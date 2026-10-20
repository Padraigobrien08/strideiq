"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { ReadinessRing } from "@/components/home/primitives/readiness-ring";
import { Sparkline } from "@/components/home/primitives/sparkline";
import type { TrainingStateHeroView, TrainingStateSeverity } from "@/lib/training/viewModels";
import { Eyebrow, Panel } from "@/components/console/console-kit";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

const severityBorder: Record<TrainingStateSeverity, string> = {
  positive: "border-l-[var(--home-good)]",
  neutral: "border-l-[var(--border-default)]",
  warning: "border-l-amber-500/55",
  critical: "border-l-red-500/55",
};

export function TrainingStateHero({ hero }: { hero: TrainingStateHeroView }) {
  return (
    <Panel className={cn("relative overflow-hidden border-l-[3px]", severityBorder[hero.severity])}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,var(--home-signal-wash),transparent_55%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[1fr_minmax(220px,280px)] lg:gap-8">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Training state</Eyebrow>
            <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 ring-1 ring-inset ring-white/[0.06]">
              {hero.classification}
            </span>
            <ConfidenceBadge level={hero.confidence} />
          </div>

          <div className="max-w-4xl space-y-2">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {hero.title}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-300/90">
              {hero.interpretation}
            </p>
          </div>

          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: "var(--home-signal-wash)",
              boxShadow: "inset 0 0 0 1px var(--home-signal-line)",
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--home-signal)" }}>
              Current recommendation
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-200">{hero.recommendation}</p>
          </div>

          {hero.raceContext ? (
            <p className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-400">Race · </span>
              {hero.raceContext}
            </p>
          ) : null}

          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
            {hero.inlineMetrics.map((m) => (
              <div key={m.label} className="flex flex-col">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">{m.label}</dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[15px] tabular-nums text-foreground">
                    {m.value}
                  </span>
                  {m.hint ? (
                    <span className="font-mono text-[10px] text-zinc-500">{m.hint}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <Link href="/progress">
            <Button size="sm" className="h-9">
              Review goals & readiness
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <aside
          className="flex items-center gap-4 rounded-xl bg-[var(--surface-subdued)] p-4 ring-1 ring-[var(--border-subtle)] lg:flex-col lg:items-center lg:gap-3"
          aria-label="Readiness telemetry"
        >
          <ReadinessRing score={hero.readinessScore} size={100} showGlow />
          <div className="min-w-0 flex-1 space-y-2 lg:w-full lg:text-center">
            <p className="text-sm text-zinc-400">{hero.readinessLabel}</p>
            <p className="text-xs text-zinc-500">
              Freshness{" "}
              <strong className="font-mono tabular-nums text-zinc-200">{hero.freshness}</strong>
              <span className="text-zinc-600"> · {hero.freshnessLabel}</span>
            </p>
            <Sparkline
              data={hero.loadSparkline}
              fullWidth
              height={32}
              positive={hero.freshness >= 55}
            />
            <p className="font-mono text-[11px] tabular-nums text-zinc-600">{hero.trendLabel}</p>
          </div>
        </aside>
      </div>
    </Panel>
  );
}
