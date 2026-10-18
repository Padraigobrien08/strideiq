"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCoachThread } from "@/hooks/use-coach-thread";
import { useAthleteIntelligence } from "@/hooks/use-athlete-intelligence";
import { getCoachDomainContext } from "@/lib/intelligence/athleteState";
import { CoachWorkspaceSidebar } from "./coach-workspace-sidebar";
import { CoachReasoningPanel } from "./coach-reasoning-panel";
import { CoachMiniContext } from "./coach-mini-context";
import { cn } from "@/lib/utils";
import { AlertCircle, Menu, X } from "lucide-react";
import Link from "next/link";
import { intelligenceUrl } from "@/lib/coach/domainLinks";
import { parseCoachSource, SOURCE_LABELS, type CoachSourceParams } from "@/lib/coach/sourceContext";
import { format, parseISO } from "date-fns";
import { useTrainingCalendar } from "@/hooks/use-training-calendar";
import { currentWeekStart } from "@/lib/today/todayView";

export function CoachReasoningWorkspace({
  disabled,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const searchParams = useSearchParams();
  const thread = useCoachThread(disabled);
  const intel = useAthleteIntelligence(thread.messages);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bootstrapped = useRef(false);

  const domainParam = searchParams.get("domain");
  const qParam = searchParams.get("q");
  const investigate = searchParams.get("investigate") === "1";
  const source = parseCoachSource(searchParams);

  useEffect(() => {
    if (!intel.state || bootstrapped.current) return;
    bootstrapped.current = true;

    if (domainParam) {
      setActiveDomainId(domainParam);
      const domain = getCoachDomainContext(intel.state, domainParam);
      if (domain && investigate) {
        void thread.send(domain.suggestedQuery);
        return;
      }
    }
    if (qParam && investigate) {
      void thread.send(qParam);
    }
  }, [intel.state, domainParam, qParam, investigate, thread]);

  const handleDomainSelect = useCallback(
    (domain: NonNullable<typeof intel.state>["domains"][0]) => {
      setActiveDomainId(domain.id);
      setSidebarOpen(false);
      void thread.send(domain.suggestedQuery);
    },
    [thread],
  );

  const showSidebar = intel.state && !intel.loading;

  return (
    // No rounded card and no inner title bar: the app shell already marks Coach
    // as the current surface, so a second header and a floating panel read as a
    // shell inside a shell. The conversation is the page.
    <div className="coach-terminal flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Only reason for a bar at all is reaching the thread drawer on screens
          too narrow for the persistent sidebar. */}
      {showSidebar ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.04] px-3 py-2 lg:hidden">
          <button
            type="button"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close threads" : "Open threads"}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <span className="text-[11px] text-zinc-600">Investigations</span>
        </div>
      ) : null}

      {disabled ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/15 bg-amber-500/[0.06] px-4 py-2 text-[11px] text-amber-200/85">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{disabledReason}</span>
        </div>
      ) : null}

      {source ? <CoachSourceLine source={source} /> : null}

      <div className="coach-grid relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_264px]">
        {sidebarOpen && showSidebar ? (
          <button
            type="button"
            className="absolute inset-0 z-30 bg-black/50 lg:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {showSidebar ? (
          <CoachWorkspaceSidebar
            className={cn(
              "z-40 lg:relative lg:z-auto",
              sidebarOpen
                ? "fixed inset-y-0 left-0 flex max-w-[85vw] shadow-2xl lg:static lg:max-w-none lg:shadow-none"
                : "hidden lg:flex",
            )}
            threads={thread.threads}
            activeId={thread.activeId}
            state={intel.state!}
            activeDomainId={activeDomainId}
            onNewThread={() => {
              thread.handleNewThread();
              setSidebarOpen(false);
            }}
            onSelectThread={(id) => {
              thread.loadThread(id);
              setSidebarOpen(false);
            }}
            onDeleteThread={thread.handleDeleteThread}
            onDomainSelect={handleDomainSelect}
            disabled={disabled}
          />
        ) : null}

        <section className="coach-reasoning-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {intel.state && intel.analytics && !intel.loading ? (
            <CoachReasoningPanel
              workspace={intel.state}
              analytics={intel.analytics}
              raceGoal={intel.raceGoal}
              messages={thread.messages}
              input={thread.input}
              setInput={thread.setInput}
              loading={thread.loading}
              error={thread.error}
              pendingTools={thread.pendingTools}
              scrollRef={thread.scrollRef}
              onSend={(t) => void thread.send(t)}
              onStop={thread.stop}
              onRetry={thread.retryLast}
              disabled={disabled}
            />
          ) : intel.loading ? (
            <PanelSkeleton />
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center p-8 text-sm text-zinc-600">
              Connect and sync Strava data to open Coach.
            </div>
          )}
        </section>

        {intel.state ? (
          <CoachMiniContext
            state={intel.state}
            collapsed={contextCollapsed}
            onToggle={() => setContextCollapsed((c) => !c)}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Says what Coach was opened about (NAV-03). Phase 1 knows the page and id; Phase 5
 * attaches the entity itself and its thread history.
 */
function CoachSourceLine({ source }: { source: CoachSourceParams }) {
  // Today's planned session, by id, from this week's saved plan (TODAY-06): the line
  // names the session Coach was asked about rather than only the page.
  const calendar = useTrainingCalendar(currentWeekStart());
  const session = source.workout
    ? calendar.savedWeek?.workouts.find((w) => w.id === source.workout)?.title
    : undefined;
  const detail = [
    source.date ? format(parseISO(source.date), "EEE d MMM") : null,
    session ?? (source.activity ? "this run" : null),
  ].filter(Boolean);
  return (
    <p className="shrink-0 border-b border-white/[0.04] px-4 py-1.5 text-[12px] text-zinc-400">
      Opened from <span className="font-medium text-zinc-200">{SOURCE_LABELS[source.source]}</span>
      {detail.length ? <span className="text-zinc-500"> · {detail.join(" · ")}</span> : null}
    </p>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5">
        <div className="coach-message-column mx-auto w-full space-y-4">
          <div className="skeleton-shimmer h-6 w-32 rounded" />
          <div className="skeleton-shimmer h-10 w-full rounded" />
          <div className="skeleton-shimmer h-48 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
