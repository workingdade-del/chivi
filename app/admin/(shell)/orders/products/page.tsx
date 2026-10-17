import Link from "next/link";
import { getProductSales, type ProductSalesView, type ProductSalesRow } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

type SortKey = "plus" | "moins" | "ca" | "marge";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "plus", label: "Plus vendus" },
  { id: "moins", label: "Moins vendus" },
  { id: "ca", label: "Par CA" },
  { id: "marge", label: "Par marge" },
];

function sortRows(rows: ProductSalesRow[], sort: SortKey): ProductSalesRow[] {
  const copy = [...rows];
  if (sort === "plus") return copy.sort((a, b) => b.qty - a.qty);
  if (sort === "moins") return copy.sort((a, b) => a.qty - b.qty);
  if (sort === "ca") return copy.sort((a, b) => b.revenue - a.revenue);
  return copy.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
}

export default async function AdminProductSalesPage({
  searchParams,
}: {
  searchParams: { view?: string; offset?: string; sort?: string };
}) {
  const view: ProductSalesView = searchParams.view === "semaine" ? "semaine" : "mois";
  const offset = Math.max(0, parseInt(searchParams.offset ?? "0", 10) || 0);
  const sort = (SORTS.some((s) => s.id === searchParams.sort) ? searchParams.sort : "plus") as SortKey;

  const data = await getProductSales(view, offset);
  const rows = sortRows(data.rows, sort);

  const href = (o: { view?: ProductSalesView; offset?: number; sort?: SortKey }) => {
    const params = new URLSearchParams();
    params.set("view", o.view ?? view);
    params.set("offset", String(o.offset ?? offset));
    params.set("sort", o.sort ?? sort);
    return `/admin/orders/products?${params.toString()}`;
  };
  const pill = (active: boolean) =>
    `px-4 py-2 rounded-full text-[13px] font-bold ${active ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"}`;

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux commandes
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex gap-2">
          <Link href={href({ view: "semaine", offset: 0 })} className={pill(view === "semaine")}>
            Semaine
          </Link>
          <Link href={href({ view: "mois", offset: 0 })} className={pill(view === "mois")}>
            Mois
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href={href({ offset: offset + 1 })} className="px-3 py-1.5 rounded-full border border-[#e2d6bd] bg-white text-maroon font-bold" aria-label="Période précédente">
            ‹
          </Link>
          <span className="font-semibold text-ink text-sm capitalize min-w-[150px] text-center">{data.rangeLabel}</span>
          {data.canGoNext ? (
            <Link href={href({ offset: offset - 1 })} className="px-3 py-1.5 rounded-full border border-[#e2d6bd] bg-white text-maroon font-bold" aria-label="Période suivante">
              ›
            </Link>
          ) : (
            <span className="px-3 py-1.5 rounded-full border border-[#efe6d3] text-[#c9bda6] font-bold">›</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {SORTS.map((s) => (
          <Link key={s.id} href={href({ sort: s.id })} className={pill(sort === s.id)}>
            {s.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "1.5fr 60px 1fr 70px 1fr 90px 1fr" }}
        >
          <span>Produit</span>
          <span>Qté</span>
          <span>CA</span>
          <span>% ventes</span>
          <span>Marge</span>
          <span>Points</span>
          <span>Étiquette</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.name}
            className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center text-sm last:border-b-0"
            style={{ gridTemplateColumns: "1.5fr 60px 1fr 70px 1fr 90px 1fr" }}
          >
            <span className="font-semibold text-ink">{r.name}</span>
            <span className="text-[#6d6358]">{r.qty}</span>
            <span className="font-mega text-maroon-deep">{formatFcfa(r.revenue)}</span>
            <span className="text-[#6d6358]">{r.salesSharePct} %</span>
            {r.costKnown ? (
              <span className="text-[#6d6358]">
                {formatFcfa(r.margin!)} <span className="text-xs text-[#9a8b78]">({r.marginPct} %)</span>
              </span>
            ) : (
              <span className="text-[#b0a596] italic">Coût non renseigné</span>
            )}
            <span className="text-[#6d6358]">{r.points ?? 0}</span>
            <span>
              {r.badge === "phare" && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-status-green-bg text-status-green-deep">Produit phare</span>
              )}
              {r.badge === "surveiller" && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#fff6e5] text-[#a6740a]">À surveiller</span>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucune vente sur cette période.</div>}
        {rows.length > 0 && (
          <div
            className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-t border-[#efe6d3] text-sm font-bold text-ink"
            style={{ gridTemplateColumns: "1.5fr 60px 1fr 70px 1fr 90px 1fr" }}
          >
            <span>Total</span>
            <span>{data.totalQty}</span>
            <span className="font-mega text-maroon-deep">{formatFcfa(data.totalRevenue)}</span>
            <span>100 %</span>
            <span />
            <span>{rows.reduce((sum, r) => sum + (r.points ?? 0), 0)}</span>
            <span />
          </div>
        )}
      </div>

      <div className="text-xs text-[#9a8b78] mt-3 leading-relaxed">
        Commandes non annulées uniquement. CA = sous-total hors livraison, net des réductions. <b>Produit phare</b> : dans le top 25 % (min. 1) en
        volume ET en marge. <b>À surveiller</b> : parmi les 25 % (min. 1) les moins vendus. Étiquettes affichées à partir de 3 produits. Points : fidélité générés par les commandes livrées de la période.
      </div>
    </div>
  );
}
