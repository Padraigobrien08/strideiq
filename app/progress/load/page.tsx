"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RequireData } from "@/components/require-data";
import { useTrainingIntelligence } from "@/hooks/use-training-intelligence";
import { buildTrainingPageView } from "@/lib/training/viewModels";
import { TrainingWorkspace } from "@/components/training/training-workspace";
import { TrainingStateHero } from "@/components/training/training-state-hero";
import { LoadIntelligencePanel } from "@/components/training/load-intelligence-panel";
import { CoachingExplainability } from "@/components/training/coaching-explainability";
import { AdaptationSignalsPanel } from "@/components/training/adaptation-signals-panel";
import { PhaseCatalogPanel } from "@/components/training/phase-catalog-panel";
import { SupportingAnalytics } from "@/components/training/supporting-analytics";
import { TrainingEcosystemPanel } from "@/components/training/training-ecosystem-panel";
import { ops } from "@/components/home/primitives/tokens";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/console/console-kit";
import { JargonTerm } from "@/components/jargon-term";
import { ArrowRight, Sparkles } from "lucide-react";

function TrainingEvidenceBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--surface-shadow-subtle)] ring-1 ring-[var(--border-subtle)]">
      <div>
        <Eyebrow>Training load · Am I training correctly?</Eyebrow>
        <p className="mt-0.5 text-xs text-zinc-600">
          <JargonTerm term="load">Load</JargonTerm>, intensity mix,{" "}
          <JargonTerm term="phase">phase</JargonTerm>, and cross-training: how your training is
          structured.
        </p>
      </div>
      <Link
        href="/training"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent/12 px-3 py-2 text-[13px] font-medium text-accent ring-1 ring-inset ring-accent/30 hover:bg-accent/20"
      >
        <Sparkles className="h-3.5 w-3.5" />
        This week&apos;s plan
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/**
 * Training load — "Am I training correctly?" Moved from `/training` in overhaul Phase 3,
 * when `/training` became the current week; load analysis is Progress depth.
 */
export default function TrainingLoadPage() {
  const { analytics, insights, loading } = useTrainingIntelligence();

  const view = useMemo(() => {
    if (!analytics) return null;
    return buildTrainingPageView(analytics, insights);
  }, [analytics, insights]);

  if (loading && !view) {
    return (
      <div className="dashboard-enter w-full space-y-4 pb-8">
        <div className="skeleton-shimmer h-10 w-full rounded-lg" />
        <div className="skeleton-shimmer h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <RequireData>
      {view && analytics && (
        <TrainingWorkspace>
          <TrainingEvidenceBanner />
          <TrainingStateHero hero={view.hero} />
          <div className="grid gap-4 lg:grid-cols-2">
            <LoadIntelligencePanel data={view.load} className={cn(ops.intelMain)} />
            <CoachingExplainability data={view.explain} className={cn(ops.intelSide)} />
          </div>
          <AdaptationSignalsPanel data={view.adaptation} />
          <PhaseCatalogPanel phases={analytics.trainingPhases} />
          <TrainingEcosystemPanel data={view.ecosystem} />
          <SupportingAnalytics data={view.supporting} defaultCollapsed />
        </TrainingWorkspace>
      )}
    </RequireData>
  );
}
