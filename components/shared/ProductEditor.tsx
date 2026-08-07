"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Plus, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { getMenuImageUrl } from "@/lib/menu-image";
import { formatFcfa } from "@/lib/format";
import { MenuImage } from "@/components/client/MenuImage";
import { showToast } from "@/components/shared/Toast";

export interface EditorCategory {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  isSupplements: boolean;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  base_price: number;
  image_path: string | null;
  ingredients: string | null;
  is_available: boolean;
}

interface VariantRow {
  id: string;
  group_label: string;
  name: string;
  price: number;
  ingredient_cost: number;
  packaging_cost: number;
  is_available: boolean;
  sort_order: number;
}

interface GalleryImage {
  id: string;
  image_path: string;
  sort_order: number;
}

interface SupplementRow {
  id: string;
  name: string;
  price: number;
}

/**
 * Fiche plat unique, réutilisée par l'Admin (édition complète) et la
 * Cuisine (scope="costs" — seuls les coûts/marge sont éditables, tout le
 * reste est en lecture seule) pour éviter de dupliquer l'interface entre
 * les deux apps.
 */
export function ProductEditor({
  productId,
  scope,
  categories,
  theme = "light",
  onClose,
  onChanged,
  onDeleted,
}: {
  productId: string;
  scope: "full" | "costs";
  categories: EditorCategory[];
  theme?: "light" | "dark";
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [allSupplements, setAllSupplements] = useState<SupplementRow[]>([]);
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<Set<string>>(new Set());

  // Champs éditables (form state local, sauvegardés en un clic sur "Enregistrer")
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("0");
  const [ingredients, setIngredients] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [ingredientCost, setIngredientCost] = useState("0");
  const [packagingCost, setPackagingCost] = useState("0");
  const [internalNotes, setInternalNotes] = useState("");

  const isDark = theme === "dark";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [{ data: p, error: pErr }, { data: v }, { data: g }, { data: cost }, { data: supplements }, { data: linked }] = await Promise.all([
      supabase.from("products").select("id, name, description, category, base_price, image_path, ingredients, is_available").eq("id", productId).maybeSingle(),
      supabase
        .from("product_variants")
        .select("id, group_label, name, price, ingredient_cost, packaging_cost, is_available, sort_order")
        .eq("product_id", productId)
        .order("sort_order"),
      supabase.from("product_images").select("id, image_path, sort_order").eq("product_id", productId).order("sort_order"),
      supabase.from("product_costs").select("ingredient_cost, packaging_cost, notes").eq("product_id", productId).maybeSingle(),
      supabase.from("supplements").select("id, name, price").order("sort_order"),
      supabase.from("product_supplements").select("supplement_id").eq("product_id", productId),
    ]);

    if (pErr || !p) {
      setError("Plat introuvable.");
      setLoading(false);
      return;
    }

    setProduct(p);
    setName(p.name);
    setDescription(p.description ?? "");
    setCategory(p.category);
    setBasePrice(String(p.base_price));
    setIngredients(p.ingredients ?? "");
    setIsAvailable(p.is_available);
    setVariants(v ?? []);
    setGallery(g ?? []);
    setAllSupplements(supplements ?? []);
    setSelectedSupplementIds(new Set((linked ?? []).map((l) => l.supplement_id)));
    setIngredientCost(String(cost?.ingredient_cost ?? 0));
    setPackagingCost(String(cost?.packaging_cost ?? 0));
    setInternalNotes(cost?.notes ?? "");
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCost = (parseFloat(ingredientCost) || 0) + (parseFloat(packagingCost) || 0);
  const margin = (parseFloat(basePrice) || 0) - totalCost;
  const marginPct = parseFloat(basePrice) > 0 ? Math.round((margin / parseFloat(basePrice)) * 100) : 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (scope === "full") {
      const { error: prodErr } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          category,
          base_price: Math.round(parseFloat(basePrice) || 0),
          ingredients: ingredients.trim() || null,
          is_available: isAvailable,
        })
        .eq("id", productId);

      if (prodErr) {
        setError(`Échec de l'enregistrement : ${prodErr.message}`);
        showToast(`Échec de l'enregistrement : ${prodErr.message}`, "error");
        setSaving(false);
        return;
      }

      // Sélection des suppléments applicables : remplace la sélection existante.
      await supabase.from("product_supplements").delete().eq("product_id", productId);
      if (selectedSupplementIds.size > 0) {
        await supabase.from("product_supplements").insert(
          Array.from(selectedSupplementIds).map((supplement_id) => ({ product_id: productId, supplement_id }))
        );
      }
    }

    const { error: costErr } = await supabase.from("product_costs").upsert(
      {
        product_id: productId,
        ingredient_cost: parseFloat(ingredientCost) || 0,
        packaging_cost: parseFloat(packagingCost) || 0,
        notes: internalNotes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" }
    );

    setSaving(false);

    if (costErr) {
      setError(`Échec de l'enregistrement des coûts : ${costErr.message}`);
      showToast(`Échec de l'enregistrement des coûts : ${costErr.message}`, "error");
      return;
    }

    showToast("✅ Enregistré");
    onChanged();
    onClose();
  }

  async function handleMainPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !product) return;
    setUploadingMain(true);
    const supabase = createClient();
    const compressed = await compressImage(file, 1000).catch(() => file);
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
    const path = `${Date.now()}-${baseName}.jpg`;
    const { error: upErr } = await supabase.storage.from("menu-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (!upErr) {
      await supabase.from("products").update({ image_path: path }).eq("id", productId);
      setProduct((p) => (p ? { ...p, image_path: path } : p));
      onChanged();
    } else {
      setError(`Échec de l'upload : ${upErr.message}`);
      showToast(`Échec de l'upload : ${upErr.message}`, "error");
    }
    setUploadingMain(false);
    e.target.value = "";
  }

  async function handleGalleryAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingGallery(true);
    const supabase = createClient();
    let nextSort = gallery.length ? Math.max(...gallery.map((g) => g.sort_order)) + 1 : 0;

    for (const file of files) {
      const compressed = await compressImage(file, 1200).catch(() => file);
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${baseName}.jpg`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, compressed, { contentType: "image/jpeg" });
      if (!upErr) {
        const { data: row } = await supabase
          .from("product_images")
          .insert({ product_id: productId, image_path: path, sort_order: nextSort })
          .select("id, image_path, sort_order")
          .single();
        if (row) setGallery((g) => [...g, row]);
        nextSort += 1;
      }
    }
    setUploadingGallery(false);
    e.target.value = "";
  }

  async function handleGalleryRemove(id: string) {
    const supabase = createClient();
    await supabase.from("product_images").delete().eq("id", id);
    setGallery((g) => g.filter((img) => img.id !== id));
  }

  async function handleGalleryMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= gallery.length) return;
    const reordered = [...gallery];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setGallery(reordered);
    const supabase = createClient();
    await Promise.all(reordered.map((img, i) => supabase.from("product_images").update({ sort_order: i }).eq("id", img.id)));
  }

  function toggleSupplement(id: string) {
    setSelectedSupplementIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddVariant() {
    const supabase = createClient();
    const { data } = await supabase
      .from("product_variants")
      .insert({ product_id: productId, group_label: "Option", name: "Nouvelle option", price: product?.base_price ?? 0, sort_order: variants.length })
      .select("id, group_label, name, price, ingredient_cost, packaging_cost, is_available, sort_order")
      .single();
    if (data) setVariants((v) => [...v, data]);
  }

  async function handleUpdateVariant(id: string, patch: Partial<VariantRow>) {
    setVariants((v) => v.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
    const supabase = createClient();
    await supabase.from("product_variants").update(patch).eq("id", id);
  }

  async function handleDeleteVariant(id: string) {
    const supabase = createClient();
    await supabase.from("product_variants").delete().eq("id", id);
    setVariants((v) => v.filter((variant) => variant.id !== id));
  }

  async function handleDeleteProduct() {
    if (!confirm(`Supprimer définitivement "${product?.name}" ? Cette action est irréversible.`)) return;
    setSaving(true);
    const supabase = createClient();
    const { error: delErr } = await supabase.from("products").delete().eq("id", productId);
    setSaving(false);
    if (delErr) {
      setError(`Échec de la suppression : ${delErr.message}`);
      showToast(`Échec de la suppression : ${delErr.message}`, "error");
      return;
    }
    showToast("Plat supprimé");
    onDeleted?.();
  }

  const panelBg = isDark ? "bg-[#1d0e0e]" : "bg-white";
  const textColor = isDark ? "text-white" : "text-ink";
  const borderColor = isDark ? "border-[#3a1c1c]" : "border-[#ece2cd]";
  const inputBg = isDark ? "bg-[#2a1414] text-white border-[#3a1c1c]" : "bg-white text-ink border-[#ece2cd]";
  const labelColor = isDark ? "text-[#a07d6d]" : "text-ink/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`${panelBg} ${textColor} w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border ${borderColor} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg uppercase">{scope === "full" ? "Fiche plat" : "Coûts du plat"}</h2>
          <button onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        {loading && <div className="py-10 text-center text-sm opacity-70">Chargement…</div>}
        {error && <div className="mb-4 text-sm text-red-500">{error}</div>}

        {!loading && product && (
          <div className="flex flex-col gap-5">
            {/* Photo principale */}
            <Field label="Photo principale" labelColor={labelColor}>
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/10 flex-none flex items-center justify-center">
                  <MenuImage src={getMenuImageUrl(product.image_path)} alt={product.name} />
                </div>
                <label className={`text-xs font-semibold cursor-pointer px-3 py-2 rounded-lg border ${borderColor}`}>
                  {uploadingMain ? "Envoi…" : "Changer la photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleMainPhotoChange} disabled={uploadingMain || scope !== "full"} />
                </label>
              </div>
            </Field>

            {/* Titre */}
            <Field label="Titre du plat" labelColor={labelColor}>
              <input
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={scope !== "full"}
              />
            </Field>

            {/* Description */}
            <Field label="Description" labelColor={labelColor}>
              <textarea
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={scope !== "full"}
              />
            </Field>

            {/* Galerie */}
            <Field label="Galerie de photos" labelColor={labelColor}>
              <div className="flex flex-wrap gap-2">
                {gallery.map((img, i) => (
                  <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/10 group">
                    <MenuImage src={getMenuImageUrl(img.image_path)} alt="" />
                    {scope === "full" && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                        <button onClick={() => handleGalleryMove(i, -1)} className="text-white" aria-label="Monter">
                          <ChevronUp size={14} />
                        </button>
                        <button onClick={() => handleGalleryRemove(img.id)} className="text-white" aria-label="Supprimer">
                          <Trash2 size={14} />
                        </button>
                        <button onClick={() => handleGalleryMove(i, 1)} className="text-white" aria-label="Descendre">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {scope === "full" && (
                  <label className={`w-16 h-16 rounded-lg border ${borderColor} border-dashed flex items-center justify-center cursor-pointer`}>
                    {uploadingGallery ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryAdd} disabled={uploadingGallery} />
                  </label>
                )}
              </div>
            </Field>

            {/* Catégorie */}
            <Field label="Catégorie" labelColor={labelColor}>
              <select
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={scope !== "full"}
              >
                {categories
                  .filter((c) => !c.isSupplements)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </Field>

            {/* Ingrédients */}
            <Field label="Liste des ingrédients" labelColor={labelColor}>
              <textarea
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                rows={2}
                placeholder="Un ingrédient par ligne, ou séparés par des virgules"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                disabled={scope !== "full"}
              />
            </Field>

            {/* Notes internes */}
            <Field label="Notes internes (jamais visibles côté client)" labelColor={labelColor}>
              <textarea
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </Field>

            {/* Coûts + marge */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Coût ingrédients (FCFA)" labelColor={labelColor}>
                <input
                  type="number"
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  value={ingredientCost}
                  onChange={(e) => setIngredientCost(e.target.value)}
                />
              </Field>
              <Field label="Coût emballage (FCFA)" labelColor={labelColor}>
                <input
                  type="number"
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Prix de vente (FCFA)" labelColor={labelColor}>
              <input
                type="number"
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                disabled={scope !== "full"}
              />
            </Field>

            <div className={`rounded-lg border ${borderColor} px-3 py-2 text-sm flex items-center justify-between`}>
              <span className={labelColor}>Marge calculée</span>
              <span className={`font-bold ${margin >= 0 ? "text-status-green-deep" : "text-red-500"}`}>
                {formatFcfa(margin)} ({marginPct}%)
              </span>
            </div>

            {/* Suppléments applicables */}
            {scope === "full" && (
              <Field label="Suppléments applicables à ce plat" labelColor={labelColor}>
                <div className="flex flex-wrap gap-2">
                  {allSupplements.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border cursor-pointer ${
                        selectedSupplementIds.has(s.id) ? "bg-amber text-maroon-deep border-amber font-bold" : `${borderColor} ${labelColor}`
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedSupplementIds.has(s.id)}
                        onChange={() => toggleSupplement(s.id)}
                      />
                      {s.name} (+{formatFcfa(s.price)})
                    </label>
                  ))}
                  {allSupplements.length === 0 && <span className="text-xs opacity-60">Aucun supplément défini.</span>}
                </div>
              </Field>
            )}

            {/* Variantes */}
            {scope === "full" && (
              <Field label="Variantes" labelColor={labelColor}>
                <div className="flex flex-col gap-3">
                  {/* Prix de base — pas une entrée product_variants, lié directement à
                      products.base_price / product_costs. Toujours visible en premier,
                      non supprimable : c'est l'option choisie quand le client commande
                      le plat sans sélectionner de variante nommée. */}
                  <div className={`rounded-lg border ${borderColor} p-2.5 flex flex-col gap-2 bg-[rgba(0,0,0,.02)]`}>
                    <div className="flex items-center gap-2">
                      <span className={`flex-1 text-xs font-bold ${textColor}`}>Prix de base</span>
                      <input
                        type="number"
                        className={`w-24 rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        disabled={scope !== "full"}
                      />
                      <span className="w-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase ${labelColor}`}>Ingrédients</span>
                        <input
                          type="number"
                          className={`w-full rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                          value={ingredientCost}
                          onChange={(e) => setIngredientCost(e.target.value)}
                        />
                      </div>
                      <div className="flex-1 flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase ${labelColor}`}>Emballage</span>
                        <input
                          type="number"
                          className={`w-full rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                          value={packagingCost}
                          onChange={(e) => setPackagingCost(e.target.value)}
                        />
                      </div>
                      <span className={`flex-none text-xs font-bold ${margin >= 0 ? "text-status-green-deep" : "text-red-500"}`}>
                        {formatFcfa(margin)} ({marginPct}%)
                      </span>
                    </div>
                  </div>

                  {variants.map((v) => {
                    const vCost = v.ingredient_cost + v.packaging_cost;
                    const vMargin = v.price - vCost;
                    const vMarginPct = v.price > 0 ? Math.round((vMargin / v.price) * 100) : 0;
                    return (
                      <div key={v.id} className={`rounded-lg border ${borderColor} p-2.5 flex flex-col gap-2`}>
                        <div className="flex items-center gap-2">
                          <input
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                            value={v.group_label}
                            onChange={(e) => handleUpdateVariant(v.id, { group_label: e.target.value })}
                            placeholder="Groupe (ex: Protéine)"
                          />
                          <input
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                            value={v.name}
                            onChange={(e) => handleUpdateVariant(v.id, { name: e.target.value })}
                            placeholder="Nom"
                          />
                          <input
                            type="number"
                            className={`w-24 rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                            value={v.price}
                            onChange={(e) => handleUpdateVariant(v.id, { price: Math.round(parseFloat(e.target.value) || 0) })}
                          />
                          <button onClick={() => handleDeleteVariant(v.id)} aria-label="Supprimer la variante">
                            <Trash2 size={16} className="text-red-500" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-1.5">
                            <span className={`text-[10px] uppercase ${labelColor}`}>Ingrédients</span>
                            <input
                              type="number"
                              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                              value={v.ingredient_cost}
                              onChange={(e) => handleUpdateVariant(v.id, { ingredient_cost: Math.round(parseFloat(e.target.value) || 0) })}
                            />
                          </div>
                          <div className="flex-1 flex items-center gap-1.5">
                            <span className={`text-[10px] uppercase ${labelColor}`}>Emballage</span>
                            <input
                              type="number"
                              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${inputBg}`}
                              value={v.packaging_cost}
                              onChange={(e) => handleUpdateVariant(v.id, { packaging_cost: Math.round(parseFloat(e.target.value) || 0) })}
                            />
                          </div>
                          <span className={`flex-none text-xs font-bold ${vMargin >= 0 ? "text-status-green-deep" : "text-red-500"}`}>
                            {formatFcfa(vMargin)} ({vMarginPct}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={handleAddVariant} className={`flex items-center gap-1 text-xs font-semibold ${labelColor}`}>
                    <Plus size={14} /> Ajouter une variante
                  </button>
                </div>
              </Field>
            )}

            {/* Disponibilité */}
            {scope === "full" && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
                Disponible à la commande
              </label>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-inherit">
              {scope === "full" ? (
                <button onClick={handleDeleteProduct} className="flex items-center gap-1.5 text-xs font-bold text-red-500" disabled={saving}>
                  <Trash2 size={14} /> Supprimer le plat
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-amber text-maroon-deep font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, labelColor, children }: { label: string; labelColor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`text-[11px] font-bold uppercase tracking-wide ${labelColor}`}>{label}</span>
      {children}
    </div>
  );
}
