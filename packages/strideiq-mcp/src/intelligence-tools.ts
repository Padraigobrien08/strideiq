/**
 * Every deterministic intelligence tool the StrideIQ server exposes.
 *
 * Pure data on purpose: no SDK and no zod import, so the main repo's parity test can
 * import this table directly and fail when it drifts from
 * `lib/intelligence/tools.ts`. The package is standalone (its own deps and tsconfig)
 * and cannot import the registry, so an enforced test is what keeps the two in step.
 *
 * Before this table the server reached only 16 tools through hand-written `section`
 * aliases and this package registered 15, leaving 28 registered tools — including
 * every ecosystem tool — unreachable from any MCP client.
 */

/** JSON-schema-ish argument spec, converted to zod at registration time. */
export interface ToolArgSpec {
  type: "string" | "number" | "boolean" | "array";
  /** Numeric as well as string enums appear in the registry (e.g. windowDays). */
  enum?: (string | number)[];
}

export interface IntelligenceToolSpec {
  name: string;
  description: string;
  args: Record<string, ToolArgSpec>;
}

export const INTELLIGENCE_TOOLS: readonly IntelligenceToolSpec[] = [
  {
    name: "get_coach_brief",
    description:
      "Get a compact training intelligence brief: readiness, week plan, predictions, fatigue, data quality. Call first for overview questions.",
    args: {},
  },
  {
    name: "get_readiness",
    description: "Race or half-marathon readiness score, gaps, and risks.",
    args: {},
  },
  {
    name: "get_predictions",
    description: "Consensus race time predictions with confidence and anchor effort.",
    args: {},
  },
  {
    name: "get_week_plan",
    description: "Recommended next week sessions (deterministic plan engine).",
    args: {},
  },
  {
    name: "recommend_today_session",
    description:
      "Recommend a single session for today (rest, recovery, easy, long, tempo, or interval) from the training load balance (when there is enough history), recent intensity balance, time since the last quality/long run, and race proximity. Use for 'what should I run today?'.",
    args: {},
  },
  {
    name: "get_goal_scenarios",
    description:
      "Adaptive goal scenarios: the probability of hitting the target race time under different training changes (maintain, build volume, add quality, full block), each with its projected time. Use for 'what would it take to hit my goal?', 'can I run <time>?', or 'how do I get faster for my race?'.",
    args: {},
  },
  {
    name: "get_monthly_narrative",
    description:
      "A prose summary of the athlete's training month: volume trajectory, best 4-week block, PRs, efficiency, consistency, and intensity mix. Use for 'how did my month go?', 'summarize my last month', or a monthly recap.",
    args: {},
  },
  {
    name: "get_pre_race_narrative",
    description:
      "A pre-race lead-in summary (only within ~3 weeks of a race goal): readiness, taper and training load balance, projected finish, top limiter, and a one-line game plan. Use for 'how's my race prep?', 'am I ready for race day?'.",
    args: {},
  },
  {
    name: "get_training_phases",
    description:
      "A catalog of the athlete's recent training phases (base, build, sharpening, taper, recovery, off) as a timeline: each with its week span, average weekly volume, and a one-line characterization. Use for 'what phases have I been through?', 'am I in a build or base phase?', or a training-history overview. Distinct from get_race_strategy; this segments history, it does not pick a single best block.",
    args: {},
  },
  {
    name: "get_risk_patterns",
    description:
      "Detect dangerous training patterns from the athlete's series: acute-load spikes (ACWR), rapid volume ramps, overreaching streaks, excessive intensity, long-run jumps, each with severity, evidence, and a mitigation. Use for 'am I at risk of injury/overtraining?', 'is my ramp too aggressive?', or a safety check.",
    args: {},
  },
  {
    name: "explain_prediction",
    description:
      "Explain WHY the race prediction is what it is: the step-by-step derivation from raw capability through durability, specificity, and training-load-balance/taper adjustments to the most-likely time; each capability model's estimate and weight; what widens the prediction range; and which training levers (long run, volume, quality, load balance) would move the time most. Use for 'why do you think I'll run that?', 'how did you get that time?', or 'what would make me faster?'.",
    args: {},
  },
  {
    name: "get_physiology",
    description:
      "Elite physiology fitted to this athlete: (1) Critical Speed (aerobic ceiling, as a pace) and D\u2032 (anaerobic distance reserve) from the two-parameter critical-speed model on their own 2\u201330 min best efforts; (2) personalized fatigue-resistance: the power-law exponent (time \u221d distance^exponent) vs the ~1.06 Riegel reference, how much more they fade per doubling of distance, and its trend; (3) durability: a 0\u2013100 score for how well efficiency (HR drift) and pace hold up deep into long runs, with a trend; (4) threshold/economy: estimated lactate-threshold pace and HR from tempo/threshold sessions, plus running economy as a grade-adjusted pace-per-HR trend; (5) condition normalization: efficiency adjusted for heat (weather temperature) and grade so trends are apples-to-apples, including an example where accounting for heat changes how a session reads. Each with confidence. Use for 'what's my critical speed?', 'aerobic vs anaerobic capacity', 'do I fade over distance?', 'how durable is my aerobic engine?', 'what's my threshold pace/HR?', 'is my running economy improving?', 'was that hot run actually bad?', or physiological-ceiling questions. Distinct from race predictions (this is capacity, not a finish-time forecast).",
    args: {},
  },
  {
    name: "get_capability_radar",
    description:
      "The athlete's capability profile across six axes (aerobic base, threshold, top-end speed, durability, economy, consistency), each scored 0\u2013100 vs their OWN history (50 \u2248 personal baseline), plus how much each matters for the goal race (demand profile) and the auto-flagged biggest limiter (the axis that matters for the race and is weakest). Use for 'what's my biggest limiter?', 'where am I strong or weak?', 'what should I work on for my race?', or a capability overview. This is the diagnosis; pair with goal scenarios for the prescription.",
    args: {},
  },
  {
    name: "get_progression_burndown",
    description:
      "Are the athlete's build metrics on pace to be race-ready? For long run and weekly volume, gives current vs the race-distance target, the dated deadline (race day minus taper), the required weekly ramp vs their recent rate, and how many weeks ahead/behind (or stalled) they are. Use for 'am I on track for my race?', 'is my long run where it needs to be?', 'am I behind on volume?'. Complements the limiter protocol (what to build) with pacing (are you building fast enough).",
    args: {},
  },
  {
    name: "get_session_zscores",
    description:
      "How each recent session stacks up against the athlete's OWN distribution for that workout type, as a z-score ('this tempo was +1.8\u03c3, faster-per-HR than your typical tempo'). Returns the standout best/worst recent sessions plus recent scores, each with cohort size and confidence. Use for 'was that a good tempo/long run?', 'how does this session compare to my usual?', 'which recent session stood out?'. Personal, not population: a small cohort reads as directional.",
    args: {},
  },
  {
    name: "get_anomalies",
    description:
      "Recent runs that don't fit the athlete's personal model (large personal z-score), each flagged with a likely cause (heat from weather temp, terrain from elevation per km, or fatigue from heavy preceding load), or marked 'unexplained' when none of those account for it. Use for 'why was that run off?', 'any weird sessions lately?', 'was that a bad day or just conditions?'. Causes are contextual associations, not proven explanations.",
    args: {},
  },
  {
    name: "get_uncertainty",
    description:
      "Descriptive metrics as intervals, not points: aerobic efficiency, typical weekly volume, and easy-run pace each bootstrapped from the athlete's own recent runs into a 90% confidence interval with sample size. Use for 'what's my current efficiency/volume, and how sure are we?', 'how variable is my easy pace?', or when a point number needs its honest range. Bootstrap of the athlete's own data: no population assumptions.",
    args: {},
  },
  {
    name: "get_correlations",
    description:
      "Honest personal correlations between the athlete's own metrics (cadence vs efficiency, prior-week load vs efficiency/pace, temperature vs pace), each with Pearson r, sample size n, a conservative strength label, and a plain reading. Use for 'does higher cadence help my efficiency?', 'does training load affect my pace?', 'what's associated with my good/bad runs?'. Always association, never causation: confounders overlap; report the caveats.",
    args: {},
  },
  {
    name: "get_change_points",
    description:
      "Inflection points in the athlete's fitness trajectory (weekly CTL) where the slope meaningfully changed: a build taking hold (reversal_up), a peak then decline or break/setback (reversal_down), a ramp steepening (acceleration), or gains flattening (deceleration), each dated with a plain reading. Use for 'when did my fitness turn around?', 'did that block work?', 'when did things drop off?'. CTL is a load-based proxy; these are descriptive markers, not diagnoses.",
    args: {},
  },
  {
    name: "get_forecast_accuracy",
    description:
      "How well-calibrated the race forecaster has been: of past predictions that a real effort later tested, what share landed in the predicted p10\u2013p90 range, the model's bias (optimistic/conservative), and mean absolute error. Use for 'how accurate are your predictions?', 'can I trust your forecast?', or a calibration check.",
    args: {},
  },
  {
    name: "get_recommendation_outcomes",
    description:
      "Track whether past recommendations were followed: for each recorded recommendation, its adherence (followed, partial, skipped, pending) vs the athlete's actual runs, plus an overall adherence rate. Use for 'did I follow your advice?', 'how consistent have I been with the plan?', or to self-assess coaching effectiveness.",
    args: {},
  },
  {
    name: "get_race_strategy",
    description:
      "Pacing strategy splits for the race goal. mode: even, negative, conservative, aggressive.",
    args: {
      mode: { type: "string", enum: ["even", "negative", "conservative", "aggressive"] },
    },
  },
  {
    name: "get_fatigue_load",
    description:
      "Training load balance: form (TSB as a % of chronic load), its evidence status and confidence, whether it changed today's session, plus CTL/ATL and load interpretation. Quote trainingLoadBalance; freshness and TSB are null when there is not enough history.",
    args: {},
  },
  {
    name: "list_recent_runs",
    description:
      "List recent runs with workout type, pace, HR, execution quality, fade/drift, and a one-line narrative. Use before get_run_detail when browsing.",
    args: {
      limit: { type: "number" },
    },
  },
  {
    name: "get_run_detail",
    description:
      "Deep dive on one run: laps, stream metrics, pacing/HR assessment, execution score, adaptations, and evidence. Requires runId or date (YYYY-MM-DD).",
    args: {
      runId: { type: "string" },
      date: { type: "string" },
    },
  },
  {
    name: "get_data_quality",
    description: "Import coverage: HR, FIT, cadence, warnings.",
    args: {},
  },
  {
    name: "get_connection_status",
    description: "Strava connection and stream sync status.",
    args: {},
  },
  {
    name: "compare_sessions",
    description:
      "Compare recent sessions of a workout type (tempo, interval, long, race) with execution quality metrics: quality, pacing stability, interval repeatability, aerobic decoupling, and threshold control. Use for 'compare my last 3 thresholds/tempos/intervals'.",
    args: {
      type: { type: "string", enum: ["tempo", "interval", "long", "race"] },
      n: { type: "number" },
    },
  },
  {
    name: "explain_readiness_delta",
    description:
      "Explain how race or HM readiness changed over the last N weeks with component drivers.",
    args: {
      weeks: { type: "number" },
    },
  },
  {
    name: "find_best_phase",
    description:
      "Find strongest historical 4-week training phase by aerobic, volume, consistency, or efficiency.",
    args: {
      metric: { type: "string", enum: ["aerobic", "volume", "consistency", "efficiency"] },
    },
  },
  {
    name: "attribute_improvement",
    description:
      "Historically associate training block patterns with pace, efficiency, or volume improvements.",
    args: {
      metric: { type: "string", enum: ["pace", "efficiency", "volume"] },
    },
  },
  {
    name: "analyze_fade_pattern",
    description: "Analyze late-session pace fade on long runs at or above a distance threshold.",
    args: {
      distanceKm: { type: "number" },
    },
  },
  {
    name: "pr_context",
    description:
      "Summarize training in the 8 weeks before a PR vs the prior 8 weeks: what changed.",
    args: {
      bucket: { type: "string", enum: ["5k", "10k", "hm", "long"] },
      runId: { type: "string" },
    },
  },
  {
    name: "get_training_ecosystem",
    description:
      "Full training ecosystem payload (summary, modality, cross-training, interference, archetype). Use for gym/hybrid/triathlon questions. Does not change race predictions.",
    args: {},
  },
  {
    name: "get_training_ecosystem_summary",
    description: "Compact ecosystem summary for a rolling window (days: 7, 14, 28, 56, 84).",
    args: {
      window: { type: "number" },
    },
  },
  {
    name: "get_modality_distribution",
    description: "Session distribution by modality and sport_type mix for a window.",
    args: {
      window: { type: "number" },
    },
  },
  {
    name: "get_cross_training_support",
    description:
      "Bike/swim/aerobic cross-training support scores and evidence (not run-equivalent miles).",
    args: {
      window: { type: "number" },
    },
  },
  {
    name: "get_interference_risks",
    description: "HIIT/strength/sport timing risks near quality runs and weekly HI density.",
    args: {
      window: { type: "number" },
    },
  },
  {
    name: "get_athlete_archetype",
    description:
      "Infer runner/hybrid/triathlete/cyclist/strength-endurance/multisport from 8\u201312 week modality mix.",
    args: {},
  },
  {
    name: "compare_modality_blocks",
    description: "Compare modality session counts between two rolling blocks.",
    args: {
      blockADays: { type: "number" },
      blockBDays: { type: "number" },
    },
  },
  {
    name: "get_race_week_interference_check",
    description: "Race-week non-run intensity warnings and taper guidance for strength/HIIT.",
    args: {
      goalId: { type: "string" },
    },
  },
  {
    name: "get_strength_mobility_support",
    description:
      "Strength and mobility consistency, scores, and whether to schedule strength this week.",
    args: {
      window: { type: "number" },
    },
  },
  {
    name: "get_athlete_memory",
    description:
      "Structured athlete memory: evidence-backed beliefs about adaptation, fatigue, pacing, taper, and modality. Use for 'what have you learned about me', fatigue patterns, uncertain patterns, and longitudinal coaching context.",
    args: {
      topic: {
        type: "string",
        enum: ["all", "adaptation", "fatigue", "pacing", "taper", "modality"],
      },
    },
  },
  {
    name: "generate_next_week_training_plan",
    description:
      "Generate an AI-native adaptive weekly training plan from coaching context, guardrails, and validation. REQUIRED for 'build my next week', race week plans, taper plans, and plan adjustments. Never invent a plan without this tool. Returns structured WeeklyTrainingPlan with evidence, constraints, and limitations.",
    args: {
      goalId: { type: "string" },
      windowDays: { type: "number", enum: [14, 21, 28] },
      planPreference: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
      availableDays: { type: "array" },
      constraints: { type: "array" },
      planningContext: { type: "string" },
    },
  },
] as const;

export const INTELLIGENCE_TOOL_NAMES: readonly string[] = INTELLIGENCE_TOOLS.map((t) => t.name);
