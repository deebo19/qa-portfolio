import { describe, expect, it } from "vitest";
import type { Trip } from "../src/config.js";
import { run } from "../src/run.js";
import type { JourneyResults, TflSource } from "../src/tfl.js";
import { MemoryNotifier, TODAY, clean, config, disrupted, trip } from "./helpers.js";

const base = (overrides: Partial<Parameters<typeof run>[0]> = {}) => {
  const notifier = new MemoryNotifier();
  return { opts: { config: config(), secrets: {}, tfl: disrupted(), notifier, date: TODAY, ...overrides }, notifier };
};

describe("morning run", () => {
  it("sends one alert for an affected commute", async () => {
    const { opts, notifier } = base();
    const res = await run(opts);
    expect(res.sent).toHaveLength(1);
    expect(res.sent[0]).toMatchObject({ trip: "Commute", source: "template" });
    expect(notifier.sent[0]).toContain("Northern part suspended");
  });

  it("sends nothing on a clean day (no spam)", async () => {
    const { opts, notifier } = base({ tfl: clean() });
    const res = await run(opts);
    expect(notifier.sent).toEqual([]);
    expect(res.skipped).toEqual(["Commute: not affected"]);
  });

  it("sends an all-clear when the user opted in", async () => {
    const { opts, notifier } = base({ tfl: clean(), config: config({ notifyWhenClear: true }) });
    await run(opts);
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toContain("🟢 Commute: all clear");
  });

  it("skips trips not due today", async () => {
    const weekend = config({ trips: [{ ...trip, days: ["sat", "sun"] }] });
    const { opts, notifier } = base({ config: weekend });
    const res = await run(opts);
    expect(notifier.sent).toEqual([]);
    expect(res.checked).toEqual([]);
    expect(res.skipped).toEqual(["Commute: not due on wed"]);
  });

  it("checks each trip independently", async () => {
    const gym: Trip = { ...trip, name: "Gym", from: "Home", to: "Brixton", usualLines: ["victoria"] };
    const two = config({ trips: [trip, gym] });
    // Same live status for both; the gym trip only rides the Victoria line, which is fine today.
    const victoriaOnly: JourneyResults = {
      journeys: [
        {
          startDateTime: "2026-10-07T08:30:00",
          arrivalDateTime: "2026-10-07T08:50:00",
          duration: 20,
          legs: [
            {
              duration: 20,
              mode: { id: "tube", name: "tube" },
              departurePoint: { commonName: "Euston Underground Station" },
              arrivalPoint: { commonName: "Brixton Underground Station" },
              routeOptions: [{ lineIdentifier: { id: "victoria", name: "Victoria" } }],
            },
          ],
        },
      ],
    };
    const tfl: TflSource = {
      lineStatus: () => disrupted().lineStatus(),
      journey: async (q) => (q.to === "Brixton" ? victoriaOnly : disrupted().journey(q)),
    };
    const { opts, notifier } = base({ config: two, tfl });
    const res = await run(opts);
    expect(res.checked.map((i) => `${i.trip.name}=${i.affected}`)).toEqual(["Commute=true", "Gym=false"]);
    expect(notifier.sent).toHaveLength(1);
  });

  it("--force sends even when clear", async () => {
    const { opts, notifier } = base({ tfl: clean(), force: true });
    await run(opts);
    expect(notifier.sent).toHaveLength(1);
  });
});
