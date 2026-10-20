"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Copy, Loader2, MessageCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Eyebrow } from "@/components/console/console-kit";
import { cn } from "@/lib/utils";

export type PlanHeaderStatus = "empty" | "saved" | "preview" | "saved_with_preview" | "modified";

export function PlanHeader({
  eyebrow = "Week planner",
  title,
  summary,
  nav,
  weekRange,
  status,
  statusLabel,
  phaseLabel,
  goalContext,
  confidence,
  canSave,
  canRevert,
  hasSaved,
  loading,
  onGenerate,
  onSave,
  onClear,
  onDuplicate,
  onRevert,
  onViewPreview,
  onViewSaved,
  coachHref,
}: {
  eyebrow?: string;
  title: string;
  /** Replaces the plain week-range line, e.g. Training's "2 of 5 sessions complete". */
  summary?: ReactNode;
  /** Week navigation, shown beside the title. */
  nav?: ReactNode;
  weekRange: string;
  status: PlanHeaderStatus;
  statusLabel: string;
  phaseLabel: string;
  goalContext: string | null;
  confidence: "low" | "medium" | "high";
  canSave: boolean;
  canRevert: boolean;
  hasSaved: boolean;
  loading?: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onClear: () => void;
  onDuplicate?: () => void;
  onRevert?: () => void;
  onViewPreview?: () => void;
  onViewSaved?: () => void;
  showingPreview?: boolean;
  coachHref: string;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="type-page-title">{title}</h1>
          {nav}
        </div>
        {summary ?? (
          <p className="font-mono text-[13px] tabular-nums text-muted-foreground">{weekRange}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} label={statusLabel} />
          <span className="text-[11px] text-zinc-600">{phaseLabel}</span>
          <ConfidenceBadge level={confidence} />
        </div>
        {goalContext ? (
          <p className="text-[12px] text-zinc-500">
            <span className="text-zinc-600">Goal: </span>
            {goalContext}
          </p>
        ) : null}
        {status === "saved_with_preview" && onViewPreview ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <button
              type="button"
              className="text-amber-400/90 hover:text-amber-300"
              onClick={onViewPreview}
            >
              View unsaved preview
            </button>
            {onViewSaved ? (
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={onViewSaved}
              >
                Back to saved
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {canSave ? (
          <Button
            size="sm"
            className="h-8 gap-1 border-0 text-xs text-[var(--home-signal-ink)]"
            style={{ background: "var(--home-signal)" }}
            onClick={onSave}
          >
            <Save className="h-3 w-3" />
            Save to calendar
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          disabled={loading}
          onClick={onGenerate}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Regenerate
        </Button>
        <Link href={coachHref}>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <MessageCircle className="h-3 w-3" />
            Refine in Coach
          </Button>
        </Link>
        {onDuplicate && hasSaved ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-zinc-500"
            onClick={onDuplicate}
          >
            <Copy className="h-3 w-3" />
            Duplicate
          </Button>
        ) : null}
        {canRevert ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-zinc-500"
            onClick={onRevert}
          >
            Revert
          </Button>
        ) : null}
        {hasSaved ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-zinc-600"
            onClick={onClear}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function StatusBadge({ status, label }: { status: PlanHeaderStatus; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]",
        status === "saved" && "bg-accent/12 text-accent",
        status === "modified" && "bg-accent/10 text-accent/90",
        status === "preview" && "bg-amber-500/12 text-amber-200/90",
        status === "saved_with_preview" && "bg-zinc-500/10 text-zinc-400",
        status === "empty" && "bg-[var(--surface)] text-zinc-600",
      )}
    >
      {status !== "empty" ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              status === "preview"
                ? "var(--hz-moderate)"
                : status === "saved_with_preview"
                  ? "var(--muted-subtle)"
                  : "var(--home-signal)",
          }}
        />
      ) : null}
      {label}
    </span>
  );
}
