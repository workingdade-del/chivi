"use client";

import { useState } from "react";
import { LayoutGrid, List, Plus, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { getMenuImageUrl } from "@/lib/menu-image";
import { MenuImage } from "@/components/client/MenuImage";
import { ProductEditor, type EditorCategory } from "@/components/shared/ProductEditor";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  base_price: number;
  is_available: boolean;
  image_path: string | null;
}

interface SupplementRow {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  sort_order: number;
}

function slugify(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `categorie_${Date.now()}`
  );
}

export function MenuManagementScreen({
  initialCategories,
  initialProducts,
  initialSupplements,
}: {
  initialCategories: EditorCategory[];
  initialProducts: ProductRow[];
  initialSupplements: SupplementRow[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [supplements, setSupplements] = useState(initialSupplements);
  const [view, setView] = useState<"list" | "mosaic">("list");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  async function refetch() {
    const supabase = createClient();
    const [{ data: cats }, { data: prods }, { data: sups }] = await Promise.all([
      supabase.from("categories").select("id, slug, label, sort_order, is_supplements").order("sort_order"),
      supabase.from("products").select("id, name, category, base_price, is_available, image_path").order("sort_order"),
      supabase.from("supplements").select("id, name, price, is_available, sort_order").order("sort_order"),
    ]);
    if (cats) setCategories(cats.map((c) => ({ id: c.id, slug: c.slug, label: c.label, sortOrder: c.sort_order, isSupplements: c.is_supplements })));
    if (prods) setProducts(prods);
    if (sups) setSupplements(sups);
  }

  async function toggleProductAvailability(id: string, current: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_available: !current } : p)));
    const supabase = createClient();
    await supabase.from("products").update({ is_available: !current }).eq("id", id);
  }

  async function toggleSupplementAvailability(id: string, current: boolean) {
    setSupplements((prev) => prev.map((s) => (s.id === id ? { ...s, is_available: !current } : s)));
    const supabase = createClient();
    await supabase.from("supplements").update({ is_available: !current }).eq("id", id);
  }

  async function handleAddProduct(categorySlug: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .insert({ name: "Nouveau plat", category: categorySlug, base_price: 0, is_available: false })
      .select("id, name, category, base_price, is_available, image_path")
      .single();
    if (data) {
      setProducts((prev) => [...prev, data]);
      setEditingProductId(data.id);
    } else if (error) {
      alert(`Échec de la création : ${error.message}`);
    }
  }

  async function handleAddCategory() {
    const label = window.prompt("Nom de la nouvelle catégorie :");
    if (!label?.trim()) return;
    const supabase = createClient();
    const slug = slugify(label);
    const { data, error } = await supabase
      .from("categories")
      .insert({ slug, label: label.trim(), sort_order: categories.length })
      .select("id, slug, label, sort_order, is_supplements")
      .single();
    if (data) {
      setCategories((prev) => [...prev, { id: data.id, slug: data.slug, label: data.label, sortOrder: data.sort_order, isSupplements: data.is_supplements }]);
    } else if (error) {
      alert(`Échec de la création : ${error.message}`);
    }
  }

  async function handleRenameCategory(cat: EditorCategory) {
    const label = window.prompt("Nouveau nom de la catégorie :", cat.label);
    if (!label?.trim() || label.trim() === cat.label) return;
    const supabase = createClient();
    const { error } = await supabase.from("categories").update({ label: label.trim() }).eq("id", cat.id);
    if (error) {
      alert(`Échec du renommage : ${error.message}`);
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, label: label.trim() } : c)));
  }

  async function handleDeleteCategory(cat: EditorCategory) {
    const itemCount = cat.isSupplements ? supplements.length : products.filter((p) => p.category === cat.slug).length;
    if (itemCount > 0) {
      alert(`Impossible de supprimer "${cat.label}" : elle contient encore ${itemCount} élément(s). Vide-la d'abord.`);
      return;
    }
    if (!confirm(`Supprimer la catégorie "${cat.label}" ?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) {
      alert(`Échec de la suppression : ${error.message}`);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
  }

  const productCategories = categories.filter((c) => !c.isSupplements);
  const supplementsCategory = categories.find((c) => c.isSupplements);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-[#faf4e8] border border-[#efe6d3] rounded-xl p-1">
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${view === "list" ? "bg-white text-maroon-deep shadow-sm" : "text-[#9a8b78]"}`}
          >
            <List size={14} /> Liste
          </button>
          <button
            onClick={() => setView("mosaic")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${view === "mosaic" ? "bg-white text-maroon-deep shadow-sm" : "text-[#9a8b78]"}`}
          >
            <LayoutGrid size={14} /> Mosaïque
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddCategory}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border border-[#ece2cd] text-maroon-deep"
          >
            <Plus size={14} /> Nouvelle catégorie
          </button>
          <button
            onClick={() => handleAddProduct(productCategories[0]?.slug ?? "")}
            disabled={productCategories.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-amber text-maroon-deep disabled:opacity-50"
          >
            <Plus size={14} /> Nouveau plat
          </button>
        </div>
      </div>

      {productCategories.map((cat) => (
        <CategorySection
          key={cat.id}
          title={cat.label}
          onRename={() => handleRenameCategory(cat)}
          onDelete={() => handleDeleteCategory(cat)}
          onAddItem={() => handleAddProduct(cat.slug)}
        >
          {view === "list" ? (
            <ProductListView items={products.filter((p) => p.category === cat.slug)} onToggle={toggleProductAvailability} onClick={setEditingProductId} />
          ) : (
            <ProductMosaicView items={products.filter((p) => p.category === cat.slug)} onToggle={toggleProductAvailability} onClick={setEditingProductId} />
          )}
        </CategorySection>
      ))}

      {supplementsCategory && (
        <CategorySection
          title={supplementsCategory.label}
          onRename={() => handleRenameCategory(supplementsCategory)}
          onDelete={() => handleDeleteCategory(supplementsCategory)}
        >
          <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
            {supplements.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 border-b border-[#f3ecdd] last:border-b-0">
                <b className={`font-semibold text-sm ${s.is_available ? "text-ink" : "text-[#b9ad9c] line-through"}`}>{s.name}</b>
                <div className="flex items-center gap-4">
                  <span className="font-mega text-[15px] text-maroon-deep">{formatFcfa(s.price)}</span>
                  <AvailabilityToggle isAvailable={s.is_available} onClick={() => toggleSupplementAvailability(s.id, s.is_available)} />
                </div>
              </div>
            ))}
            {supplements.length === 0 && <div className="px-5 py-6 text-sm text-center text-[#9a8b78]">Aucun supplément.</div>}
          </div>
        </CategorySection>
      )}

      {editingProductId && (
        <ProductEditor
          productId={editingProductId}
          scope="full"
          categories={categories}
          onClose={() => setEditingProductId(null)}
          onChanged={() => {
            refetch();
          }}
          onDeleted={() => {
            setEditingProductId(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function CategorySection({
  title,
  onRename,
  onDelete,
  onAddItem,
  children,
}: {
  title: string;
  onRename: () => void;
  onDelete: () => void;
  onAddItem?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-sm uppercase text-maroon-deep">{title}</h3>
        <button onClick={onRename} aria-label="Renommer la catégorie" className="text-[#9a8b78]">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} aria-label="Supprimer la catégorie" className="text-[#9a8b78]">
          <Trash2 size={13} />
        </button>
        {onAddItem && (
          <button onClick={onAddItem} className="ml-auto flex items-center gap-1 text-[11px] font-bold text-maroon-deep">
            <Plus size={12} /> Ajouter
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function AvailabilityToggle({ isAvailable, onClick }: { isAvailable: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-[52px] h-[29px] rounded-full relative" style={{ background: isAvailable ? "#1b9c53" : "#d8ccb5" }}>
      <span className="absolute top-[3px] w-[23px] h-[23px] rounded-full bg-white transition-all" style={{ left: isAvailable ? "26px" : "3px" }} />
    </button>
  );
}

function ProductListView({
  items,
  onToggle,
  onClick,
}: {
  items: ProductRow[];
  onToggle: (id: string, current: boolean) => void;
  onClick: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="bg-white border border-[#ece2cd] rounded-2xl px-5 py-6 text-sm text-center text-[#9a8b78]">Aucun plat dans cette catégorie.</div>;
  }
  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
      {items.map((item) => (
        <div key={item.id} className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] last:border-b-0 items-center" style={{ gridTemplateColumns: "2fr 1fr 130px" }}>
          <button className="flex items-center gap-3 text-left" onClick={() => onClick(item.id)}>
            <div className="relative w-[42px] h-[42px] flex-none rounded-xl overflow-hidden bg-[#f3ecdd]">
              <MenuImage src={getMenuImageUrl(item.image_path)} alt={item.name} />
            </div>
            <b className={`font-semibold text-sm ${item.is_available ? "text-ink" : "text-[#b9ad9c] line-through"}`}>{item.name}</b>
          </button>
          <span className="font-mega text-[15px] text-maroon-deep">{formatFcfa(item.base_price)}</span>
          <AvailabilityToggle isAvailable={item.is_available} onClick={() => onToggle(item.id, item.is_available)} />
        </div>
      ))}
    </div>
  );
}

function ProductMosaicView({
  items,
  onToggle,
  onClick,
}: {
  items: ProductRow[];
  onToggle: (id: string, current: boolean) => void;
  onClick: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="bg-white border border-[#ece2cd] rounded-2xl px-5 py-6 text-sm text-center text-[#9a8b78]">Aucun plat dans cette catégorie.</div>;
  }
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {items.map((item) => (
        <div key={item.id} className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden flex flex-col">
          <button className="relative w-full aspect-square bg-[#f3ecdd]" onClick={() => onClick(item.id)}>
            <MenuImage src={getMenuImageUrl(item.image_path)} alt={item.name} />
          </button>
          <div className="p-3 flex flex-col gap-2">
            <b className={`font-semibold text-sm ${item.is_available ? "text-ink" : "text-[#b9ad9c] line-through"}`}>{item.name}</b>
            <div className="flex items-center justify-between">
              <span className="font-mega text-[14px] text-maroon-deep">{formatFcfa(item.base_price)}</span>
              <AvailabilityToggle isAvailable={item.is_available} onClick={() => onToggle(item.id, item.is_available)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
