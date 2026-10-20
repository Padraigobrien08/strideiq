"use client";

import { Suspense } from "react";
import { RequireData } from "@/components/require-data";
import { PlanWorkspace } from "@/components/plan/plan-workspace";

/**
 * Training — "What is planned, and what actually happened?" (docs/ui-overhaul/SPEC.md §7).
 * The current week, a seven-day strip and the selected day; plan generation, saving and
 * history are unchanged from the former `/plan`, which now redirects here
 * (next.config.ts). The race goal moved to Progress.
 */
function TrainingPageFallback() {
  return (
    <div className="space-y-4 pb-12">
      <div className="skeleton-shimmer h-10 w-64 rounded" />
      <div className="skeleton-shimmer h-28 rounded-xl" />
      <div className="skeleton-shimmer h-64 rounded-xl" />
    </div>
  );
}

export default function TrainingPage() {
  return (
    <RequireData>
      {/* useSearchParams (?date=) needs a Suspense boundary. */}
      <Suspense fallback={<TrainingPageFallback />}>
        <PlanWorkspace />
      </Suspense>
    </RequireData>
  );
}
