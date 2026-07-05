"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: string;
  currentOrder: string | null;
  currentDest: string | null;
}

export function DriversScreen({ initialDrivers }: { initialDrivers: Driver[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    await supabase.from("drivers").insert({ name, phone });
    setBusy(false);
    setShowForm(false);
    setName("");
    setPhone("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-maroon text-gold font-bold text-sm px-4 py-2.5 rounded-xl"
        >
          <Plus size={16} /> Ajouter un livreur
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-[#ece2cd] rounded-2xl p-5 mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Nom</div>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Téléphone</div>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+229 xx xx xx xx"
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <button disabled={busy} className="bg-maroon text-gold font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50">
            Ajouter
          </button>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4">
        {initialDrivers.map((d) => (
          <div key={d.id} className="bg-white border border-[#ece2cd] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex-none rounded-full bg-maroon text-gold flex items-center justify-center font-mega text-lg">
                {d.name[0]}
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
            <div className="h-px bg-[#efe6d3] my-3.5" />
            {d.status === "en_course" && d.currentOrder ? (
              <>
                <div className="text-xs text-[#9a8b78] uppercase tracking-wide mb-1.5">Livre actuellement</div>
                <div className="flex justify-between text-sm">
                  <span className="font-mega text-maroon-deep">{d.currentOrder}</span>
                  <span className="text-[#6d6358]">{d.currentDest}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-[13px] text-[#6d6358]">
                <span>Statut</span>
                <b className="text-ink">Disponible</b>
              </div>
            )}
          </div>
        ))}
        {initialDrivers.length === 0 && (
          <div className="col-span-3 text-center text-[#9a8b78] text-sm py-10">Aucun livreur pour le moment.</div>
        )}
      </div>
    </div>
  );
}
