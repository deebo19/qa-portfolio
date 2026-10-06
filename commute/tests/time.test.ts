import { describe, expect, it } from "vitest";
import { addDays, dayOf, hhmmFromIso, londonDate, minutesBetween, prettyDate, tflDate, tflTime } from "../src/time.js";

describe("time helpers", () => {
  it("knows the weekday of a date", () => {
    expect(dayOf("2026-10-07")).toBe("wed");
    expect(dayOf("2026-10-10")).toBe("sat");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
  });

  it("formats for humans and for TfL", () => {
    expect(prettyDate("2026-10-07")).toBe("Wed 7 Oct");
    expect(tflDate("2026-10-07")).toBe("20261007");
    expect(tflTime("09:00")).toBe("0900");
  });

  it("extracts HH:MM from a TfL local timestamp", () => {
    expect(hhmmFromIso("2026-10-07T08:03:00")).toBe("08:03");
  });

  it("gives the London calendar date, not UTC, late at night in summer", () => {
    // 23:30 UTC on 6 July is 00:30 BST on 7 July.
    expect(londonDate(new Date("2026-07-06T23:30:00Z"))).toBe("2026-07-07");
  });

  it("computes minutes between two clock times", () => {
    expect(minutesBetween("08:03", "09:00")).toBe(57);
  });
});
