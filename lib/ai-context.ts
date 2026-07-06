import { createServiceClient } from "@/lib/supabase/server";
import { formatFcfa } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/menu";
import type { ProductCategory } from "@/lib/supabase/types";

const CHIVI_ORDER_LINK = "https://chividashboard.vercel.app/client";

/** Construit le menu + les zones de livraison à jour depuis la base, pour le system prompt de l'assistant IA. */
export async function buildChiviSystemPrompt(): Promise<string> {
  const supabase = createServiceClient();

  const [{ data: products }, { data: variants }, { data: supplements }, { data: zones }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, base_price")
      .eq("is_available", true)
      .order("category")
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("product_id, name, price")
      .eq("is_available", true)
      .order("sort_order"),
    supabase.from("supplements").select("name, price").eq("is_available", true).order("sort_order"),
    supabase.from("delivery_zones").select("name, fee_min, fee_max").order("sort_order"),
  ]);

  const menuByCategory = CATEGORY_ORDER.map((category) => {
    const items = (products ?? []).filter((p) => p.category === category);
    if (items.length === 0) return null;

    const lines = items.map((p) => {
      const productVariants = (variants ?? []).filter((v) => v.product_id === p.id);
      const variantsLabel = productVariants.length
        ? ` (variantes : ${productVariants.map((v) => `${v.name} ${formatFcfa(v.price)}`).join(", ")})`
        : "";
      return `- ${p.name} : ${formatFcfa(p.base_price)}${variantsLabel}`;
    });

    return `${CATEGORY_LABELS[category as ProductCategory]} :\n${lines.join("\n")}`;
  }).filter(Boolean);

  const supplementsLine = (supplements ?? [])
    .map((s) => `${s.name} ${formatFcfa(s.price)}`)
    .join(", ");

  const zonesLine = (zones ?? [])
    .map((z) => `${z.name} : ${z.fee_min === z.fee_max ? formatFcfa(z.fee_min) : `${z.fee_min}-${z.fee_max} FCFA`}`)
    .join(", ");

  return [
    "Tu es l'assistant de CHIVI, un restaurant de livraison à Cotonou, Bénin.",
    "Tu réponds en français et en fongbé si nécessaire. Tu es chaleureux et efficace.",
    `Si le client veut commander, demande-lui de cliquer sur ce lien : ${CHIVI_ORDER_LINK}.`,
    "",
    "Menu disponible :",
    menuByCategory.join("\n\n"),
    "",
    `Suppléments : ${supplementsLine}`,
    "",
    `Frais de livraison selon zone : ${zonesLine}`,
    "",
    "Ne réponds qu'aux questions liées à CHIVI (menu, prix, livraison, commande, horaires).",
    "Pour toute autre question, redirige poliment vers ces sujets.",
  ].join("\n");
}
