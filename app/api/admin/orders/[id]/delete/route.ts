import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Suppression RÉELLE et irréversible d'une commande. orders n'a aucune
 * policy RLS de DELETE pour "authenticated" (uniquement select/update) —
 * passage obligé par le service role, comme les autres écritures
 * bloquées par RLS dans ce projet. order_items/order_supplements/
 * order_assignments partent en cascade (FK on delete cascade) ; la
 * finance_transaction éventuellement générée par le trigger
 * "livree" N'EST PAS supprimée (source_id devient une référence
 * orpheline mais reste visible en historique — voir migration 0041,
 * les transactions générées ne suivent pas de cascade de suppression
 * explicite).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const orderId = params.id;

  const { data: order, error: findError } = await supabase.from("orders").select("id, order_number").eq("id", orderId).maybeSingle();
  if (findError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from("orders").delete().eq("id", orderId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, orderNumber: order.order_number });
}
