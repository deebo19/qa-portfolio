import { describe, expect, it } from "vitest";
import { assessTrip, classify } from "../src/impact.js";
import type { LineStatus, TflSource } from "../src/tfl.js";
import { TODAY, c2c, c2cTrip, clean, disrupted, trip } from "./helpers.js";

describe("classify", () => {
  const status = (entries: LineStatus["lineStatuses"]): LineStatus => ({ id: "northern", name: "Northern", modeName: "tube", lineStatuses: entries });

  it("treats good service as no problem", () => {
    expect(classify(status([{ statusSeverity: 10, statusSeverityDescription: "Good Service" }]))).toBeUndefined();
  });

  it("maps minor delays to minor and suspensions to severe", () => {
    expect(classify(status([{ statusSeverity: 9, statusSeverityDescription: "Minor Delays" }]))?.severity).toBe("minor");
    expect(classify(status([{ statusSeverity: 2, statusSeverityDescription: "Suspended" }]))?.severity).toBe("severe");
  });

  it("ignores a planned closure that is not in force right now", () => {
    const later = status([
      { statusSeverity: 4, statusSeverityDescription: "Planned Closure", validityPeriods: [{ fromDate: "x", toDate: "y", isNow: false }] },
    ]);
    expect(classify(later)).toBeUndefined();
  });

  it("reports the worst active status when a line has several", () => {
    const both = status([
      { statusSeverity: 9, statusSeverityDescription: "Minor Delays", validityPeriods: [{ fromDate: "x", toDate: "y", isNow: true }] },
      { statusSeverity: 3, statusSeverityDescription: "Part Suspended", validityPeriods: [{ fromDate: "x", toDate: "y", isNow: true }] },
    ]);
    expect(classify(both)?.status).toBe("Part Suspended");
  });
});

describe("assessTrip", () => {
  it("flags the commute when its line is part suspended and the planner reroutes", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    expect(impact.affected).toBe(true);
    expect(impact.severity).toBe("severe");
    expect(impact.usualLines).toEqual(["northern"]);
    expect(impact.problems.map((p) => `${p.lineName}: ${p.status}`)).toEqual(["Northern: Part Suspended"]);
    expect(impact.rerouted).toBe(true);
    expect(impact.extraMinutes).toBe(11);
  });

  it("stays quiet when the usual route is fine, even if another line is bad", async () => {
    const impact = await assessTrip(clean(), trip, TODAY);
    expect(impact.affected).toBe(false);
    expect(impact.severity).toBe("none");
    expect(impact.problems).toEqual([]);
    expect(impact.rerouted).toBe(false);
  });

  it("uses configured usual lines instead of planning a week ahead", async () => {
    const calls: string[] = [];
    const src: TflSource = {
      lineStatus: () => clean().lineStatus(),
      journey: (q) => {
        calls.push(q.date);
        return clean().journey(q);
      },
    };
    const impact = await assessTrip(src, { ...trip, usualLines: ["Central"] }, TODAY);
    expect(calls).toEqual([TODAY]);
    expect(impact.usualLines).toEqual(["central"]);
    // The clean fixture has severe delays on the Central line, so this commuter is affected.
    expect(impact.affected).toBe(true);
    expect(impact.severity).toBe("severe");
  });

  it("covers a National Rail commute: c2c severe delays, planner falls back to the District line", async () => {
    const impact = await assessTrip(c2c(), c2cTrip, TODAY);
    expect(impact.affected).toBe(true);
    expect(impact.severity).toBe("severe");
    expect(impact.usualLines).toEqual(["c2c"]);
    expect(impact.problems.map((p) => `${p.lineName}: ${p.status}`)).toEqual(["c2c: Severe Delays"]);
    expect(impact.rerouted).toBe(true);
    expect(impact.extraMinutes).toBe(22);
  });

  it("rates minor delays on the usual line as minor", async () => {
    const src: TflSource = {
      lineStatus: async () => [
        { id: "northern", name: "Northern", modeName: "tube", lineStatuses: [{ statusSeverity: 9, statusSeverityDescription: "Minor Delays", reason: "Northern Line: Minor delays." }] },
      ],
      journey: (q) => clean().journey(q),
    };
    const impact = await assessTrip(src, trip, TODAY);
    expect(impact.affected).toBe(true);
    expect(impact.severity).toBe("minor");
    expect(impact.rerouted).toBe(false);
  });
});
