"use client";

import type { CoachContextSnapshot } from "@/lib/coach/types";
import type { MemorySnippet } from "@/lib/coach/memorySnippets";
import { dash } from "@/components/home/primitives/tokens";
import { cn } from "@/lib/utils";
import { useUnitFormat } from "@/hooks/use-unit-format";
import { distanceValueIn } from "@/lib/units";
import { AreaChart, Area, XAxis, Tooltip } from "recharts";
import { ChartContainer } from "@/components/charts/chart-container";
import { ChevronLeft, ChevronRight, Target, AlertTriangle, TrendingUp, Layers } from "lucide-react";
import Link from "next/link";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className={dash.label}>{label}</p>
      <p className="font-display text-lg font-bold tabular-nums text-white">{value}</p>
      {sub ? <p className="text-[11px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

const riskColors = {
  low: "text-accent/90 border-accent/20 bg-accent/5",
  moderate: "text-amber-200/90 border-amber-500/20 bg-amber-500/5",
  elevated: "text-red-300/90 border-red-500/20 bg-red-500/5",
};

const adaptColors = {
  improving: "text-accent",
  stable: "text-zinc-400",
  strained: "text-amber-400",
  unknown: "text-zinc-600",
};

export function CoachContextRail({
  snapshot,
  memory,
  volumeSparkline,
  collapsed,
  onToggleCollapse,
}: {
  snapshot: CoachContextSnapshot;
  memory: MemorySnippet[];
  volumeSparkline: { label: string; km: number }[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { distance, distanceUnit, distanceLabel } = useUnitFormat();
  const sparkData = volumeSparkline.map((d) => ({
    ...d,
    dist: distanceValueIn(d.km, distanceUnit),
  }));

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="hidden h-full w-10 shrink-0 items-center justify-center border-l border-white/[0.06] bg-[var(--surface-subdued)] lg:flex"
        aria-label="Expand context panel"
      >
        <ChevronLeft className="h-4 w-4 text-zinc-500" />
      </button>
    );
  }

  return (
    <aside className="coach-rail hidden w-[280px] shrink-0 flex-col border-l border-white/[0.06] bg-[var(--surface-subdued)] backdrop-blur-sm lg:flex xl:w-[320px]">
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
        <span className={dash.labelAccent}>Operational context</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"
          aria-label="Collapse context"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="rounded-lg border border-accent/15 bg-accent/[0.04] px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-accent/80">Current focus</p>
          <p className="mt-1 font-display text-sm font-semibold text-white">
            {snapshot.currentFocus}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
            <p className={dash.label}>Adaptation</p>
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs font-medium",
                adaptColors[snapshot.adaptationTrend],
              )}
            >
              <TrendingUp className="h-3 w-3" />
              {snapshot.adaptationLabel}
            </p>
          </div>
          <div className={cn("rounded-lg border p-2.5", riskColors[snapshot.riskLevel])}>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Risk</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              {snapshot.riskLabel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Metric
            label="Readiness"
            value={snapshot.readinessScore != null ? String(snapshot.readinessScore) : "—"}
            sub={snapshot.readinessLabel ?? undefined}
          />
          <Metric
            label="Freshness"
            value={snapshot.freshness != null ? String(snapshot.freshness) : "—"}
            sub={
              snapshot.tsb != null ? `TSB ${snapshot.tsb}` : (snapshot.fatigueLabel ?? undefined)
            }
          />
        </div>

        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-xs text-zinc-500">
          <span className={dash.label}>Recommendation confidence</span>
          <p className="mt-1 capitalize text-zinc-300">{snapshot.recommendationConfidence}</p>
        </div>

        {snapshot.blockSummary ? (
          <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] px-3 py-2.5 text-xs text-zinc-500">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <span>{snapshot.blockSummary}</span>
          </div>
        ) : null}

        {snapshot.archetypeLabel ? (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
            <p className={dash.label}>Modality profile</p>
            <p className="mt-1 text-sm font-medium text-zinc-300">{snapshot.archetypeLabel}</p>
            {snapshot.modalityHeadline ? (
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
                {snapshot.modalityHeadline}
              </p>
            ) : null}
          </div>
        ) : null}

        {snapshot.raceLabel ? (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-accent/70" />
              <span className={dash.label}>Race timeline</span>
            </div>
            <p className="mt-1 font-display text-sm font-semibold text-white">
              {snapshot.raceLabel}
            </p>
            {snapshot.daysToRace != null ? (
              <p className="text-xs text-zinc-500">
                {snapshot.daysToRace} days out
                {snapshot.projectedFinish ? ` · ~${snapshot.projectedFinish}` : ""}
              </p>
            ) : null}
            {snapshot.weekLabel ? (
              <p className="mt-1 text-[11px] text-zinc-600">This week: {snapshot.weekLabel}</p>
            ) : null}
            <Link
              href="/progress"
              className="mt-2 inline-block text-[11px] text-accent/90 hover:underline"
            >
              Adjust goal
            </Link>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">
            <Link href="/progress" className="text-accent/90 hover:underline">
              Set a race goal
            </Link>{" "}
            for race-specific coaching.
          </p>
        )}

        {volumeSparkline.length >= 3 ? (
          <div>
            <p className={cn(dash.label, "mb-2")}>Weekly volume</p>
            <ChartContainer height={88} className="w-full">
              {({ width, height }) => (
                <AreaChart width={width} height={height} data={sparkData}>
                  <defs>
                    <linearGradient id="coachVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v) => [`${v ?? 0} ${distanceLabel}`, "Volume"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="dist"
                    stroke="rgb(240, 134, 74)"
                    strokeWidth={1.5}
                    fill="url(#coachVol)"
                  />
                </AreaChart>
              )}
            </ChartContainer>
          </div>
        ) : null}

        <p className="text-xs text-zinc-600">
          {snapshot.runCount} runs · {distance(snapshot.last7Km)} last 7d
          {snapshot.dataConfidence ? ` · ${snapshot.dataConfidence} confidence` : ""}
        </p>

        {memory.length > 0 ? (
          <div>
            <p className={cn(dash.label, "mb-2")}>Memory signals</p>
            <ul className="space-y-2">
              {memory.slice(0, 4).map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-2 text-[11px] leading-snug text-zinc-500"
                >
                  <span className="font-medium text-zinc-600">{m.label}: </span>
                  {m.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
