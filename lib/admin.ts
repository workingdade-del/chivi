import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/order-status";
import { loadCostMaps, summarizeMargins, marginByDish, type NamedOrderItemForMargin, type DishMarginRow } from "@/lib/margin";
import type { OrderStatus, PaymentMethod } from "@/lib/supabase/types";

export interface OrderDetailData {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  delivery_fee: number;
  total: number;
  client_note: string | null;
  created_at: string;
  delivery_address: string | null;
  profiles: { full_name: string | null; whatsapp_phone: string } | null;
  order_items: {
    id: string;
    product_id: string | null;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    order_supplements: { supplement_id: string | null; supplement_name: string; unit_price: number }[];
  }[];
  order_assignments: {
    id: string;
    drivers: { id: string; name: string; phone: string } | null;
  }[];
}

export interface ClientOrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  order_items: { quantity: number }[];
}

// CHIVI opère à Cotonou (UTC+1, fixe — pas de DST) mais les fonctions
// serverless (Vercel) tournent en UTC par défaut : un simple
// `.setHours(0,0,0,0)` calcule "minuit" dans le fuseau du SERVEUR, pas celui
// de Cotonou — décalage d'une heure sur la frontière du jour, qui peut faire
// classer une commande dans le mauvais jour/période. On convertit vers une
// vue "horloge murale Cotonou" (lisible avec les getters UTC quel que soit
// le fuseau du serveur), on fait les calculs de calendrier dessus, puis on
// reconvertit en instant UTC réel.
const COTONOU_OFFSET_MS = 60 * 60 * 1000;
function toCotonouWallClock(d: Date): Date {
  return new Date(d.getTime() + COTONOU_OFFSET_MS);
}
function fromCotonouWallClock(d: Date): Date {
  return new Date(d.getTime() - COTONOU_OFFSET_MS);
}

function startOfDay(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  return fromCotonouWallClock(wall);
}
function startOfWeek(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  const day = wall.getUTCDay() === 0 ? 7 : wall.getUTCDay(); // lundi = 1
  wall.setUTCDate(wall.getUTCDate() - (day - 1));
  return fromCotonouWallClock(wall);
}
function startOfMonth(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  wall.setUTCDate(1);
  return fromCotonouWallClock(wall);
}

function startOfYear(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  wall.setUTCMonth(0, 1);
  return fromCotonouWallClock(wall);
}

const MONTH_LABELS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const WEEKDAY_LABELS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const COTONOU_TZ = "Africa/Porto-Novo";

/**
 * toLocaleDateString() sans option `timeZone` explicite lit le calendrier du
 * fuseau du SERVEUR (UTC sur Vercel) — sur un instant déjà corrigé Cotonou
 * (voir toCotonouWallClock plus haut), ça peut afficher le jour PRÉCÉDENT
 * (ex: un instant "jeudi 00h Cotonou" vaut "mercredi 23h UTC" ; sans
 * timeZone explicite, .toLocaleDateString lit "mercredi"). D'où le décalage
 * d'un jour rapporté sur le graphique Dashboard — le regroupement des
 * ventes était correct, seul le LABEL affiché était faux. Toujours passer
 * ce fuseau explicitement pour tout affichage de date dérivé de ces instants.
 */
function formatCotonouDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("fr-FR", { ...opts, timeZone: COTONOU_TZ });
}

export interface DashboardData {
  ordersToday: number;
  revenueToday: number;
  costsToday: number;
  profitToday: number;
  marginToday: number;
  inProgress: { recue: number; en_preparation_prete: number; en_route: number };
  topDishes: { name: string; qty: number }[];
  /** Marge plats (coûts ingrédients/emballage) — distincte de "Bénéfice" ci-dessus, qui reste basée sur les dépenses saisies manuellement. */
  dishMarginToday: number;
  dishMarginCoveragePct: number;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = createClient();
  const today = startOfDay(new Date());

  const { data: todayOrders } = await supabase
    .from("orders")
    .select("total, status, created_at")
    .gte("created_at", today.toISOString())
    .neq("status", "annulee");

  const revenueToday = (todayOrders ?? []).reduce((s, o) => s + o.total, 0);
  const ordersToday = todayOrders?.length ?? 0;

  const { data: expensesToday } = await supabase
    .from("expenses")
    .select("amount")
    .gte("expense_date", today.toISOString().slice(0, 10));
  const costsToday = (expensesToday ?? []).reduce((s, e) => s + e.amount, 0);
  const profitToday = revenueToday - costsToday;
  const marginToday = revenueToday > 0 ? Math.round((profitToday / revenueToday) * 100) : 0;

  const { data: activeOrders } = await supabase
    .from("orders")
    .select("status")
    .in("status", ["recue", "en_preparation", "prete", "en_route"]);

  const inProgress = {
    recue: (activeOrders ?? []).filter((o) => o.status === "recue").length,
    en_preparation_prete: (activeOrders ?? []).filter((o) => o.status === "en_preparation" || o.status === "prete").length,
    en_route: (activeOrders ?? []).filter((o) => o.status === "en_route").length,
  };

  const { data: itemsToday, error: itemsTodayErr } = await supabase
    .from("order_items")
    .select("product_id, product_variant_id, product_name, variant_name, quantity, line_total, orders!inner(created_at, status)")
    .gte("orders.created_at", today.toISOString())
    .neq("orders.status", "annulee");
  if (itemsTodayErr) console.error("[dashboard] échec lecture order_items du jour :", itemsTodayErr.message);

  const dishCounts = new Map<string, number>();
  const todaysItems = (itemsToday ?? []) as unknown as {
    product_id: string | null;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    line_total: number;
  }[];
  for (const item of todaysItems) {
    dishCounts.set(item.product_name, (dishCounts.get(item.product_name) ?? 0) + item.quantity);
  }
  const topDishes = [...dishCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({ name, qty }));

  const costMaps = await loadCostMaps(supabase);
  const dishMargin = summarizeMargins(todaysItems, costMaps);

  return {
    ordersToday,
    revenueToday,
    costsToday,
    profitToday,
    marginToday,
    inProgress,
    topDishes,
    dishMarginToday: dishMargin.knownMargin,
    dishMarginCoveragePct: dishMargin.coveragePct,
  };
}

export type ChartView = "semaine" | "mois" | "annee";

export interface RevenueChartPoint {
  label: string;
  revenue: number;
  /** "YYYY-MM-DD" (calendrier Cotonou) pour un point journalier (semaine/mois), sinon null (année = points mensuels, pas de détail jour). */
  date: string | null;
}

export interface RevenueChartData {
  view: ChartView;
  offset: number;
  rangeLabel: string;
  points: RevenueChartPoint[];
  /** false quand offset=0 — on ne navigue jamais vers une période future. */
  canGoNext: boolean;
}

/** "YYYY-MM-DD" du jour Cotonou correspondant à cet instant, quel que soit le fuseau du serveur. */
function cotonouDateString(d: Date): string {
  const wall = toCotonouWallClock(d);
  const y = wall.getUTCFullYear();
  const m = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wall.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Chiffre d'affaires pour le widget "Revenus" du Dashboard, navigable
 * (semaine/mois/année, précédent/suivant). offset=0 = période courante ;
 * offset croissant = on remonte dans le passé. Toutes les frontières de
 * calendrier sont calculées en heure de Cotonou (voir toCotonouWallClock).
 * La vue "semaine" affiche la semaine calendaire Lundi→Dimanche contenant
 * la période ciblée (pas une fenêtre glissante des 7 derniers jours) —
 * convention française/béninoise standard.
 */
export async function getRevenueChart(view: ChartView, offset: number): Promise<RevenueChartData> {
  const supabase = createClient();
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const now = new Date();

  if (view === "semaine") {
    const start = startOfWeek(now); // lundi de la semaine courante, déjà Cotonou-correct
    start.setDate(start.getDate() - safeOffset * 7);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);

    const { data } = await supabase
      .from("orders")
      .select("total, created_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())
      .neq("status", "annulee");

    const points: RevenueChartPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const dayRevenue = (data ?? [])
        .filter((o) => startOfDay(new Date(o.created_at)).getTime() === day.getTime())
        .reduce((s, o) => s + o.total, 0);
      points.push({ label: WEEKDAY_LABELS_FR[i], revenue: dayRevenue, date: cotonouDateString(day) });
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const rangeLabel = `${formatCotonouDate(start, { day: "numeric", month: "short" })} – ${formatCotonouDate(end, { day: "numeric", month: "short" })}`;
    return { view, offset: safeOffset, rangeLabel, points, canGoNext: safeOffset > 0 };
  }

  if (view === "mois") {
    const nowWall = toCotonouWallClock(now);
    const targetY = nowWall.getUTCFullYear();
    const targetM = nowWall.getUTCMonth() - safeOffset;
    const monthStartWall = new Date(Date.UTC(targetY, targetM, 1));
    const monthEndWall = new Date(Date.UTC(targetY, targetM + 1, 1));
    const start = fromCotonouWallClock(monthStartWall);
    const end = fromCotonouWallClock(monthEndWall);

    const { data } = await supabase
      .from("orders")
      .select("total, created_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .neq("status", "annulee");

    const daysInMonth = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
    const points: RevenueChartPoint[] = [];
    for (let d = 0; d < daysInMonth; d++) {
      const dayStart = fromCotonouWallClock(new Date(Date.UTC(targetY, targetM, 1 + d)));
      const dayEnd = fromCotonouWallClock(new Date(Date.UTC(targetY, targetM, 2 + d)));
      const dayRevenue = (data ?? [])
        .filter((o) => {
          const t = new Date(o.created_at).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        })
        .reduce((s, o) => s + o.total, 0);
      points.push({ label: String(d + 1), revenue: dayRevenue, date: cotonouDateString(dayStart) });
    }

    const rangeLabel = `${MONTH_LABELS_FR[monthStartWall.getUTCMonth()]} ${monthStartWall.getUTCFullYear()}`;
    return { view, offset: safeOffset, rangeLabel, points, canGoNext: safeOffset > 0 };
  }

  // view === "annee" — points mensuels, pas de détail par jour (date: null)
  const nowWall = toCotonouWallClock(now);
  const targetYear = nowWall.getUTCFullYear() - safeOffset;
  const yearStart = fromCotonouWallClock(new Date(Date.UTC(targetYear, 0, 1)));
  const yearEnd = fromCotonouWallClock(new Date(Date.UTC(targetYear + 1, 0, 1)));

  const { data } = await supabase
    .from("orders")
    .select("total, created_at")
    .gte("created_at", yearStart.toISOString())
    .lt("created_at", yearEnd.toISOString())
    .neq("status", "annulee");

  const points: RevenueChartPoint[] = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = fromCotonouWallClock(new Date(Date.UTC(targetYear, m, 1)));
    const monthEnd = fromCotonouWallClock(new Date(Date.UTC(targetYear, m + 1, 1)));
    const monthRevenue = (data ?? [])
      .filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= monthStart.getTime() && t < monthEnd.getTime();
      })
      .reduce((s, o) => s + o.total, 0);
    points.push({ label: MONTH_LABELS_FR[m], revenue: monthRevenue, date: null });
  }

  return { view, offset: safeOffset, rangeLabel: String(targetYear), points, canGoNext: safeOffset > 0 };
}

export interface AdminOrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  client_name: string | null;
  client_phone: string | null;
  driver_name: string | null;
}

export async function getOrders(filter?: OrderStatus): Promise<AdminOrderRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, total, created_at, profiles(full_name, whatsapp_phone), order_assignments(drivers(name))"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter) query = query.eq("status", filter);

  const { data } = await query;
  const rows = (data ?? []) as unknown as {
    id: string;
    order_number: string;
    status: OrderStatus;
    total: number;
    created_at: string;
    profiles: { full_name: string | null; whatsapp_phone: string } | null;
    order_assignments: { drivers: { name: string } | null }[];
  }[];

  return rows.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    total: o.total,
    created_at: o.created_at,
    client_name: o.profiles?.full_name ?? null,
    client_phone: o.profiles?.whatsapp_phone ?? null,
    driver_name: o.order_assignments?.[0]?.drivers?.name ?? null,
  }));
}

export async function getOrderDetail(id: string): Promise<OrderDetailData | null> {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_method, subtotal, delivery_fee, total, client_note, created_at, delivery_address, profiles(full_name, whatsapp_phone), order_items(id, product_id, product_variant_id, product_name, variant_name, unit_price, quantity, line_total, order_supplements(supplement_id, supplement_name, unit_price)), order_assignments(id, drivers(id, name, phone))"
    )
    .eq("id", id)
    .maybeSingle();

  return (order ?? null) as unknown as OrderDetailData | null;
}

interface DriverAssignmentRow {
  driver_id: string;
  orders: { order_number: string; delivery_address: string | null } | null;
}

export async function getDrivers() {
  const supabase = createClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone, status, is_available, last_seen, photo_url")
    .eq("is_active", true)
    .order("name");

  const { data: activeAssignments } = await supabase
    .from("order_assignments")
    .select("driver_id, orders(order_number, delivery_address)")
    .neq("status", "livree");

  const assignments = (activeAssignments ?? []) as unknown as DriverAssignmentRow[];

  return (drivers ?? []).map((d) => {
    const assignment = assignments.find((a) => a.driver_id === d.id);
    return {
      ...d,
      currentOrder: assignment?.orders?.order_number ?? null,
      currentDest: assignment?.orders?.delivery_address ?? null,
    };
  });
}

interface ClientProfileRow {
  id: string;
  full_name: string | null;
  whatsapp_phone: string;
  zone: string | null;
  created_at: string;
  orders: { total: number }[];
}

export async function getClients() {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, whatsapp_phone, zone, created_at, orders(total)")
    .order("created_at", { ascending: false });

  const rows = (profiles ?? []) as unknown as ClientProfileRow[];

  return rows.map((p) => ({
    id: p.id,
    name: p.full_name || p.whatsapp_phone,
    phone: p.whatsapp_phone,
    orderCount: p.orders?.length ?? 0,
    spent: (p.orders ?? []).reduce((s, o) => s + o.total, 0),
  }));
}

export async function getClientDetail(id: string) {
  const supabase = createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at, order_items(quantity)")
    .eq("profile_id", id)
    .order("created_at", { ascending: false });

  return { profile, orders: (orders ?? []) as unknown as ClientOrderRow[] };
}

export type ReportPeriod = "jour" | "semaine" | "mois" | "annee";
export interface CustomDateRange {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD", inclusif
}

export interface ReportRow {
  label: string;
  orders: number;
  revenue: number;
  costs: number;
  profit: number;
}

export interface ReportData {
  label: string;
  rowHead: string;
  revenue: number;
  orders: number;
  costs: number;
  deliveryCosts: number;
  profit: number;
  margin: number;
  rows: ReportRow[];
  /** Marge plats (coûts ingrédients/emballage), recalculée en temps réel — distincte de profit/margin ci-dessus (basés sur les dépenses saisies). */
  dishMargin: number;
  dishMarginCoveragePct: number;
  dishMarginRows: DishMarginRow[];
}

const DAYPARTS = [
  { label: "6h–14h", start: 6, end: 14 },
  { label: "14h–18h", start: 14, end: 18 },
  { label: "18h–24h", start: 18, end: 24 },
];

export async function getReport(period: ReportPeriod, customRange?: CustomDateRange): Promise<ReportData> {
  const supabase = createClient();
  const today = startOfDay(new Date());

  let rangeStart: Date;
  let rangeEndExclusive: Date | null = null; // null = pas de borne haute (comportement historique, va jusqu'à "maintenant")
  if (customRange) {
    rangeStart = startOfDay(new Date(customRange.start));
    const endDay = startOfDay(new Date(customRange.end));
    rangeEndExclusive = new Date(endDay);
    rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);
  } else if (period === "jour") {
    rangeStart = today;
  } else if (period === "semaine") {
    rangeStart = startOfWeek(new Date());
  } else if (period === "mois") {
    rangeStart = startOfMonth(new Date());
  } else {
    rangeStart = startOfYear(new Date());
  }

  type PeriodOrderItem = {
    product_id: string | null;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    line_total: number;
  };
  interface PeriodOrderRow {
    total: number;
    delivery_fee: number;
    created_at: string;
    order_items: PeriodOrderItem[];
  }

  let ordersQuery = supabase
    .from("orders")
    .select(
      "total, delivery_fee, created_at, order_items(product_id, product_variant_id, product_name, variant_name, quantity, line_total)"
    )
    .gte("created_at", rangeStart.toISOString())
    .neq("status", "annulee");
  if (rangeEndExclusive) ordersQuery = ordersQuery.lt("created_at", rangeEndExclusive.toISOString());
  const { data: ordersRaw, error: ordersErr } = await ordersQuery;
  if (ordersErr) console.error("[report] échec lecture orders de la période :", ordersErr.message);
  const orders = (ordersRaw ?? []) as unknown as PeriodOrderRow[];

  let expensesQuery = supabase.from("expenses").select("amount, expense_date").gte("expense_date", rangeStart.toISOString().slice(0, 10));
  if (rangeEndExclusive) expensesQuery = expensesQuery.lt("expense_date", rangeEndExclusive.toISOString().slice(0, 10));
  const { data: expenses, error: expensesErr } = await expensesQuery;
  if (expensesErr) console.error("[report] échec lecture expenses de la période :", expensesErr.message);

  const revenue = (orders ?? []).reduce((s, o) => s + o.total, 0);
  const deliveryCosts = (orders ?? []).reduce((s, o) => s + o.delivery_fee, 0);
  const costs = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const profit = revenue - costs;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  const periodItems = orders.flatMap((o) => o.order_items);
  const costMaps = await loadCostMaps(supabase);
  const dishMarginSummary = summarizeMargins(periodItems, costMaps);
  const namedItems: NamedOrderItemForMargin[] = periodItems.map((item) => ({
    ...item,
    label: item.variant_name ? `${item.product_name} — ${item.variant_name}` : item.product_name,
  }));
  const dishMarginRows = marginByDish(namedItems, costMaps);

  let rows: ReportRow[] = [];
  let rowHead = "Période";
  let label = "aujourd'hui";

  function bucketByDay(from: Date, toExclusive: Date) {
    rowHead = "Jour";
    for (let day = new Date(from); day < toExclusive; day.setDate(day.getDate() + 1)) {
      const d = new Date(day);
      const dayOrders = (orders ?? []).filter((o) => startOfDay(new Date(o.created_at)).getTime() === d.getTime());
      const dayRevenue = dayOrders.reduce((s, o) => s + o.total, 0);
      rows.push({
        label: formatCotonouDate(d, { day: "numeric", month: "short" }),
        orders: dayOrders.length,
        revenue: dayRevenue,
        costs: 0,
        profit: dayRevenue,
      });
    }
  }

  function bucketByMonth(from: Date, toExclusive: Date) {
    rowHead = "Mois";
    const fromWall = toCotonouWallClock(from);
    const toWall = toCotonouWallClock(toExclusive);
    let y = fromWall.getUTCFullYear();
    let m = fromWall.getUTCMonth();
    while (y < toWall.getUTCFullYear() || (y === toWall.getUTCFullYear() && m < toWall.getUTCMonth())) {
      const monthStart = fromCotonouWallClock(new Date(Date.UTC(y, m, 1)));
      const monthEnd = fromCotonouWallClock(new Date(Date.UTC(y, m + 1, 1)));
      const monthOrders = (orders ?? []).filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= monthStart.getTime() && t < monthEnd.getTime();
      });
      const monthRevenue = monthOrders.reduce((s, o) => s + o.total, 0);
      rows.push({ label: `${MONTH_LABELS_FR[m]} ${y}`, orders: monthOrders.length, revenue: monthRevenue, costs: 0, profit: monthRevenue });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }

  function bucketByYear(from: Date, toExclusive: Date) {
    rowHead = "Année";
    const fromWall = toCotonouWallClock(from);
    const toWall = toCotonouWallClock(toExclusive);
    for (let y = fromWall.getUTCFullYear(); y <= toWall.getUTCFullYear(); y++) {
      const yearStart = fromCotonouWallClock(new Date(Date.UTC(y, 0, 1)));
      const yearEnd = fromCotonouWallClock(new Date(Date.UTC(y + 1, 0, 1)));
      const yearOrders = (orders ?? []).filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= yearStart.getTime() && t < yearEnd.getTime();
      });
      const yearRevenue = yearOrders.reduce((s, o) => s + o.total, 0);
      rows.push({ label: String(y), orders: yearOrders.length, revenue: yearRevenue, costs: 0, profit: yearRevenue });
    }
  }

  if (customRange) {
    const spanDays = Math.round((rangeEndExclusive!.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));
    // customRange.{start,end} sont des "YYYY-MM-DD" — new Date() les parse en
    // minuit UTC ; timeZone: "UTC" explicite ici évite toute ambiguïté avec
    // le fuseau du serveur au lieu de compter sur une coïncidence de valeurs par défaut.
    label = `du ${new Date(customRange.start).toLocaleDateString("fr-FR", { timeZone: "UTC" })} au ${new Date(customRange.end).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`;
    if (spanDays <= 31) bucketByDay(rangeStart, rangeEndExclusive!);
    else if (spanDays <= 366) bucketByMonth(rangeStart, rangeEndExclusive!);
    else bucketByYear(rangeStart, rangeEndExclusive!);
  } else if (period === "jour") {
    rowHead = "Heure";
    label = "aujourd'hui";
    rows = DAYPARTS.map((part) => {
      const partOrders = (orders ?? []).filter((o) => {
        const h = new Date(o.created_at).getHours();
        return h >= part.start && h < part.end;
      });
      const partRevenue = partOrders.reduce((s, o) => s + o.total, 0);
      return { label: part.label, orders: partOrders.length, revenue: partRevenue, costs: 0, profit: partRevenue };
    });
  } else if (period === "semaine") {
    label = "cette semaine";
    const end = new Date(rangeStart);
    end.setDate(end.getDate() + 7);
    bucketByDay(rangeStart, new Date(Math.min(end.getTime(), Date.now())));
  } else if (period === "mois") {
    rowHead = "Semaine";
    label = "ce mois";
    for (let w = 0; w < 5; w++) {
      const weekStart = new Date(rangeStart);
      weekStart.setDate(weekStart.getDate() + w * 7);
      if (weekStart > new Date()) break;
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekOrders = (orders ?? []).filter((o) => {
        const t = new Date(o.created_at);
        return t >= weekStart && t < weekEnd;
      });
      const weekRevenue = weekOrders.reduce((s, o) => s + o.total, 0);
      rows.push({ label: `Semaine ${w + 1}`, orders: weekOrders.length, revenue: weekRevenue, costs: 0, profit: weekRevenue });
    }
  } else {
    label = "cette année";
    const end = new Date(rangeStart);
    end.setFullYear(end.getFullYear() + 1);
    bucketByMonth(rangeStart, new Date(Math.min(end.getTime(), Date.now())));
  }

  return {
    label,
    rowHead,
    revenue,
    orders: orders?.length ?? 0,
    costs,
    deliveryCosts,
    profit,
    margin,
    rows,
    dishMargin: dishMarginSummary.knownMargin,
    dishMarginCoveragePct: dishMarginSummary.coveragePct,
    dishMarginRows,
  };
}

export { STATUS_LABELS };
