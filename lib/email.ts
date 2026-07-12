import { Resend } from "resend";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "CHIVI <onboarding@resend.dev>";

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function brandedShell(title: string, bodyHtml: string): string {
  return `
  <div style="background:#f7f0e2;padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ece2cd;">
      <div style="background:#7c0000;padding:28px 24px;text-align:center;">
        <div style="color:#f6bc13;font-size:26px;font-weight:800;letter-spacing:.03em;">CHIVI</div>
        <div style="color:#f6bc13;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-top:4px;">${title}</div>
      </div>
      <div style="padding:24px;color:#2a2015;">${bodyHtml}</div>
      <div style="background:#fff6e5;padding:16px 24px;text-align:center;color:#a6740a;font-size:12px;">
        La cuillère ne ment jamais — CHIVI, Cotonou
      </div>
    </div>
  </div>`;
}

export interface OrderReceiptParams {
  toEmail: string;
  orderNumber: string;
  itemsSummary: { name: string; qty: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  address: string;
  paymentLabel: string;
}

function fcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

/** Envoie le reçu de commande au client. No-op silencieux si RESEND_API_KEY absente. */
export async function sendOrderReceiptEmail(params: OrderReceiptParams): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY absente — reçu non envoyé (dégradation gracieuse)", {
      orderNumber: params.orderNumber,
    });
    return;
  }

  const rows = params.itemsSummary
    .map(
      (l) => `<tr>
        <td style="padding:6px 0;color:#2a2015;">${l.qty}× ${l.name}</td>
        <td style="padding:6px 0;text-align:right;color:#7c0000;font-weight:700;">${fcfa(l.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const html = brandedShell(
    "Reçu de commande",
    `
    <p style="font-size:15px;">Merci pour ta commande <b>${params.orderNumber}</b> !</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">${rows}</table>
    <div style="height:1px;background:#efe6d3;margin:16px 0;"></div>
    <table style="width:100%;font-size:14px;">
      <tr><td style="color:#6d6358;">Sous-total</td><td style="text-align:right;">${fcfa(params.subtotal)}</td></tr>
      <tr><td style="color:#6d6358;">Livraison</td><td style="text-align:right;">${fcfa(params.deliveryFee)}</td></tr>
      <tr><td style="font-weight:800;padding-top:6px;">Total</td><td style="text-align:right;font-weight:800;color:#7c0000;padding-top:6px;">${fcfa(params.total)}</td></tr>
    </table>
    <div style="height:1px;background:#efe6d3;margin:16px 0;"></div>
    <p style="font-size:13px;color:#6d6358;"><b>Adresse :</b> ${params.address}</p>
    <p style="font-size:13px;color:#6d6358;"><b>Paiement :</b> ${params.paymentLabel}</p>
    <p style="font-size:13px;color:#6d6358;"><b>Temps estimé :</b> 45–60 min</p>
    `
  );

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.toEmail,
      subject: `CHIVI — Reçu de ta commande ${params.orderNumber}`,
      html,
    });
  } catch (err) {
    console.error("[email] échec envoi reçu client", { orderNumber: params.orderNumber, error: err });
  }
}

/** Notifie l'admin d'une nouvelle commande. No-op silencieux si RESEND_API_KEY ou ADMIN_NOTIFICATION_EMAIL absente. */
export async function sendAdminOrderNotification(params: {
  orderNumber: string;
  total: number;
  phone: string;
  address: string;
}): Promise<void> {
  const resend = getResendClient();
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!resend || !adminEmail) {
    console.warn("[email] RESEND_API_KEY ou ADMIN_NOTIFICATION_EMAIL absente — notification admin non envoyée");
    return;
  }

  const html = brandedShell(
    "Nouvelle commande",
    `
    <p style="font-size:15px;">Nouvelle commande <b>${params.orderNumber}</b> — ${fcfa(params.total)}</p>
    <p style="font-size:13px;color:#6d6358;"><b>Client :</b> ${params.phone}</p>
    <p style="font-size:13px;color:#6d6358;"><b>Adresse :</b> ${params.address}</p>
    `
  );

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: adminEmail,
      subject: `CHIVI — Nouvelle commande ${params.orderNumber} (${fcfa(params.total)})`,
      html,
    });
  } catch (err) {
    console.error("[email] échec notification admin", { orderNumber: params.orderNumber, error: err });
  }
}

/** Notifie l'admin qu'une commande WhatsApp est bloquée après 3 échecs de localisation — l'IA a été désactivée sur cette conversation, prise en main manuelle nécessaire. */
export async function sendAdminLocationEscalationNotification(params: { phone: string }): Promise<void> {
  const resend = getResendClient();
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!resend || !adminEmail) {
    console.warn("[email] RESEND_API_KEY ou ADMIN_NOTIFICATION_EMAIL absente — notification d'escalade non envoyée");
    return;
  }

  const html = brandedShell(
    "Localisation échouée",
    `
    <p style="font-size:15px;">Un client n'a pas pu être localisé après 3 tentatives et l'IA a été désactivée sur sa conversation.</p>
    <p style="font-size:13px;color:#6d6358;"><b>Numéro :</b> ${params.phone}</p>
    <p style="font-size:13px;color:#6d6358;">Reprends la main dans la console Admin &gt; Conversations pour finaliser sa commande manuellement.</p>
    `
  );

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: adminEmail,
      subject: `CHIVI — Localisation échouée (${params.phone})`,
      html,
    });
  } catch (err) {
    console.error("[email] échec notification escalade localisation", { phone: params.phone, error: err });
  }
}

/**
 * Envoie une newsletter à une liste d'emails, un par un (Resend n'a pas de
 * vraie API "broadcast" simple à ce volume). Retourne le nombre envoyé avec
 * succès. No-op (0 envoyé) si RESEND_API_KEY absente — jamais d'exception.
 */
export async function sendBulkEmail(toEmails: string[], subject: string, html: string): Promise<number> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY absente — newsletter non envoyée (dégradation gracieuse)");
    return 0;
  }

  let sent = 0;
  for (const to of toEmails) {
    try {
      await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
      sent += 1;
    } catch (err) {
      console.error("[email] échec envoi newsletter", { to, error: err });
    }
  }
  return sent;
}
