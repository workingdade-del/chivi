import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";

/**
 * Création manuelle d'un client depuis l'Admin. profiles n'a aucune policy
 * RLS d'INSERT pour "authenticated" (seulement lecture + update) — la
 * création normale passe toujours par le service role (webhook, staff-
 * order/staff-log), jamais par un insert client direct avant cette
 * fonctionnalité. Même pattern que /api/admin/orders/create.
 */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    phone?: string;
    email?: string;
    addressText?: string;
    lat?: number;
    lng?: number;
    fee?: number;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Le nom du client est requis." }, { status: 400 });
  }

  const normalizedPhone = body.phone?.replace(/\D/g, "") ?? "";
  const isValidPhone = /^229\d{8}$/.test(normalizedPhone) || /^\d{8}$/.test(normalizedPhone);
  if (!isValidPhone) {
    return NextResponse.json(
      { error: "Numéro béninois invalide. Format attendu : 8 chiffres (ex : 90000000) ou avec l'indicatif (229 90000000)." },
      { status: 400 }
    );
  }
  const phone = normalizedPhone.length === 8 ? `229${normalizedPhone}` : normalizedPhone;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, full_name, whatsapp_phone")
    .eq("whatsapp_phone", phone)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Ce numéro est déjà utilisé par un client existant.", existingClient: existing }, { status: 409 });
  }

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      whatsapp_phone: phone,
      full_name: sanitizeText(body.name.trim(), 100),
      email: body.email?.trim() ? sanitizeText(body.email.trim(), 150) : null,
      usual_address_text: body.addressText?.trim() ? sanitizeText(body.addressText.trim(), 300) : null,
      usual_address_lat: body.lat ?? null,
      usual_address_lng: body.lng ?? null,
      usual_delivery_fee: body.fee ?? null,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    if (insertError?.code === "23505") {
      return NextResponse.json({ error: "Ce numéro est déjà utilisé par un client existant." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError?.message ?? "Échec de la création du client" }, { status: 500 });
  }

  return NextResponse.json({ created: true, clientId: created.id });
}
