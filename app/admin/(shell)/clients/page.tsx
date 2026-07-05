import Link from "next/link";
import { getClients } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

export default async function AdminClientsPage() {
  const clients = await getClients();

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
      <div
        className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
        style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 40px" }}
      >
        <span>Client</span>
        <span>WhatsApp</span>
        <span>Commandes</span>
        <span>Total dépensé</span>
        <span />
      </div>
      {clients.map((c) => (
        <Link
          key={c.id}
          href={`/admin/clients/${c.id}`}
          className="grid gap-3 px-5 py-4 border-b border-[#f3ecdd] items-center text-sm"
          style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 40px" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-[38px] h-[38px] flex-none rounded-full bg-[#f4ead2] text-maroon flex items-center justify-center font-mega">
              {c.name[0]?.toUpperCase()}
            </div>
            <b className="font-semibold text-ink">{c.name}</b>
          </div>
          <span className="text-[13px] text-[#6d6358]">{c.phone}</span>
          <span className="text-[#6d6358]">{c.orderCount}</span>
          <span className="font-mega text-maroon-deep">{formatFcfa(c.spent)}</span>
          <span className="text-[#c9bda6] text-right">›</span>
        </Link>
      ))}
      {clients.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucun client pour le moment.</div>}
    </div>
  );
}
