import { describe, expect, it } from "vitest";
import { assessRaceStatus } from "../raceStatus";

/** Likely (inner) range 1:34:00–1:41:00. */
const forecast = (confidence: "low" | "medium" | "medium_high" | "high" = "medium_high") => ({
  confidence,
  predictionIntervalSec: {
    outerLowSec: 5400,
    innerLowSec: 5640,
    mostLikelySec: 5850,
    innerHighSec: 6060,
    outerHighSec: 6300,
  },
});

const status = (targetTimeSec: number | undefined, f = forecast()) =>
  assessRaceStatus({ targetTimeSec, forecast: f })?.status;

describe("assessRaceStatus (PROGRESS-01/02/04)", () => {
  it("is Ahead when the goal is slower than the slow edge of the likely range", () => {
    expect(status(6300)).toBe("ahead"); // 1:45 goal, 1:34–1:41 likely
    expect(status(6061)).toBe("ahead");
  });

  it("is On track when the goal sits inside the likely range, edges included", () => {
    expect(status(6060)).toBe("on_track");
    expect(status(5850)).toBe("on_track");
    expect(status(5640)).toBe("on_track");
  });

  it("is At risk when the goal is faster than the fast edge", () => {
    expect(status(5639)).toBe("at_risk");
    expect(status(5400)).toBe("at_risk");
  });

  it("says Not enough evidence without a forecast or with low confidence", () => {
    expect(assessRaceStatus({ targetTimeSec: 6000, forecast: null })).toEqual({
      status: "not_enough_evidence",
      label: "Not enough evidence",
      likelyRangeSec: null,
    });
    expect(status(6300, forecast("low"))).toBe("not_enough_evidence");
  });

  it("has no status without a goal time", () => {
    expect(assessRaceStatus({ targetTimeSec: undefined, forecast: forecast() })).toBeNull();
    expect(assessRaceStatus({ targetTimeSec: 0, forecast: forecast() })).toBeNull();
  });

  it("labels each status in words, never colour alone", () => {
    expect(assessRaceStatus({ targetTimeSec: 6300, forecast: forecast() })?.label).toBe("Ahead");
    expect(assessRaceStatus({ targetTimeSec: 5850, forecast: forecast() })?.label).toBe("On track");
    expect(assessRaceStatus({ targetTimeSec: 5000, forecast: forecast() })?.label).toBe("At risk");
  });
});
