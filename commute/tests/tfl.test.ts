import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { TflClient, describeLeg, linesUsed, type JourneyResults } from "../src/tfl.js";
import { fixtures } from "./helpers.js";

function fakeFetch(handler: (url: URL) => { status: number; body: unknown }) {
  const calls: URL[] = [];
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}

const query = {
  from: "Finchley Central",
  to: "Bank",
  date: "2026-10-07",
  arriveBy: "09:00",
  modes: ["tube", "bus"],
  maxWalkingMinutes: 20,
};

describe("TflClient", () => {
  it("builds the journey URL with date, arriving time, modes and app key", async () => {
    const today = JSON.parse(await readFile(`${fixtures("disrupted")}/journey-today.json`, "utf8"));
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: today }));
    const client = new TflClient("secret-key", fetchImpl);
    const res = await client.journey(query);
    expect(res.journeys).toHaveLength(1);
    const url = calls[0]!;
    expect(url.pathname).toBe("/Journey/JourneyResults/Finchley%20Central/to/Bank");
    expect(url.searchParams.get("date")).toBe("20261007");
    expect(url.searchParams.get("time")).toBe("0900");
    expect(url.searchParams.get("timeIs")).toBe("Arriving");
    expect(url.searchParams.get("mode")).toBe("tube,bus");
    expect(url.searchParams.get("app_key")).toBe("secret-key");
  });

  it("retries once with TfL's best disambiguation match", async () => {
    const today = JSON.parse(await readFile(`${fixtures("disrupted")}/journey-today.json`, "utf8"));
    const ambiguous: JourneyResults = {
      fromLocationDisambiguation: {
        matchStatus: "list",
        disambiguationOptions: [
          { parameterValue: "1000080", place: { commonName: "Finchley Road" }, matchQuality: 500 },
          { parameterValue: "1000083", place: { commonName: "Finchley Central Underground Station" }, matchQuality: 900 },
        ],
      },
      toLocationDisambiguation: { matchStatus: "identified" },
    };
    const { fetchImpl, calls } = fakeFetch((url) => (url.pathname.includes("1000083") ? { status: 200, body: today } : { status: 300, body: ambiguous }));
    const res = await new TflClient(undefined, fetchImpl).journey(query);
    expect(res.journeys).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.pathname).toBe("/Journey/JourneyResults/1000083/to/Bank");
    expect(calls[1]!.searchParams.has("app_key")).toBe(false);
  });

  it("gives a helpful error when a place can't be resolved", async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 300, body: { fromLocationDisambiguation: { matchStatus: "empty" } } }));
    await expect(new TflClient(undefined, fetchImpl).journey(query)).rejects.toThrow(/could not plan "Finchley Central" to "Bank"/);
  });

  it("surfaces HTTP errors with the status code", async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 429, body: { message: "slow down" } }));
    await expect(new TflClient(undefined, fetchImpl).lineStatus(["tube"])).rejects.toThrow(/TfL 429/);
  });

  it("fetches TfL modes and National Rail status separately and merges them", async () => {
    const tube = [{ id: "district", name: "District", modeName: "tube", lineStatuses: [] }];
    const rail = [{ id: "c2c", name: "c2c", modeName: "national-rail", lineStatuses: [] }];
    const { fetchImpl, calls } = fakeFetch((url) => ({ status: 200, body: url.pathname.includes("national-rail") ? rail : tube }));
    const statuses = await new TflClient(undefined, fetchImpl).lineStatus(["tube", "national-rail", "elizabeth-line"]);
    expect(calls.map((c) => c.pathname).sort()).toEqual(["/Line/Mode/national-rail/Status", "/Line/Mode/tube,elizabeth-line/Status"]);
    expect(calls[0]!.searchParams.get("detail")).toBe("true");
    expect(statuses.map((s) => s.id)).toEqual(["district", "c2c"]);
  });

  it("skips the National Rail call when no trip uses it", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: [] }));
    await new TflClient(undefined, fetchImpl).lineStatus(["tube"]);
    expect(calls.map((c) => c.pathname)).toEqual(["/Line/Mode/tube/Status"]);
  });

  it("carries on with TfL modes if the National Rail status call fails", async () => {
    const tube = [{ id: "district", name: "District", modeName: "tube", lineStatuses: [] }];
    const { fetchImpl } = fakeFetch((url) => (url.pathname.includes("national-rail") ? { status: 500, body: {} } : { status: 200, body: tube }));
    const statuses = await new TflClient(undefined, fetchImpl).lineStatus(["tube", "national-rail"]);
    expect(statuses.map((s) => s.id)).toEqual(["district"]);
  });
});

describe("journey helpers", () => {
  it("lists the lines a journey rides, ignoring walking", async () => {
    const today = JSON.parse(await readFile(`${fixtures("disrupted")}/journey-today.json`, "utf8")) as JourneyResults;
    expect(linesUsed(today.journeys![0]!)).toEqual(["northern", "victoria", "central"]);
  });

  it("describes a leg in one line", async () => {
    const today = JSON.parse(await readFile(`${fixtures("disrupted")}/journey-today.json`, "utf8")) as JourneyResults;
    const legs = today.journeys![0]!.legs;
    expect(describeLeg(legs[0]!)).toBe("Walk: Home → Finchley Central Underground Station (4 min)");
    expect(describeLeg(legs[1]!)).toBe("Northern line: Finchley Central Underground Station → Euston Underground Station (22 min)");
  });

  it("labels a National Rail leg by operator", async () => {
    const base = JSON.parse(await readFile(`${fixtures("c2c")}/journey-baseline.json`, "utf8")) as JourneyResults;
    expect(describeLeg(base.journeys![0]!.legs[1]!)).toBe("c2c train: Upminster Rail Station → Fenchurch Street Rail Station (25 min)");
    expect(linesUsed(base.journeys![0]!)).toEqual(["c2c"]);
  });
});
