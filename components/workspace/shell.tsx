"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { useStrava } from "@/lib/context/strava-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { coachUrl } from "@/lib/coach/domainLinks";
import { coachSourceForPath } from "@/lib/coach/sourceContext";
import { MessageCircle, Settings, Search } from "lucide-react";

/**
 * Usable workspace width on large displays. This frame is the single place that
 * caps content: pages used to re-clamp themselves to max-w-5xl/6xl on top of it,
 * which rendered dashboards in a ~1024px column on a wide monitor and read as a
 * tablet layout.
 */
export const WORKSPACE_MAX = "max-w-[1720px]";
/** Coach matches the rest of the app; kept as a named export for clarity. */
export const COACH_WORKSPACE_MAX = WORKSPACE_MAX;

export function WorkspaceFrame({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "coach";
}) {
  const isCoach = variant === "coach";
  return (
    <div
      className={cn(
        "mx-auto w-full",
        isCoach
          ? cn(COACH_WORKSPACE_MAX, "px-3 sm:px-4 lg:px-5")
          : cn(WORKSPACE_MAX, "px-4 sm:px-5 lg:px-6"),
        className,
      )}
    >
      {children}
    </div>
  );
}

function WorkspaceMeta() {
  const { importData, clearData, dataSourceLabel, dataSources } = useStrava();
  if (!importData) return null;
  const isDemo = Boolean(dataSources.demo);
  return (
    <div className="hidden items-center gap-2 text-xs text-zinc-500 xl:flex">
      {isDemo ? (
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent">
          Demo
        </span>
      ) : null}
      <span>
        {importData.runs.length} runs
        {!isDemo && dataSourceLabel ? ` · ${dataSourceLabel}` : ""}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-zinc-500"
        onClick={clearData}
      >
        {isDemo ? "Exit demo" : "Clear"}
      </Button>
    </div>
  );
}

/**
 * The persistent Ask Coach action (SPEC §4.1): not a destination, but available from
 * every page, carrying which page it came from so Coach can say so.
 */
function AskCoachLink({ pathname }: { pathname: string }) {
  const onCoach = pathname === "/coach";
  const href = coachUrl(coachSourceForPath(pathname) ?? undefined);
  return (
    <Link
      href={href}
      aria-label="Ask Coach"
      aria-current={onCoach ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[0.8125rem] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        onCoach
          ? "border-accent/50 bg-accent/15 text-foreground"
          : "border-accent/30 text-accent hover:bg-accent/10",
      )}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      <span>
        Ask<span className="hidden min-[360px]:inline"> Coach</span>
      </span>
    </Link>
  );
}

export function AppWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/home" || pathname === "/training";
  const isCoach = pathname === "/coach";

  useEffect(() => {
    document.documentElement.classList.toggle("coach-route", isCoach);
    document.body.classList.toggle("coach-route", isCoach);
    return () => {
      document.documentElement.classList.remove("coach-route");
      document.body.classList.remove("coach-route");
    };
  }, [isCoach]);

  return (
    <div
      className={cn(
        "relative z-10 flex w-full flex-col",
        isCoach ? "h-dvh max-h-dvh overflow-hidden" : "min-h-dvh",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-50 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--header-bg)] backdrop-blur-xl">
        <WorkspaceFrame className="flex h-[var(--app-nav-height)] items-center gap-2 sm:gap-5">
          <Link href="/home" className="type-title shrink-0 text-[1.0625rem] tracking-[-0.03em]">
            Stride<span className="text-accent">IQ</span>
          </Link>
          <Nav className="hidden sm:block" />
          <div className="flex-1" />
          <AskCoachLink pathname={pathname} />
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            title="Search (⌘K)"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <Search className="h-4 w-4" />
            <kbd className="hidden rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
              pathname === "/settings" || pathname.startsWith("/settings/")
                ? "bg-accent/12 text-accent"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>
          <ThemeToggle className="shrink-0" />
          <WorkspaceMeta />
        </WorkspaceFrame>
        {/* Phones: the three destinations get their own full-width row rather than
            being squeezed beside the actions (SPEC §10.3). */}
        <WorkspaceFrame className="border-t border-[var(--border-subtle)] sm:hidden">
          <Nav layout="bar" />
        </WorkspaceFrame>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "focus:outline-none",
          isCoach ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex-1",
        )}
      >
        <WorkspaceFrame
          variant={isCoach ? "coach" : "default"}
          className={cn(
            isCoach
              ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden py-1 sm:py-1.5"
              : "py-4 sm:py-5",
            isHome && "pb-8",
          )}
        >
          {children}
        </WorkspaceFrame>
      </main>

      <CommandPalette />
    </div>
  );
}
