import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { NEXT_STATUS } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/supabase/types";

/** Avance manuelle de statut pour la démo client (bouton "Simuler l'étape suivante"). */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  const nextStatus = NEXT_STATUS[order.status as OrderStatus];

  const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: nextStatus });
}
