import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Modification du numéro WhatsApp d'un client existant depuis l'Admin. Même
 * validation/normalisation et même détection de conflit proactive que
 * /api/admin/clients/create, mais exclut le profil lui-même de la recherche
 * de conflit (sinon un numéro inchangé se signalerait comme "déjà utilisé").
 * Ce numéro devient ensuite le point d'identification WhatsApp du client
 * pour tous les messages entrants (upsert par whatsapp_phone côté webhook).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };

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
    .neq("id", params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Ce numéro est déjà utilisé par un autre client.", existingClient: existing }, { status: 409 });
  }

  const { error: updateError } = await supabase.from("profiles").update({ whatsapp_phone: phone }).eq("id", params.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json({ error: "Ce numéro est déjà utilisé par un autre client." }, { status: 409 });
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true, phone });
}
