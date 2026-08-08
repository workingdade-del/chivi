"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import { DayDetailModal } from "@/components/admin/DayDetailModal";
import type { ChartView, RevenueChartData } from "@/lib/admin";

const CHART_VIEWS: { id: ChartView; label: string }[] = [
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "annee", label: "Année" },
];

export function RevenueChartCard({ chart, chartView, chartOffset }: { chart: RevenueChartData; chartView: ChartView; chartOffset: number }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const maxRevenue = Math.max(...chart.points.map((c) => c.revenue), 1);

  function navHref(view: ChartView, offset: number) {
    return `/admin?chartView=${view}&chartOffset=${offset}`;
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="font-bold text-[15px] text-ink">Revenus</div>
          <div className="flex gap-1">
            {CHART_VIEWS.map((v) => (
              <Link
                key={v.id}
                href={navHref(v.id, 0)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  chartView === v.id ? "bg-maroon text-gold" : "bg-[#faf4e8] text-[#6d6358]"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="font-mega text-[15px] text-maroon">{formatFcfa(chart.points.reduce((s, c) => s + c.revenue, 0))}</div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <Link
          href={navHref(chartView, chartOffset + 1)}
          className="w-7 h-7 rounded-full border border-[#e6dcc4] flex items-center justify-center text-[#6d6358]"
          aria-label="Période précédente"
        >
          <ChevronLeft size={15} />
        </Link>
        <span className="text-xs font-semibold text-[#9a8b78] capitalize">{chart.rangeLabel}</span>
        {chart.canGoNext ? (
          <Link
            href={navHref(chartView, chartOffset - 1)}
            className="w-7 h-7 rounded-full border border-[#e6dcc4] flex items-center justify-center text-[#6d6358]"
            aria-label="Période suivante"
          >
            <ChevronRight size={15} />
          </Link>
        ) : (
          <span className="w-7 h-7 rounded-full border border-[#f0e7d4] flex items-center justify-center text-[#d8cdb8]">
            <ChevronRight size={15} />
          </span>
        )}
      </div>

      <div className="flex items-end gap-1.5 h-[180px] mt-4 pb-1.5 border-b border-[#efe6d3] overflow-x-auto">
        {chart.points.map((c, i) => (
          <div
            key={i}
            onClick={() => c.date && setSelectedDate(c.date)}
            className={`flex-1 min-w-[6px] flex flex-col items-center gap-2 justify-end h-full group ${c.date ? "cursor-pointer" : ""}`}
          >
            <div
              className={`w-full max-w-[34px] rounded-t-lg transition-opacity ${c.date ? "group-hover:opacity-70" : ""}`}
              style={{
                height: `${Math.max(4, (c.revenue / maxRevenue) * 160)}px`,
                background: i === chart.points.length - 1 && chartOffset === 0 ? "var(--chivi-amber)" : "#e8b94a",
              }}
            />
            {chart.points.length <= 12 && <span className="text-[11px] text-[#9a8b78] capitalize">{c.label}</span>}
          </div>
        ))}
      </div>

      {selectedDate && <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}
