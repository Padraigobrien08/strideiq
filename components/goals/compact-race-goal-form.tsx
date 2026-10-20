"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoalStore } from "@/stores/goal-store";
import {
  RACE_DISTANCE_LABELS,
  RACE_NAME_MAX_LENGTH,
  raceDisplayName,
  type RaceDistance,
  type RaceGoal,
} from "@/lib/analytics/readiness";
import { ChevronDown } from "lucide-react";
import { cn, formatRaceTime } from "@/lib/utils";

const DISTANCES: RaceDistance[] = ["5k", "10k", "hm", "marathon"];

/**
 * Parse a target finish time into seconds.
 *
 * Accepts `h:mm:ss`, `mm:ss`, or bare minutes. The `> 0` guard applies to every path:
 * the bare-number branch always had it, the colon branches did not, so "-1:00" parsed
 * to minus sixty and the caller's `if (targetTimeSec)` waved it through as truthy. A
 * negative goal then flows into the race-prediction comparisons as a real target.
 */
function parseTargetTime(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const seconds = (() => {
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map(Number);
      if (parts.some((n) => Number.isNaN(n))) return undefined;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return undefined;
    }
    const min = Number(trimmed);
    return Number.isNaN(min) ? undefined : Math.round(min * 60);
  })();

  return seconds !== undefined && seconds > 0 ? seconds : undefined;
}

export function CompactRaceGoalForm() {
  const { raceGoal, setRaceGoal, clearRaceGoal } = useGoalStore();
  const [open, setOpen] = useState(!raceGoal);
  const [distance, setDistance] = useState<RaceDistance>(raceGoal?.distance ?? "hm");
  const [date, setDate] = useState(
    () =>
      raceGoal?.date ?? new Date(Date.now() + 56 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  // Pre-filled from the saved goal. The target used to start empty, so re-saving a goal
  // (say, to move its date) silently dropped the target time.
  const [targetTime, setTargetTime] = useState(() =>
    raceGoal?.targetTimeSec ? formatRaceTime(raceGoal.targetTimeSec) : "",
  );
  const [name, setName] = useState(raceGoal?.name ?? "");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const goal: RaceGoal = { distance, date };
    const targetTimeSec = parseTargetTime(targetTime);
    if (targetTimeSec) goal.targetTimeSec = targetTimeSec;
    const trimmedName = name.trim();
    if (trimmedName) goal.name = trimmedName;
    setRaceGoal(goal);
    setOpen(false);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-white/[0.05] bg-white/[0.02]"
    >
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            className="flex h-auto w-full items-center justify-between gap-2 whitespace-normal rounded-xl px-4 py-3 text-left font-normal hover:bg-white/[0.02]"
          />
        }
      >
        <span className="min-w-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Race mission setup
          {raceGoal ? (
            <span className="ml-2 font-normal normal-case text-accent/80">
              {raceDisplayName(raceGoal)} · {new Date(raceGoal.date).toLocaleDateString()}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-zinc-600 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          onSubmit={handleSubmit}
          className="grid gap-3 border-t border-white/[0.04] px-4 py-4 sm:grid-cols-4"
        >
          <div className="space-y-2 sm:col-span-4">
            <Label htmlFor="compact-race-name" className="text-xs text-zinc-500">
              Race name (optional)
            </Label>
            <Input
              id="compact-race-name"
              type="text"
              value={name}
              maxLength={RACE_NAME_MAX_LENGTH}
              placeholder="Edinburgh Half Marathon"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-500">Distance</Label>
            <Select value={distance} onValueChange={(v) => setDistance(v as RaceDistance)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {RACE_DISTANCE_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="compact-race-date" className="text-xs text-zinc-500">
              Race date
            </Label>
            <Input
              id="compact-race-date"
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="compact-race-target" className="text-xs text-zinc-500">
              Target time (optional)
            </Label>
            <Input
              id="compact-race-target"
              type="text"
              value={targetTime}
              placeholder="1:49:00"
              onChange={(e) => setTargetTime(e.target.value)}
            />
          </div>
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm">
              Update mission
            </Button>
            {raceGoal ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearRaceGoal}>
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
