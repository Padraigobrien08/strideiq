import { simulateRaceStrategy, type StrategyMode } from "@/lib/analytics/raceStrategy";
import { WORKOUT_TYPE_LABELS } from "@/lib/analytics/workoutType";
import { formatDuration, formatPace } from "@/lib/utils";
import { countRunsMissingStreams, countStreamsForUser } from "@/lib/db/activity-streams";
import { buildGoalsPageView } from "@/lib/goals/viewModels";
import { buildTrainingPageView } from "@/lib/training/viewModels";
import { recommendTodaySession, buildTodaySessionInput } from "@/lib/training/todaySession";
import { loadImpactFor, todayLoadImpact } from "@/lib/training/loadBalanceImpact";
import { trainingLoadBalancePayload } from "./loadBalancePayload";
import { computeGoalScenarios } from "@/lib/goals/goalScenarios";
import { buildRaceForecastInput } from "@/lib/forecasting-v2/buildInput";
import { buildRaceForecastV2 } from "@/lib/forecasting-v2/forecastEngine";
import { computeForecastSensitivity } from "@/lib/forecasting-v2/sensitivity";
import {
  evaluateForecastCalibration,
  logForecastForCalibration,
} from "@/lib/forecasting-v2/calibrationService";
import {
  evaluateRecommendationOutcomes,
  logGoalScenarioRecommendation,
  logTodaySessionRecommendation,
  logWeekPlanRecommendations,
} from "@/lib/recommendation-outcomes/service";
import {
  buildFullEcosystemCoachPayload,
  compareModalityBlocks,
  getAthleteArchetypePayload,
  getCrossTrainingSupport,
  getInterferenceRisks,
  getModalityDistribution,
  getRaceWeekInterferenceCheck,
  getStrengthMobilitySupport,
  getTrainingEcosystemSummary,
  parseEcosystemWindow,
} from "@/lib/ecosystem/coachTools";
import type {
  CompareModalityBlocksArgs,
  EcosystemWindowArgs,
  RaceWeekInterferenceArgs,
} from "./types";
import { buildReasoningContext } from "@/lib/reasoning/context";
import {
  analyzeFadePattern,
  attributeImprovement,
  compareSessions,
  explainReadinessDelta,
  findBestPhase,
  prContext,
} from "@/lib/reasoning";
import { serializeMemoryForCoachAnswer } from "@/lib/athlete-memory";
import { getPersistedAthleteMemory } from "@/lib/db/athlete-memory";
import { executeGenerateNextWeekTrainingPlan, planToolPayload } from "@/lib/ai-planning/planTool";
import { buildRunCoachDetail } from "@/lib/coaching-context";
import { buildIntelligenceBrief } from "./brief";
import { wrapIntelligence, wrapReasoning } from "./envelope";
import { computeAthleteIntelligence, resolveIntelligenceContext } from "./service";
import type {
  AnalyzeFadePatternToolArgs,
  AthleteIntelligenceBundle,
  AttributeImprovementToolArgs,
  CompareSessionsToolArgs,
  ExplainReadinessDeltaToolArgs,
  FindBestPhaseToolArgs,
  GenerateNextWeekTrainingPlanArgs,
  GetRaceStrategyArgs,
  IntelligenceContext,
  IntelligenceToolName,
  GetRunDetailArgs,
  ListRecentRunsArgs,
  PrContextToolArgs,
  ToolCallInput,
} from "./types";

let bundleCache: {
  key: string;
  bundle: AthleteIntelligenceBundle;
  at: number;
} | null = null;

const CACHE_MS = 60_000;

async function getBundle(ctx: IntelligenceContext): Promise<AthleteIntelligenceBundle> {
  const key = `${ctx.userId}:${ctx.raceGoal?.date ?? ""}:${ctx.raceGoal?.distance ?? ""}`;
  if (bundleCache && bundleCache.key === key && Date.now() - bundleCache.at < CACHE_MS) {
    return bundleCache.bundle;
  }
  const bundle = await computeAthleteIntelligence(ctx);
  bundleCache = { key, bundle, at: Date.now() };
  return bundle;
}

export async function executeIntelligenceTool(ctx: IntelligenceContext, call: ToolCallInput) {
  const bundle = await getBundle(ctx);
  const resolved = await resolveIntelligenceContext(ctx.userId, ctx);
  const { analytics, insights, quality } = bundle;
  const raceGoal = resolved.raceGoal ?? null;

  switch (call.name) {
    case "get_coach_brief": {
      const brief = buildIntelligenceBrief(analytics, insights, quality, raceGoal);
      return wrapIntelligence(brief, quality);
    }

    case "get_readiness": {
      const goals = buildGoalsPageView(analytics, raceGoal, insights);
      const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
      return wrapIntelligence(
        {
          score: r.score,
          label: r.label,
          distanceLabel: goals.targetDistanceLabel,
          daysUntilRace: analytics.raceReadiness?.daysUntilRace ?? null,
          probabilityBand: analytics.raceReadiness?.probabilityBand ?? null,
          gaps: analytics.raceReadiness?.gaps?.length
            ? analytics.raceReadiness.gaps
            : goals.risks.slice(0, 3).map((x) => ({
                metric: x.title,
                current: x.evidence,
                target: x.mitigation,
              })),
          strongestSignal: goals.hero.strongestSignal,
          largestRisk: goals.hero.biggestLimiter,
        },
        quality,
      );
    }

    case "get_predictions": {
      const analysis = analytics.racePredictionAnalysis;
      return wrapIntelligence(
        {
          confidence: analysis.confidence,
          explanation: analysis.explanation,
          primaryAnchor: analysis.primaryAnchor
            ? {
                runName: analysis.primaryAnchor.runName,
                time: formatDuration(analysis.primaryAnchor.timeSec),
                distanceKm: analysis.primaryAnchor.distanceKm,
              }
            : null,
          consensus: analysis.consensus.map((c) => ({
            label: c.label,
            time: formatDuration(c.timeSec),
            range:
              c.spreadSec > 45
                ? `${formatDuration(c.timeMin)} – ${formatDuration(c.timeMax)}`
                : null,
            pace: formatPace(c.timeSec / c.distanceKm),
          })),
        },
        quality,
      );
    }

    case "get_week_plan": {
      const plan = analytics.nextWeekPlan;
      void logWeekPlanRecommendations(ctx.userId, plan);
      return wrapIntelligence(
        {
          weekLabel: plan.weekLabel,
          weekStart: plan.weekStart,
          template: plan.template,
          totalKmRange: plan.totalKmRange,
          rationale: plan.rationale,
          warnings: plan.warnings.filter((w) => !w.includes("Not a substitute")),
          sessions: plan.sessions.map((s) => ({
            day: s.day,
            type: s.type,
            typeLabel: WORKOUT_TYPE_LABELS[s.type],
            description: s.description,
            distanceKmRange: s.distanceKmRange,
          })),
        },
        quality,
        [
          analytics.raceReadiness
            ? `Race in ${analytics.raceReadiness.daysUntilRace} days`
            : "No race goal on server",
        ],
      );
    }

    case "recommend_today_session": {
      const todayInput = buildTodaySessionInput(analytics);
      const rec = recommendTodaySession(todayInput);
      // Record it so adherence can be evaluated later (fire-and-forget).
      void logTodaySessionRecommendation(ctx.userId, rec);
      return wrapIntelligence(
        {
          kind: rec.kind,
          typeLabel: rec.typeLabel,
          headline: rec.headline,
          distanceKmRange: rec.distanceKmRange,
          intensity: rec.intensity,
          rationale: rec.rationale,
          alternatives: rec.alternatives,
          confidence: rec.confidence,
          // Whether the load balance shaped this session, so Coach can say so (or not).
          trainingLoadBalance: trainingLoadBalancePayload(
            analytics.fatigue,
            loadImpactFor(todayInput),
          ),
        },
        quality,
        rec.evidence,
      );
    }

    case "get_goal_scenarios": {
      if (!raceGoal) {
        return wrapIntelligence(
          { error: "No race goal set. Set a goal on the Goals page or sync preferences." },
          quality,
          [],
          ["Goal scenarios require a race goal with a distance (and ideally a target time)."],
        );
      }
      const forecastInput = buildRaceForecastInput({
        analytics,
        goal: raceGoal,
        runs: bundle.runs,
        fitDetails: bundle.fitDetails,
      });
      if (!forecastInput || forecastInput.efforts.length === 0) {
        return wrapIntelligence(
          { error: "Not enough race-quality efforts to project goal scenarios yet." },
          quality,
          [],
          ["Goal scenarios need at least one race-quality effort on record."],
        );
      }
      const result = computeGoalScenarios(forecastInput);
      void logGoalScenarioRecommendation(ctx.userId, result);
      return wrapIntelligence(
        {
          target: result.targetLabel,
          baselineProjection: formatDuration(result.baselineTimeSec),
          baselineProbabilityPct: result.baselineProbabilityPct,
          recommendation: result.recommendation,
          scenarios: result.scenarios.map((s) => ({
            label: s.label,
            change: s.leverSummary,
            projectedTime: s.projectedTimeLabel,
            probabilityPct: s.probabilityPct,
            meetsTarget: s.meetsTarget,
            why: s.rationale,
          })),
        },
        quality,
        result.evidence,
        result.limitations,
      );
    }

    case "get_monthly_narrative": {
      const n = analytics.monthlyNarrative;
      return wrapIntelligence(
        {
          month: n.monthLabel,
          headline: n.headline,
          narrative: n.paragraphs.join(" "),
          highlights: n.highlights,
          severity: n.severity,
        },
        quality,
        n.highlights,
      );
    }

    case "get_pre_race_narrative": {
      const n = analytics.preRaceNarrative;
      if (!n) {
        return wrapIntelligence(
          { error: "No upcoming race within the taper window (set a race goal within ~3 weeks)." },
          quality,
          [],
          ["Pre-race narrative activates when a race goal is 21 or fewer days out."],
        );
      }
      return wrapIntelligence(
        {
          headline: n.headline,
          daysUntilRace: n.daysUntilRace,
          narrative: n.paragraphs.join(" "),
          gamePlan: n.gamePlan,
          highlights: n.highlights,
          severity: n.severity,
        },
        quality,
        n.highlights,
      );
    }

    case "get_training_phases": {
      const phases = analytics.trainingPhases;
      return wrapIntelligence(
        {
          count: phases.length,
          current: phases[phases.length - 1]?.label ?? null,
          phases: phases.map((p) => ({
            type: p.type,
            label: p.label,
            startWeek: p.startWeek,
            endWeek: p.endWeek,
            weeks: p.weeks,
            avgWeeklyKm: p.avgWeeklyKm,
            characterization: p.characterization,
          })),
        },
        quality,
        phases.map((p) => `${p.label} (${p.weeks}w): ${p.characterization}`),
        phases.length === 0 ? ["Not enough history to segment training phases yet."] : [],
      );
    }

    case "get_risk_patterns": {
      const patterns = analytics.riskPatterns;
      return wrapIntelligence(
        {
          count: patterns.length,
          highestSeverity: patterns[0]?.severity ?? null,
          patterns: patterns.map((p) => ({
            name: p.name,
            severity: p.severity,
            evidence: p.evidence,
            mitigation: p.mitigation,
            confidence: p.confidence,
          })),
        },
        quality,
        patterns.slice(0, 5).map((p) => `${p.name} (${p.severity}): ${p.evidence[0]}`),
        patterns.length === 0 ? ["No elevated training-risk patterns detected."] : [],
      );
    }

    case "explain_prediction": {
      if (!raceGoal) {
        return wrapIntelligence(
          { error: "No race goal set. Set a goal on the Goals page or sync preferences." },
          quality,
          [],
          ["Prediction explanation requires a race goal with a distance."],
        );
      }
      const input = buildRaceForecastInput({
        analytics,
        goal: raceGoal,
        runs: bundle.runs,
        fitDetails: bundle.fitDetails,
      });
      if (!input || input.efforts.length === 0) {
        return wrapIntelligence(
          { error: "Not enough race-quality efforts to forecast yet." },
          quality,
          [],
          ["A prediction needs at least one race-quality effort on record."],
        );
      }
      const f = buildRaceForecastV2(input);
      // Record it so the forecaster can be scored against reality later (G5).
      void logForecastForCalibration(ctx.userId, f, raceGoal.distance);
      return wrapIntelligence(
        {
          mostLikely: formatDuration(f.mostLikelyTimeSec),
          range: `${formatDuration(f.predictionIntervalSec.innerLowSec)}–${formatDuration(f.predictionIntervalSec.innerHighSec)}`,
          confidence: f.confidence,
          capabilityBase: formatDuration(f.capabilityBaseTimeSec),
          derivation: f.derivation.map((s) => ({
            step: s.label,
            deltaSec: s.deltaSec,
            cumulative: formatDuration(s.cumulativeSec),
            factor: s.factor ?? null,
            why: s.evidence ?? null,
          })),
          models: f.modelEstimates.map((m) => ({
            name: m.modelName,
            time: formatDuration(m.predictedTimeSec),
            weight: Math.round(m.weight * 100) / 100,
          })),
          modelAgreement: {
            label: f.modelAgreement.label,
            spread: formatDuration(f.modelAgreement.spreadSec),
          },
          sensitivity: computeForecastSensitivity(input).map((s) => ({
            lever: s.label,
            change: s.change,
            deltaSec: s.deltaSec,
            direction: s.direction,
          })),
          rangeWidth: formatDuration(f.uncertaintyWidthSec),
          whyRangeIsWide: [
            { factor: "Baseline model variability", addsSec: f.uncertaintyBaseWidthSec },
            ...[...f.uncertaintyDrivers]
              .sort((a, b) => b.widthSec - a.widthSec)
              .map((u) => ({ factor: u.label, addsSec: u.widthSec })),
          ],
        },
        quality,
        f.derivation
          .filter((s) => s.deltaSec !== 0)
          .map(
            (s) =>
              `${s.label}: ${s.deltaSec > 0 ? "+" : ""}${s.deltaSec}s${s.evidence ? ` (${s.evidence})` : ""}`,
          ),
        f.limitations.map((l) => l.detail).slice(0, 3),
      );
    }

    case "get_physiology": {
      const phys = analytics.physiology;
      const cs = phys.criticalSpeed;
      const fr = phys.fatigueResistance;
      const dur = phys.durability;
      const te = phys.thresholdEconomy;
      const cn = phys.conditionNormalization;
      return wrapIntelligence(
        {
          criticalSpeed: cs.available
            ? {
                cs: cs.csPaceSecPerKm != null ? formatPace(cs.csPaceSecPerKm) : null,
                csMetersPerSec: cs.csMetersPerSec,
                dPrimeMeters: cs.dPrimeMeters,
                rSquared: cs.rSquared,
                effortsUsed: cs.n,
                confidence: cs.confidence,
                interpretation: cs.interpretation,
              }
            : null,
          fatigueResistance: fr.available
            ? {
                exponent: fr.exponent,
                referenceExponent: fr.referenceExponent,
                extraFadePerDoublingPct: fr.extraFadePerDoublingPct,
                trend: fr.trend,
                rSquared: fr.rSquared,
                effortsUsed: fr.n,
                confidence: fr.confidence,
                interpretation: fr.interpretation,
              }
            : null,
          durability: dur.available
            ? {
                score: dur.score,
                label: dur.label,
                decouplingMedianPct: dur.decouplingMedianPct,
                lateFadeMedianPct: dur.lateFadeMedianPct,
                trend: dur.trend,
                runsSampled: dur.sampleSize,
                confidence: dur.confidence,
                interpretation: dur.interpretation,
              }
            : null,
          thresholdEconomy: te.available
            ? {
                thresholdPace: te.ltPaceSecPerKm != null ? formatPace(te.ltPaceSecPerKm) : null,
                thresholdHr: te.ltHr,
                thresholdPctMaxHr: te.ltPctMaxHr != null ? Math.round(te.ltPctMaxHr * 100) : null,
                thresholdSessions: te.thresholdSampleSize,
                economyIndex: te.economyIndex,
                economyTrend: te.economyTrend,
                economyRuns: te.economySampleSize,
                confidence: te.confidence,
                interpretation: te.interpretation,
              }
            : null,
          conditionNormalization: cn.available
            ? {
                referenceTempC: cn.referenceTempC,
                tempCoveragePct: Math.round(cn.tempCoveragePct * 100),
                hotRuns: cn.hotRunCount,
                normalizedEfficiencyTrend: cn.normalizedEfficiencyTrend,
                example: cn.example
                  ? {
                      run: cn.example.runName,
                      date: cn.example.date.slice(0, 10),
                      tempC: cn.example.tempC,
                      rawPace: formatPace(cn.example.rawPaceSecPerKm),
                      coolEquivalentPace: formatPace(cn.example.normalizedPaceSecPerKm),
                      rawZScore: cn.example.rawZScore,
                      normalizedZScore: cn.example.normalizedZScore,
                    }
                  : null,
                confidence: cn.confidence,
                interpretation: cn.interpretation,
              }
            : null,
        },
        quality,
        [...cs.evidence, ...fr.evidence, ...dur.evidence, ...te.evidence, ...cn.evidence],
        [
          ...cs.limitations,
          ...fr.limitations,
          ...dur.limitations,
          ...te.limitations,
          ...cn.limitations,
        ],
      );
    }

    case "get_capability_radar": {
      const radar = analytics.capabilityRadar;
      if (!radar.available) {
        return wrapIntelligence(
          { error: "Not enough history to profile capabilities yet." },
          quality,
          [],
          radar.limitations,
        );
      }
      return wrapIntelligence(
        {
          goalDistance: radar.goalDistanceLabel,
          biggestLimiter: radar.biggestLimiter
            ? {
                capability: radar.biggestLimiter.label,
                score: radar.biggestLimiter.score,
                why: radar.biggestLimiter.evidence,
              }
            : null,
          interpretation: radar.interpretation,
          axes: radar.axes.map((a) => ({
            capability: a.label,
            score: a.score,
            demandImportance: a.demandImportance,
            isLimiter: a.isLimiter,
            confidence: a.confidence,
            basis: a.basis,
          })),
        },
        quality,
        radar.evidence,
        radar.limitations,
      );
    }

    case "get_progression_burndown": {
      const b = analytics.progressionBurndown;
      if (!b.available) {
        return wrapIntelligence({ error: b.headline }, quality, [], b.limitations);
      }
      return wrapIntelligence(
        {
          goalDistance: b.goalDistanceLabel,
          deadline: b.deadlineLabel,
          headline: b.headline,
          metrics: b.metrics.map((m) => ({
            metric: m.label,
            unit: m.unit,
            current: m.current,
            target: m.target,
            neededPerWeek: m.neededPerWeek,
            recentRatePerWeek: m.recentRatePerWeek,
            weeksToDeadline: m.weeksToDeadline,
            status: m.status,
            weeksBehind: m.weeksBehind,
          })),
        },
        quality,
        b.evidence,
        b.limitations,
      );
    }

    case "get_session_zscores": {
      const z = analytics.personalZScores;
      if (!z.available) {
        return wrapIntelligence(
          { error: "Not enough comparable sessions to score against your own distribution yet." },
          quality,
          [],
          z.limitations,
        );
      }
      const fmt = (s: (typeof z.sessions)[number]) => ({
        date: s.date.slice(0, 10),
        type: s.typeLabel,
        sigma: s.primaryZ,
        metric: s.primaryMetric,
        cohortSize: s.cohortSize,
        confidence: s.confidence,
        headline: s.headline,
      });
      return wrapIntelligence(
        {
          standouts: {
            best: z.standouts.best ? fmt(z.standouts.best) : null,
            worst: z.standouts.worst ? fmt(z.standouts.worst) : null,
          },
          recent: z.sessions.slice(0, 10).map(fmt),
        },
        quality,
        z.evidence,
        z.limitations,
      );
    }

    case "get_anomalies": {
      const report = analytics.anomalies;
      if (!report.available) {
        return wrapIntelligence(
          { anomalies: [], note: report.limitations[0] ?? "No anomalies detected." },
          quality,
          [],
          report.limitations,
        );
      }
      return wrapIntelligence(
        {
          anomalies: report.anomalies.map((a) => ({
            date: a.date.slice(0, 10),
            type: a.typeLabel,
            sigma: a.z,
            direction: a.direction,
            causes: a.likelyCauses.map((c) => ({ cause: c.cause, detail: c.detail })),
            confidence: a.confidence,
            headline: a.headline,
          })),
        },
        quality,
        report.evidence,
        report.limitations,
      );
    }

    case "get_uncertainty": {
      const u = analytics.uncertaintyEstimates;
      if (!u.available) {
        return wrapIntelligence(
          { error: "Not enough recent data to bootstrap confidence intervals yet." },
          quality,
          [],
          u.limitations,
        );
      }
      return wrapIntelligence(
        {
          estimates: u.estimates.map((e) => ({
            metric: e.label,
            unit: e.unit,
            point: e.point,
            ciLow: e.lo,
            ciHigh: e.hi,
            ciPct: e.ciPct,
            sampleSize: e.n,
            confidence: e.confidence,
            interpretation: e.interpretation,
          })),
        },
        quality,
        u.evidence,
        u.limitations,
      );
    }

    case "get_correlations": {
      const c = analytics.correlations;
      if (!c.available) {
        return wrapIntelligence(
          { error: "Not enough data to explore correlations yet." },
          quality,
          [],
          c.limitations,
        );
      }
      return wrapIntelligence(
        {
          correlations: c.correlations.map((x) => ({
            pair: x.label,
            r: x.r,
            n: x.n,
            strength: x.strength,
            direction: x.direction,
            interpretation: x.interpretation,
            caveat: x.caveat,
          })),
        },
        quality,
        c.evidence,
        c.limitations,
      );
    }

    case "get_change_points": {
      const cp = analytics.changePoints;
      if (!cp.available) {
        return wrapIntelligence(
          { changePoints: [], note: cp.limitations[0] ?? "No fitness change-points detected." },
          quality,
          [],
          cp.limitations,
        );
      }
      return wrapIntelligence(
        {
          metric: cp.metricLabel,
          changePoints: cp.changePoints.map((c) => ({
            week: c.label,
            kind: c.kind,
            slopeBefore: c.slopeBefore,
            slopeAfter: c.slopeAfter,
            deltaPerWeek: c.deltaPerWeek,
            interpretation: c.interpretation,
          })),
        },
        quality,
        cp.evidence,
        cp.limitations,
      );
    }

    case "get_forecast_accuracy": {
      const result = await evaluateForecastCalibration(
        ctx.userId,
        analytics.racePredictionAnalysis.efforts,
      );
      const s = result.summary;
      const scored = result.forecasts.filter((f) => f.actualTimeSec != null);
      return wrapIntelligence(
        {
          summary: {
            logged: s.logged,
            evaluated: s.evaluated,
            outerBandHitRatePct: s.outerBandHitRatePct,
            innerBandHitRatePct: s.innerBandHitRatePct,
            bias:
              s.medianSignedErrorSec == null
                ? null
                : s.medianSignedErrorSec > 5
                  ? `runs ~${s.medianSignedErrorSec}s slower than predicted (model optimistic)`
                  : s.medianSignedErrorSec < -5
                    ? `runs ~${Math.abs(s.medianSignedErrorSec)}s faster than predicted (model conservative)`
                    : "well-centered",
            meanAbsErrorSec: s.meanAbsErrorSec,
          },
          scored: scored.slice(0, 8).map((f) => ({
            distance: f.distanceKey,
            issued: f.issuedAt.slice(0, 10),
            predicted: formatDuration(f.mostLikelyTimeSec),
            actual: f.actualTimeSec != null ? formatDuration(f.actualTimeSec) : null,
            withinBand: f.withinBand ?? null,
          })),
        },
        quality,
        s.evaluated > 0
          ? [
              `${s.outerBandHitRatePct}% of scored forecasts landed inside the band that was shown. This is an observed hit rate, not a calibration score: the band is a heuristic, so there is no share it ought to be.`,
              `Mean absolute error ${s.meanAbsErrorSec}s across ${s.evaluated} scored forecasts`,
            ]
          : [],
        s.evaluated === 0
          ? ["No forecasts have been scored yet. They're graded once you race that distance again."]
          : [],
      );
    }

    case "get_recommendation_outcomes": {
      const result = await evaluateRecommendationOutcomes(
        ctx.userId,
        bundle.runs,
        analytics.workoutLabels,
        {
          // Too little history and the balance would be judged on noise (as in the
          // /api/me/recommendation-outcomes route).
          ...(analytics.fatigue.loadEvidence.sufficient
            ? { freshness: analytics.fatigue.freshness, tsb: analytics.fatigue.tsb }
            : {}),
          readinessScore: analytics.raceReadiness?.score,
          hardRuns14d: analytics.intensityAdvice.hardRunsLast14d,
        },
      );
      const evidence = result.recommendations
        .slice(0, 8)
        .map(
          (r) =>
            `${r.targetDate} ${r.kind}: ${r.adherence ?? "pending"}${r.outcomeSignal ? ` / ${r.outcomeSignal}` : ""}${r.evaluationNote ? ` (${r.evaluationNote})` : ""}`,
        );
      return wrapIntelligence(
        {
          summary: result.summary,
          recommendations: result.recommendations.map((r) => ({
            date: r.targetDate,
            producer: r.producer,
            kind: r.kind,
            headline: r.headline,
            adherence: r.adherence ?? "pending",
            outcomeSignal: r.outcomeSignal ?? null,
            note: r.evaluationNote ?? null,
            outcomeNote: r.outcomeNote ?? null,
          })),
        },
        quality,
        evidence,
        result.summary.total === 0
          ? ["No recommendations recorded yet. They log as the Coach makes them."]
          : [],
      );
    }

    case "get_race_strategy": {
      const mode = ((call.arguments as GetRaceStrategyArgs)?.mode ?? "even") as StrategyMode;
      if (!raceGoal) {
        return wrapIntelligence(
          { error: "No race goal set. Set goal on Goals page or sync preferences." },
          quality,
          [],
          ["Race strategy requires a race goal with date and distance."],
        );
      }
      const strategy = simulateRaceStrategy(
        raceGoal,
        analytics.racePredictionAnalysis,
        analytics.fatigue,
        analytics.raceReadiness,
        mode,
      );
      if (!strategy) {
        return wrapIntelligence(
          { error: "Could not build strategy. Need predictions for this distance." },
          quality,
        );
      }
      return wrapIntelligence(
        {
          mode,
          targetTime: formatDuration(strategy.targetTimeSec),
          fadeRisk: strategy.fadeRisk,
          narrative: strategy.narrative,
          warnings: strategy.warnings,
          splits: strategy.splits.map((s) => ({
            km: s.km,
            pace: formatPace(s.paceSecPerKm),
            cumulative: formatDuration(s.cumulativeSec),
          })),
        },
        quality,
      );
    }

    case "get_fatigue_load": {
      const training = buildTrainingPageView(analytics, insights);
      const loadKnown = analytics.fatigue.loadEvidence.sufficient;
      return wrapIntelligence(
        {
          // The reading to quote. The legacy fields below stay for MCP clients, and the
          // two balance numbers are withheld when there is not enough history.
          trainingLoadBalance: trainingLoadBalancePayload(
            analytics.fatigue,
            todayLoadImpact(analytics),
          ),
          freshness: loadKnown ? analytics.fatigue.freshness : null,
          label: analytics.fatigue.label,
          tsb: loadKnown ? analytics.fatigue.tsb : null,
          ctl: analytics.fatigue.ctl,
          atl: analytics.fatigue.atl,
          trendNote: training.load.trendNote,
          interpretation: training.load.interpretation,
          recentLoad: analytics.loadHistory.slice(-6),
        },
        quality,
      );
    }

    case "list_recent_runs": {
      const limit = Math.min(20, Math.max(1, (call.arguments as ListRecentRunsArgs)?.limit ?? 10));
      const runs = bundle.recentRuns.slice(0, limit).map((r) => ({
        ...r,
        typeLabel: WORKOUT_TYPE_LABELS[r.type as keyof typeof WORKOUT_TYPE_LABELS] ?? r.type,
      }));
      return wrapIntelligence({ runs }, quality);
    }

    case "get_run_detail": {
      const args = (call.arguments ?? {}) as GetRunDetailArgs;
      const fitById = new Map(bundle.fitDetails.map((f) => [f.activityId, f]));
      let run = args.runId != null ? bundle.runs.find((r) => r.id === args.runId) : undefined;
      if (!run && args.date) {
        const day = args.date.slice(0, 10);
        run = bundle.runs.find((r) => r.date.slice(0, 10) === day);
      }
      if (!run) {
        return wrapIntelligence(
          {
            error: "Run not found. Pass runId from list_recent_runs or a YYYY-MM-DD date.",
          },
          quality,
          [],
          ["Use list_recent_runs to see available runId values."],
        );
      }
      const detail = buildRunCoachDetail(run, fitById.get(run.id) ?? null, analytics, bundle.runs);
      return wrapIntelligence({ run: detail }, quality);
    }

    case "get_data_quality": {
      return wrapIntelligence(
        {
          runCount: quality.runCount,
          activityCount: quality.activityCount,
          fitParsed: quality.fitParsed,
          fitReferenced: quality.fitReferenced,
          fieldCoverage: quality.fieldCoverage,
          warnings: quality.warnings,
          overallConfidence: quality.overallConfidence,
        },
        quality,
      );
    }

    case "get_connection_status": {
      const streams = await countStreamsForUser(ctx.userId);
      const missing = await countRunsMissingStreams(ctx.userId);
      return wrapIntelligence(
        {
          connected: true,
          runs: quality.runCount,
          streams,
          runsMissingStreams: missing,
        },
        quality,
      );
    }

    case "compare_sessions": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as CompareSessionsToolArgs;
      return wrapReasoning(compareSessions(rctx, { type: args.type, n: args.n }), quality);
    }

    case "explain_readiness_delta": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as ExplainReadinessDeltaToolArgs;
      return wrapReasoning(explainReadinessDelta(rctx, { weeks: args.weeks }), quality);
    }

    case "find_best_phase": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as FindBestPhaseToolArgs;
      return wrapReasoning(findBestPhase(rctx, { metric: args.metric }), quality);
    }

    case "attribute_improvement": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as AttributeImprovementToolArgs;
      return wrapReasoning(attributeImprovement(rctx, { metric: args.metric }), quality);
    }

    case "analyze_fade_pattern": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as AnalyzeFadePatternToolArgs;
      return wrapReasoning(analyzeFadePattern(rctx, { distanceKm: args.distanceKm }), quality);
    }

    case "pr_context": {
      const rctx = buildReasoningContext(bundle, raceGoal);
      const args = (call.arguments ?? {}) as PrContextToolArgs;
      return wrapReasoning(prContext(rctx, { bucket: args.bucket, runId: args.runId }), quality);
    }

    case "get_training_ecosystem": {
      return wrapIntelligence(buildFullEcosystemCoachPayload(analytics, raceGoal), quality);
    }

    case "get_training_ecosystem_summary": {
      const w = parseEcosystemWindow(call.arguments as EcosystemWindowArgs);
      return wrapIntelligence(getTrainingEcosystemSummary(analytics, w), quality);
    }

    case "get_modality_distribution": {
      const w = parseEcosystemWindow(call.arguments as EcosystemWindowArgs);
      return wrapIntelligence(getModalityDistribution(analytics, w), quality);
    }

    case "get_cross_training_support": {
      const w = parseEcosystemWindow(call.arguments as EcosystemWindowArgs);
      return wrapIntelligence(getCrossTrainingSupport(analytics, w), quality);
    }

    case "get_interference_risks": {
      const w = parseEcosystemWindow(call.arguments as EcosystemWindowArgs);
      return wrapIntelligence(getInterferenceRisks(analytics, w), quality);
    }

    case "get_athlete_archetype": {
      return wrapIntelligence(getAthleteArchetypePayload(analytics), quality);
    }

    case "compare_modality_blocks": {
      const args = (call.arguments ?? {}) as CompareModalityBlocksArgs;
      return wrapIntelligence(
        compareModalityBlocks(analytics, args.blockADays ?? 28, args.blockBDays ?? 28),
        quality,
      );
    }

    case "get_race_week_interference_check": {
      const args = (call.arguments ?? {}) as RaceWeekInterferenceArgs;
      return wrapIntelligence(getRaceWeekInterferenceCheck(analytics, args.goalId), quality);
    }

    case "get_strength_mobility_support": {
      const w = parseEcosystemWindow(call.arguments as EcosystemWindowArgs);
      return wrapIntelligence(getStrengthMobilitySupport(analytics, w <= 14 ? 14 : 28), quality);
    }

    case "get_athlete_memory": {
      const profile = await getPersistedAthleteMemory(ctx.userId, analytics);
      const topic = (call.arguments as { topic?: string })?.topic;
      const answer = serializeMemoryForCoachAnswer(
        profile,
        topic === "fatigue" ||
          topic === "adaptation" ||
          topic === "pacing" ||
          topic === "taper" ||
          topic === "modality"
          ? topic
          : "all",
      );
      return wrapIntelligence(
        {
          summary: answer,
          beliefCount:
            profile.adaptationPatterns.length +
            profile.fatiguePatterns.length +
            profile.pacingPatterns.length,
          generatedAt: profile.generatedAt,
        },
        quality,
      );
    }

    case "generate_next_week_training_plan": {
      const args = (call.arguments ?? {}) as GenerateNextWeekTrainingPlanArgs;
      const result = await executeGenerateNextWeekTrainingPlan(ctx, {
        goalId: args.goalId,
        windowDays: args.windowDays,
        planPreference: args.planPreference,
        availableDays: args.availableDays,
        constraints: args.constraints,
        planningContext: args.planningContext,
      });
      return wrapIntelligence(
        planToolPayload(result),
        quality,
        result.plan.rationale.evidenceUsed,
        result.plan.limitations,
      );
    }

    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

export const INTELLIGENCE_TOOL_DEFINITIONS = [
  {
    name: "get_coach_brief",
    description:
      "Get a compact training intelligence brief: readiness, week plan, predictions, fatigue, data quality. Call first for overview questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_readiness",
    description: "Race or half-marathon readiness score, gaps, and risks.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_predictions",
    description: "Consensus race time predictions with confidence and anchor effort.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_week_plan",
    description: "Recommended next week sessions (deterministic plan engine).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "recommend_today_session",
    description:
      "Recommend a single session for today (rest, recovery, easy, long, tempo, or interval) from the training load balance (when there is enough history), recent intensity balance, time since the last quality/long run, and race proximity. Use for 'what should I run today?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_goal_scenarios",
    description:
      "Adaptive goal scenarios: the probability of hitting the target race time under different training changes (maintain, build volume, add quality, full block), each with its projected time. Use for 'what would it take to hit my goal?', 'can I run <time>?', or 'how do I get faster for my race?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_monthly_narrative",
    description:
      "A prose summary of the athlete's training month: volume trajectory, best 4-week block, PRs, efficiency, consistency, and intensity mix. Use for 'how did my month go?', 'summarize my last month', or a monthly recap.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_pre_race_narrative",
    description:
      "A pre-race lead-in summary (only within ~3 weeks of a race goal): readiness, taper and training load balance, projected finish, top limiter, and a one-line game plan. Use for 'how's my race prep?', 'am I ready for race day?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_training_phases",
    description:
      "A catalog of the athlete's recent training phases (base, build, sharpening, taper, recovery, off) as a timeline: each with its week span, average weekly volume, and a one-line characterization. Use for 'what phases have I been through?', 'am I in a build or base phase?', or a training-history overview. Distinct from get_race_strategy; this segments history, it does not pick a single best block.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_risk_patterns",
    description:
      "Detect dangerous training patterns from the athlete's series: acute-load spikes (ACWR), rapid volume ramps, overreaching streaks, excessive intensity, long-run jumps, each with severity, evidence, and a mitigation. Use for 'am I at risk of injury/overtraining?', 'is my ramp too aggressive?', or a safety check.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "explain_prediction",
    description:
      "Explain WHY the race prediction is what it is: the step-by-step derivation from raw capability through durability, specificity, and training-load-balance/taper adjustments to the most-likely time; each capability model's estimate and weight; what widens the prediction range; and which training levers (long run, volume, quality, load balance) would move the time most. Use for 'why do you think I'll run that?', 'how did you get that time?', or 'what would make me faster?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_physiology",
    description:
      "Elite physiology fitted to this athlete: (1) Critical Speed (aerobic ceiling, as a pace) and D′ (anaerobic distance reserve) from the two-parameter critical-speed model on their own 2–30 min best efforts; (2) personalized fatigue-resistance: the power-law exponent (time ∝ distance^exponent) vs the ~1.06 Riegel reference, how much more they fade per doubling of distance, and its trend; (3) durability: a 0–100 score for how well efficiency (HR drift) and pace hold up deep into long runs, with a trend; (4) threshold/economy: estimated lactate-threshold pace and HR from tempo/threshold sessions, plus running economy as a grade-adjusted pace-per-HR trend; (5) condition normalization: efficiency adjusted for heat (weather temperature) and grade so trends are apples-to-apples, including an example where accounting for heat changes how a session reads. Each with confidence. Use for 'what's my critical speed?', 'aerobic vs anaerobic capacity', 'do I fade over distance?', 'how durable is my aerobic engine?', 'what's my threshold pace/HR?', 'is my running economy improving?', 'was that hot run actually bad?', or physiological-ceiling questions. Distinct from race predictions (this is capacity, not a finish-time forecast).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_capability_radar",
    description:
      "The athlete's capability profile across six axes (aerobic base, threshold, top-end speed, durability, economy, consistency), each scored 0–100 vs their OWN history (50 ≈ personal baseline), plus how much each matters for the goal race (demand profile) and the auto-flagged biggest limiter (the axis that matters for the race and is weakest). Use for 'what's my biggest limiter?', 'where am I strong or weak?', 'what should I work on for my race?', or a capability overview. This is the diagnosis; pair with goal scenarios for the prescription.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_progression_burndown",
    description:
      "Are the athlete's build metrics on pace to be race-ready? For long run and weekly volume, gives current vs the race-distance target, the dated deadline (race day minus taper), the required weekly ramp vs their recent rate, and how many weeks ahead/behind (or stalled) they are. Use for 'am I on track for my race?', 'is my long run where it needs to be?', 'am I behind on volume?'. Complements the limiter protocol (what to build) with pacing (are you building fast enough).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_session_zscores",
    description:
      "How each recent session stacks up against the athlete's OWN distribution for that workout type, as a z-score ('this tempo was +1.8σ, faster-per-HR than your typical tempo'). Returns the standout best/worst recent sessions plus recent scores, each with cohort size and confidence. Use for 'was that a good tempo/long run?', 'how does this session compare to my usual?', 'which recent session stood out?'. Personal, not population: a small cohort reads as directional.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_anomalies",
    description:
      "Recent runs that don't fit the athlete's personal model (large personal z-score), each flagged with a likely cause (heat from weather temp, terrain from elevation per km, or fatigue from heavy preceding load), or marked 'unexplained' when none of those account for it. Use for 'why was that run off?', 'any weird sessions lately?', 'was that a bad day or just conditions?'. Causes are contextual associations, not proven explanations.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_uncertainty",
    description:
      "Descriptive metrics as intervals, not points: aerobic efficiency, typical weekly volume, and easy-run pace each bootstrapped from the athlete's own recent runs into a 90% confidence interval with sample size. Use for 'what's my current efficiency/volume, and how sure are we?', 'how variable is my easy pace?', or when a point number needs its honest range. Bootstrap of the athlete's own data: no population assumptions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_correlations",
    description:
      "Honest personal correlations between the athlete's own metrics (cadence vs efficiency, prior-week load vs efficiency/pace, temperature vs pace), each with Pearson r, sample size n, a conservative strength label, and a plain reading. Use for 'does higher cadence help my efficiency?', 'does training load affect my pace?', 'what's associated with my good/bad runs?'. Always association, never causation: confounders overlap; report the caveats.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_change_points",
    description:
      "Inflection points in the athlete's fitness trajectory (weekly CTL) where the slope meaningfully changed: a build taking hold (reversal_up), a peak then decline or break/setback (reversal_down), a ramp steepening (acceleration), or gains flattening (deceleration), each dated with a plain reading. Use for 'when did my fitness turn around?', 'did that block work?', 'when did things drop off?'. CTL is a load-based proxy; these are descriptive markers, not diagnoses.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_forecast_accuracy",
    description:
      "How the race forecaster has actually performed: of past predictions that a real effort later tested, what share landed inside the band that was shown, the model's bias (optimistic/conservative), and mean absolute error. The hit rate is an observed frequency, not a calibration score, because the band is not a fitted interval. Use for 'how accurate are your predictions?' or 'can I trust your forecast?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recommendation_outcomes",
    description:
      "Track whether past recommendations were followed: for each recorded recommendation, its adherence (followed, partial, skipped, pending) vs the athlete's actual runs, plus an overall adherence rate. Use for 'did I follow your advice?', 'how consistent have I been with the plan?', or to self-assess coaching effectiveness.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_race_strategy",
    description:
      "Pacing strategy splits for the race goal. mode: even, negative, conservative, aggressive.",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["even", "negative", "conservative", "aggressive"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_fatigue_load",
    description:
      "Training load balance: form (TSB as a % of chronic load), its evidence status and confidence, whether it changed today's session, plus CTL/ATL and load interpretation. Quote trainingLoadBalance; freshness and TSB are null when there is not enough history.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_recent_runs",
    description:
      "List recent runs with workout type, pace, HR, execution quality, fade/drift, and a one-line narrative. Use before get_run_detail when browsing.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_run_detail",
    description:
      "Deep dive on one run: laps, stream metrics, pacing/HR assessment, execution score, adaptations, and evidence. Requires runId or date (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_data_quality",
    description: "Import coverage: HR, FIT, cadence, warnings.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_connection_status",
    description: "Strava connection and stream sync status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "compare_sessions",
    description:
      "Compare recent sessions of a workout type (tempo, interval, long, race) with execution quality metrics: quality, pacing stability, interval repeatability, aerobic decoupling, and threshold control. Use for 'compare my last 3 thresholds/tempos/intervals'.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["tempo", "interval", "long", "race"],
        },
        n: { type: "number", description: "Number of sessions (default 3)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "explain_readiness_delta",
    description:
      "Explain how race or HM readiness changed over the last N weeks with component drivers.",
    input_schema: {
      type: "object",
      properties: {
        weeks: { type: "number", description: "Lookback weeks 1-4 (default 1)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "find_best_phase",
    description:
      "Find strongest historical 4-week training phase by aerobic, volume, consistency, or efficiency.",
    input_schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["aerobic", "volume", "consistency", "efficiency"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "attribute_improvement",
    description:
      "Historically associate training block patterns with pace, efficiency, or volume improvements.",
    input_schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["pace", "efficiency", "volume"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "analyze_fade_pattern",
    description: "Analyze late-session pace fade on long runs at or above a distance threshold.",
    input_schema: {
      type: "object",
      properties: {
        distanceKm: { type: "number", description: "Min distance km (default 15)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "pr_context",
    description:
      "Summarize training in the 8 weeks before a PR vs the prior 8 weeks: what changed.",
    input_schema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          enum: ["5k", "10k", "hm", "long"],
        },
        runId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_training_ecosystem",
    description:
      "Full training ecosystem payload (summary, modality, cross-training, interference, archetype). Use for gym/hybrid/triathlon questions. Does not change race predictions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_training_ecosystem_summary",
    description: "Compact ecosystem summary for a rolling window (days: 7, 14, 28, 56, 84).",
    input_schema: {
      type: "object",
      properties: { window: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_modality_distribution",
    description: "Session distribution by modality and sport_type mix for a window.",
    input_schema: {
      type: "object",
      properties: { window: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_cross_training_support",
    description:
      "Bike/swim/aerobic cross-training support scores and evidence (not run-equivalent miles).",
    input_schema: {
      type: "object",
      properties: { window: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_interference_risks",
    description: "HIIT/strength/sport timing risks near quality runs and weekly HI density.",
    input_schema: {
      type: "object",
      properties: { window: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_athlete_archetype",
    description:
      "Infer runner/hybrid/triathlete/cyclist/strength-endurance/multisport from 8–12 week modality mix.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "compare_modality_blocks",
    description: "Compare modality session counts between two rolling blocks.",
    input_schema: {
      type: "object",
      properties: {
        blockADays: { type: "number" },
        blockBDays: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_race_week_interference_check",
    description: "Race-week non-run intensity warnings and taper guidance for strength/HIIT.",
    input_schema: {
      type: "object",
      properties: { goalId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_strength_mobility_support",
    description:
      "Strength and mobility consistency, scores, and whether to schedule strength this week.",
    input_schema: {
      type: "object",
      properties: { window: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_athlete_memory",
    description:
      "Structured athlete memory: evidence-backed beliefs about adaptation, fatigue, pacing, taper, and modality. Use for 'what have you learned about me', fatigue patterns, uncertain patterns, and longitudinal coaching context.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["all", "adaptation", "fatigue", "pacing", "taper", "modality"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "generate_next_week_training_plan",
    description:
      "Generate an AI-native adaptive weekly training plan from coaching context, guardrails, and validation. REQUIRED for 'build my next week', race week plans, taper plans, and plan adjustments. Never invent a plan without this tool. Returns structured WeeklyTrainingPlan with evidence, constraints, and limitations.",
    input_schema: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        windowDays: { type: "number", enum: [14, 21, 28] },
        planPreference: {
          type: "string",
          enum: ["conservative", "balanced", "aggressive"],
        },
        availableDays: {
          type: "array",
          items: { type: "string" },
          description: "e.g. Mon, Wed, Fri, Sun",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
        },
        planningContext: {
          type: "string",
          description:
            "Freeform athlete narrative for this week (e.g. post-race recovery, travel, no current goal)",
        },
      },
      additionalProperties: false,
    },
  },
] as const;

export function parseToolName(name: string): IntelligenceToolName {
  const allowed = INTELLIGENCE_TOOL_DEFINITIONS.map((t) => t.name);
  if (!allowed.includes(name as IntelligenceToolName)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return name as IntelligenceToolName;
}
