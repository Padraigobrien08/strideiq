import { describe, expect, it } from "vitest";
import { coachSourceForPath, parseCoachSource } from "../sourceContext";
import { coachUrl } from "../domainLinks";

const params = (qs: string) => new URLSearchParams(qs);

describe("coachSourceForPath", () => {
  it("maps each primary area to its source kind", () => {
    expect(coachSourceForPath("/home")).toEqual({ source: "today" });
    expect(coachSourceForPath("/plan")).toEqual({ source: "training_week" });
    expect(coachSourceForPath("/training")).toEqual({ source: "training_week" });
    expect(coachSourceForPath("/progress")).toEqual({ source: "progress" });
    expect(coachSourceForPath("/intelligence")).toEqual({ source: "progress" });
  });

  it("carries the activity id from a run page, including its route replay", () => {
    expect(coachSourceForPath("/runs/987")).toEqual({ source: "activity", activity: "987" });
    expect(coachSourceForPath("/runs/987/route")).toEqual({ source: "activity", activity: "987" });
  });

  it("has no source for pages outside the three areas", () => {
    for (const p of ["/coach", "/settings", "/import", "/runs"]) {
      expect(coachSourceForPath(p)).toBeNull();
    }
  });
});

describe("parseCoachSource", () => {
  it("round-trips what coachUrl writes", () => {
    const url = coachUrl({ source: "activity", activity: "987" });
    expect(parseCoachSource(params(url.split("?")[1]))).toEqual({
      source: "activity",
      activity: "987",
    });
  });

  it("accepts a valid date for today", () => {
    expect(parseCoachSource(params("source=today&date=2026-10-18"))).toEqual({
      source: "today",
      date: "2026-10-18",
    });
  });

  it("drops anything it does not recognise, so a crafted link cannot inject text", () => {
    expect(parseCoachSource(params("source=<script>"))).toBeNull();
    expect(parseCoachSource(params("source=today&date=tomorrow"))).toEqual({ source: "today" });
    expect(
      parseCoachSource(params("source=activity&activity=" + encodeURIComponent("1; drop"))),
    ).toEqual({ source: "activity" });
    // Ids only belong to the kind they describe.
    expect(parseCoachSource(params("source=progress&activity=987&date=2026-10-18"))).toEqual({
      source: "progress",
    });
  });

  it("is absent without a source", () => {
    expect(parseCoachSource(params("q=hello"))).toBeNull();
  });
});
