import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/order-status";
import { loadLoyaltyRates, pointsForLine, getLoyaltyBalances } from "@/lib/loyalty";
import { loadCostMaps, summarizeMargins, marginByDish, prorateLineForDiscount, prorateItemsForDiscount, type NamedOrderItemForMargin, type DishMarginRow } from "@/lib/margin";
import type { OrderStatus, PaymentMethod } from "@/lib/supabase/types";

export interface OrderDetailData {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
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

export function startOfDay(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  return fromCotonouWallClock(wall);
}
export function startOfWeek(d: Date) {
  const wall = toCotonouWallClock(d);
  wall.setUTCHours(0, 0, 0, 0);
  const day = wall.getUTCDay() === 0 ? 7 : wall.getUTCDay(); // lundi = 1
  wall.setUTCDate(wall.getUTCDate() - (day - 1));
  return fromCotonouWallClock(wall);
}
export function startOfMonth(d: Date) {
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
    .select("subtotal, status, created_at")
    .gte("created_at", today.toISOString())
    .neq("status", "annulee");

  // Le sous-total (hors livraison) est le vrai chiffre d'affaires CHIVI —
  // les frais de livraison sont perçus au nom du prestataire livreur externe,
  // ce n'est pas de l'argent CHIVI et ça ne doit apparaître dans aucun total agrégé.
  const revenueToday = (todayOrders ?? []).reduce((s, o) => s + o.subtotal, 0);
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
    .select("product_id, product_variant_id, product_name, variant_name, quantity, line_total, orders!inner(created_at, status, subtotal, discount_amount)")
    .gte("orders.created_at", today.toISOString())
    .neq("orders.status", "annulee");
  if (itemsTodayErr) console.error("[dashboard] échec lecture order_items du jour :", itemsTodayErr.message);

  const dishCounts = new Map<string, number>();
  const todaysItems = ((itemsToday ?? []) as unknown as {
    product_id: string | null;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    line_total: number;
    orders: { subtotal: number; discount_amount: number };
  }[]).map((i) => ({ ...i, line_total: prorateLineForDiscount(i.line_total, i.orders.subtotal, i.orders.discount_amount) }));
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
      .select("subtotal, created_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())
      .neq("status", "annulee");

    const points: RevenueChartPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const dayRevenue = (data ?? [])
        .filter((o) => startOfDay(new Date(o.created_at)).getTime() === day.getTime())
        .reduce((s, o) => s + o.subtotal, 0);
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
      .select("subtotal, created_at")
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
        .reduce((s, o) => s + o.subtotal, 0);
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
    .select("subtotal, created_at")
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
      .reduce((s, o) => s + o.subtotal, 0);
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

export type QuickPeriod = "jour" | "semaine" | "mois";

function quickPeriodStart(period: QuickPeriod, now: Date): Date {
  if (period === "jour") return startOfDay(now);
  if (period === "semaine") return startOfWeek(now);
  return startOfMonth(now);
}

/** Filtre produit : "p:<product_id>" (plat, toutes variantes) ou "v:<variant_id>" (une variante précise). */
export async function getOrders(options?: { status?: OrderStatus; period?: QuickPeriod; search?: string; product?: string }): Promise<AdminOrderRow[]> {
  const supabase = createClient();
  const productFilter = options?.product && /^[pv]:[0-9a-f-]{36}$/i.test(options.product) ? options.product : null;
  // Jointure !inner sur order_items uniquement quand un produit est filtré :
  // ne garde que les commandes contenant ce produit (sans longue liste d'ids dans l'URL).
  let query = supabase
    .from("orders")
    .select(
      `id, order_number, status, total, created_at, profiles(full_name, whatsapp_phone), order_assignments(drivers(name))${
        productFilter ? ", order_items!inner(product_id, product_variant_id)" : ""
      }`
    )
    .order("created_at", { ascending: false })
    .limit(options?.search?.trim() ? 500 : 100);

  if (productFilter) {
    query = query.eq(productFilter.startsWith("p:") ? "order_items.product_id" : "order_items.product_variant_id", productFilter.slice(2));
  }
  if (options?.status) query = query.eq("status", options.status);
  if (options?.period) query = query.gte("created_at", quickPeriodStart(options.period, new Date()).toISOString());

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

  let result = rows.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    total: o.total,
    created_at: o.created_at,
    client_name: o.profiles?.full_name ?? null,
    client_phone: o.profiles?.whatsapp_phone ?? null,
    driver_name: o.order_assignments?.[0]?.drivers?.name ?? null,
  }));

  const term = options?.search?.trim().toLowerCase();
  if (term) {
    const digits = term.replace(/\D/g, "");
    result = result.filter(
      (o) =>
        o.order_number.toLowerCase().includes(term) ||
        (o.client_name?.toLowerCase().includes(term) ?? false) ||
        (digits.length > 0 && (o.client_phone?.includes(digits) ?? false))
    );
  }

  return result;
}

export async function getOrderDetail(id: string): Promise<OrderDetailData | null> {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_method, subtotal, delivery_fee, discount_amount, total, client_note, created_at, delivery_address, profiles(full_name, whatsapp_phone), order_items(id, product_id, product_variant_id, product_name, variant_name, unit_price, quantity, line_total, order_supplements(supplement_id, supplement_name, unit_price)), order_assignments(id, drivers(id, name, phone))"
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

export async function getClients(options?: { search?: string; period?: QuickPeriod }) {
  const supabase = createClient();
  const loyaltyBalances = await getLoyaltyBalances();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, whatsapp_phone, zone, created_at, orders(total)")
    .order("created_at", { ascending: false });

  let rows = (profiles ?? []) as unknown as ClientProfileRow[];

  if (options?.period) {
    const startIso = quickPeriodStart(options.period, new Date()).toISOString();
    rows = rows.filter((p) => p.created_at >= startIso);
  }

  let result = rows.map((p) => ({
    id: p.id,
    name: p.full_name || p.whatsapp_phone,
    phone: p.whatsapp_phone,
    orderCount: p.orders?.length ?? 0,
    spent: (p.orders ?? []).reduce((s, o) => s + o.total, 0),
    points: loyaltyBalances.get(p.id) ?? 0,
  }));

  const term = options?.search?.trim().toLowerCase();
  if (term) {
    const digits = term.replace(/\D/g, "");
    result = result.filter(
      (c) => c.name.toLowerCase().includes(term) || (digits.length > 0 && c.phone.includes(digits))
    );
  }

  return result;
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
  /** Coût ingrédients/emballage des plats vendus (product_costs/product_variants). */
  costs: number;
  /** Marge brute = revenue - costs (denrées). Ne tient PAS compte des dépenses générales. */
  grossMargin: number;
  /** % de marge brute sur le revenu. */
  margin: number;
  /** Dépenses générales saisies manuellement (loyer, salaires, achats divers — table expenses), distinctes du coût ingrédients ci-dessus. */
  expenses: number;
  /** Bénéfice net = grossMargin - expenses. */
  netProfit: number;
  /** % de bénéfice net sur le revenu. */
  netMargin: number;
  rows: ReportRow[];
  /** Marge plats (coûts ingrédients/emballage), recalculée en temps réel — même logique que costs/grossMargin ci-dessus, présentée par plat. */
  dishMargin: number;
  dishMarginCoveragePct: number;
  dishMarginRows: DishMarginRow[];
  /** Dépenses marquées "fixe" (hors catégories ingrédients/emballage, déjà couvertes par le coût variable des plats). */
  fixedCosts: number;
  /** Dépenses de la période sans type (cost_type NULL) — "à classer". */
  unclassifiedExpensesCount: number;
  /** Points de fidélité générés par les commandes livrées de la période. */
  totalPoints: number;
}

const DAYPARTS = [
  { label: "6h–14h", start: 6, end: 14 },
  { label: "14h–18h", start: 14, end: 18 },
  { label: "18h–24h", start: 18, end: 24 },
];

/** "YYYY-MM" du mois courant à Cotonou. */
export function currentCotonouMonth(): string {
  return toCotonouWallClock(new Date()).toISOString().slice(0, 7);
}

/** Premier mois ("YYYY-MM") contenant une commande, ou le mois courant s'il n'y en a pas. */
export async function getFirstOrderMonth(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.from("orders").select("created_at").order("created_at", { ascending: true }).limit(1);
  const first = data?.[0]?.created_at;
  return first ? toCotonouWallClock(new Date(first)).toISOString().slice(0, 7) : currentCotonouMonth();
}

function monthBounds(month: string): { start: Date; endExclusive: Date; label: string } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: fromCotonouWallClock(new Date(Date.UTC(y, m - 1, 1))),
    endExclusive: fromCotonouWallClock(new Date(Date.UTC(y, m, 1))),
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export async function getReport(period: ReportPeriod, customRange?: CustomDateRange, month?: string): Promise<ReportData> {
  const supabase = createClient();
  const today = startOfDay(new Date());

  let rangeStart: Date;
  let rangeEndExclusive: Date | null = null; // null = pas de borne haute (comportement historique, va jusqu'à "maintenant")
  if (month) {
    const b = monthBounds(month);
    rangeStart = b.start;
    rangeEndExclusive = b.endExclusive;
  } else if (customRange) {
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
    subtotal: number;
    discount_amount: number;
    status: OrderStatus;
    created_at: string;
    order_items: PeriodOrderItem[];
  }

  let ordersQuery = supabase
    .from("orders")
    .select(
      "subtotal, discount_amount, status, created_at, order_items(product_id, product_variant_id, product_name, variant_name, quantity, line_total)"
    )
    .gte("created_at", rangeStart.toISOString())
    .neq("status", "annulee");
  if (rangeEndExclusive) ordersQuery = ordersQuery.lt("created_at", rangeEndExclusive.toISOString());
  const { data: ordersRaw, error: ordersErr } = await ordersQuery;
  if (ordersErr) console.error("[report] échec lecture orders de la période :", ordersErr.message);
  // Les lignes sont ramenées à leur part nette de réduction (discount_amount)
  // au prorata — voir prorateLineForDiscount dans lib/margin.ts.
  const orders = ((ordersRaw ?? []) as unknown as PeriodOrderRow[]).map((o) => ({
    ...o,
    order_items: prorateItemsForDiscount(o.order_items, o.subtotal, o.discount_amount),
  }));

  // expense_date est une date calendaire : on la borne avec le jour CALENDAIRE
  // Cotonou (rangeStart est minuit Cotonou = 23h UTC la veille, d'où le décalage
  // d'un jour qu'aurait donné un simple toISOString().slice(0, 10)).
  const calendarDay = (d: Date) => toCotonouWallClock(d).toISOString().slice(0, 10);
  const fromDay = calendarDay(rangeStart);
  const toDay = rangeEndExclusive ? calendarDay(rangeEndExclusive) : null;
  type ExpenseLite = { amount: number; category?: string; cost_type?: string | null };
  async function loadExpenses(cols: string) {
    let q = supabase.from("expenses").select(cols).gte("expense_date", fromDay);
    if (toDay) q = q.lt("expense_date", toDay);
    return q;
  }
  // Avec cost_type (migration 0048) ; repli sans si la colonne n'existe pas encore.
  let { data: expensesRaw, error: expensesErr } = await loadExpenses("amount, category, cost_type");
  if (expensesErr) {
    console.error("[report] échec lecture expenses (cost_type) :", expensesErr.message);
    ({ data: expensesRaw, error: expensesErr } = await loadExpenses("amount"));
    if (expensesErr) console.error("[report] échec lecture expenses de la période :", expensesErr.message);
  }
  const expenseRows = (expensesRaw ?? []) as unknown as ExpenseLite[];
  const expenses = expenseRows.reduce((s, e) => s + e.amount, 0);
  // Coûts fixes = dépenses marquées "fixe", hors ingrédients/emballage : ces
  // achats sont déjà dans le coût variable des plats (lib/margin.ts), les
  // recompter ici serait un double comptage.
  const fixedCosts = expenseRows
    .filter((e) => e.cost_type === "fixe" && e.category !== "ingredients" && e.category !== "emballage")
    .reduce((s, e) => s + e.amount, 0);
  const unclassifiedExpensesCount = expenseRows.filter((e) => e.category !== undefined && !e.cost_type).length;

  // Sous-total hors livraison : les frais de livraison sont perçus au nom du
  // prestataire livreur externe, jamais un revenu/coût/bénéfice CHIVI.
  const revenue = (orders ?? []).reduce((s, o) => s + o.subtotal, 0);

  const periodItems = orders.flatMap((o) => o.order_items);
  const costMaps = await loadCostMaps(supabase);
  const dishMarginSummary = summarizeMargins(periodItems, costMaps);
  const namedItems: NamedOrderItemForMargin[] = periodItems.map((item) => ({
    ...item,
    label: item.variant_name ? `${item.product_name} — ${item.variant_name}` : item.product_name,
  }));
  const loyaltyRates = await loadLoyaltyRates(supabase);
  const pointsByLabel = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "livree") continue;
    for (const item of o.order_items) {
      const label = item.variant_name ? `${item.product_name} — ${item.variant_name}` : item.product_name;
      pointsByLabel.set(label, (pointsByLabel.get(label) ?? 0) + pointsForLine(item, loyaltyRates));
    }
  }
  const dishMarginRows = marginByDish(namedItems, costMaps).map((r) => ({ ...r, points: Math.floor(pointsByLabel.get(r.name) ?? 0) }));
  const totalPoints = dishMarginRows.reduce((sum, r) => sum + (r.points ?? 0), 0);

  // "Coûts (denrées)" = coût ingrédients/emballage réel des plats vendus
  // (product_costs / product_variants, même logique que "Marge par plat"
  // ci-dessous) — PAS les dépenses manuelles (loyer, salaires...) qui vivent
  // dans /admin/expenses et le compte Finance "Dépenses" séparément. Avant ce
  // fix, ce total venait de la table expenses (sans lien avec les denrées)
  // pendant que les lignes du tableau détaillé étaient câblées en dur à 0 —
  // trois sources de vérité différentes qui ne pouvaient jamais se recouper.
  const costs = dishMarginSummary.knownCost;
  const grossMargin = revenue - costs;
  const margin = revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0;
  // Bénéfice net = marge brute - dépenses générales (loyer, salaires, achats
  // divers saisis manuellement) — distinct de la marge brute ci-dessus, qui
  // ne tient compte que du coût des ingrédients.
  const netProfit = grossMargin - expenses;
  const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  function bucketCosts(bucketOrders: PeriodOrderRow[]): number {
    return summarizeMargins(bucketOrders.flatMap((o) => o.order_items), costMaps).knownCost;
  }

  let rows: ReportRow[] = [];
  let rowHead = "Période";
  let label = "aujourd'hui";

  function bucketByDay(from: Date, toExclusive: Date) {
    rowHead = "Jour";
    for (let day = new Date(from); day < toExclusive; day.setDate(day.getDate() + 1)) {
      const d = new Date(day);
      const dayOrders = (orders ?? []).filter((o) => startOfDay(new Date(o.created_at)).getTime() === d.getTime());
      const dayRevenue = dayOrders.reduce((s, o) => s + o.subtotal, 0);
      const dayCosts = bucketCosts(dayOrders);
      rows.push({
        label: formatCotonouDate(d, { day: "numeric", month: "short" }),
        orders: dayOrders.length,
        revenue: dayRevenue,
        costs: dayCosts,
        profit: dayRevenue - dayCosts,
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
      const monthRevenue = monthOrders.reduce((s, o) => s + o.subtotal, 0);
      const monthCosts = bucketCosts(monthOrders);
      rows.push({ label: `${MONTH_LABELS_FR[m]} ${y}`, orders: monthOrders.length, revenue: monthRevenue, costs: monthCosts, profit: monthRevenue - monthCosts });
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
      const yearRevenue = yearOrders.reduce((s, o) => s + o.subtotal, 0);
      const yearCosts = bucketCosts(yearOrders);
      rows.push({ label: String(y), orders: yearOrders.length, revenue: yearRevenue, costs: yearCosts, profit: yearRevenue - yearCosts });
    }
  }

  if (month) {
    // Découpage hebdomadaire Lundi→Dimanche à l'intérieur du mois (la 1re
    // semaine peut commencer avant le 1er, seuls les jours du mois comptent).
    rowHead = "Semaine";
    label = monthBounds(month).label;
    const firstMonday = startOfWeek(rangeStart);
    for (let w = 0; w < 6; w++) {
      const weekStart = new Date(firstMonday.getTime() + w * 7 * 24 * 60 * 60 * 1000);
      if (weekStart >= rangeEndExclusive! || weekStart > new Date()) break;
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekOrders = orders.filter((o) => {
        const t = new Date(o.created_at);
        return t >= weekStart && t < weekEnd;
      });
      const weekRevenue = weekOrders.reduce((sum, o) => sum + o.subtotal, 0);
      const weekCosts = bucketCosts(weekOrders);
      rows.push({ label: `Semaine ${w + 1}`, orders: weekOrders.length, revenue: weekRevenue, costs: weekCosts, profit: weekRevenue - weekCosts });
    }
  } else if (customRange) {
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
      const partRevenue = partOrders.reduce((s, o) => s + o.subtotal, 0);
      const partCosts = bucketCosts(partOrders);
      return { label: part.label, orders: partOrders.length, revenue: partRevenue, costs: partCosts, profit: partRevenue - partCosts };
    });
  } else if (period === "semaine") {
    label = "cette semaine";
    const end = new Date(rangeStart);
    end.setDate(end.getDate() + 7);
    bucketByDay(rangeStart, new Date(Math.min(end.getTime(), Date.now())));
  } else if (period === "mois") {
    rowHead = "Semaine";
    label = "ce mois";
    // Semaines calendaires Lundi→Dimanche, cohérentes avec le découpage du
    // graphique Dashboard (getRevenueChart) — pas un pavage fixe "jour 1 à
    // jour 7" qui ne correspond à aucune semaine réelle (l'ancien découpage
    // faisait tomber le dernier jour d'une vraie semaine Lundi-Dimanche dans
    // la ligne "Semaine 2" à tort). La première semaine peut démarrer avant
    // le 1er du mois (son lundi réel) — normal, la semaine 1 y est alors
    // partielle, seuls les jours du mois en cours sont dans `orders`.
    const firstMonday = startOfWeek(rangeStart);
    for (let w = 0; w < 6; w++) {
      const weekStart = new Date(firstMonday);
      weekStart.setDate(weekStart.getDate() + w * 7);
      if (weekStart > new Date()) break;
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekOrders = (orders ?? []).filter((o) => {
        const t = new Date(o.created_at);
        return t >= weekStart && t < weekEnd;
      });
      const weekRevenue = weekOrders.reduce((s, o) => s + o.subtotal, 0);
      const weekCosts = bucketCosts(weekOrders);
      rows.push({ label: `Semaine ${w + 1}`, orders: weekOrders.length, revenue: weekRevenue, costs: weekCosts, profit: weekRevenue - weekCosts });
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
    grossMargin,
    margin,
    expenses,
    netProfit,
    netMargin,
    rows,
    dishMargin: dishMarginSummary.knownMargin,
    dishMarginCoveragePct: dishMarginSummary.coveragePct,
    dishMarginRows,
    fixedCosts,
    unclassifiedExpensesCount,
    totalPoints,
  };
}

export { STATUS_LABELS };

export interface TopClientRow {
  id: string;
  name: string;
  total: number;
  orderCount: number;
}

/** Top clients par montant dépensé (orders.total des commandes livrées) sur la semaine ou le mois en cours. */
export async function getTopClients(period: "semaine" | "mois", limit = 5): Promise<TopClientRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select("profile_id, total, profiles(full_name, whatsapp_phone)")
    .eq("status", "livree")
    .not("profile_id", "is", null)
    .gte("created_at", quickPeriodStart(period, new Date()).toISOString());

  const rows = (data ?? []) as unknown as {
    profile_id: string;
    total: number;
    profiles: { full_name: string | null; whatsapp_phone: string } | null;
  }[];

  const byClient = new Map<string, TopClientRow>();
  for (const o of rows) {
    const entry = byClient.get(o.profile_id) ?? {
      id: o.profile_id,
      name: o.profiles?.full_name || o.profiles?.whatsapp_phone || "Client",
      total: 0,
      orderCount: 0,
    };
    entry.total += o.total;
    entry.orderCount += 1;
    byClient.set(o.profile_id, entry);
  }

  return Array.from(byClient.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}


export interface ProductFilterOption {
  productId: string;
  productName: string;
  variants: { id: string; name: string }[];
}

/** Plats + variantes pour le filtre produit de la page Commandes. */
export async function getProductFilterOptions(): Promise<ProductFilterOption[]> {
  const supabase = createClient();
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase.from("products").select("id, name").order("name"),
    supabase.from("product_variants").select("id, product_id, name").order("sort_order"),
  ]);
  return (products ?? []).map((p) => ({
    productId: p.id,
    productName: p.name,
    variants: (variants ?? []).filter((v) => v.product_id === p.id).map((v) => ({ id: v.id, name: v.name })),
  }));
}

export type ProductSalesView = "semaine" | "mois";
export type ProductBadge = "phare" | "surveiller" | null;

export interface ProductSalesRow extends DishMarginRow {
  badge: ProductBadge;
}

export interface ProductSalesData {
  view: ProductSalesView;
  offset: number;
  rangeLabel: string;
  canGoNext: boolean;
  totalQty: number;
  totalRevenue: number;
  rows: ProductSalesRow[];
}

/**
 * Ventes par produit sur une semaine (Lundi→Dimanche) ou un mois calendaire
 * Cotonou, navigable via offset (0 = période courante, 1 = précédente...).
 * Commandes non annulées uniquement ; CA = sous-total hors livraison, net des
 * réductions (prorata par ligne). Labels : "phare" = top 25 % (min. 1) en
 * volume ET en marge ; "surveiller" = 25 % (min. 1) les moins vendus ; il faut
 * au moins 3 produits pour qu'un label ait un sens.
 */
export async function getProductSales(view: ProductSalesView, offset: number): Promise<ProductSalesData> {
  const supabase = createClient();
  const safeOffset = Math.max(0, offset);
  const DAY = 24 * 60 * 60 * 1000;

  let start: Date;
  let end: Date;
  let rangeLabel: string;
  if (view === "semaine") {
    start = new Date(startOfWeek(new Date()).getTime() - safeOffset * 7 * DAY);
    end = new Date(start.getTime() + 7 * DAY);
    const last = new Date(end.getTime() - DAY);
    rangeLabel = `${formatCotonouDate(start, { day: "numeric", month: "short" })} – ${formatCotonouDate(last, { day: "numeric", month: "short" })}`;
  } else {
    const wall = toCotonouWallClock(new Date());
    const y = wall.getUTCFullYear();
    const m = wall.getUTCMonth() - safeOffset;
    start = fromCotonouWallClock(new Date(Date.UTC(y, m, 1)));
    end = fromCotonouWallClock(new Date(Date.UTC(y, m + 1, 1)));
    rangeLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  }

  const { data } = await supabase
    .from("orders")
    .select("subtotal, discount_amount, status, order_items(product_id, product_variant_id, product_name, quantity, line_total)")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .neq("status", "annulee");

  const orders = (data ?? []) as unknown as {
    subtotal: number;
    discount_amount: number;
    status: OrderStatus;
    order_items: { product_id: string | null; product_variant_id: string | null; product_name: string; quantity: number; line_total: number }[];
  }[];

  const items: NamedOrderItemForMargin[] = orders.flatMap((o) =>
    prorateItemsForDiscount(o.order_items, o.subtotal, o.discount_amount).map((i) => ({ ...i, label: i.product_name }))
  );
  const costMaps = await loadCostMaps(supabase);
  const loyaltyRates = await loadLoyaltyRates(supabase);
  const pointsByName = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "livree") continue;
    for (const i of prorateItemsForDiscount(o.order_items, o.subtotal, o.discount_amount)) {
      pointsByName.set(i.product_name, (pointsByName.get(i.product_name) ?? 0) + pointsForLine(i, loyaltyRates));
    }
  }
  const dishRows = marginByDish(items, costMaps).map((r) => ({ ...r, points: Math.floor(pointsByName.get(r.name) ?? 0) }));

  const n = dishRows.length;
  const k = Math.max(1, Math.floor(n * 0.25));
  const byQty = [...dishRows].sort((a, b) => b.qty - a.qty);
  const byMargin = dishRows.filter((r) => r.margin !== null).sort((a, b) => b.margin! - a.margin!);
  const topQty = new Set(byQty.slice(0, k).map((r) => r.name));
  const topMargin = new Set(byMargin.slice(0, k).map((r) => r.name));
  const bottomQty = new Set(byQty.slice(-k).map((r) => r.name));

  const rows: ProductSalesRow[] = dishRows.map((r) => ({
    ...r,
    badge: n < 3 ? null : topQty.has(r.name) && topMargin.has(r.name) ? "phare" : bottomQty.has(r.name) ? "surveiller" : null,
  }));

  return {
    view,
    offset: safeOffset,
    rangeLabel,
    canGoNext: safeOffset > 0,
    totalQty: rows.reduce((sum, r) => sum + r.qty, 0),
    totalRevenue: rows.reduce((sum, r) => sum + r.revenue, 0),
    rows,
  };
}
