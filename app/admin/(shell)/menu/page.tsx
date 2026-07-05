import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/menu";
import { MenuManagementScreen } from "@/components/admin/MenuManagementScreen";
import type { ProductCategory } from "@/lib/supabase/types";

export default async function AdminMenuPage() {
  const supabase = createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, base_price, is_available, image_path")
    .order("category")
    .order("sort_order");

  const items = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: CATEGORY_LABELS[p.category as ProductCategory],
    price: p.base_price,
    isAvailable: p.is_available,
  }));

  return <MenuManagementScreen initialItems={items} />;
}
