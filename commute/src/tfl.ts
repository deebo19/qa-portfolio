/**
 * Minimal typed client for the parts of the TfL Unified API this app uses.
 * Powered by the Transport for London Journey Planner API.
 * Docs: https://api-portal.tfl.gov.uk/
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tflDate, tflTime } from "./time.js";

export const TFL_BASE = "https://api.tfl.gov.uk";

// ---- Response shapes (only the fields we read) ----

export interface AffectedRoute {
  id: string;
  name: string;
  originationName?: string;
  destinationName?: string;
}
export interface AffectedStop {
  id: string;
  commonName: string;
}
export interface Disruption {
  category?: string;
  description?: string;
  additionalInfo?: string;
  affectedRoutes?: AffectedRoute[];
  affectedStops?: AffectedStop[];
  closureText?: string;
}
export interface LineStatusEntry {
  statusSeverity: number;
  statusSeverityDescription: string;
  reason?: string;
  validityPeriods?: { fromDate: string; toDate: string; isNow: boolean }[];
  disruption?: Disruption;
}
export interface LineStatus {
  id: string;
  name: string;
  modeName: string;
  lineStatuses: LineStatusEntry[];
}

export interface Point {
  commonName: string;
  naptanId?: string;
  lat?: number;
  lon?: number;
}
export interface RouteOption {
  name?: string;
  directions?: string[];
  lineIdentifier?: { id: string; name: string };
}
export interface Leg {
  duration: number;
  departureTime?: string;
  arrivalTime?: string;
  mode: { id: string; name: string };
  departurePoint: Point;
  arrivalPoint: Point;
  routeOptions?: RouteOption[];
  instruction?: { summary?: string; detailed?: string };
  disruptions?: Disruption[];
  isDisrupted?: boolean;
  path?: { stopPoints?: { id: string; name: string }[] };
}
export interface Journey {
  startDateTime: string;
  arrivalDateTime: string;
  duration: number;
  legs: Leg[];
}
export interface DisambiguationOption {
  parameterValue: string;
  place?: { commonName?: string };
  matchQuality?: number;
}
export interface Disambiguation {
  matchStatus?: string;
  disambiguationOptions?: DisambiguationOption[];
}
export interface JourneyResults {
  journeys?: Journey[];
  fromLocationDisambiguation?: Disambiguation;
  toLocationDisambiguation?: Disambiguation;
}

export interface JourneyQuery {
  from: string;
  to: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, the time you want to arrive. */
  arriveBy: string;
  modes: readonly string[];
  maxWalkingMinutes: number;
}

/** What the rest of the app needs from TfL. Swappable for fixtures in tests and demos. */
export interface TflSource {
  lineStatus(modes: readonly string[]): Promise<LineStatus[]>;
  journey(q: JourneyQuery): Promise<JourneyResults>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TflClient implements TflSource {
  constructor(
    private readonly appKey: string | undefined,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
    private readonly base: string = TFL_BASE,
  ) {}

  private async get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
    if (this.appKey) url.searchParams.set("app_key", this.appKey);
    const res = await this.fetchImpl(url.toString(), { headers: { accept: "application/json" } });
    // 300 = ambiguous from/to; body still carries disambiguation options.
    if (!res.ok && res.status !== 300) {
      const body = await res.text().catch(() => "");
      throw new Error(`TfL ${res.status} on ${url.pathname}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async lineStatus(modes: readonly string[]): Promise<LineStatus[]> {
    // Status is only published for TfL-run modes; drop the rest so the call doesn't 404.
    const supported = modes.filter((m) => ["tube", "overground", "elizabeth-line", "dlr", "tram", "bus"].includes(m));
    if (supported.length === 0) return [];
    return this.get<LineStatus[]>(`/Line/Mode/${supported.join(",")}/Status`, { detail: "true" });
  }

  async journey(q: JourneyQuery, attempt = 0): Promise<JourneyResults> {
    const enc = (s: string) => encodeURIComponent(s);
    const results = await this.get<JourneyResults>(`/Journey/JourneyResults/${enc(q.from)}/to/${enc(q.to)}`, {
      date: tflDate(q.date),
      time: tflTime(q.arriveBy),
      timeIs: "Arriving",
      mode: q.modes.join(","),
      maxWalkingMinutes: String(q.maxWalkingMinutes),
      journeyPreference: "LeastTime",
    });
    if (results.journeys && results.journeys.length > 0) return results;

    // TfL answers a free-text place with a list of candidates. Take the best one and retry once.
    const from = bestMatch(results.fromLocationDisambiguation) ?? q.from;
    const to = bestMatch(results.toLocationDisambiguation) ?? q.to;
    if (attempt === 0 && (from !== q.from || to !== q.to)) {
      return this.journey({ ...q, from, to }, 1);
    }
    throw new Error(
      `TfL could not plan "${q.from}" to "${q.to}". Try a full station name (e.g. "Bank Underground Station"), a postcode, or "lat,lon".`,
    );
  }
}

function bestMatch(d?: Disambiguation): string | undefined {
  const opts = d?.disambiguationOptions;
  if (!opts || opts.length === 0) return undefined;
  const sorted = [...opts].sort((a, b) => (b.matchQuality ?? 0) - (a.matchQuality ?? 0));
  return sorted[0]?.parameterValue;
}

/**
 * Reads recorded responses from a folder:
 *   status.json            -> lineStatus()
 *   journey-today.json     -> journey() for the date being checked
 *   journey-baseline.json  -> journey() for any other date (the "usual route")
 */
export class FixtureTfl implements TflSource {
  constructor(
    private readonly dir: string,
    private readonly todayDate: string,
  ) {}
  private async read<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(join(this.dir, name), "utf8")) as T;
  }
  lineStatus(): Promise<LineStatus[]> {
    return this.read<LineStatus[]>("status.json");
  }
  journey(q: JourneyQuery): Promise<JourneyResults> {
    return this.read<JourneyResults>(q.date === this.todayDate ? "journey-today.json" : "journey-baseline.json");
  }
}

/** Public, line-level identifiers used on a journey (e.g. "northern", "thameslink", bus "43"). */
export function linesUsed(j: Journey): string[] {
  const ids = new Set<string>();
  for (const leg of j.legs) {
    if (leg.mode.id === "walking") continue;
    const id = leg.routeOptions?.[0]?.lineIdentifier?.id;
    if (id) ids.add(id.toLowerCase());
  }
  return [...ids];
}

/** Short one-line description: "Northern line Finchley Central → Bank (32 min)". */
export function describeLeg(leg: Leg): string {
  const line = leg.routeOptions?.[0]?.lineIdentifier?.name;
  const mode = leg.mode.id === "walking" ? "Walk" : line ? `${line}${leg.mode.id === "tube" ? " line" : ""}` : leg.mode.name;
  return `${mode}: ${leg.departurePoint.commonName} → ${leg.arrivalPoint.commonName} (${leg.duration} min)`;
}
