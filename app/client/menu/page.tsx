import { getMenu, getProductCategories } from "@/lib/menu";
import { MenuScreen } from "@/components/client/MenuScreen";
import { PauseGate } from "@/components/client/PauseGate";
import { getSystemSettings } from "@/lib/system-settings";

export const revalidate = 60;

export default async function MenuPage() {
  try {
    const [products, settings, allCategories] = await Promise.all([getMenu(), getSystemSettings(), getProductCategories()]);
    const categories = allCategories
      .filter((c) => products.some((p) => p.category === c.slug))
      .map((c) => ({ id: c.slug, name: c.label }));

    return (
      <PauseGate initial={{ isPaused: settings.isPaused, pauseReason: settings.pauseReason }}>
        <MenuScreen products={products} categories={categories} />
      </PauseGate>
    );
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
