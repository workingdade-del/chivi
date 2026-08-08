// ============================================================
// Détection (lecture seule) des order_items avec une quantité
// suspecte — ex: l'incident "Atassi CHIVI x1206" (CHV-2086), où
// l'IA a probablement confondu le prix unitaire (1200 FCFA) avec
// la quantité lors d'une extraction /commande-log.
//
// Usage :
//   node scripts/detect-suspicious-quantities.ts                 (seuil 20 par défaut)
//   node scripts/detect-suspicious-quantities.ts --threshold=50
//
// Ne corrige RIEN automatiquement — liste seulement, pour revue
// manuelle. Une fois une ligne confirmée, corrige-la précisément
// via l'Admin (Commandes → la commande → Modifier) plutôt que par
// ce script, qui reste volontairement en lecture seule.
// ============================================================

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
const THRESHOLD = thresholdArg ? parseInt(thresholdArg.split("=")[1], 10) : 20;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: items, error } = await supabase
    .from("order_items")
    .select("id, order_id, product_name, variant_name, quantity, unit_price, line_total, orders(order_number, status, source, created_at)")
    .gt("quantity", THRESHOLD)
    .order("quantity", { ascending: false });

  if (error) {
    console.error("Échec de la lecture des order_items :", error.message);
    process.exit(1);
  }

  const rows = (items ?? []) as unknown as {
    id: string;
    order_id: string;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    orders: { order_number: string; status: string; source: string; created_at: string } | null;
  }[];

  console.log("=".repeat(70));
  console.log(`Order_items avec quantité > ${THRESHOLD} — REVUE MANUELLE, rien n'est corrigé`);
  console.log(`Généré le ${new Date().toLocaleString("fr-FR")}`);
  console.log("=".repeat(70));
  console.log("");
  console.log(`${rows.length} ligne(s) trouvée(s).`);
  console.log("");

  for (const r of rows) {
    const label = r.variant_name ? `${r.product_name} (${r.variant_name})` : r.product_name;
    const suspiciousMatch = r.quantity === r.unit_price ? " ⚠️ quantité == prix unitaire, très probable confusion IA" : "";
    console.log(`- Commande ${r.orders?.order_number ?? "?"} (${r.orders?.source ?? "?"}, ${r.orders?.status ?? "?"}, ${r.orders ? new Date(r.orders.created_at).toLocaleDateString("fr-FR") : "?"})`);
    console.log(`    order_item_id: ${r.id}`);
    console.log(`    ${label} — quantité: ${r.quantity} × ${r.unit_price} FCFA = ${r.line_total} FCFA${suspiciousMatch}`);
    console.log("");
  }

  if (rows.length === 0) {
    console.log("Aucune ligne suspecte au-dessus de ce seuil.");
  } else {
    console.log("Aucune correction appliquée — confirme la (les) ligne(s) à corriger, la correction se fait ensuite manuellement via Admin → Commandes → Modifier.");
  }
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exit(1);
});
