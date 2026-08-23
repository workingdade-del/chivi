import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";

/**
 * Fusionne deux profils clients en doublon depuis l'Admin. Le profil `keepId`
 * (la fiche depuis laquelle la fusion est lancée) survit toujours ; `mergeId`
 * est celui qu'on supprime. Toutes ses commandes (orders.profile_id) et
 * messages (whatsapp_messages.profile_id) sont d'abord réassignés à keepId,
 * puis mergeId est supprimé (libère son whatsapp_phone de la contrainte
 * unique), puis les champs choisis explicitement (nom, notes, adresse,
 * numéro final) sont appliqués sur keepId. Ordre important : mergeId doit
 * être supprimé AVANT d'écrire son numéro sur keepId, sinon la contrainte
 * unique sur whatsapp_phone bloquerait l'update tant que mergeId existe
 * encore avec ce même numéro.
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
    keepId?: string;
    mergeId?: string;
    fullName?: string | null;
    notes?: string | null;
    usualAddressText?: string | null;
    usualAddressLat?: number | null;
    usualAddressLng?: number | null;
    usualDeliveryFee?: number | null;
    whatsappPhone?: string;
  };

  if (!body.keepId || !body.mergeId || body.keepId === body.mergeId) {
    return NextResponse.json({ error: "Deux profils distincts sont requis pour fusionner." }, { status: 400 });
  }
  if (!body.whatsappPhone?.trim()) {
    return NextResponse.json({ error: "Le numéro WhatsApp final à conserver est requis." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const phone = body.whatsappPhone.replace(/\D/g, "");

  const { data: mergeProfile } = await supabase.from("profiles").select("id").eq("id", body.mergeId).maybeSingle();
  if (!mergeProfile) {
    return NextResponse.json({ error: "Le profil à fusionner est introuvable." }, { status: 404 });
  }

  const { data: conflict } = await supabase
    .from("profiles")
    .select("id, full_name, whatsapp_phone")
    .eq("whatsapp_phone", phone)
    .neq("id", body.keepId)
    .neq("id", body.mergeId)
    .maybeSingle();
  if (conflict) {
    return NextResponse.json(
      { error: "Ce numéro est déjà utilisé par un troisième profil.", existingClient: conflict },
      { status: 409 }
    );
  }

  const { error: ordersError } = await supabase.from("orders").update({ profile_id: body.keepId }).eq("profile_id", body.mergeId);
  if (ordersError) {
    return NextResponse.json({ error: `Échec de la réassignation des commandes : ${ordersError.message}` }, { status: 500 });
  }

  const { error: messagesError } = await supabase
    .from("whatsapp_messages")
    .update({ profile_id: body.keepId })
    .eq("profile_id", body.mergeId);
  if (messagesError) {
    return NextResponse.json({ error: `Échec de la réassignation des messages : ${messagesError.message}` }, { status: 500 });
  }

  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", body.mergeId);
  if (deleteError) {
    return NextResponse.json({ error: `Échec de la suppression du doublon : ${deleteError.message}` }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      whatsapp_phone: phone,
      full_name: body.fullName?.trim() ? sanitizeText(body.fullName.trim(), 100) : null,
      notes: body.notes?.trim() ? sanitizeText(body.notes.trim(), 2000) : null,
      usual_address_text: body.usualAddressText?.trim() ? sanitizeText(body.usualAddressText.trim(), 300) : null,
      usual_address_lat: body.usualAddressLat ?? null,
      usual_address_lng: body.usualAddressLng ?? null,
      usual_delivery_fee: body.usualDeliveryFee ?? null,
    })
    .eq("id", body.keepId);
  if (updateError) {
    return NextResponse.json({ error: `Fusion des commandes/messages réussie mais échec de la mise à jour du profil conservé : ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ merged: true });
}
