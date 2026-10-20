"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RequireData } from "@/components/require-data";
import { useStrava } from "@/lib/context/strava-context";
import { useAthleteIntelligence } from "@/hooks/use-athlete-intelligence";
import { getStateEvolutionStrip } from "@/lib/intelligence/presentation";
import { allBeliefs } from "@/lib/athlete-memory";
import { IntelligenceWorkspace } from "./intelligence-workspace";
import { IntelligenceHero } from "./intelligence-hero";
import {
  IntelligenceStateEvolution,
  IntelligenceSignalBoard,
  IntelligenceDecisionSupport,
  IntelligenceMemoryGrouped,
  IntelligenceEcosystemCompact,
  IntelligenceCoachEntries,
} from "./intelligence-sections";
import { IntelligenceRecentlyLearned } from "./intelligence-recently-learned";
import { IntelligenceRecommendationOutcomes } from "./intelligence-recommendation-outcomes";
import { IntelligenceRiskPatterns } from "./intelligence-risk-patterns";
import { IntelligencePeriodNarratives } from "./intelligence-period-narratives";
import { IntelligenceForecastAccuracy } from "./intelligence-forecast-accuracy";
import { IntelligencePhysiology } from "./intelligence-physiology";
import { IntelligenceCapabilityRadar } from "./intelligence-capability-radar";
import { IntelligenceProgressionBurndown } from "./intelligence-progression-burndown";
import { IntelligenceDeepDive } from "./intelligence-deep-dive";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow } from "@/components/console/console-kit";
import { useRecommendationOutcomes } from "@/hooks/use-recommendation-outcomes";
import { useForecastAccuracy } from "@/hooks/use-forecast-accuracy";
import { coachUrl } from "@/lib/coach/domainLinks";

export function IntelligencePage() {
  const intel = useAthleteIntelligence();
  const { dataSourceLabel, importData } = useStrava();
  const outcomes = useRecommendationOutcomes(!!intel.state);
  const forecastAccuracy = useForecastAccuracy(!!intel.state);
  const [evidenceTab, setEvidenceTab] = useState<"fitness" | "physiology" | "memory">("fitness");

  const evolution = useMemo(
    () => (intel.analytics ? getStateEvolutionStrip(intel.analytics) : []),
    [intel.analytics],
  );

  const beliefsById = useMemo(() => {
    if (!intel.adaptive?.memory) return undefined;
    const map = new Map<string, import("@/lib/athlete-memory/types").AthleteBelief>();
    for (const b of allBeliefs(intel.adaptive.memory)) {
      map.set(b.id, b);
    }
    return map;
  }, [intel.adaptive]);

  if (intel.loading && !intel.state) {
    return (
      <RequireData>
        <IntelligenceWorkspace>
          <div className="intelligence-model space-y-3">
            <div className="skeleton-shimmer h-32 rounded-xl" />
            <div className="skeleton-shimmer h-16 rounded-lg" />
          </div>
        </IntelligenceWorkspace>
      </RequireData>
    );
  }

  if (!intel.state || !intel.analytics || !intel.primaryRecommendation) {
    return (
      <RequireData>
        <p className="text-sm text-zinc-600">
          Load training data to view your athlete intelligence model.
        </p>
      </RequireData>
    );
  }

  const runCount = importData?.runs.length ?? intel.analytics.summary.runCount;
  const confidenceLabel =
    intel.analytics.dataConfidence === "high"
      ? "high confidence"
      : intel.analytics.dataConfidence === "medium"
        ? "moderate confidence"
        : "low confidence";
  const trustLine = [`${runCount} runs`, dataSourceLabel ?? "Strava API", confidenceLabel].join(
    " · ",
  );

  const risks = intel.risksAndOpportunities.filter((r) => r.kind === "risk");
  const opportunities = intel.risksAndOpportunities.filter((r) => r.kind === "opportunity");

  return (
    <RequireData>
      <IntelligenceWorkspace>
        <div className="intelligence-model space-y-3 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-500">
              What StrideIQ currently believes, what changed, and what to investigate
            </p>
            <div className="flex gap-3 font-mono text-[11px]">
              <Link href="/training" className="text-zinc-500 hover:text-accent">
                Plan →
              </Link>
              <Link href={coachUrl()} className="text-zinc-500 hover:text-accent">
                Coach →
              </Link>
            </div>
          </div>

          {/* The answer: what the system believes and what to do. */}
          <IntelligenceHero
            state={intel.state}
            analytics={intel.analytics}
            primaryRecommendation={intel.primaryRecommendation}
            trustLine={trustLine}
          />

          {evolution.length > 0 ? <IntelligenceStateEvolution items={evolution} /> : null}

          <IntelligenceDecisionSupport
            risks={risks}
            opportunities={opportunities}
            recommendation={intel.primaryRecommendation}
          />

          <IntelligenceRecentlyLearned
            items={intel.recentlyLearned}
            adaptationSignals={intel.adaptationSignals}
          />

          {/* The evidence behind the belief, grouped so the page never becomes a wall. */}
          <div className="pt-1">
            <Eyebrow className="mb-2">Evidence</Eyebrow>
            <Tabs
              value={evidenceTab}
              onValueChange={(value) =>
                setEvidenceTab(value as "fitness" | "physiology" | "memory")
              }
              className="gap-3"
            >
              <TabsList className="w-full">
                <TabsTrigger value="fitness">Fitness</TabsTrigger>
                <TabsTrigger value="physiology">Physiology</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-3 space-y-3">
              {evidenceTab === "fitness" ? (
                <>
                  <IntelligencePeriodNarratives
                    monthly={intel.analytics.monthlyNarrative}
                    preRace={intel.analytics.preRaceNarrative}
                  />
                  {intel.analytics.riskPatterns.length > 0 ? (
                    <IntelligenceRiskPatterns patterns={intel.analytics.riskPatterns} />
                  ) : null}
                  <IntelligenceCapabilityRadar data={intel.analytics.capabilityRadar} />
                  <IntelligenceProgressionBurndown data={intel.analytics.progressionBurndown} />
                  {outcomes ? <IntelligenceRecommendationOutcomes data={outcomes} /> : null}
                  {forecastAccuracy ? (
                    <IntelligenceForecastAccuracy data={forecastAccuracy} />
                  ) : null}
                </>
              ) : null}

              {evidenceTab === "physiology" ? (
                <IntelligencePhysiology data={intel.analytics.physiology} />
              ) : null}

              {evidenceTab === "memory" ? (
                <>
                  <IntelligenceMemoryGrouped memory={intel.memory} beliefsById={beliefsById} />
                  <IntelligenceSignalBoard signals={intel.signals} compact />
                  {intel.ecosystem ? (
                    <IntelligenceEcosystemCompact ecosystem={intel.ecosystem} />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {/* Statistical depth, demoted: a teaser + Coach handoff, expandable on demand. */}
          <IntelligenceDeepDive
            data={{
              personalZScores: intel.analytics.personalZScores,
              anomalies: intel.analytics.anomalies,
              uncertaintyEstimates: intel.analytics.uncertaintyEstimates,
              correlations: intel.analytics.correlations,
              changePoints: intel.analytics.changePoints,
            }}
          />

          <IntelligenceCoachEntries domains={intel.state.domains} />
        </div>
      </IntelligenceWorkspace>
    </RequireData>
  );
}
