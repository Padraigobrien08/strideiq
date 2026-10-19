import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DistanceUnit, PaceUnit } from "@/stores/settings-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  formatDistance,
  formatDistanceFromMeters,
  formatDistanceRange,
  formatDistanceValue,
  formatPaceInUnit,
} from "@/lib/units";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Current saved units, read non-reactively. In the browser this is the athlete's
 * persisted preference; on the server (LLM/coach context, GPX export) the store
 * is never hydrated, so it returns the metric default — which is what those
 * paths want. Formatters read this by default; pass an explicit unit to override
 * (e.g. `useUnitFormat`, which subscribes reactively).
 */
function displayDistanceUnit(): DistanceUnit {
  return useSettingsStore.getState().distanceUnit;
}

function displayPaceUnit(): PaceUnit {
  return useSettingsStore.getState().paceUnit;
}

/**
 * Distance/pace formatters. All input is metric (km, sec-per-km). The unit
 * defaults to the saved preference (metric on the server); memoized view-model
 * strings pick up a changed unit on the next render/navigation.
 */
export function formatPace(secPerKm: number, unit: PaceUnit = displayPaceUnit()): string {
  return formatPaceInUnit(secPerKm, unit);
}

export function formatDistanceKm(
  meters: number,
  unit: DistanceUnit = displayDistanceUnit(),
): string {
  return formatDistanceFromMeters(meters, unit);
}

/** Display distance with unit suffix, without floating-point noise. */
export function formatKm(km: number, unit: DistanceUnit = displayDistanceUnit()): string {
  return formatDistance(km, unit);
}

/** Compact distance number for ranges and chips (no unit suffix). */
export function formatKmValue(km: number, unit: DistanceUnit = displayDistanceUnit()): string {
  return formatDistanceValue(km, unit);
}

export function formatKmRange(
  lo: number,
  hi: number,
  unit: DistanceUnit = displayDistanceUnit(),
): string {
  return formatDistanceRange(lo, hi, unit);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

/** Race clock time, "1:40:00" or "24:30" — not the analytics "1h 40m" style. */
export function formatRaceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return formatDuration(sec);
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return h > 0 ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

export function parseNum(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
