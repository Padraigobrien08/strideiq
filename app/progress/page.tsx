"use client";

import { Suspense } from "react";
import Link from "next/link";
import { RequireData } from "@/components/require-data";
import { RaceGoalWorkspace } from "@/components/goals/race-goal-workspace";

/**
 * Progress — "Am I on track for my race goal?" (docs/ui-overhaul/SPEC.md §8).
 *
 * Interim, overhaul Phase 1: renders the existing race-goal view (also the Plan page's
 * Race goal tab) so the new navigation has a real destination. Phase 4 replaces this
 * with the status/projection/evidence overview at the same URL. The deeper read-first
 * surfaces stay one click away, as DECISIONS requires for Intelligence.
 */
export default function ProgressPage() {
  return (
    <RequireData>
      <div className="space-y-6 pb-12">
        <Suspense fallback={<div className="skeleton-shimmer h-64 rounded-xl" />}>
          <RaceGoalWorkspace />
        </Suspense>
        <nav
          aria-label="Full analysis"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm"
        >
          <span className="text-zinc-500">Full analysis</span>
          <Link href="/intelligence" className="font-medium text-accent hover:underline">
            Intelligence
          </Link>
          <Link href="/performance" className="font-medium text-accent hover:underline">
            Performance
          </Link>
          <Link href="/progress/load" className="font-medium text-accent hover:underline">
            Training load
          </Link>
          <Link href="/report" className="font-medium text-accent hover:underline">
            Report
          </Link>
        </nav>
      </div>
    </RequireData>
  );
}
