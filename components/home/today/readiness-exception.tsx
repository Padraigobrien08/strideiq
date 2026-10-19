"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import type { TodayLoadImpact } from "@/lib/training/loadBalanceImpact";
import type { TodaySessionKind } from "@/lib/training/todaySession";
import { cn } from "@/lib/utils";

const SESSION_WORDS: Record<TodaySessionKind, string> = {
  rest: "rest",
  recovery: "a recovery run",
  easy: "an easy run",
  long: "a long run",
  tempo: "a tempo session",
  interval: "intervals",
};

/**
 * Readiness, only when it changed today's session (SPEC §6.7, ACCEPTANCE TODAY-04):
 * what changed, the evidence, what is recommended now, and a way to discuss it.
 * `todayLoadImpact` decides whether this exists at all; there is no routine panel.
 */
export function ReadinessException({
  impact,
  coachHref,
}: {
  impact: TodayLoadImpact & { affects: true };
  coachHref: string;
}) {
  const heldBack = impact.direction === "held_back";
  const Icon = heldBack ? AlertTriangle : Info;
  return (
    <section
      aria-labelledby="readiness-exception"
      className={cn(
        "mt-8 max-w-[65ch] rounded-xl px-5 py-4",
        heldBack ? "bg-[var(--caution-wash)]" : "bg-[var(--surface)]",
      )}
    >
      <h2
        id="readiness-exception"
        className={cn(
          "flex items-center gap-2 font-semibold",
          heldBack ? "text-[var(--caution)]" : "text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {heldBack ? "Your recent load eased today back" : "Your recent load leaves room for more"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        Without it, today would be {SESSION_WORDS[impact.withoutLoad]}. StrideIQ recommends{" "}
        {SESSION_WORDS[impact.actual]} instead.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {impact.evidence.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link
        href={coachHref}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Discuss this with Coach <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
