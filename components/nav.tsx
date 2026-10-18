"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CalendarRange, Sun, TrendingUp } from "lucide-react";

/**
 * Three destinations, one question each (docs/ui-overhaul/SPEC.md §4.1): Today — what
 * should I do now; Training — what is planned and what happened; Progress — am I on
 * track. Coach is not a destination; it is the Ask Coach action in the header.
 *
 * Each destination owns the routes beneath it, so a deep page still shows where it
 * lives. Until overhaul Phases 3 and 4 move content, Training's canonical URL is
 * `/plan` (the current week) and Progress renders the race-goal view; `/training`,
 * `/runs`, `/performance` and `/intelligence` stay valid deep routes under them, and
 * the command palette still lists every one.
 */
export const PRIMARY_DESTINATIONS = [
  { href: "/home", label: "Today", icon: Sun, owns: ["/home"] },
  { href: "/plan", label: "Training", icon: CalendarRange, owns: ["/plan", "/training", "/runs"] },
  {
    href: "/progress",
    label: "Progress",
    icon: TrendingUp,
    owns: ["/progress", "/goals", "/performance", "/intelligence", "/report"],
  },
] as const;

const within = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

/** The destination a pathname belongs to, or null (Coach, Settings, Import…). */
export function activeDestination(pathname: string): string | null {
  return PRIMARY_DESTINATIONS.find((d) => d.owns.some((r) => within(pathname, r)))?.href ?? null;
}

export function Nav({
  className,
  layout = "inline",
}: {
  className?: string;
  /** `inline` sits in the header row; `bar` is the full-width row used on phones. */
  layout?: "inline" | "bar";
}) {
  const pathname = usePathname();
  const active = activeDestination(pathname);

  return (
    <nav aria-label="Main" className={cn("min-w-0", className)}>
      <ul className={cn("flex items-stretch", layout === "bar" ? "w-full" : "gap-1")}>
        {PRIMARY_DESTINATIONS.map(({ href, label, icon: Icon }) => {
          const current = active === href;
          return (
            <li key={href} className={cn(layout === "bar" && "flex-1")}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "type-nav relative inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  layout === "bar" && "w-full",
                  // The active state is carried by weight and an underline as well as
                  // colour, so it reads without colour vision (SPEC §13).
                  current
                    ? "font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-accent"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
