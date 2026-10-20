"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { PredictionChart } from "@/components/predictions/prediction-chart";
import { PredictionTrendChart } from "@/components/progression/prediction-trend-chart";
import type { RaceProjectionView } from "@/lib/performance/viewModels";
import type { PredictionTimelinePoint } from "@/lib/analytics/progression";
import { Eyebrow, Panel, PanelHeader, Readout } from "@/components/console/console-kit";
import { cn } from "@/lib/utils";
import { ChevronDown, AlertTriangle } from "lucide-react";

export function RaceProjectionPanel({
  projection,
  predictionTimeline,
}: {
  projection: RaceProjectionView;
  predictionTimeline: PredictionTimelinePoint[];
}) {
  const [curveOpen, setCurveOpen] = useState(false);

  if (!projection.primary && projection.allDistances.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Race performance projection" />
        <p className="text-sm text-zinc-500">
          Need quality efforts between 4–15 km (or FIT segment data) to build evidence-based
          projections.{" "}
          <Link href="/import" className="text-accent hover:underline">
            Import FIT files
          </Link>{" "}
          for best results.
        </p>
      </Panel>
    );
  }

  const p = projection.primary!;

  return (
    <Panel>
      <PanelHeader title="Race performance projection" href="/progress" action="Open" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(200px,280px)] lg:gap-8">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>{p.label} projection</Eyebrow>
              <div className="mt-1 flex items-end gap-2">
                <Readout value={p.timeDisplay} className="text-[clamp(30px,5vw,40px)]" />
                <span className="mb-1 font-mono text-lg text-zinc-500">{p.spreadDisplay}</span>
              </div>
              <p className="mt-1 font-mono text-sm text-zinc-500">
                Evidence band {p.rangeDisplay} · {p.paceDisplay} even effort
              </p>
            </div>
            <ConfidenceBadge level={p.confidence} />
          </div>

          <p className="mt-3 text-xs text-zinc-600">
            Estimate, not a guarantee. Spread reflects model disagreement and sample size.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Eyebrow>Confidence drivers</Eyebrow>
              <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                {projection.confidenceDrivers.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent/70">✓</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>Confidence reducers</Eyebrow>
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                {projection.confidenceReducers.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span>○</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {projection.pacingNote ? (
            <p className="mt-4 rounded-lg bg-[var(--surface-subdued)] px-3 py-2.5 text-sm text-zinc-400 ring-1 ring-inset ring-[var(--border-subtle)]">
              <span className="font-medium text-zinc-300">Pacing · </span>
              {projection.pacingNote}
            </p>
          ) : null}

          {projection.fadeRisk ? (
            <p className="mt-2 flex items-start gap-2 text-xs text-amber-400/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {projection.fadeRisk}
            </p>
          ) : null}

          <ul className="mt-4 space-y-1 text-xs text-zinc-600">
            {projection.explanation.slice(0, 3).map((line, i) => (
              <li key={i}>· {line}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Eyebrow>All distances</Eyebrow>
          <div className="space-y-2">
            {projection.allDistances.map((d) => (
              <div
                key={d.label}
                className="flex items-baseline justify-between rounded-lg bg-[var(--surface-subdued)] px-3 py-2 ring-1 ring-inset ring-[var(--border-subtle)]"
              >
                <span className="text-xs text-zinc-500">{d.label}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {d.timeDisplay}
                  {d.rangeDisplay ? (
                    <span className="ml-1 text-[10px] font-normal text-zinc-600">
                      {d.rangeDisplay}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {predictionTimeline.length >= 2 ? (
        <div className="mt-5 rounded-lg bg-[var(--surface-subdued)] px-2 py-3 ring-1 ring-inset ring-[var(--border-subtle)]">
          <Eyebrow className="mb-2 px-1">Projection trajectory</Eyebrow>
          <PredictionTrendChart timeline={predictionTimeline} />
        </div>
      ) : null}

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg bg-[var(--surface-subdued)] px-3 py-2.5 text-left text-xs font-medium text-zinc-500 ring-1 ring-inset ring-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
        onClick={() => setCurveOpen((v) => !v)}
        aria-expanded={curveOpen}
      >
        Performance curve & model scatter
        <ChevronDown className={cn("h-4 w-4 transition-transform", curveOpen && "rotate-180")} />
      </button>
      {curveOpen ? (
        <div className="mt-3 rounded-lg bg-[var(--surface-subdued)] p-2 ring-1 ring-inset ring-[var(--border-subtle)]">
          <PredictionChart analysis={projection.analysis} />
        </div>
      ) : null}
    </Panel>
  );
}
