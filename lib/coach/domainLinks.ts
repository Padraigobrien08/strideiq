import type { CoachingDomain } from "./types";
import type { CoachSourceParams } from "./sourceContext";

export function coachUrl(
  params?: { domain?: string; q?: string; investigate?: boolean } & Partial<CoachSourceParams>,
): string {
  const sp = new URLSearchParams();
  if (params?.domain) sp.set("domain", params.domain);
  if (params?.q) sp.set("q", params.q);
  if (params?.investigate) sp.set("investigate", "1");
  // Source context: a kind and ids only, never metrics (see ./sourceContext).
  if (params?.source) sp.set("source", params.source);
  if (params?.date) sp.set("date", params.date);
  if (params?.activity) sp.set("activity", params.activity);
  const qs = sp.toString();
  return qs ? `/coach?${qs}` : "/coach";
}

export function intelligenceUrl(): string {
  return "/intelligence";
}

export function domainCoachLink(domain: CoachingDomain, investigate = true): string {
  return coachUrl({
    domain: domain.id,
    q: domain.suggestedQuery,
    investigate: investigate ? true : undefined,
  });
}

export function signalCoachLink(question: string): string {
  return coachUrl({ q: question, investigate: true });
}

export function topicCoachLink(topic: string, query?: string): string {
  const sp = new URLSearchParams();
  sp.set("topic", topic);
  if (query) sp.set("q", query);
  sp.set("investigate", "1");
  return `/coach?${sp.toString()}`;
}
