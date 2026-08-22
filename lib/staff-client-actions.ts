import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { findBestMatch } from "@/lib/fuzzy-match";
import { isConfirmationReply } from "@/lib/staff-log";

/**
 * Actions client (renommer, changer numéro) proposées par
 * classifyStaffIntent (lib/ai-provider.ts) — jamais appliquées
 * directement : comme pour log_order, une confirmation explicite ("OUI")
 * est requise avant toute écriture. Une seule action en attente à la fois
 * par numéro staff (table staff_pending_actions, migration 0045).
 */

export interface PendingClientAction {
  id: string;
  action_type: "rename_client" | "update_client_phone";
  payload: Record<string, unknown>;
  summary: string;
}

export async function getPendingClientAction(staffPhone: string): Promise<PendingClientAction | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("staff_pending_actions")
    .select("id, action_type, payload, summary")
    .eq("staff_phone", staffPhone)
    .eq("status", "awaiting_confirmation")
    .maybeSingle();
  return data as PendingClientAction | null;
}

async function sendToStaff(staffPhone: string, message: string): Promise<void> {
  const supabase = createServiceClient();
  try {
    const sendResult = await sendWhatsappText(staffPhone, message);
    await supabase.from("whatsapp_messages").insert({
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: staffPhone,
      message_type: "text",
      content: message,
    });
  } catch (err) {
    console.error("[staff-client-actions] failed to reply to staff", err);
  }
}

/**
 * Retrouve un client par numéro (si l'identifiant ressemble à un numéro —
 * 8 chiffres ou plus, jamais ambigu) ou par nom (fuzzy match, lib/fuzzy-match.ts
 * déjà utilisé ailleurs dans le projet — seuil 0.6, un peu plus permissif que
 * le seuil par défaut car un identifiant de client est court et le staff ne
 * l'épelle pas toujours exactement).
 */
async function resolveClientByIdentifier(identifier: string): Promise<{ id: string; fullName: string | null; whatsappPhone: string } | null> {
  const supabase = createServiceClient();
  const digitsOnly = identifier.replace(/[^\d]/g, "");

  if (digitsOnly.length >= 8) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, whatsapp_phone")
      .ilike("whatsapp_phone", `%${digitsOnly.slice(-8)}%`)
      .order("id")
      .limit(1)
      .maybeSingle();
    if (data) return { id: data.id, fullName: data.full_name, whatsappPhone: data.whatsapp_phone };
  }

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, whatsapp_phone").not("full_name", "is", null).order("id");
  const match = findBestMatch(identifier, profiles ?? [], (p) => p.full_name ?? "", 0.6);
  if (match) return { id: match.item.id, fullName: match.item.full_name, whatsappPhone: match.item.whatsapp_phone };
  return null;
}

/** Préserve un indicatif international explicite (+XXX...) s'il est présent ; sinon assume Bénin (+229) pour un numéro local à 8 chiffres — même convention que le reste de l'app (ex: app/api/admin/clients/create). */
function normalizeNewPhone(raw: string): string {
  const explicitIntl = raw.match(/\+\s*(\d[\d\s.-]{6,}\d)/);
  if (explicitIntl) return explicitIntl[1].replace(/[^\d]/g, "");
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 8) return `229${digits}`;
  return digits;
}

async function createPendingAction(
  staffPhone: string,
  actionType: "rename_client" | "update_client_phone",
  payload: Record<string, unknown>,
  summary: string
): Promise<void> {
  const supabase = createServiceClient();
  // Une seule action en attente à la fois — proposer une nouvelle action
  // signifie qu'on ne veut plus de la précédente si elle n'a pas encore été confirmée.
  await supabase.from("staff_pending_actions").update({ status: "abandoned" }).eq("staff_phone", staffPhone).eq("status", "awaiting_confirmation");
  const { error } = await supabase.from("staff_pending_actions").insert({ staff_phone: staffPhone, action_type: actionType, payload, summary });
  if (error) console.error("[staff-client-actions] failed to create pending action", error);
}

export async function proposeRenameClient(staffPhone: string, clientIdentifier: string, newName: string): Promise<void> {
  const client = await resolveClientByIdentifier(clientIdentifier);
  if (!client) {
    await sendToStaff(staffPhone, `Client introuvable pour "${clientIdentifier}". Précise le nom exact ou le numéro WhatsApp.`);
    return;
  }
  const cleanName = newName.trim();
  if (!cleanName) {
    await sendToStaff(staffPhone, "Le nouveau nom est vide — précise le nom souhaité.");
    return;
  }
  const summary = `Renommer "${client.fullName ?? client.whatsappPhone}" (${client.whatsappPhone}) en "${cleanName}" ? Répondez OUI pour confirmer.`;
  await createPendingAction(staffPhone, "rename_client", { profileId: client.id, newName: cleanName }, summary);
  await sendToStaff(staffPhone, summary);
}

export async function proposeUpdateClientPhone(staffPhone: string, clientIdentifier: string, newPhoneRaw: string): Promise<void> {
  const client = await resolveClientByIdentifier(clientIdentifier);
  if (!client) {
    await sendToStaff(staffPhone, `Client introuvable pour "${clientIdentifier}". Précise le nom exact ou le numéro WhatsApp actuel.`);
    return;
  }
  const newPhone = normalizeNewPhone(newPhoneRaw);
  if (newPhone.length < 8) {
    await sendToStaff(staffPhone, "Le nouveau numéro semble invalide — précise-le à nouveau.");
    return;
  }
  const summary = `Modifier le numéro de "${client.fullName ?? client.whatsappPhone}" : ${client.whatsappPhone} → ${newPhone} ? Répondez OUI pour confirmer.`;
  await createPendingAction(staffPhone, "update_client_phone", { profileId: client.id, newPhone }, summary);
  await sendToStaff(staffPhone, summary);
}

/**
 * Traite la réponse du staff à une action en attente. Retourne `true` si
 * l'action a été appliquée (confirmation) ou abandonnée avec message
 * explicite — dans les deux cas l'appelant n'a rien de plus à faire pour CE
 * message. Retourne `false` si la réponse n'est pas une confirmation :
 * l'action est abandonnée silencieusement et l'appelant doit retraiter le
 * message normalement (nouvelle intention possible).
 */
export async function handlePendingClientActionReply(staffPhone: string, pending: PendingClientAction, replyText: string): Promise<boolean> {
  const supabase = createServiceClient();

  if (!isConfirmationReply(replyText)) {
    await supabase.from("staff_pending_actions").update({ status: "abandoned" }).eq("id", pending.id);
    console.log("[staff-client-actions] action en attente abandonnée (réponse non confirmative) — retraitement normal du message", {
      staffPhone,
      actionType: pending.action_type,
      replyText,
    });
    return false;
  }

  if (pending.action_type === "rename_client") {
    const { profileId, newName } = pending.payload as { profileId: string; newName: string };
    const { error } = await supabase.from("profiles").update({ full_name: newName }).eq("id", profileId);
    await supabase.from("staff_pending_actions").update({ status: "completed" }).eq("id", pending.id);
    await sendToStaff(staffPhone, error ? "Échec de la modification — réessaie." : `✅ Client renommé en "${newName}".`);
    if (error) console.error("[staff-client-actions] rename_client FAILED", error);
    return true;
  }

  if (pending.action_type === "update_client_phone") {
    const { profileId, newPhone } = pending.payload as { profileId: string; newPhone: string };
    const { error } = await supabase.from("profiles").update({ whatsapp_phone: newPhone }).eq("id", profileId);
    await supabase.from("staff_pending_actions").update({ status: "completed" }).eq("id", pending.id);
    await sendToStaff(
      staffPhone,
      error ? "Échec de la modification — le numéro est peut-être déjà utilisé par un autre client." : `✅ Numéro mis à jour : ${newPhone}.`
    );
    if (error) console.error("[staff-client-actions] update_client_phone FAILED", error);
    return true;
  }

  return true;
}
