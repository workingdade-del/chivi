import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** Handshake de vérification exigé par Meta lors de la config du webhook. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WhatsappWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id: string }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
        }[];
      };
      field?: string;
    }[];
  }[];
}

/** Réception des messages entrants : log + auto-création du profil client. */
export async function POST(req: NextRequest) {
  const payload = (await req.json()) as WhatsappWebhookPayload;
  const supabase = createServiceClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      for (const message of value.messages) {
        const contact = value.contacts?.find((c) => c.wa_id === message.from);

        const { data: profile } = await supabase
          .from("profiles")
          .upsert(
            { whatsapp_phone: message.from, full_name: contact?.profile?.name },
            { onConflict: "whatsapp_phone", ignoreDuplicates: false }
          )
          .select("id")
          .single();

        await supabase.from("whatsapp_messages").insert({
          profile_id: profile?.id ?? null,
          wa_message_id: message.id,
          direction: "inbound",
          phone: message.from,
          message_type: message.type,
          content: message.text?.body ?? null,
          payload: message as unknown as Record<string, unknown>,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
