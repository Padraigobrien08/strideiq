import type { WeekPlan } from "./planEngine";
import type { WorkoutType } from "@/lib/analytics/workoutType";

const HARD_TYPES: WorkoutType[] = ["tempo", "interval", "race"];

const MEDICAL_DISCLAIMER =
  "Not a substitute for a coach or medical advice: adjust based on how you feel.";

export interface SafetyAdjustments {
  plan: WeekPlan;
  adjusted: boolean;
}

export function countHardSessions(plan: WeekPlan): number {
  return plan.sessions.filter((s) => HARD_TYPES.includes(s.type)).length;
}

export function validatePlan(
  plan: WeekPlan,
  lastWeekKm: number,
  /** Form: TSB as a percentage of CTL (`FatigueSnapshot.formPct`). */
  formPct: number,
): SafetyAdjustments {
  const warnings = [...plan.warnings];
  let sessions = [...plan.sessions];
  let totalKmRange: [number, number] = [...plan.totalKmRange];
  let adjusted = false;

  const maxCap = lastWeekKm > 0 ? Math.round(lastWeekKm * 1.15 * 10) / 10 : totalKmRange[1];

  if (lastWeekKm > 0 && totalKmRange[1] > maxCap) {
    const scale = maxCap / totalKmRange[1];
    sessions = sessions.map((s) => ({
      ...s,
      distanceKmRange: [
        Math.round(s.distanceKmRange[0] * scale * 10) / 10,
        Math.round(s.distanceKmRange[1] * scale * 10) / 10,
      ] as [number, number],
    }));
    totalKmRange = [Math.round(totalKmRange[0] * scale * 10) / 10, maxCap];
    warnings.push(`Volume capped at ${maxCap} km (+15% vs last week's ${lastWeekKm} km).`);
    adjusted = true;
  }

  const hardCount = countHardSessions({ ...plan, sessions });
  if (formPct < -21 && hardCount > 2) {
    let removed = 0;
    sessions = sessions.map((s) => {
      if (removed < hardCount - 2 && HARD_TYPES.includes(s.type)) {
        removed += 1;
        adjusted = true;
        return {
          ...s,
          type: "easy" as WorkoutType,
          description: s.description.replace(/tempo|interval|threshold/gi, "easy"),
          distanceKmRange: [
            Math.min(s.distanceKmRange[0], 8),
            Math.min(s.distanceKmRange[1], 10),
          ] as [number, number],
        };
      }
      return s;
    });
    warnings.push("Reduced hard sessions to 2 while TSB is negative (fatigue elevated).");
  }

  if (!warnings.includes(MEDICAL_DISCLAIMER)) {
    warnings.push(MEDICAL_DISCLAIMER);
  }

  return {
    plan: {
      ...plan,
      sessions,
      totalKmRange,
      warnings,
    },
    adjusted,
  };
}
