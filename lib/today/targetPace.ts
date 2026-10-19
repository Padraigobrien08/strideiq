import type { AthletePhysiology } from "@/lib/analytics/physiology";

/**
 * Target pace for a session, derived from the athlete's own threshold pace (overhaul
 * decision D2). The plan stores an intensity, not a pace; this turns one into the other
 * deterministically, labelled with what it was derived from, and returns nothing rather
 * than a guess when there is no basis.
 *
 * Bands are multiples of lactate-threshold pace (sec/km; >1 is slower). They follow the
 * usual threshold-relative zones and were checked against observed paces before use
 * (2026-10-18): the demo athlete's median easy run sits at 1.227 × LT (IQR 1.205–1.246),
 * long runs at 1.164 (1.146–1.185), tempo at 0.999 (0.966–1.021), intervals at 0.968; a
 * real export's tempo median is 1.004. Recovery could not be validated (the demo labels
 * recovery runs at easy pace, and the real export has four), so it keeps the
 * conventional band slower than easy.
 */

export type PaceZone = "recovery" | "easy" | "steady" | "tempo" | "interval";

export const PACE_BANDS: Record<PaceZone, readonly [fast: number, slow: number]> = {
  recovery: [1.3, 1.4],
  easy: [1.2, 1.3],
  steady: [1.1, 1.18],
  tempo: [0.98, 1.03],
  interval: [0.92, 0.97],
};

/**
 * Critical speed sits a little faster than lactate threshold. When only CS is known it
 * stands in for threshold at this ratio, and the basis says so.
 */
const CS_TO_THRESHOLD = 1.03;

export interface TargetPace {
  zone: PaceZone;
  /** Faster end of the range, sec/km. */
  fastSecPerKm: number;
  /** Slower end of the range, sec/km. */
  slowSecPerKm: number;
  basis: { kind: "threshold" | "critical_speed"; paceSecPerKm: number };
}

/**
 * The pace zone for a session, from its type when that is specific and its intensity
 * otherwise. Null for rest and for anything that is not a run.
 */
export function paceZoneFor(session: {
  type?: string | null;
  intensity?: string | null;
}): PaceZone | null {
  const type = (session.type ?? "").toLowerCase();
  if (/interval|repeat|vo2|speed/.test(type)) return "interval";
  if (/tempo|threshold/.test(type)) return "tempo";
  if (/long|steady|progression/.test(type)) return "steady";
  if (/recovery/.test(type)) return "recovery";
  if (/easy|aerobic|base/.test(type)) return "easy";
  switch (session.intensity) {
    case "hard":
      return "tempo";
    case "moderate":
      return "steady";
    case "easy":
      return "easy";
    case "recovery":
      return "recovery";
    default:
      return null;
  }
}

/** Round to the nearest 5 seconds: a prescription, not a measurement. */
const round5 = (sec: number) => Math.round(sec / 5) * 5;

export function targetPaceFor(
  zone: PaceZone | null,
  physiology: Pick<AthletePhysiology, "thresholdEconomy" | "criticalSpeed">,
): TargetPace | null {
  if (!zone) return null;
  const lt = physiology.thresholdEconomy.ltPaceSecPerKm;
  const cs = physiology.criticalSpeed.csPaceSecPerKm;
  const basis =
    lt != null && lt > 0
      ? { kind: "threshold" as const, paceSecPerKm: lt }
      : cs != null && cs > 0
        ? { kind: "critical_speed" as const, paceSecPerKm: cs }
        : null;
  if (!basis) return null;
  const threshold = basis.kind === "threshold" ? lt! : cs! * CS_TO_THRESHOLD;
  const [fast, slow] = PACE_BANDS[zone];
  return {
    zone,
    fastSecPerKm: round5(threshold * fast),
    slowSecPerKm: round5(threshold * slow),
    basis,
  };
}

/**
 * Duration range for a distance at a pace range, in whole minutes rounded to 5. Used
 * only when the plan has no duration of its own, and always shown as an estimate.
 */
export function estimateDurationMin(
  distanceKm: readonly [lo: number, hi: number],
  pace: TargetPace,
): [number, number] {
  const lo = (distanceKm[0] * pace.fastSecPerKm) / 60;
  const hi = (distanceKm[1] * pace.slowSecPerKm) / 60;
  const r = (m: number) => Math.max(5, Math.round(m / 5) * 5);
  return [r(lo), r(hi)];
}
