"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  CalendarRange,
  Brain,
  MessageCircle,
  Footprints,
  Upload,
  TrendingUp,
  Dumbbell,
  FileText,
  Layers,
  Settings,
  Search,
  SunMoon,
  Play,
  LogOut,
  RefreshCw,
  CornerDownLeft,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { useStrava } from "@/lib/context/strava-context";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "command-palette:open";

/** Open the command palette from anywhere (e.g. a header button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Command {
  id: string;
  label: string;
  group: "Go to" | "Analysis & tools" | "Actions";
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

type RouteEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Go to" | "Analysis & tools";
  keywords?: string;
};

// "Go to" mirrors the three-item top nav plus the Ask Coach action. "Analysis & tools"
// holds every deeper or compatibility route, so none of them loses its way in when it
// leaves the top nav: Activities and Intelligence moved out of the chrome in overhaul
// Phase 1, and Plan/Home keep their old names as keywords.
const ROUTES: RouteEntry[] = [
  {
    href: "/home",
    label: "Today",
    icon: Sun,
    group: "Go to",
    keywords: "home dashboard session daily briefing",
  },
  {
    href: "/plan",
    label: "Training",
    icon: CalendarRange,
    group: "Go to",
    keywords: "plan week schedule calendar",
  },
  {
    href: "/progress",
    label: "Progress",
    icon: Target,
    group: "Go to",
    keywords: "goal race forecast projection on track",
  },
  {
    href: "/coach",
    label: "Coach",
    icon: MessageCircle,
    group: "Go to",
    keywords: "chat ask investigate why",
  },
  {
    href: "/runs",
    label: "Activities",
    icon: Footprints,
    group: "Analysis & tools",
    keywords: "runs sessions history explore",
  },
  {
    href: "/intelligence",
    label: "Intelligence",
    icon: Brain,
    group: "Analysis & tools",
    keywords: "belief model insights",
  },
  {
    href: "/performance",
    label: "Performance",
    icon: TrendingUp,
    group: "Analysis & tools",
    keywords: "improving trajectory pr records am i improving",
  },
  {
    href: "/training",
    label: "Training load",
    icon: Dumbbell,
    group: "Analysis & tools",
    keywords: "load intensity distribution phase am i training",
  },
  {
    href: "/report",
    label: "Report / export",
    icon: FileText,
    group: "Analysis & tools",
    keywords: "summary export pdf print briefing",
  },
  {
    href: "/runs",
    label: "Activity mix",
    icon: Layers,
    group: "Analysis & tools",
    keywords: "cross training modality mix activity context",
  },
  {
    href: "/import",
    label: "Import data",
    icon: Upload,
    group: "Analysis & tools",
    keywords: "connect strava upload fit",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    group: "Analysis & tools",
    keywords: "preferences theme account",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const { theme, toggleTheme } = useThemeStore();
  const { loadDemo, clearData, refreshFromStravaApi, apiConnected, dataSources } = useStrava();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global ⌘K / Ctrl+K to toggle the palette; custom event to open it from a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Reset query/selection each time it opens, and focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = ROUTES.map((r) => ({
      id: `nav:${r.href}:${r.label}`,
      label: r.label,
      group: r.group,
      icon: r.icon,
      keywords: r.keywords,
      run: () => router.push(r.href),
    }));

    const actions: Command[] = [
      {
        id: "action:theme",
        label: `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
        group: "Actions",
        icon: SunMoon,
        keywords: "theme dark light appearance",
        run: () => toggleTheme(),
      },
    ];
    if (dataSources.demo) {
      actions.push({
        id: "action:exit-demo",
        label: "Exit demo",
        group: "Actions",
        icon: LogOut,
        keywords: "clear data leave sample",
        run: () => void clearData(),
      });
    } else {
      actions.push({
        id: "action:demo",
        label: "Try the demo",
        group: "Actions",
        icon: Play,
        keywords: "sample athlete load demo",
        run: () => loadDemo(),
      });
    }
    if (apiConnected) {
      actions.push({
        id: "action:sync",
        label: "Sync from Strava",
        group: "Actions",
        icon: RefreshCw,
        keywords: "refresh update pull",
        run: () => void refreshFromStravaApi(),
      });
    }
    return [...nav, ...actions];
  }, [
    router,
    theme,
    toggleTheme,
    dataSources.demo,
    apiConnected,
    loadDemo,
    clearData,
    refreshFromStravaApi,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const runCommand = useCallback((cmd: Command | undefined) => {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }, []);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(filtered[active]);
    }
  };

  // Scroll the active row into view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let renderIndex = -1;
  let lastGroup = "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          aria-label="Command palette"
          className="fixed left-1/2 top-[12vh] z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Search pages and actions…"
              aria-label="Search pages and actions"
              className="h-12 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
            />
          </div>

          <div ref={listRef} className="max-h-[min(60vh,380px)] overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-zinc-500">
                No matches for &ldquo;{query}&rdquo;
              </p>
            ) : (
              filtered.map((cmd) => {
                renderIndex += 1;
                const index = renderIndex;
                const Icon = cmd.icon;
                const showHeader = cmd.group !== lastGroup;
                lastGroup = cmd.group;
                return (
                  <div key={cmd.id}>
                    {showHeader ? (
                      <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-eyebrow text-zinc-600">
                        {cmd.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => runCommand(cmd)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                        index === active
                          ? "bg-accent/15 text-accent"
                          : "text-zinc-300 hover:bg-white/[0.04]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          index === active ? "text-accent" : "text-zinc-500",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                      {index === active ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent/70" />
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-white/[0.06] px-3.5 py-2 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/[0.06] px-1 py-0.5">↑</kbd>
              <kbd className="rounded bg-white/[0.06] px-1 py-0.5">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/[0.06] px-1 py-0.5">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/[0.06] px-1 py-0.5">esc</kbd>
              close
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
