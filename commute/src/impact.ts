/**
 * Decides whether a trip is affected today by comparing the usual route
 * (planned a week ahead: timetable only) with today's route (live, disruption-aware)
 * and the live status of every line the usual route uses.
 */
import type { Trip } from "./config.js";
import { addDays } from "./time.js";
import { linesUsed, type Journey, type JourneyResults, type LineStatus, type TflSource } from "./tfl.js";

export type Severity = "none" | "minor" | "severe";

/** TfL statusSeverity codes. 10 is Good Service. */
const SEVERE = new Set([0, 1, 2, 3, 4, 5, 6, 8, 11, 15, 16, 20]);
const MINOR = new Set([7, 9, 12, 14, 17]);
// 10 Good Service, 13 No Step Free Access, 18 No Issues, 19 Information are treated as fine.

export interface LineProblem {
  lineId: string;
  lineName: string;
  severity: Severity;
  status: string;
  reason?: string;
}

export interface Impact {
  trip: Trip;
  date: string;
  affected: boolean;
  severity: Severity;
  /** Lines on the usual route with a problem right now. */
  problems: LineProblem[];
  /** Line ids on the usual route (lowercase). */
  usualLines: string[];
  usual?: Journey;
  today?: Journey;
  /** Today's planner route differs from the usual one (planner has rerouted). */
  rerouted: boolean;
  /** Positive when today's journey is longer than usual. */
  extraMinutes: number;
}

export function classify(status: LineStatus): LineProblem | undefined {
  let worst: LineProblem | undefined;
  for (const s of status.lineStatuses) {
    const active = !s.validityPeriods || s.validityPeriods.length === 0 || s.validityPeriods.some((p) => p.isNow);
    if (!active) continue;
    const severity: Severity = SEVERE.has(s.statusSeverity) ? "severe" : MINOR.has(s.statusSeverity) ? "minor" : "none";
    if (severity === "none") continue;
    const problem: LineProblem = {
      lineId: status.id.toLowerCase(),
      lineName: status.name,
      severity,
      status: s.statusSeverityDescription,
      reason: s.reason,
    };
    if (!worst || (worst.severity === "minor" && severity === "severe")) worst = problem;
  }
  return worst;
}

function firstJourney(r: JourneyResults): Journey | undefined {
  return r.journeys?.[0];
}

export async function assessTrip(tfl: TflSource, trip: Trip, date: string): Promise<Impact> {
  const base = { from: trip.from, to: trip.to, arriveBy: trip.arriveBy, modes: trip.modes, maxWalkingMinutes: trip.maxWalkingMinutes };

  const [statuses, todayRes] = await Promise.all([tfl.lineStatus(trip.modes), tfl.journey({ ...base, date })]);
  const today = firstJourney(todayRes);

  let usual: Journey | undefined;
  let usualLines: string[];
  if (trip.usualLines) {
    usualLines = trip.usualLines.map((l) => l.toLowerCase());
  } else {
    usual = firstJourney(await tfl.journey({ ...base, date: addDays(date, 7) }));
    usualLines = usual ? linesUsed(usual) : today ? linesUsed(today) : [];
  }

  const byId = new Map(statuses.map((s) => [s.id.toLowerCase(), s]));
  const problems = usualLines
    .map((id) => byId.get(id))
    .filter((s): s is LineStatus => Boolean(s))
    .map(classify)
    .filter((p): p is LineProblem => Boolean(p));

  // Station-level trouble the planner already knows about (closures, lift outages) shows up on the legs.
  const legDisrupted = today?.legs.some((l) => l.isDisrupted || (l.disruptions?.length ?? 0) > 0) ?? false;

  const todayLines = today ? linesUsed(today) : [];
  const rerouted = usualLines.length > 0 && todayLines.length > 0 && !sameSet(usualLines, todayLines);
  const extraMinutes = usual && today ? today.duration - usual.duration : 0;

  let severity: Severity = "none";
  if (problems.some((p) => p.severity === "severe") || rerouted || extraMinutes >= 10) severity = "severe";
  else if (problems.length > 0 || legDisrupted) severity = "minor";

  return {
    trip,
    date,
    affected: severity !== "none",
    severity,
    problems,
    usualLines,
    usual,
    today,
    rerouted,
    extraMinutes,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
