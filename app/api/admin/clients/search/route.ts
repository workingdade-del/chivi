import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Recherche de profils clients pour le picker de fusion (Admin → fiche
 * client → "Fusionner avec un autre profil"). Retourne les champs
 * nécessaires pour pré-remplir la comparaison de fusion sans refetch.
 */
export async function GET(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const excludeId = req.nextUrl.searchParams.get("excludeId") ?? "";
  if (q.length < 2) {
    return NextResponse.json({ clients: [] });
  }

  const supabase = createServiceClient();
  const digits = q.replace(/\D/g, "");

  let query = supabase
    .from("profiles")
    .select("id, full_name, whatsapp_phone, notes, usual_address_text, usual_address_lat, usual_address_lng, usual_delivery_fee")
    .limit(8);

  query = digits.length >= 4 ? query.ilike("whatsapp_phone", `%${digits}%`) : query.ilike("full_name", `%${q}%`);

  const { data } = await query;
  const results = (data ?? []).filter((c) => c.id !== excludeId);

  return NextResponse.json({ clients: results });
}
