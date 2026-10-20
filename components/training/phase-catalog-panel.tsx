"use client";

import type { TrainingPhase, TrainingPhaseType } from "@/lib/analytics";
import { Eyebrow, Panel } from "@/components/console/console-kit";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const band: Record<TrainingPhaseType, string> = {
  base: "bg-accent/60",
  build: "bg-sky-500/60",
  peak: "bg-violet-500/65",
  taper: "bg-amber-500/65",
  recovery: "bg-zinc-500/55",
  gap: "bg-zinc-700/60",
};

const dot: Record<TrainingPhaseType, string> = {
  base: "bg-accent/80",
  build: "bg-sky-400/80",
  peak: "bg-violet-400/85",
  taper: "bg-amber-400/85",
  recovery: "bg-zinc-400/70",
  gap: "bg-zinc-500/70",
};

function span(p: TrainingPhase): string {
  const start = format(parseISO(p.startWeek), "MMM d");
  const end = format(parseISO(p.endWeek), "MMM d");
  return start === end ? start : `${start} – ${end}`;
}

export function PhaseCatalogPanel({ phases }: { phases: TrainingPhase[] }) {
  if (phases.length === 0) return null;
  const totalWeeks = phases.reduce((s, p) => s + p.weeks, 0);

  return (
    <Panel>
      <Eyebrow className="mb-2">Training phases</Eyebrow>
      <p className="mb-2 text-xs text-zinc-500">
        The shape of your last {totalWeeks} weeks: base, build, sharpening, taper, and recovery.
      </p>

      {/* Band timeline: each segment's width is proportional to its week count. */}
      <div
        className="mb-3 flex h-6 w-full overflow-hidden rounded-md"
        role="img"
        aria-label="Training phase timeline"
      >
        {phases.map((p, i) => (
          <div
            key={i}
            className={cn("h-full", band[p.type])}
            style={{ width: `${(p.weeks / totalWeeks) * 100}%` }}
            title={`${p.label}: ${span(p)}`}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {phases
          .slice()
          .reverse()
          .map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs">
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dot[p.type])} />
              <span className="w-20 shrink-0 font-medium text-zinc-300">{p.label}</span>
              <span className="w-28 shrink-0 font-mono tabular-nums text-zinc-600">{span(p)}</span>
              {/* Own line on phones, where the fixed columns leave it ~60px. */}
              <span className="min-w-0 basis-full pl-[1.125rem] text-zinc-500 sm:flex-1 sm:basis-auto sm:pl-0">
                {p.characterization}
              </span>
            </li>
          ))}
      </ul>
    </Panel>
  );
}
