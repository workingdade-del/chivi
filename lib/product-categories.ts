import type { ProductCategory } from "@/lib/supabase/types";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  plats_chivi: "Plats CHIVI",
  plats_traditionnels: "Plats Traditionnels",
  boissons: "Boissons",
};

export const CATEGORY_ORDER: ProductCategory[] = [
  "plats_chivi",
  "plats_traditionnels",
  "boissons",
];
