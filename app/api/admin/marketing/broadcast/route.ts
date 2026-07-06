import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText } from "@/lib/whatsapp";

const RECENT_DAYS = 30;

/** Diffuse un message WhatsApp aux clients ayant commandé dans les 30 derniers jours. Staff uniquement. */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("profile_id")
    .gte("created_at", since)
    .not("profile_id", "is", null);

  const profileIds = [...new Set((recentOrders ?? []).map((o) => o.profile_id as string))];
  if (profileIds.length === 0) {
    return NextResponse.json({ sent: 0, totalRecipients: 0 });
  }

  const { data: profiles } = await supabase.from("profiles").select("id, whatsapp_phone").in("id", profileIds);

  let sent = 0;
  for (const profile of profiles ?? []) {
    try {
      await sendWhatsappText(profile.whatsapp_phone, body.message);
      await supabase.from("whatsapp_messages").insert({
        profile_id: profile.id,
        direction: "outbound",
        phone: profile.whatsapp_phone,
        message_type: "text",
        content: body.message,
      });
      sent += 1;
    } catch (err) {
      console.error("[marketing-broadcast] échec envoi", { profileId: profile.id, error: err });
    }
  }

  await supabase.from("newsletter_sends").insert({
    subject: "Diffusion WhatsApp",
    body_html: body.message,
    recipient_count: sent,
    channel: "whatsapp",
    sent_by: user.id,
  });

  return NextResponse.json({ sent, totalRecipients: profiles?.length ?? 0 });
}
