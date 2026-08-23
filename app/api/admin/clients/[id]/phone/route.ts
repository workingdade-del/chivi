import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Modification du numéro WhatsApp d'un client existant depuis l'Admin.
 * Numéro sans indicatif → traité comme béninois (préfixé 229). Numéro avec
 * un indicatif international explicite (+XXX...) → accepté tel quel, jamais
 * tronqué ni rejeté (clients ivoiriens, togolais, etc. — même logique que
 * normalizeNewPhone dans lib/staff-client-actions.ts, chemin staff-log/
 * WhatsApp, pour rester cohérent entre les deux). Détection de conflit
 * proactive comme /api/admin/clients/create, en excluant le profil
 * lui-même de la recherche (sinon un numéro inchangé se signalerait comme
 * "déjà utilisé"). Ce numéro devient ensuite le point d'identification
 * WhatsApp du client pour tous les messages entrants (upsert par
 * whatsapp_phone côté webhook).
 */
function normalizePhone(raw: string): string {
  const explicitIntl = raw.match(/\+\s*(\d[\d\s.-]{6,}\d)/);
  if (explicitIntl) return explicitIntl[1].replace(/[^\d]/g, "");
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 8) return `229${digits}`;
  return digits;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };

  const phone = normalizePhone(body.phone ?? "");
  if (phone.length < 8 || phone.length > 15) {
    return NextResponse.json(
      { error: "Numéro invalide — vérifie qu'il contient bien un indicatif international ou 8 chiffres pour le Bénin." },
      { status: 400 }
    );
  }

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
