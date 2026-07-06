import { createClient } from "@/lib/supabase/server";
import type { ProductCategory } from "@/lib/supabase/types";

export interface MenuVariant {
  id: string;
  groupLabel: string;
  name: string;
  price: number;
  sortOrder: number;
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  basePrice: number;
  imagePath: string | null;
  isNew: boolean;
  variants: MenuVariant[];
}

export interface MenuSupplement {
  id: string;
  name: string;
  price: number;
}

export async function getMenu(): Promise<MenuProduct[]> {
  const supabase = createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, description, category, base_price, image_path, is_new, sort_order")
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error || !products) {
    throw new Error(`Impossible de charger le menu: ${error?.message}`);
  }

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id, group_label, name, price, sort_order")
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    basePrice: p.base_price,
    imagePath: p.image_path,
    isNew: p.is_new,
    variants: (variants || [])
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        groupLabel: v.group_label,
        name: v.name,
        price: v.price,
        sortOrder: v.sort_order,
      })),
  }));
}

export async function getProduct(id: string): Promise<MenuProduct | null> {
  const menu = await getMenu();
  return menu.find((p) => p.id === id) ?? null;
}

export async function getSupplements(): Promise<MenuSupplement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("supplements")
    .select("id, name, price")
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    throw new Error(`Impossible de charger les suppléments: ${error?.message}`);
  }
  return data.map((s) => ({ id: s.id, name: s.name, price: s.price }));
}

export interface MenuDeliveryZone {
  id: string;
  name: string;
  feeMin: number;
  feeMax: number;
}

export async function getDeliveryZones(): Promise<MenuDeliveryZone[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("id, name, fee_min, fee_max")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    throw new Error(`Impossible de charger les zones de livraison: ${error?.message}`);
  }
  return data.map((z) => ({ id: z.id, name: z.name, feeMin: z.fee_min, feeMax: z.fee_max }));
}

export { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/product-categories";
