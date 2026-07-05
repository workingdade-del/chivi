import { getMenu, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/menu";
import { MenuScreen } from "@/components/client/MenuScreen";

export const revalidate = 60;

export default async function MenuPage() {
  try {
    const products = await getMenu();
    const categories = CATEGORY_ORDER.filter((c) => products.some((p) => p.category === c)).map(
      (c) => ({ id: c, name: CATEGORY_LABELS[c] })
    );

    return <MenuScreen products={products} categories={categories} />;
  } catch (err) {
    return (
      <div className="p-8 text-center text-maroon">
        <div className="font-display text-lg uppercase mb-2">Menu indisponible</div>
        <p className="text-sm text-ink/70">
          La base de données Supabase n&apos;est pas encore configurée (migrations SQL non
          appliquées). Détail : {err instanceof Error ? err.message : "erreur inconnue"}
        </p>
      </div>
    );
  }
}
