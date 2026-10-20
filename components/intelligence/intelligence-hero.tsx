"use client";

import Link from "next/link";
import type { CoachWorkspaceState } from "@/lib/coach/types";
import type { DashboardInsights } from "@/lib/analytics";
import { buildCurrentBelief } from "@/lib/intelligence/presentation";
import {
  buildHeroSupportingReasons,
  buildSystemConfidenceSummary,
} from "@/lib/intelligence/intelligenceUiHelpers";
import { coachUrl, topicCoachLink } from "@/lib/coach/domainLinks";
import { Eyebrow, Panel } from "@/components/console/console-kit";
import { CalendarRange, MessageCircle } from "lucide-react";

export function IntelligenceHero({
  state,
  analytics,
  primaryRecommendation,
  metaLine,
  trustLine,
}: {
  state: CoachWorkspaceState;
  analytics: DashboardInsights;
  primaryRecommendation: string;
  metaLine?: string;
  trustLine?: string;
}) {
  const currentBelief = buildCurrentBelief(state, analytics);
  const supporting = buildHeroSupportingReasons(state, analytics);
  const confidence = buildSystemConfidenceSummary(analytics);

  return (
    <Panel className="intelligence-hero relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_100%_0%,var(--home-signal-wash),transparent_55%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
        <Eyebrow>
          Persistent athlete model
          {metaLine ? <span className="text-zinc-500"> · {metaLine}</span> : null}
        </Eyebrow>
        <p className="font-mono text-[10px] text-zinc-500">
          System confidence: <span className="text-zinc-400">{confidence.level}</span>
          <span className="text-zinc-600">, {confidence.reason}</span>
        </p>
      </div>

      <div className="relative mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0 space-y-2.5">
          <div>
            <Eyebrow>Current focus</Eyebrow>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              {state.currentFocus}
            </h1>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Current belief
            </p>
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
              {currentBelief}
            </p>
          </div>

          <div
            className="max-w-2xl rounded-lg px-3.5 py-3"
            style={{
              background: "var(--home-signal-wash)",
              boxShadow: "inset 0 0 0 1px var(--home-signal-line)",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Primary action
            </p>
            <p className="mt-1 text-[14px] font-medium leading-snug text-foreground">
              {primaryRecommendation}
            </p>
          </div>

          {supporting.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {supporting.map((r) => (
                <span
                  key={r}
                  className="rounded-md bg-[var(--surface-subdued)] px-2 py-0.5 font-mono text-[10px] text-zinc-500 ring-1 ring-[var(--border-subtle)]"
                >
                  {r}
                </span>
              ))}
            </div>
          ) : null}

          {trustLine ? <p className="font-mono text-[10px] text-zinc-500">{trustLine}</p> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/training"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--home-signal-ink)] hover:brightness-110"
              style={{ background: "var(--home-signal)" }}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Open next plan
            </Link>
            <Link
              href={coachUrl({ investigate: true })}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-foreground ring-1 ring-[var(--border-default)] hover:bg-[var(--surface-subdued)]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ask Coach
            </Link>
            <Link
              href={topicCoachLink("readiness-change", "Why did my readiness change this week?")}
              className="rounded-lg px-3 py-1.5 text-[12px] text-zinc-500 hover:bg-[var(--surface-subdued)] hover:text-zinc-300"
            >
              Investigate readiness
            </Link>
          </div>
        </div>
      </div>
    </Panel>
  );
}
