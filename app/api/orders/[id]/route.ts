import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_method, payment_status, subtotal, delivery_fee, total, created_at, order_items(id, product_name, variant_name, unit_price, quantity, line_total, order_supplements(id, supplement_name, unit_price, quantity))"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  return NextResponse.json({ order });
}
