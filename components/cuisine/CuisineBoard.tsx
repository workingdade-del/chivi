"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NEXT_STATUS } from "@/lib/order-status";
import { CancelOrderModal } from "@/components/shared/CancelOrderModal";
import type { OrderStatus } from "@/lib/supabase/types";

interface TicketItem {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  note: string | null;
  order_supplements: { supplement_name: string }[];
}

interface Ticket {
  id: string;
  order_number: string;
  status: OrderStatus;
  created_at: string;
  client_note: string | null;
  order_items: TicketItem[];
}

const STATUS_PRIORITY: Record<OrderStatus, number> = {
  recue: 0,
  en_preparation: 1,
  prete: 2,
  en_route: 3,
  livree: 4,
  annulee: 4,
};

const CUISINE_LABEL: Record<string, string> = {
  recue: "Nouvelle",
  en_preparation: "En préparation",
  prete: "Prête",
};

const ADVANCE_LABEL: Record<string, string> = {
  recue: "Commencer la préparation",
  en_preparation: "Marquer prêt",
  prete: "Remis au livreur",
};

const STRIPE_COLOR: Record<string, string> = {
  recue: "#FFB600",
  en_preparation: "#E73223",
  prete: "#31C06A",
};

function itemOptsLabel(item: TicketItem): string {
  const supp = item.order_supplements.map((s) => s.supplement_name);
  return [item.variant_name, ...supp].filter(Boolean).join(" · ");
}

function elapsedMinutes(createdAt: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60000));
}

export function CuisineBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelTicket, setCancelTicket] = useState<Ticket | null>(null);

  const fetchTickets = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, created_at, client_note, order_items(id, product_name, variant_name, quantity, note, order_supplements(supplement_name))"
      )
      .in("status", ["recue", "en_preparation", "prete"])
      .order("created_at", { ascending: true });

    if (data) setTickets(data as unknown as Ticket[]);
  }, []);

  useEffect(() => {
    fetchTickets();
    const supabase = createClient();
    const channel = supabase
      .channel(`cuisine-orders:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchTickets())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  async function advance(id: string, status: OrderStatus) {
    const supabase = createClient();
    await supabase.from("orders").update({ status: NEXT_STATUS[status] }).eq("id", id);
    if (openId === id && NEXT_STATUS[status] !== "prete") setOpenId(null);
  }

  const sorted = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const pri = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (pri !== 0) return pri;
      return elapsedMinutes(b.created_at, now) - elapsedMinutes(a.created_at, now);
    });
  }, [tickets, now]);

  const counts = {
    recue: tickets.filter((t) => t.status === "recue").length,
    en_preparation: tickets.filter((t) => t.status === "en_preparation").length,
    prete: tickets.filter((t) => t.status === "prete").length,
  };

  const openTicket = tickets.find((t) => t.id === openId) ?? null;
  const clock = new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="w-full h-full bg-app-cuisine flex flex-col">
      <div className="flex-none bg-chivi-black border-b border-[#2a1010] px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-5">
        <div className="flex items-center gap-3 sm:gap-5">
          <div
            className="w-[88px] sm:w-[104px] h-7 sm:h-8 bg-left bg-contain bg-no-repeat"
            style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
          />
          <div className="hidden sm:block border-l border-[#3a1616] pl-5">
            <div className="font-display text-white text-[17px] tracking-wide uppercase">
              Cuisine · Production
            </div>
            <div className="text-xs text-[#a07d6d] mt-0.5">Godomey Nonhouenou · Cotonou</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Counter label="En attente" value={counts.recue} color="#FFB600" pulse />
          <Counter label="En prépa" value={counts.en_preparation} color="#ff6a5c" />
          <Counter label="Prêtes" value={counts.prete} color="#4fd587" />
          <div className="hidden md:block border-l border-[#3a1616] pl-4 ml-1 text-right">
            <div className="font-mega text-white text-xl leading-none">{clock}</div>
            <div className="text-[11px] text-[#a07d6d] tracking-wide uppercase mt-0.5">{today}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pt-4 sm:pt-5 pb-7">
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {sorted.map((t) => {
              const mins = elapsedMinutes(t.created_at, now);
              const urgent = mins >= 10 && t.status !== "prete";
              return (
                <div
                  key={t.id}
                  className="relative bg-[#1d0e0e] border border-[#3a1c1c] rounded-2xl overflow-hidden p-4 pt-[18px] flex flex-col gap-2.5 text-base"
                >
                  <div className="absolute top-0 left-0 right-0 h-[5px]" style={{ background: STRIPE_COLOR[t.status] }} />
                  <div className="flex items-start justify-between gap-2.5 cursor-pointer" onClick={() => setOpenId(t.id)}>
                    <div>
                      <div className="font-mega text-[1.55em] text-gold leading-none">{t.order_number}</div>
                      <div className="text-[.78em] text-[#b79b86] mt-1.5">
                        Reçue à {new Date(t.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div
                        className="inline-block text-[.7em] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full"
                        style={{ background: `${STRIPE_COLOR[t.status]}29`, color: STRIPE_COLOR[t.status] }}
                      >
                        {CUISINE_LABEL[t.status]}
                      </div>
                      <div
                        className="font-mega text-[1.05em] mt-1.5"
                        style={{ color: urgent ? "#ff7264" : "#a07d6d" }}
                      >
                        il y a {mins} min
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-[#3a1c1c]" />
                  <div className="flex flex-col gap-2 cursor-pointer" onClick={() => setOpenId(t.id)}>
                    {t.order_items.map((item) => (
                      <div key={item.id} className="flex gap-2.5">
                        <span className="font-mega text-[1.05em] text-amber min-w-[1.7em]">{item.quantity}×</span>
                        <span className="flex-1">
                          <span className="text-[1em] font-semibold text-white">{item.product_name}</span>
                          {itemOptsLabel(item) && (
                            <span className="block text-[.8em] text-[#d3a78d] mt-0.5">{itemOptsLabel(item)}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {t.client_note && (
                    <div className="bg-[#2c1510] border-l-[3px] border-amber rounded-lg px-2.5 py-2 text-[.82em] text-cream leading-snug">
                      <b className="text-amber uppercase tracking-wide text-[.9em]">Note client</b>
                      <br />
                      {t.client_note}
                    </div>
                  )}
                  <button
                    onClick={() => advance(t.id, t.status)}
                    className="mt-1 w-full min-h-[48px] py-[15px] rounded-xl font-bold text-[.98em]"
                    style={
                      t.status === "recue"
                        ? { background: "#FFB600", color: "#3a1500" }
                        : t.status === "en_preparation"
                          ? { background: "#E73223", color: "#fff" }
                          : { background: "#31C06A", color: "#04351b" }
                    }
                  >
                    {ADVANCE_LABEL[t.status]}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCancelTicket(t);
                    }}
                    className="w-full py-2 rounded-xl border border-[#5a2a2a] text-[#ff8f82] font-semibold text-[.85em]"
                  >
                    Annuler la commande
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[420px] text-[#7a5a4c] gap-2.5">
            <div className="font-display text-gold text-3xl uppercase">Tout est servi</div>
            <div className="text-[15px]">Aucune commande en attente. La cuillère se repose.</div>
          </div>
        )}
      </div>

      {openTicket && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-0 md:p-10 z-50"
          onClick={() => setOpenId(null)}
        >
          <div
            className="relative w-full h-full md:h-auto md:w-[560px] max-h-full overflow-auto bg-[#1d0e0e] border-0 md:border border-[#4a2020] rounded-none md:rounded-[20px] p-5 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: STRIPE_COLOR[openTicket.status] }} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mega text-[44px] text-gold leading-[.95]">{openTicket.order_number}</div>
                <div className="text-sm text-[#b79b86] mt-2">
                  Reçue à {new Date(openTicket.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · il y a{" "}
                  {elapsedMinutes(openTicket.created_at, now)} min
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <span
                  className="text-xs font-bold tracking-wide uppercase px-3 py-1.5 rounded-full"
                  style={{ background: `${STRIPE_COLOR[openTicket.status]}29`, color: STRIPE_COLOR[openTicket.status] }}
                >
                  {CUISINE_LABEL[openTicket.status]}
                </span>
                <button
                  onClick={() => setOpenId(null)}
                  className="w-[38px] h-[38px] rounded-full border border-[#4a2020] bg-[#2a1212] text-[#c9a68f] flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="h-px bg-[#3a1c1c] my-5" />
            <div className="flex flex-col gap-3.5">
              {openTicket.order_items.map((item) => (
                <div key={item.id} className="flex gap-3.5 items-start">
                  <span className="font-mega text-2xl text-amber min-w-[1.7em]">{item.quantity}×</span>
                  <div className="flex-1">
                    <div className="text-lg font-bold text-white">{item.product_name}</div>
                    {itemOptsLabel(item) && (
                      <div className="text-sm text-[#d3a78d] mt-1">{itemOptsLabel(item)}</div>
                    )}
                    {item.note && (
                      <div className="text-[13px] text-cream mt-1 italic">« {item.note} »</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {openTicket.client_note && (
              <div className="mt-5 bg-[#2c1510] border-l-[3px] border-amber rounded-[10px] px-4 py-3 text-sm text-cream leading-snug">
                <b className="text-amber uppercase tracking-wide text-xs">Note client</b>
                <br />
                {openTicket.client_note}
              </div>
            )}
            <button
              onClick={() => advance(openTicket.id, openTicket.status)}
              className="mt-6 w-full min-h-[52px] py-[18px] rounded-2xl font-bold text-[17px]"
              style={
                openTicket.status === "recue"
                  ? { background: "#FFB600", color: "#3a1500" }
                  : openTicket.status === "en_preparation"
                    ? { background: "#E73223", color: "#fff" }
                    : { background: "#31C06A", color: "#04351b" }
              }
            >
              {ADVANCE_LABEL[openTicket.status]}
            </button>
            <button
              onClick={() => setCancelTicket(openTicket)}
              className="mt-2.5 w-full min-h-[44px] py-3 rounded-2xl border border-[#5a2a2a] text-[#ff8f82] font-bold text-sm"
            >
              Annuler la commande
            </button>
          </div>
        </div>
      )}

      {cancelTicket && (
        <CancelOrderModal
          orderId={cancelTicket.id}
          orderNumber={cancelTicket.order_number}
          onClose={() => setCancelTicket(null)}
          onCancelled={() => {
            setCancelTicket(null);
            setOpenId(null);
            fetchTickets();
          }}
        />
      )}
    </div>
  );
}

function Counter({ label, value, color, pulse }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-[14px] px-4 py-2.5"
      style={{ background: `${color}1a`, border: `1px solid ${color}4d` }}
    >
      {pulse && (
        <span className="w-[9px] h-[9px] rounded-full animate-pulse" style={{ background: color }} />
      )}
      <span className="font-mega text-2xl leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] text-[#d9b48f] tracking-wide uppercase leading-tight whitespace-pre-line">
        {label.replace(" ", "\n")}
      </span>
    </div>
  );
}
