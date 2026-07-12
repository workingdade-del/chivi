import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

/** Relance une commande annulée — repasse au statut "reçue" et réintègre le flow normal. Staff uniquement. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const orderId = params.id;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  if (order.status !== "annulee") {
    return NextResponse.json({ error: "Seule une commande annulée peut être relancée." }, { status: 409 });
  }

  const { error: updateError } = await supabase.from("orders").update({ status: "recue" }).eq("id", orderId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ relaunched: true });
}
