"use client";

import type { PlanWeekTelemetry } from "@/lib/plan/planWorkspaceView";
import { formatKm } from "@/lib/utils";
import { Eyebrow, Panel, StatItem } from "@/components/console/console-kit";

export function PlanWeekTelemetryStrip({ telemetry }: { telemetry: PlanWeekTelemetry }) {
  const chips = [
    telemetry.volumeKm != null
      ? { label: "Volume", value: `${formatKm(telemetry.volumeKm)} planned` }
      : null,
    {
      label: "Intensity",
      value: `${telemetry.hardSessions} hard session${telemetry.hardSessions === 1 ? "" : "s"}`,
    },
    { label: "Load balance", value: telemetry.loadBalance },
    { label: "Goal alignment", value: telemetry.goalAlignment },
    telemetry.riskSummary ? { label: "Risk", value: telemetry.riskSummary, warn: true } : null,
    { label: "Confidence", value: telemetry.confidence },
  ].filter(Boolean) as {
    label: string;
    value: string;
    warn?: boolean;
  }[];

  return (
    <Panel>
      <Eyebrow className="mb-3">Week telemetry</Eyebrow>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {chips.map((c) =>
          c.warn ? (
            <div key={c.label} className="flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.14em] text-amber-400/70">
                {c.label}
              </span>
              <span className="font-mono text-[13px] tabular-nums text-amber-200/85">
                {c.value}
              </span>
            </div>
          ) : (
            <StatItem key={c.label} label={c.label} value={c.value} />
          ),
        )}
      </div>
    </Panel>
  );
}
