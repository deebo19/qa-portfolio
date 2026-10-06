import type { Day } from "./config.js";

export const LONDON = "Europe/London";

/** Calendar date as YYYY-MM-DD in London, for a given instant. */
export function londonDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Time as HH:MM in London for a given instant. */
export function londonTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** Day key (mon..sun) for a YYYY-MM-DD date. */
export function dayOf(date: string): Day {
  const d = new Date(`${date}T12:00:00Z`);
  const names: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return names[d.getUTCDay()] as Day;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-07" -> "Tue 7 Oct". */
export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** TfL journey planner wants YYYYMMDD and HHmm. */
export function tflDate(date: string): string {
  return date.replaceAll("-", "");
}
export function tflTime(hhmm: string): string {
  return hhmm.replace(":", "");
}

/** "2026-10-07T08:12:00" (TfL local time, no zone) -> "08:12". */
export function hhmmFromIso(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : iso;
}

export function minutesBetween(hhmmA: string, hhmmB: string): number {
  const [ah, am] = hhmmA.split(":").map(Number) as [number, number];
  const [bh, bm] = hhmmB.split(":").map(Number) as [number, number];
  return bh * 60 + bm - (ah * 60 + am);
}
