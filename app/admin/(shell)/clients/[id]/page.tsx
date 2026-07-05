import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getClientDetail } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";

export default async function AdminClientDetailPage({ params }: { params: { id: string } }) {
  const { profile, orders } = await getClientDetail(params.id);
  if (!profile) notFound();

  const spent = orders.reduce((s, o) => s + o.total, 0);
  const name = profile.full_name || profile.whatsapp_phone;

  return (
    <div>
      <Link href="/admin/clients" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux clients
      </Link>
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1.7fr" }}>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-6 text-center">
          <div className="w-[76px] h-[76px] mx-auto rounded-full bg-maroon text-gold flex items-center justify-center font-mega text-3xl">
            {name[0]?.toUpperCase()}
          </div>
          <div className="font-bold text-lg text-ink mt-3.5">{name}</div>
          <div className="inline-flex items-center gap-1.5 bg-status-green-bg text-status-green-deep text-xs font-semibold px-2.5 py-1.5 rounded-full mt-2.5">
            <MessageCircle size={13} />
            Profil auto-créé via WhatsApp
          </div>
          <div className="h-px bg-[#efe6d3] my-4.5" />
          <div className="flex flex-col gap-3 text-left">
            <Row label="WhatsApp" value={profile.whatsapp_phone} />
            <Row label="Zone" value={profile.zone || "—"} />
            <Row
              label="Client depuis"
              value={new Date(profile.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            />
          </div>
          <div className="flex gap-3 mt-4.5">
            <div className="flex-1 bg-[#faf4e8] rounded-xl p-3.5">
              <div className="font-mega text-xl text-maroon-deep">{orders.length}</div>
              <div className="text-[11px] text-[#9a8b78]">commandes</div>
            </div>
            <div className="flex-1 bg-[#faf4e8] rounded-xl p-3.5">
              <div className="font-mega text-lg text-maroon-deep">{formatFcfa(spent)}</div>
              <div className="text-[11px] text-[#9a8b78]">dépensé</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-[15px] text-ink mb-3.5">Historique des commandes</div>
          {orders.map((o) => {
            const itemsCount = o.order_items.reduce((n, i) => n + i.quantity, 0);
            return (
              <div key={o.id} className="flex items-center justify-between py-3.5 border-b border-[#f3ecdd]">
                <div>
                  <div className="font-mega text-sm text-maroon-deep">{o.order_number}</div>
                  <div className="text-[12.5px] text-[#9a8b78] mt-0.5">
                    {new Date(o.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {itemsCount} article
                    {itemsCount > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mega text-[15px] text-ink">{formatFcfa(o.total)}</div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-status-green-bg text-status-green-deep">
                    {STATUS_LABELS[o.status]}
                  </span>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div className="text-center text-[#9a8b78] text-sm py-8">Aucune commande.</div>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[#9a8b78]">{label}</span>
      <b className="text-ink">{value}</b>
    </div>
  );
}
