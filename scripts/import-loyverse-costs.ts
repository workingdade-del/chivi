// ============================================================
// Import ponctuel des coûts ingrédients depuis un export Loyverse
// (data/loyverse_export.csv) vers product_costs.ingredient_cost /
// product_variants.ingredient_cost + products.ingredients.
//
// Usage :
//   node scripts/import-loyverse-costs.ts               (dry-run, défaut)
//   node scripts/import-loyverse-costs.ts --apply        (écrit réellement)
//
// Si Node refuse d'exécuter un fichier .ts directement (versions plus
// anciennes que Node 22.6+), relancer avec :
//   node --experimental-strip-types scripts/import-loyverse-costs.ts
//
// Ne touche JAMAIS packaging_cost ni products.base_price — uniquement
// ingredient_cost (product_costs ou product_variants selon le type de
// correspondance) et products.ingredients (produits uniquement, les
// variantes n'ont pas de colonne "ingredients" dédiée).
// ============================================================

import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Copie locale de l'algorithme de lib/fuzzy-match.ts — un script exécuté
// directement via `node` (sans bundler) ne peut pas fiablement importer un
// module .ts du projet (tsc sous moduleResolution "bundler" refuse les
// extensions .ts explicites dans les imports, alors que le loader natif de
// Node les exige) ; garder ce fichier autonome évite tout conflit de
// résolution. Reste identique à similarity()/findBestMatch() — à
// resynchroniser manuellement si lib/fuzzy-match.ts change.
function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

// --- Charge .env.local (même pattern que scripts/create-staff-user.mjs) ---
const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const APPLY = process.argv.includes("--apply");
const CSV_PATH = new URL("../data/loyverse_export.csv", import.meta.url);
const REPORT_PATH = new URL("../scripts/loyverse-import-report.txt", import.meta.url);

// Score minimum pour un écrit automatique en --apply. En dessous, la ligne
// atterrit dans la section "à traiter manuellement" du rapport, jamais
// appliquée automatiquement même en mode --apply.
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
// En dessous, on considère qu'il n'y a pas de correspondance du tout
// (évite d'encombrer le rapport avec des scores proches de zéro).
const REPORT_THRESHOLD = 0.4;

// ------------------------------------------------------------
// Parseur CSV minimal (gère les champs entre guillemets contenant des
// virgules/retours à la ligne, comme les descriptions HTML du fichier) —
// pas de dépendance externe, ce fichier n'en a jamais eu besoin.
// ------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignoré
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const HTML_ENTITIES: Record<string, string> = {
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

/** Retire les balises HTML et décode les entités (&eacute; etc.) d'une description Loyverse. */
function cleanDescription(html: string): string | null {
  if (!html) return null;
  const noTags = html.replace(/<[^>]+>/g, " ");
  const decoded = noTags
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => HTML_ENTITIES[name] ?? m);
  const cleaned = decoded.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

interface CsvRow {
  Name: string;
  Category: string;
  Description: string;
  Cost: string;
}

function loadCsvRows(): CsvRow[] {
  const text = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1 && r.some((cell) => cell.trim())).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj as unknown as CsvRow;
  });
}

interface Candidate {
  type: "product" | "variant";
  id: string;
  name: string; // nom affiché dans le rapport (nom court pour une variante)
  matchName: string; // nom utilisé pour le score de similarité — "parent + variante" pour une variante, sinon = name
  parentName?: string; // pour les variantes, nom du plat parent (affichage rapport)
}

interface MatchResult {
  csvName: string;
  cost: number;
  description: string | null;
  best: { candidate: Candidate; score: number } | null;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const rows = loadCsvRows();
  const produitRows = rows.filter((r) => r.Category?.trim() === "NOS PRODUITS");
  const stockRows = rows.filter((r) => r.Category?.trim() === "STOCKS");

  const { data: products, error: productsErr } = await supabase.from("products").select("id, name");
  if (productsErr) {
    console.error("Échec de la lecture de products :", productsErr.message);
    process.exit(1);
  }
  const { data: variants, error: variantsErr } = await supabase
    .from("product_variants")
    .select("id, name, group_label, product_id, products(name)");
  if (variantsErr) {
    console.error("Échec de la lecture de product_variants :", variantsErr.message);
    process.exit(1);
  }

  const candidates: Candidate[] = [
    ...(products ?? []).map((p) => ({ type: "product" as const, id: p.id, name: p.name, matchName: p.name })),
    ...(variants ?? []).map((v) => {
      const parentName = (v as unknown as { products: { name: string } | null }).products?.name;
      return {
        type: "variant" as const,
        id: v.id,
        name: v.name,
        // Une variante s'appelle souvent juste "Aileron"/"Poisson" en base — comparer
        // ce nom seul fait matcher n'importe quelle ligne CSV contenant ce mot, quel
        // que soit le plat concerné (bug corrigé ici). On compare contre "plat parent
        // + variante" à la place, ex: "Spaghetti CHIVI Aileron".
        matchName: parentName ? `${parentName} ${v.name}` : v.name,
        parentName,
      };
    }),
  ];

  const matched = new Set<string>(); // "type:id" des candidats déjà retenus (score >= REPORT_THRESHOLD) par au moins une ligne CSV
  const results: MatchResult[] = produitRows.map((row) => {
    const csvName = row.Name?.trim();
    const cost = Math.round(parseFloat(row.Cost) || 0);
    const description = cleanDescription(row.Description);

    let best: { candidate: Candidate; score: number } | null = null;
    for (const candidate of candidates) {
      const score = similarity(csvName, candidate.matchName);
      if (!best || score > best.score) best = { candidate, score };
    }
    if (best && best.score >= REPORT_THRESHOLD) {
      matched.add(`${best.candidate.type}:${best.candidate.id}`);
    }
    return { csvName, cost, description, best: best && best.score >= REPORT_THRESHOLD ? best : null };
  });

  const highConfidence = results.filter((r) => r.best && r.best.score >= HIGH_CONFIDENCE_THRESHOLD);
  const needsReview = results.filter((r) => r.best && r.best.score < HIGH_CONFIDENCE_THRESHOLD);
  const noMatch = results.filter((r) => !r.best);
  const unmatchedCandidates = candidates.filter((c) => !matched.has(`${c.type}:${c.id}`));

  // --- Rapport texte ---
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push(`Import coûts Loyverse — ${APPLY ? "MODE APPLY (écriture réelle)" : "MODE DRY-RUN (aucune écriture)"}`);
  lines.push(`Généré le ${new Date().toLocaleString("fr-FR")}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Lignes CSV "NOS PRODUITS" : ${produitRows.length}`);
  lines.push(`Lignes CSV "STOCKS" (ignorées pour le matching) : ${stockRows.length}`);
  lines.push(`Produits en base : ${products?.length ?? 0} — Variantes en base : ${variants?.length ?? 0}`);
  lines.push("");

  lines.push(`--- CORRESPONDANCES HAUTE CONFIANCE (score >= ${HIGH_CONFIDENCE_THRESHOLD}) — ${highConfidence.length} ---`);
  lines.push(APPLY ? "(appliquées ci-dessous)" : "(seraient appliquées avec --apply)");
  for (const r of highConfidence) {
    const c = r.best!.candidate;
    const label = c.type === "variant" ? `${c.name} (variante de ${c.parentName ?? "?"})` : c.name;
    lines.push(`  [${r.best!.score.toFixed(2)}] "${r.csvName}" → ${label} — coût: ${r.cost} FCFA`);
  }
  lines.push("");

  lines.push(`--- À VÉRIFIER MANUELLEMENT (score entre ${REPORT_THRESHOLD} et ${HIGH_CONFIDENCE_THRESHOLD}) — ${needsReview.length} ---`);
  for (const r of needsReview) {
    const c = r.best!.candidate;
    const label = c.type === "variant" ? `${c.name} (variante de ${c.parentName ?? "?"})` : c.name;
    lines.push(`  [${r.best!.score.toFixed(2)}] "${r.csvName}" → ${label} ? — coût: ${r.cost} FCFA`);
  }
  lines.push("");

  lines.push(`--- AUCUNE CORRESPONDANCE (score < ${REPORT_THRESHOLD}) — ${noMatch.length} ---`);
  for (const r of noMatch) {
    lines.push(`  "${r.csvName}" — coût: ${r.cost} FCFA — à faire correspondre manuellement`);
  }
  lines.push("");

  lines.push(`--- PRODUITS/VARIANTES EN BASE SANS CORRESPONDANCE CSV — ${unmatchedCandidates.length} ---`);
  for (const c of unmatchedCandidates) {
    const label = c.type === "variant" ? `${c.name} (variante de ${c.parentName ?? "?"})` : c.name;
    lines.push(`  ${label}`);
  }
  lines.push("");

  if (stockRows.length) {
    lines.push(`--- LIGNES "STOCKS" (référence, non utilisées pour le matching) — ${stockRows.length} ---`);
    for (const r of stockRows) {
      lines.push(`  ${r.Name?.trim()} — coût unitaire: ${r.Cost}`);
    }
    lines.push("");
  }

  const report = lines.join("\n");
  console.log(report);
  writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`\nRapport écrit dans ${REPORT_PATH.pathname}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — aucune écriture en base. Relancer avec --apply pour appliquer les correspondances haute confiance.");
    return;
  }

  console.log(`\nApplication de ${highConfidence.length} correspondance(s) haute confiance...`);
  let applied = 0;
  for (const r of highConfidence) {
    const c = r.best!.candidate;
    if (c.type === "product") {
      const { error: costErr } = await supabase
        .from("product_costs")
        .upsert({ product_id: c.id, ingredient_cost: r.cost }, { onConflict: "product_id" });
      const { error: ingErr } = r.description
        ? await supabase.from("products").update({ ingredients: r.description }).eq("id", c.id)
        : { error: null };
      if (costErr || ingErr) {
        console.error(`  ÉCHEC "${r.csvName}" → ${c.name} :`, costErr?.message ?? ingErr?.message);
        continue;
      }
    } else {
      const { error: costErr } = await supabase.from("product_variants").update({ ingredient_cost: r.cost }).eq("id", c.id);
      if (costErr) {
        console.error(`  ÉCHEC "${r.csvName}" → ${c.name} (variante) :`, costErr.message);
        continue;
      }
    }
    applied++;
  }
  console.log(`Terminé : ${applied}/${highConfidence.length} correspondance(s) appliquée(s).`);
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exit(1);
});
