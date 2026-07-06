"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Send, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: string;
  is_available: boolean;
  last_seen: string | null;
  photo_url: string | null;
  currentOrder: string | null;
  currentDest: string | null;
}

interface FormState {
  id: string | null;
  name: string;
  phone: string;
  photoUrl: string | null;
}

const EMPTY_FORM: FormState = { id: null, name: "", phone: "", photoUrl: null };

function lastSeenLabel(lastSeen: string | null): string {
  if (!lastSeen) return "Jamais contacté";
  return `Vu ${new Date(lastSeen).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

export function DriversScreen({ initialDrivers }: { initialDrivers: Driver[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openAddForm() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(d: Driver) {
    setForm({ id: d.id, name: d.name, phone: d.phone, photoUrl: d.photo_url });
    setShowForm(true);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const supabase = createClient();
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("driver-photos").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("driver-photos").getPublicUrl(path);
      setForm((f) => ({ ...f, photoUrl: data.publicUrl }));
    }
    setUploadingPhoto(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    if (form.id) {
      await supabase
        .from("drivers")
        .update({ name: form.name, phone: form.phone, photo_url: form.photoUrl })
        .eq("id", form.id);
    } else {
      await supabase.from("drivers").insert({ name: form.name, phone: form.phone, photo_url: form.photoUrl });
    }
    setBusy(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    router.refresh();
  }

  async function handleRemove(id: string) {
    if (!confirm("Retirer ce livreur de la liste active ? Son historique de courses est conservé.")) return;
    const supabase = createClient();
    await supabase.from("drivers").update({ is_active: false }).eq("id", id);
    router.refresh();
  }

  async function handlePingAvailability(id: string) {
    setPinging(id);
    try {
      const res = await fetch(`/api/admin/drivers/${id}/ping-availability`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'envoi");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setPinging(null);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 bg-maroon text-gold font-bold text-sm px-4 py-2.5 rounded-xl"
        >
          <Plus size={16} /> Ajouter un livreur
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#ece2cd] rounded-2xl p-5 mb-4 flex gap-3 items-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 flex-none rounded-full bg-[#f4ead2] text-maroon flex items-center justify-center overflow-hidden relative"
          >
            {form.photoUrl ? (
              <Image src={form.photoUrl} alt="" fill className="object-cover" />
            ) : (
              <span className="font-mega text-xl">{form.name[0]?.toUpperCase() ?? "+"}</span>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <div className="flex-1">
            <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Nom</div>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Téléphone</div>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+229 xx xx xx xx"
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setForm(EMPTY_FORM);
            }}
            className="text-sm font-semibold text-[#6d6358] px-4 py-2.5"
          >
            Annuler
          </button>
          <button
            disabled={busy || uploadingPhoto}
            className="bg-maroon text-gold font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
          >
            {form.id ? "Enregistrer" : "Ajouter"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4">
        {initialDrivers.map((d) => (
          <div key={d.id} className="bg-white border border-[#ece2cd] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex-none rounded-full bg-maroon text-gold flex items-center justify-center font-mega text-lg overflow-hidden relative">
                {d.photo_url ? <Image src={d.photo_url} alt={d.name} fill className="object-cover" /> : d.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[15px] text-ink">{d.name}</div>
                <div className="text-xs text-[#9a8b78]">{d.phone}</div>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  d.status === "libre" ? "bg-status-green-bg text-status-green-deep" : "bg-[rgba(231,50,35,.14)] text-[#c0392b]"
                }`}
              >
                {d.status === "libre" ? "Libre" : "En course"}
              </span>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  d.is_available ? "bg-status-green-bg text-status-green-deep" : "bg-[rgba(255,182,0,.16)] text-[#a6740a]"
                }`}
              >
                {d.is_available ? "Disponible" : "Non disponible"}
              </span>
              <span className="text-[11px] text-[#9a8b78]">{lastSeenLabel(d.last_seen)}</span>
            </div>

            <div className="h-px bg-[#efe6d3] my-3.5" />
            {d.status === "en_course" && d.currentOrder ? (
              <div className="mb-3">
                <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Livre actuellement</div>
                <div className="flex justify-between text-sm">
                  <span className="font-mega text-maroon-deep">{d.currentOrder}</span>
                  <span className="text-[#6d6358]">{d.currentDest}</span>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => handlePingAvailability(d.id)}
                disabled={pinging === d.id}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl bg-maroon text-gold disabled:opacity-50"
              >
                <Send size={13} />
                {pinging === d.id ? "Envoi…" : "Disponibilité"}
              </button>
              <button
                onClick={() => openEditForm(d)}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl bg-[#faf4e8] text-ink"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleRemove(d.id)}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl bg-[rgba(231,50,35,.1)] text-chilli"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {initialDrivers.length === 0 && (
          <div className="col-span-3 text-center text-[#9a8b78] text-sm py-10">Aucun livreur pour le moment.</div>
        )}
      </div>
    </div>
  );
}
