import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/categories";
import { MenuManagementScreen } from "@/components/admin/MenuManagementScreen";

export default async function AdminMenuPage() {
  const supabase = createClient();
  const [categories, { data: products }, { data: supplements }] = await Promise.all([
    getCategories(supabase),
    supabase
      .from("products")
      .select("id, name, category, base_price, is_available, image_path")
      .order("sort_order"),
    supabase.from("supplements").select("id, name, price, is_available, sort_order").order("sort_order"),
  ]);

  return (
    <MenuManagementScreen
      initialCategories={categories}
      initialProducts={products ?? []}
      initialSupplements={supplements ?? []}
    />
  );
}
