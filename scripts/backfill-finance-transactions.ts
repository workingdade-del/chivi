// ============================================================
// Rattrapage ponctuel : le module Finance (migration 0041) génère des
// transactions automatiquement via des triggers, mais uniquement pour
// les NOUVEAUX insert/update — toutes les commandes déjà "livree" et
// toutes les dépenses déjà enregistrées AVANT la création du module
// n'ont jamais généré de finance_transactions. Ce script comble ce
// trou une seule fois.
//
// Usage :
//   node scripts/backfill-finance-transactions.ts              (dry-run, défaut)
//   node scripts/backfill-finance-transactions.ts --apply       (écrit réellement)
//
// Si Node refuse d'exécuter un fichier .ts directement :
//   node --experimental-strip-types scripts/backfill-finance-transactions.ts
//
// Idempotent : ne crée jamais de transaction pour une source_id qui en
// a déjà une (source_type='order'|'expense') — relancer le script
// plusieurs fois, y compris après --apply, ne duplique rien.
// ============================================================

import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const APPLY = process.argv.includes("--apply");
const REPORT_PATH = new URL("../scripts/finance-backfill-report.txt", import.meta.url);

interface LivreeOrder {
  id: string;
  order_number: string;
  total: number;
  created_at: string;
}
interface ExpenseRow {
  id: string;
  label: string;
  amount: number;
  category: string;
  expense_date: string;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: ventesAccount, error: ventesErr } = await supabase
    .from("finance_accounts")
    .select("id, name")
    .eq("type", "ventes")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: depensesAccount, error: depensesErr } = await supabase
    .from("finance_accounts")
    .select("id, name")
    .eq("name", "Dépenses")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ventesErr || depensesErr || !ventesAccount || !depensesAccount) {
    console.error("Comptes Finance introuvables (Ventes / Dépenses) — la migration 0041 est-elle bien appliquée ?", {
      ventesErr,
      depensesErr,
    });
    process.exit(1);
  }

  const { data: livreeOrders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, order_number, total, created_at")
    .eq("status", "livree");
  if (ordersErr) {
    console.error("Échec de la lecture des commandes livrées :", ordersErr.message);
    process.exit(1);
  }

  const { data: expenses, error: expensesErr2 } = await supabase.from("expenses").select("id, label, amount, category, expense_date");
  if (expensesErr2) {
    console.error("Échec de la lecture des dépenses :", expensesErr2.message);
    process.exit(1);
  }

  const { data: existingOrderTx } = await supabase.from("finance_transactions").select("source_id").eq("source_type", "order");
  const { data: existingExpenseTx } = await supabase.from("finance_transactions").select("source_id").eq("source_type", "expense");
  const existingOrderIds = new Set((existingOrderTx ?? []).map((t) => t.source_id));
  const existingExpenseIds = new Set((existingExpenseTx ?? []).map((t) => t.source_id));

  const missingOrders = ((livreeOrders ?? []) as LivreeOrder[]).filter((o) => !existingOrderIds.has(o.id));
  const missingExpenses = ((expenses ?? []) as ExpenseRow[]).filter((e) => !existingExpenseIds.has(e.id));

  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push(`Rattrapage transactions Finance — ${APPLY ? "MODE APPLY (écriture réelle)" : "MODE DRY-RUN (aucune écriture)"}`);
  lines.push(`Généré le ${new Date().toLocaleString("fr-FR")}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Commandes "livree" au total : ${livreeOrders?.length ?? 0}`);
  lines.push(`Commandes sans transaction Finance (à créer) : ${missingOrders.length}`);
  for (const o of missingOrders) {
    lines.push(`  ${o.order_number} — ${o.total} FCFA — ${new Date(o.created_at).toLocaleDateString("fr-FR")}`);
  }
  lines.push("");
  lines.push(`Dépenses au total : ${expenses?.length ?? 0}`);
  lines.push(`Dépenses sans transaction Finance (à créer) : ${missingExpenses.length}`);
  for (const e of missingExpenses) {
    lines.push(`  ${e.label} — ${e.amount} FCFA — ${e.expense_date}`);
  }
  lines.push("");

  const report = lines.join("\n");
  console.log(report);
  writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`\nRapport écrit dans ${REPORT_PATH.pathname}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — aucune écriture en base. Relancer avec --apply pour créer ces transactions.");
    return;
  }

  console.log(`\nCréation de ${missingOrders.length} transaction(s) commande + ${missingExpenses.length} transaction(s) dépense...`);
  let created = 0;

  for (const o of missingOrders) {
    const { error } = await supabase.from("finance_transactions").insert({
      account_id: ventesAccount.id,
      type: "entree",
      amount: o.total,
      description: `Commande ${o.order_number}`,
      source_type: "order",
      source_id: o.id,
      date: o.created_at.slice(0, 10),
    });
    if (error) {
      console.error(`  ÉCHEC commande ${o.order_number} :`, error.message);
      continue;
    }
    created++;
  }

  for (const e of missingExpenses) {
    const { error } = await supabase.from("finance_transactions").insert({
      account_id: depensesAccount.id,
      type: "sortie",
      amount: e.amount,
      description: e.label,
      category: e.category,
      source_type: "expense",
      source_id: e.id,
      date: e.expense_date,
    });
    if (error) {
      console.error(`  ÉCHEC dépense "${e.label}" :`, error.message);
      continue;
    }
    created++;
  }

  console.log(`Terminé : ${created}/${missingOrders.length + missingExpenses.length} transaction(s) créée(s).`);
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exit(1);
});
