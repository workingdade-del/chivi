import { createServiceClient } from "@/lib/supabase/server";
import { startOfDay, startOfWeek, startOfMonth } from "@/lib/admin";
import { loadCostMaps, summarizeMargins, type OrderItemForMargin } from "@/lib/margin";

/**
 * Requêtes DB réelles utilisées par l'interface de question Admin
 * (lib/staff-query.ts) — l'IA n'a JAMAIS le droit d'inventer des chiffres,
 * elle appelle une de ces fonctions (via tool calling) et ne fait que
 * mettre en forme le résultat exact renvoyé ici.
 */

export type QueryPeriod = "today" | "week" | "month";

function rangeStartFor(period: QueryPeriod): Date {
  const now = new Date();
  if (period === "today") return startOfDay(now);
  if (period === "week") return startOfWeek(now);
  return startOfMonth(now);
}

export interface RevenueSummaryResult {
  period: QueryPeriod;
  revenue: number;
  orderCount: number;
}

export async function queryRevenueSummary(period: QueryPeriod): Promise<RevenueSummaryResult> {
  const supabase = createServiceClient();
  const start = rangeStartFor(period);
  const { data } = await supabase.from("orders").select("total").gte("created_at", start.toISOString()).neq("status", "annulee");
  const revenue = (data ?? []).reduce((s, o) => s + o.total, 0);
  return { period, revenue, orderCount: data?.length ?? 0 };
}

export interface TopDishResult {
  period: QueryPeriod;
  dishName: string | null;
  quantitySold: number;
}

export async function queryTopDish(period: QueryPeriod): Promise<TopDishResult> {
  const supabase = createServiceClient();
  const start = rangeStartFor(period);
  const { data } = await supabase
    .from("order_items")
    .select("product_name, quantity, orders!inner(created_at, status)")
    .gte("orders.created_at", start.toISOString())
    .neq("orders.status", "annulee");

  const rows = (data ?? []) as unknown as { product_name: string; quantity: number }[];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.product_name, (counts.get(r.product_name) ?? 0) + r.quantity);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { period, dishName: sorted[0]?.[0] ?? null, quantitySold: sorted[0]?.[1] ?? 0 };
}

export interface MarginSummaryResult {
  period: QueryPeriod;
  margin: number;
  coveragePct: number;
}

export async function queryMarginSummary(period: QueryPeriod): Promise<MarginSummaryResult> {
  const supabase = createServiceClient();
  const start = rangeStartFor(period);
  const { data } = await supabase
    .from("order_items")
    .select("product_id, product_variant_id, quantity, line_total, orders!inner(created_at, status)")
    .gte("orders.created_at", start.toISOString())
    .neq("orders.status", "annulee");

  const items = (data ?? []) as unknown as OrderItemForMargin[];
  const costMaps = await loadCostMaps(supabase);
  const summary = summarizeMargins(items, costMaps);
  return { period, margin: summary.knownMargin, coveragePct: summary.coveragePct };
}

export interface DriverDeliveryResult {
  driverName: string;
  found: boolean;
  deliveryCount: number;
}

export async function queryDriverDeliveryCount(driverNameQuery: string, period: QueryPeriod): Promise<DriverDeliveryResult> {
  const supabase = createServiceClient();
  const start = rangeStartFor(period);

  const { data: driver } = await supabase.from("drivers").select("id, name").ilike("name", `%${driverNameQuery}%`).limit(1).maybeSingle();
  if (!driver) {
    return { driverName: driverNameQuery, found: false, deliveryCount: 0 };
  }

  const { data } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("driver_id", driver.id)
    .eq("status", "livree")
    .gte("delivered_at", start.toISOString());

  return { driverName: driver.name, found: true, deliveryCount: data?.length ?? 0 };
}
