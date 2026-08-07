"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";
import { OrderItemsEditor, type EditableOrderItem } from "@/components/admin/OrderItemsEditor";
import type { OrderStatus, PaymentMethod } from "@/lib/supabase/types";

const ALL_STATUSES: OrderStatus[] = ["recue", "en_preparation", "prete", "en_route", "livree", "annulee"];
const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash_livraison", label: "Cash à la livraison" },
  { id: "momo_livraison", label: "Mobile Money à la livraison" },
  { id: "momo_avance", label: "Mobile Money en avance" },
];

interface ClientOption {
  id: string;
  full_name: string | null;
  whatsapp_phone: string;
}
interface DriverOption {
  id: string;
  name: string;
}

export function NewOrderForm() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

  const [isNewClient, setIsNewClient] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  const [items, setItems] = useState<EditableOrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash_livraison");
  const [status, setStatus] = useState<OrderStatus>("recue");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [driverId, setDriverId] = useState("");
  const [notify, setNotify] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("id, full_name, whatsapp_phone").order("full_name"),
      supabase.from("drivers").select("id, name").eq("is_active", true).order("name"),
    ]).then(([c, d]) => {
      setClients(c.data ?? []);
      setDrivers(d.data ?? []);
    });
  }, []);

  const filteredClients = clientSearch
    ? clients.filter(
        (c) =>
          (c.full_name ?? "").toLowerCase().includes(clientSearch.toLowerCase()) ||
          c.whatsapp_phone.includes(clientSearch)
      )
    : clients;

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const total = subtotal + deliveryFee;

  const canSubmit =
    items.length > 0 && (isNewClient ? newClientName.trim() && newClientPhone.trim() : !!selectedClientId);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: isNewClient ? undefined : selectedClientId,
          clientName: isNewClient ? newClientName.trim() : undefined,
          clientPhone: isNewClient ? newClientPhone.trim() : undefined,
          items: items.map((i) => ({
            productId: i.productId,
            productVariantId: i.variantId,
            productName: i.productName,
            variantName: i.variantName,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
            supplements: i.supplementIds.map((id, idx) => ({ supplementId: id, supplementName: i.supplementNames[idx] })),
          })),
          paymentMethod,
          status,
          orderDate,
          deliveryAddress: deliveryAddress.trim() || undefined,
          deliveryFee,
          driverId: driverId || undefined,
          notify,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de la création");
      router.push(`/admin/orders/${body.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
      <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-[#9a8b78]">Client</label>
            <button
              onClick={() => setIsNewClient((v) => !v)}
              className="text-[12px] font-semibold text-maroon underline"
            >
              {isNewClient ? "Choisir un client existant" : "Nouveau client"}
            </button>
          </div>
          {isNewClient ? (
            <div className="flex flex-col gap-2">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nom du client"
                className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
              />
              <input
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                placeholder="Numéro WhatsApp (ex: 22990000000)"
                className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Rechercher par nom ou numéro…"
                className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
              />
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
              >
                <option value="">Choisir un client…</option>
                {filteredClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.whatsapp_phone} ({c.whatsapp_phone})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-[#9a8b78] block mb-2">Articles</label>
          <OrderItemsEditor items={items} onChange={setItems} />
        </div>

        <div>
          <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Adresse de livraison</label>
          <input
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder="Optionnel"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Mode de paiement</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Statut initial</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Date de la commande</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Livreur (optionnel)</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            >
              <option value="">Aucun</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9a8b78] block mb-1.5">Frais de livraison</label>
            <input
              type="number"
              min={0}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(Number(e.target.value))}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="flex justify-between text-sm text-[#6d6358] py-0.5">
            <span>Sous-total</span>
            <span>{formatFcfa(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-[#6d6358] py-0.5">
            <span>Livraison</span>
            <span>{formatFcfa(deliveryFee)}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="font-bold text-ink">Total</span>
            <span className="font-mega text-xl text-maroon-deep">{formatFcfa(total)}</span>
          </div>

          <label className="flex items-center gap-2.5 mt-4 cursor-pointer">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-ink">Notifier le client et le livreur par WhatsApp</span>
          </label>

          {error && (
            <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mt-3">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={busy || !canSubmit}
            className="w-full mt-4 py-3 rounded-xl bg-maroon text-gold font-bold text-sm disabled:opacity-50"
          >
            {busy ? "Création…" : "Créer la commande"}
          </button>
        </div>
      </div>
    </div>
  );
}
