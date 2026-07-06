import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { brandedShell, sendBulkEmail } from "@/lib/email";

/** Envoie une newsletter à tous les clients ayant fourni un email (opt-in implicite à la commande). Staff uniquement. */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { subject?: string; message?: string; template?: string };
  if (!body.subject?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "Sujet et message requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: profiles } = await supabase.from("profiles").select("email").not("email", "is", null);
  const recipients = [...new Set((profiles ?? []).map((p) => p.email).filter(Boolean))] as string[];

  const html = brandedShell(
    body.template === "promo" ? "Offre spéciale" : body.template === "nouveau_plat" ? "Nouveau plat" : "Actualité CHIVI",
    `<div style="font-size:14px;line-height:1.6;white-space:pre-line;">${body.message}</div>`
  );

  const sent = recipients.length > 0 ? await sendBulkEmail(recipients, body.subject, html) : 0;

  await supabase.from("newsletter_sends").insert({
    subject: body.subject,
    template: body.template ?? null,
    body_html: html,
    recipient_count: sent,
    channel: "email",
    sent_by: user.id,
  });

  return NextResponse.json({ sent, totalOptedIn: recipients.length });
}
