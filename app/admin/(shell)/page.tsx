import { Package, TrendingUp, Receipt, PiggyBank } from "lucide-react";
import { getDashboardData } from "@/lib/admin";
import { getSystemSettings } from "@/lib/system-settings";
import { formatFcfa } from "@/lib/format";
import { PauseControl } from "@/components/admin/PauseControl";

export default async function AdminDashboardPage() {
  const [data, settings] = await Promise.all([getDashboardData(), getSystemSettings()]);
  const maxRevenue = Math.max(...data.chart.map((c) => c.revenue), 1);
  const inProgressTotal = data.inProgress.recue + data.inProgress.en_preparation_prete + data.inProgress.en_route || 1;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <PauseControl initial={{ isPaused: settings.isPaused, pauseReason: settings.pauseReason }} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Commandes" value={String(data.ordersToday)} icon={Package} iconBg="rgba(255,182,0,.16)" iconColor="#a6740a" note={`${data.ordersToday} aujourd'hui`} noteColor="#1b7a44" />
        <KpiCard label="Revenus" value={formatFcfa(data.revenueToday)} icon={TrendingUp} iconBg="#e7f6ec" iconColor="#1b7a44" note="Aujourd'hui" noteColor="#1b7a44" />
        <KpiCard label="Coûts" value={formatFcfa(data.costsToday)} icon={Receipt} iconBg="rgba(231,50,35,.13)" iconColor="#c0392b" note="Denrées + livraison" noteColor="#9a8b78" />
        <KpiCard
          label="Bénéfice"
          value={formatFcfa(data.profitToday)}
          icon={PiggyBank}
          iconBg="#f4ead2"
          iconColor="#a6740a"
          note={`Marge ${data.marginToday}%`}
          noteColor="#1b7a44"
        />
      </div>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold text-[15px] text-ink">Revenus — 7 derniers jours</div>
            <div className="font-mega text-[15px] text-maroon">{formatFcfa(data.chart.reduce((s, c) => s + c.revenue, 0))}</div>
          </div>
          <div className="flex items-end gap-3.5 h-[180px] mt-5 pb-1.5 border-b border-[#efe6d3]">
            {data.chart.map((c, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 justify-end h-full">
                <div
                  className="w-full max-w-[34px] rounded-t-lg"
                  style={{
                    height: `${Math.max(4, (c.revenue / maxRevenue) * 160)}px`,
                    background: i === data.chart.length - 1 ? "var(--chivi-amber)" : "#e8b94a",
                  }}
                />
                <span className="text-[11px] text-[#9a8b78] capitalize">{c.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-[15px] text-ink">Commandes en cours</div>
          <div className="mt-4 flex flex-col gap-3">
            <ProgressRow value={data.inProgress.recue} total={inProgressTotal} color="var(--chivi-amber)" label="Reçues" />
            <ProgressRow value={data.inProgress.en_preparation_prete} total={inProgressTotal} color="var(--chivi-chilli)" label="En préparation" />
            <ProgressRow value={data.inProgress.en_route} total={inProgressTotal} color="#1b9c53" label="En route" />
          </div>
          <div className="h-px bg-[#efe6d3] my-4" />
          <div className="font-bold text-[13px] text-ink mb-2.5">Top plats du jour</div>
          <div className="flex flex-col gap-2.5">
            {data.topDishes.length === 0 && <div className="text-[13px] text-[#9a8b78]">Pas encore de commande aujourd&apos;hui.</div>}
            {data.topDishes.map((d) => (
              <div key={d.name} className="flex justify-between text-[13px] text-[#6d6358]">
                <span>{d.name}</span>
                <b className="text-maroon-deep">{d.qty}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  note,
  noteColor,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  note: string;
  noteColor: string;
}) {
  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#9a8b78] tracking-wide uppercase">{label}</span>
        <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>
          <Icon size={17} strokeWidth={2} />
        </span>
      </div>
      <div className="font-mega text-[29px] text-maroon-deep mt-3 leading-none">{value}</div>
      <div className="text-xs mt-1.5 font-semibold" style={{ color: noteColor }}>
        {note}
      </div>
    </div>
  );
}

function ProgressRow({ value, total, color, label }: { value: number; total: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-11 font-mega text-xl" style={{ color }}>
        {value}
      </span>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-[#f0e7d4] overflow-hidden">
          <div className="h-full" style={{ width: `${(value / total) * 100}%`, background: color }} />
        </div>
        <span className="text-xs text-[#8a7f6e]">{label}</span>
      </div>
    </div>
  );
}
