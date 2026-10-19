"use client";

import { useMemo, useState } from "react";
import { RequireData } from "@/components/require-data";
import { useTrainingIntelligence } from "@/hooks/use-training-intelligence";
import { useStrava } from "@/lib/context/strava-context";
import { useGoalStore } from "@/stores/goal-store";
import { DashboardSkeleton } from "@/components/home/primitives/dashboard-skeleton";
import { useTrainingCalendar } from "@/hooks/use-training-calendar";
import { buildTodayView, currentWeekStart } from "@/lib/today/todayView";
import { TodayPage, TodaySourceStatus } from "@/components/home/today/today-page";
import { LegFeelCard } from "@/components/home/console/leg-feel-card";
import { ReturningCard } from "@/components/home/console/returning-card";

/**
 * Today — "What should I do today?" (docs/ui-overhaul/SPEC.md §6, overhaul Phase 2).
 *
 * Replaced the console dashboard. What left this page and where it lives now: plan
 * generation and refinement → Training; the change feed and decision support →
 * Intelligence; the projected-finish chart → Progress; the permanent readiness panel →
 * only the readiness exception, when it changes the session.
 */
export default function HomePage() {
  const {
    apiConnected,
    dataSourceLabel,
    refreshFromStravaApi,
    loading,
    error,
    importData,
    fitDetails,
  } = useStrava();
  const { analytics, insights, loading: intelLoading } = useTrainingIntelligence();
  // This week, not the planner's default target (next week): Today follows the plan
  // that covers today.
  const calendar = useTrainingCalendar(currentWeekStart());
  const raceGoal = useGoalStore((s) => s.raceGoal);
  const [syncing, setSyncing] = useState(false);

  const view = useMemo(() => {
    if (!analytics) return null;
    return buildTodayView({
      analytics,
      savedWeek: calendar.savedWeek,
      raceGoal,
      insights,
      runs: importData?.runs,
      fitDetails,
    });
  }, [analytics, calendar.savedWeek, raceGoal, insights, importData?.runs, fitDetails]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await refreshFromStravaApi();
    } finally {
      setSyncing(false);
    }
  };

  if ((loading || intelLoading) && !analytics) {
    return <DashboardSkeleton />;
  }

  return (
    <RequireData>
      {analytics && view ? (
        <TodayPage
          view={view}
          below={
            <>
              {analytics.returning ? <ReturningCard plan={analytics.returning} /> : null}
              <LegFeelCard />
              <TodaySourceStatus
                apiConnected={apiConnected}
                dataSourceLabel={dataSourceLabel}
                syncing={syncing || loading}
                syncError={error}
                onSync={() => void handleSync()}
              />
            </>
          }
        />
      ) : null}
    </RequireData>
  );
}
