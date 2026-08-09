// ============================================================
// Correctif ponctuel : avant la migration 0044, le trigger Finance créditait
// le compte "Ventes" du montant TOTAL de la commande (denrées + livraison).
// Les frais de livraison sont perçus au nom du prestataire livreur externe
// (l'argent lui revient intégralement) — ce n'est pas un revenu CHIVI.
// Ce script corrige rétroactivement le montant des transactions Finance déjà
// enregistrées (source_type='order') pour qu'il reflète orders.subtotal
// plutôt que orders.total.
//
// Usage :
//   node scripts/fix-sales-transactions-subtotal.ts              (dry-run, défaut)
//   node scripts/fix-sales-transactions-subtotal.ts --apply       (écrit réellement)
//
// Si Node refuse d'exécuter un fichier .ts directement :
//   node --experimental-strip-types scripts/fix-sales-transactions-subtotal.ts
//
// Idempotent : ne recalcule que l'écart entre le montant enregistré et
// orders.subtotal — relancer après --apply ne trouve plus rien à corriger.
// ============================================================

import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const APPLY = process.argv.includes("--apply");
const REPORT_PATH = new URL("../scripts/sales-subtotal-fix-report.txt", import.meta.url);

interface OrderTxRow {
  id: string;
  amount: number;
  description: string | null;
  source_id: string | null;
}
interface OrderRow {
  id: string;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: orderTx, error: txErr } = await supabase
    .from("finance_transactions")
    .select("id, amount, description, source_id")
    .eq("source_type", "order");
  if (txErr) {
    console.error("Échec de la lecture des transactions Ventes :", txErr.message);
    process.exit(1);
  }

  const sourceIds = (orderTx ?? []).map((t) => t.source_id).filter((id): id is string => !!id);
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, order_number, subtotal, delivery_fee, total")
    .in("id", sourceIds.length > 0 ? sourceIds : ["00000000-0000-0000-0000-000000000000"]);
  if (ordersErr) {
    console.error("Échec de la lecture des commandes :", ordersErr.message);
    process.exit(1);
  }
  const orderById = new Map((orders as OrderRow[] ?? []).map((o) => [o.id, o]));

  const toFix = (orderTx as OrderTxRow[] ?? [])
    .map((t) => {
      const order = t.source_id ? orderById.get(t.source_id) : undefined;
      return { tx: t, order };
    })
    .filter((row) => row.order && row.tx.amount !== row.order.subtotal);

  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push(`Correctif Ventes hors livraison — ${APPLY ? "MODE APPLY (écriture réelle)" : "MODE DRY-RUN (aucune écriture)"}`);
  lines.push(`Généré le ${new Date().toLocaleString("fr-FR")}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Transactions "order" au total : ${orderTx?.length ?? 0}`);
  lines.push(`Transactions à corriger (montant ≠ sous-total) : ${toFix.length}`);
  for (const { tx, order } of toFix) {
    lines.push(
      `  ${order!.order_number} — enregistré ${tx.amount} FCFA → sous-total réel ${order!.subtotal} FCFA (livraison ${order!.delivery_fee} FCFA)`
    );
  }
  lines.push("");

  const report = lines.join("\n");
  console.log(report);
  writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`\nRapport écrit dans ${REPORT_PATH.pathname}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — aucune écriture en base. Relancer avec --apply pour corriger ces montants.");
    return;
  }

  console.log(`\nCorrection de ${toFix.length} transaction(s)...`);
  let fixed = 0;
  for (const { tx, order } of toFix) {
    const { error } = await supabase.from("finance_transactions").update({ amount: order!.subtotal }).eq("id", tx.id);
    if (error) {
      console.error(`  ÉCHEC ${order!.order_number} :`, error.message);
      continue;
    }
    fixed++;
  }
  console.log(`Terminé : ${fixed}/${toFix.length} transaction(s) corrigée(s).`);
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exit(1);
});
