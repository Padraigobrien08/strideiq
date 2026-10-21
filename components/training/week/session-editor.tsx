"use client";

import { useId, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { DashboardInsights } from "@/lib/analytics";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import {
  SESSION_KINDS,
  applySessionEdit,
  currentEdit,
  editChanges,
  editWarnings,
  weekTotals,
  type SessionEdit,
  type SessionKind,
} from "@/lib/training-week/editWeek";
import { paceZoneFor, targetPaceFor } from "@/lib/today/targetPace";
import { paceRange } from "@/lib/today/todayView";
import { cn } from "@/lib/utils";
import { TotalsDiff } from "./totals-diff";

const field = "text-sm font-semibold text-foreground";
const input =
  "min-h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface)] px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Edit one session with direct controls (SPEC §7.6, §9.5): day, session type, distance or
 * duration. Target pace follows the type (overhaul D2). The week's totals and any
 * warnings update with every change, and nothing is saved until Save; warnings never
 * block (Phase 3b decision).
 */
export function SessionEditor({
  week,
  workout,
  todayIso,
  physiology,
  onSave,
  onCancel,
}: {
  week: TrainingCalendarWeek;
  workout: CalendarWorkout;
  todayIso: string;
  physiology: DashboardInsights["physiology"] | null;
  onSave: (next: TrainingCalendarWeek) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const start = useMemo(() => currentEdit(workout), [workout]);
  const [date, setDate] = useState(start.date);
  const [kind, setKind] = useState<SessionKind>(start.kind);
  const [unit, setUnit] = useState<"km" | "min">(start.durationMin != null ? "min" : "km");
  const [amount, setAmount] = useState(
    start.distanceKm != null
      ? String(start.distanceKm)
      : start.durationMin != null
        ? String(start.durationMin)
        : "",
  );

  const parsed = amount.trim() === "" ? null : Number(amount);
  const amountInvalid = parsed !== null && !(Number.isFinite(parsed) && parsed > 0);
  const edit: SessionEdit = {
    date,
    kind,
    distanceKm: kind !== "rest" && unit === "km" && !amountInvalid ? parsed : null,
    durationMin: kind !== "rest" && unit === "min" && !amountInvalid ? parsed : null,
  };
  const draft = applySessionEdit(week, workout.id, edit);
  const changed = editChanges(workout, edit);
  const warnings = editWarnings(draft);

  const kindDef = SESSION_KINDS.find((k) => k.kind === kind)!;
  const pace =
    kind !== "rest" && physiology
      ? targetPaceFor(paceZoneFor({ type: kindDef.type, intensity: kindDef.intensity }), physiology)
      : null;

  // Days from today to the end of the week, each with what is planned there now.
  const days = Array.from({ length: 7 }, (_, i) =>
    format(addDays(parseISO(week.weekStart), i), "yyyy-MM-dd"),
  ).filter((d) => d >= todayIso || d === start.date);
  const plannedOn = (d: string) =>
    week.workouts.find((w) => w.date.slice(0, 10) === d && w.id !== workout.id)?.title;

  return (
    <form
      aria-label={`Edit ${workout.title}`}
      className="mt-6 space-y-6 rounded-xl border border-[var(--border-subtle)] p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !amountInvalid) onSave(draft);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`${id}-day`} className={field}>
            Day
          </label>
          <select
            id={`${id}-day`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          >
            {days.map((d) => {
              const there = plannedOn(d);
              return (
                <option key={d} value={d}>
                  {format(parseISO(d), "EEE d MMM")}
                  {there && d !== start.date ? ` · swaps with ${there}` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {kind !== "rest" ? (
          <div className="space-y-2">
            <label htmlFor={`${id}-amount`} className={field}>
              {unit === "km" ? "Distance" : "Duration"}
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-amount`}
                type="number"
                inputMode="decimal"
                min={0}
                step={unit === "km" ? 0.5 : 5}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amountInvalid}
                aria-describedby={amountInvalid ? `${id}-amount-error` : undefined}
                className={cn(input, "min-w-0 flex-1")}
              />
              <fieldset className="flex shrink-0 rounded-lg border border-[var(--border-default)] p-0.5">
                <legend className="sr-only">Measure by</legend>
                {(["km", "min"] as const).map((u) => (
                  <label
                    key={u}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      unit === u
                        ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                        : "text-muted-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-unit`}
                      value={u}
                      checked={unit === u}
                      onChange={() => setUnit(u)}
                      className="sr-only"
                    />
                    {u}
                  </label>
                ))}
              </fieldset>
            </div>
            {amountInvalid ? (
              <p id={`${id}-amount-error`} className="text-sm text-[var(--risk)]">
                Enter a number above zero, or leave it empty.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className={field}>Session type</legend>
        <div className="flex flex-wrap gap-2">
          {SESSION_KINDS.map((k) => (
            <label
              key={k.kind}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center rounded-lg border px-3.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                kind === k.kind
                  ? "border-[var(--accent)] bg-[var(--accent)]/[0.06] text-[var(--accent)]"
                  : "border-[var(--border-default)] text-foreground hover:bg-[var(--surface-hover)]",
              )}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={k.kind}
                checked={kind === k.kind}
                onChange={() => setKind(k.kind)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === "rest"
            ? "No running: the day is for recovery."
            : pace
              ? `Target pace ${paceRange(pace)}, from your ${
                  pace.basis.kind === "threshold" ? "threshold pace" : "critical speed"
                }.`
              : "No target pace yet: it needs a threshold estimate from your runs."}
        </p>
      </fieldset>

      <div aria-live="polite" className="space-y-3">
        <TotalsDiff before={weekTotals(week)} after={weekTotals(draft)} />
        {warnings.length ? (
          <div className="rounded-lg bg-[var(--caution-wash)] px-4 py-3">
            <ul className="space-y-1.5 text-sm text-foreground">
              {warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--caution)]"
                    aria-hidden
                  />
                  {w}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              A warning, not a block: you can still save.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!changed || amountInvalid}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-[0.9375rem] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
