import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/order-status";
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
    product_name: string;
    variant_name: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    order_supplements: { supplement_name: string; unit_price: number }[];
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

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay() === 0 ? 7 : x.getDay(); // lundi = 1
  x.setDate(x.getDate() - (day - 1));
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export interface DashboardData {
  ordersToday: number;
  revenueToday: number;
  costsToday: number;
  profitToday: number;
  marginToday: number;
  chart: { day: string; revenue: number }[];
  inProgress: { recue: number; en_preparation_prete: number; en_route: number };
  topDishes: { name: string; qty: number }[];
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

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const { data: weekOrders } = await supabase
    .from("orders")
    .select("total, created_at")
    .gte("created_at", sevenDaysAgo.toISOString())
    .neq("status", "annulee");

  const chart: { day: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const dayLabel = day.toLocaleDateString("fr-FR", { weekday: "short" });
    const dayRevenue = (weekOrders ?? [])
      .filter((o) => startOfDay(new Date(o.created_at)).getTime() === day.getTime())
      .reduce((s, o) => s + o.total, 0);
    chart.push({ day: dayLabel, revenue: dayRevenue });
  }

  const { data: activeOrders } = await supabase
    .from("orders")
    .select("status")
    .in("status", ["recue", "en_preparation", "prete", "en_route"]);

  const inProgress = {
    recue: (activeOrders ?? []).filter((o) => o.status === "recue").length,
    en_preparation_prete: (activeOrders ?? []).filter((o) => o.status === "en_preparation" || o.status === "prete").length,
    en_route: (activeOrders ?? []).filter((o) => o.status === "en_route").length,
  };

  const { data: itemsToday } = await supabase
    .from("order_items")
    .select("product_name, quantity, orders!inner(created_at)")
    .gte("orders.created_at", today.toISOString());

  const dishCounts = new Map<string, number>();
  const todaysItems = (itemsToday ?? []) as unknown as { product_name: string; quantity: number }[];
  for (const item of todaysItems) {
    dishCounts.set(item.product_name, (dishCounts.get(item.product_name) ?? 0) + item.quantity);
  }
  const topDishes = [...dishCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({ name, qty }));

  return { ordersToday, revenueToday, costsToday, profitToday, marginToday, chart, inProgress, topDishes };
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
      "id, order_number, status, payment_method, subtotal, delivery_fee, total, client_note, created_at, delivery_address, profiles(full_name, whatsapp_phone), order_items(id, product_name, variant_name, unit_price, quantity, line_total, order_supplements(supplement_name, unit_price)), order_assignments(id, drivers(id, name, phone))"
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
  const { data: drivers } = await supabase.from("drivers").select("id, name, phone, status").order("name");

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

export type ReportPeriod = "jour" | "semaine" | "mois";

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
}

const DAYPARTS = [
  { label: "6h–14h", start: 6, end: 14 },
  { label: "14h–18h", start: 14, end: 18 },
  { label: "18h–24h", start: 18, end: 24 },
];

export async function getReport(period: ReportPeriod): Promise<ReportData> {
  const supabase = createClient();
  const today = startOfDay(new Date());
  const rangeStart = period === "jour" ? today : period === "semaine" ? startOfWeek(new Date()) : startOfMonth(new Date());

  const { data: orders } = await supabase
    .from("orders")
    .select("total, delivery_fee, created_at")
    .gte("created_at", rangeStart.toISOString())
    .neq("status", "annulee");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, expense_date")
    .gte("expense_date", rangeStart.toISOString().slice(0, 10));

  const revenue = (orders ?? []).reduce((s, o) => s + o.total, 0);
  const deliveryCosts = (orders ?? []).reduce((s, o) => s + o.delivery_fee, 0);
  const costs = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const profit = revenue - costs;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  let rows: ReportRow[] = [];
  let rowHead = "Période";
  let label = "aujourd'hui";

  if (period === "jour") {
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
    rowHead = "Jour";
    label = "cette semaine";
    for (let i = 0; i < 7; i++) {
      const day = new Date(rangeStart);
      day.setDate(day.getDate() + i);
      if (day > new Date()) break;
      const dayOrders = (orders ?? []).filter((o) => startOfDay(new Date(o.created_at)).getTime() === day.getTime());
      const dayRevenue = dayOrders.reduce((s, o) => s + o.total, 0);
      rows.push({
        label: day.toLocaleDateString("fr-FR", { weekday: "long" }),
        orders: dayOrders.length,
        revenue: dayRevenue,
        costs: 0,
        profit: dayRevenue,
      });
    }
  } else {
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
  };
}

export { STATUS_LABELS };
