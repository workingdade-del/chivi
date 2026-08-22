import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { handleStaffQuestion } from "@/lib/staff-query";
import { proposeRenameClient, proposeUpdateClientPhone } from "@/lib/staff-client-actions";
import type { StaffIntent } from "@/lib/ai-provider";

async function replyDirect(staffPhone: string, message: string): Promise<void> {
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
    console.error("[staff-intent-dispatch] failed to reply to staff", err);
  }
}

/**
 * Traite toute intention NON "log_order" retournée par classifyStaffIntent
 * — partagé entre le dispatch top-level (lib/staff-order.ts) et le dispatch
 * pendant une session /commande-log active (lib/staff-log.ts::continueLogSession),
 * pour un comportement identique dans les deux cas. Retourne `true` si
 * l'intention a été traitée (l'appelant ne fait rien de plus avec ce
 * message), `false` si l'intention était "log_order" (l'appelant garde la main).
 */
export async function handleNonOrderIntent(staffPhone: string, intent: StaffIntent, rawMessage: string): Promise<boolean> {
  switch (intent.tool) {
    case "query_business_stats":
      await handleStaffQuestion(staffPhone, rawMessage);
      return true;
    case "small_talk":
      await replyDirect(staffPhone, intent.reply);
      return true;
    case "rename_client":
      await proposeRenameClient(staffPhone, intent.clientIdentifier, intent.newName);
      return true;
    case "update_client_phone":
      await proposeUpdateClientPhone(staffPhone, intent.clientIdentifier, intent.newPhone);
      return true;
    case "log_order":
      return false;
  }
}
