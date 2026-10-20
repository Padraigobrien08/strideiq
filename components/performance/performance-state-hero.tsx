"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { ReadinessRing } from "@/components/home/primitives/readiness-ring";
import { Sparkline } from "@/components/home/primitives/sparkline";
import type { PerformanceHeroView } from "@/lib/performance/viewModels";
import { dash } from "@/components/home/primitives/tokens";
import { Eyebrow, Panel, Readout } from "@/components/console/console-kit";
import { cn } from "@/lib/utils";
import { ArrowRight, TrendingUp } from "lucide-react";

const severityBar: Record<PerformanceHeroView["severity"], string> = {
  positive: "var(--home-signal)",
  neutral: "var(--muted-subtle)",
  warning: "var(--hz-moderate)",
};

export function PerformanceStateHero({ hero }: { hero: PerformanceHeroView }) {
  return (
    <Panel className="relative overflow-hidden">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
        style={{ background: severityBar[hero.severity] }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_100%_0%,var(--home-signal-wash),transparent_55%)]" />

      <div className="relative grid gap-5 lg:grid-cols-[1fr_minmax(240px,300px)] lg:gap-8">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Performance intelligence</Eyebrow>
            <span className="rounded-md bg-[var(--surface-subdued)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400 ring-1 ring-inset ring-[var(--border-subtle)]">
              {hero.classification}
            </span>
            <ConfidenceBadge level={hero.confidence} />
          </div>

          <div className="max-w-4xl space-y-2">
            <h1 className={dash.h1}>{hero.title}</h1>
            <p className={cn(dash.lead, "text-zinc-300/90")}>{hero.interpretation}</p>
          </div>

          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: "var(--home-signal-wash)",
              boxShadow: "inset 0 0 0 1px var(--home-signal-line)",
            }}
          >
            <Eyebrow>Strongest signal</Eyebrow>
            <p className="mt-1 flex items-start gap-2 text-sm text-zinc-200">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {hero.strongestSignal}
            </p>
          </div>

          <p className="text-sm text-zinc-400">
            <span className="font-medium text-zinc-300">Focus · </span>
            {hero.recommendation}
          </p>

          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
            {hero.inlineMetrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-2">
                <dt className={dash.label}>{m.label}</dt>
                <dd className="flex items-baseline gap-2">
                  <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
                    {m.value}
                  </span>
                  {m.hint ? <span className={dash.muted}>{m.hint}</span> : null}
                </dd>
              </div>
            ))}
          </dl>

          <Link href="/progress">
            <Button
              size="sm"
              className="h-9 border-0 text-[var(--home-signal-ink)]"
              style={{ background: "var(--home-signal)" }}
            >
              Race goals & strategy
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <aside
          className="flex flex-col gap-4 rounded-xl bg-[var(--surface-subdued)] p-4 ring-1 ring-[var(--border-subtle)]"
          aria-label="Projection and trajectory"
        >
          {hero.projection ? (
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <Eyebrow>Projected {hero.projection.label}</Eyebrow>
              <div className="mt-1 flex items-end gap-2">
                <Readout
                  value={hero.projection.timeDisplay}
                  className="text-[clamp(24px,4vw,32px)]"
                />
                {hero.projection.rangeDisplay ? (
                  <span className="mb-1 font-mono text-sm text-zinc-500">
                    {hero.projection.rangeDisplay}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-500">
                Confidence: {hero.projection.confidenceLabel}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <ReadinessRing score={hero.trajectoryScore} size={88} showGlow label="Trajectory" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-400">{hero.trajectoryLabel}</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-600">
                Readiness {hero.readinessScore} · {hero.readinessLabel}
              </p>
              <Sparkline
                data={hero.sparkline}
                fullWidth
                height={32}
                positive={hero.severity === "positive"}
                className="mt-2"
              />
            </div>
          </div>
        </aside>
      </div>
    </Panel>
  );
}
