import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Appelé chaque minute par Vercel Cron (voir vercel.json). Envoie les
 * messages WhatsApp différés dont l'échéance est passée (ex : feedback
 * client 5 min après livraison) — un serverless ne peut pas tenir un
 * setTimeout aussi long, donc on persiste et on poll.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: due, error } = await supabase
    .from("scheduled_messages")
    .select("id, phone, message")
    .eq("sent", false)
    .lte("send_at", new Date().toISOString())
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const row of due ?? []) {
    try {
      await sendWhatsappText(row.phone, row.message);
      await supabase.from("scheduled_messages").update({ sent: true }).eq("id", row.id);
      sent += 1;
    } catch (err) {
      console.error("[cron-scheduled-messages] failed to send", { id: row.id, error: err });
    }
  }

  return NextResponse.json({ processed: due?.length ?? 0, sent });
}
