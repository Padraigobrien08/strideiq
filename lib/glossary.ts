/**
 * Plain-language definitions for the sports-science / statistics terms that
 * surface in the UI. Rendered at point of use via <JargonTerm>. Keep each
 * definition to one runner-friendly sentence — no jargon inside the jargon.
 */
export interface GlossaryEntry {
  /** Canonical short label shown when no children are passed. */
  label: string;
  /** One-sentence, runner-friendly explanation. */
  definition: string;
}

export const GLOSSARY = {
  sigma: {
    label: "σ",
    definition:
      "How far a run sits from your own typical, measured in standard deviations. ±2σ means unusually far from normal for you.",
  },
  ci: {
    label: "CI",
    definition:
      "Confidence interval: the range your true value most likely falls in, given how much data there is. Wider means less certain.",
  },
  ctl: {
    label: "CTL",
    definition:
      "Chronic Training Load: a rolling estimate of the fitness you've built from training volume and intensity over recent weeks.",
  },
  tsb: {
    label: "TSB",
    definition:
      "Training Stress Balance: built-up fitness (chronic load) minus recent fatigue (acute load). StrideIQ reads it as a share of your chronic load, so the same balance means the same thing at any training volume.",
  },
  cs: {
    label: "Critical speed",
    definition:
      "The fastest pace your aerobic system can hold with fatigue roughly steady; your aerobic ceiling.",
  },
  dprime: {
    label: "D′",
    definition:
      "Anaerobic distance reserve: how far you can run above critical speed before you run out, like a battery above your aerobic pace.",
  },
  rsquared: {
    label: "R²",
    definition:
      "Goodness of fit: how well the model matches your data, from 0 (poor) to 1 (perfect).",
  },
  mom: {
    label: "MoM",
    definition: "Month over month: the change compared with the previous month.",
  },
  freshness: {
    label: "Training load balance",
    definition:
      "How your recent training load compares with what you are used to: recent load against built-up load, as a share of the built-up load. Higher means you have absorbed your training; lower means recent load is heavy. It needs about four weeks of runs before it counts, and it only changes today's session when it matters.",
  },
  readiness: {
    label: "Readiness",
    definition:
      "A 0 to 100 estimate of how prepared you are to perform, blending fitness, training load balance, and recent training.",
  },
  load: {
    label: "Training load",
    definition:
      "How much training stress you've absorbed lately, from the volume and intensity of your runs.",
  },
  adaptation: {
    label: "Adaptation",
    definition:
      "The fitness changes your body makes in response to training, seen as trends in pace, heart rate, and endurance over time.",
  },
  phase: {
    label: "Training phase",
    definition:
      "The training block you're in (base, build, peak, or taper), each with its own goal.",
  },
  fatigue: {
    label: "Fatigue",
    definition: "Tiredness built up from recent training, before your body has fully recovered.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
