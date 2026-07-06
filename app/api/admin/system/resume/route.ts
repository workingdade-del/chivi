import { NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { buildResumeMessage, sendWhatsappText } from "@/lib/whatsapp";

/**
 * Rétablit le service et prévient par WhatsApp tous les clients qui ont
 * écrit pendant la pause (bornés par paused_at, capturé avant reset).
 * Un échec d'envoi pour un client donné ne doit jamais bloquer les autres
 * ni empêcher le rétablissement du service.
 */
export async function POST() {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from("system_settings")
    .select("paused_at")
    .eq("id", true)
    .maybeSingle();

  let notified = 0;

  if (settings?.paused_at) {
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("profile_id")
      .eq("direction", "inbound")
      .gte("created_at", settings.paused_at)
      .not("profile_id", "is", null);

    const profileIds = [...new Set((messages ?? []).map((m) => m.profile_id as string))];

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, whatsapp_phone")
        .in("id", profileIds);

      for (const profile of profiles ?? []) {
        try {
          await sendWhatsappText(profile.whatsapp_phone, buildResumeMessage());
          await supabase.from("whatsapp_messages").insert({
            profile_id: profile.id,
            direction: "outbound",
            phone: profile.whatsapp_phone,
            message_type: "text",
            content: "Notification de rétablissement du service",
          });
          notified += 1;
        } catch (err) {
          console.error("[system-resume] failed to notify profile", { profileId: profile.id, error: err });
        }
      }
    }
  }

  const { error } = await supabase
    .from("system_settings")
    .update({ is_paused: false, pause_reason: null, paused_at: null, paused_by: null })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ resumed: true, notified });
}
