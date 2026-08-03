import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export interface Category {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  /** "Suppléments" — catégorie spéciale gérée par la table `supplements`, pas `products.category`. */
  isSupplements: boolean;
}

/**
 * Remplace les anciennes constantes figées CATEGORY_LABELS/CATEGORY_ORDER
 * (lib/product-categories.ts, supprimé) — les catégories vivent maintenant
 * dans une vraie table, gérable (créer/renommer/supprimer) depuis l'Admin.
 * Accepte un client Supabase optionnel pour respecter le contexte appelant
 * (service role pour le webhook/IA, client anon/cookies pour la PWA client).
 */
export async function getCategories(client?: SupabaseClient<Database>): Promise<Category[]> {
  const supabase = client ?? createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, label, sort_order, is_supplements")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    throw new Error(`Impossible de charger les catégories: ${error?.message}`);
  }

  return data.map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    sortOrder: c.sort_order,
    isSupplements: c.is_supplements,
  }));
}

/** Catégories de PRODUITS uniquement — exclut "Suppléments", qui n'est pas une vraie valeur de products.category. */
export async function getProductCategories(client?: SupabaseClient<Database>): Promise<Category[]> {
  const categories = await getCategories(client);
  return categories.filter((c) => !c.isSupplements);
}

/** Label par slug — équivalent direct de l'ancien CATEGORY_LABELS[x]. */
export async function getCategoryLabels(client?: SupabaseClient<Database>): Promise<Record<string, string>> {
  const categories = await getCategories(client);
  return Object.fromEntries(categories.map((c) => [c.slug, c.label]));
}
