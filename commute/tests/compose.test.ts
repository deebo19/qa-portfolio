import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { compose, facts, templateAlert } from "../src/compose.js";
import { assessTrip } from "../src/impact.js";
import { TODAY, clean, disrupted, trip } from "./helpers.js";

describe("template message", () => {
  it("names the problem, the alternative and when to leave", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    const { text, source } = await compose(impact);
    expect(source).toBe("template");
    expect(text).toContain("🔴 Commute: Northern part suspended");
    expect(text).toContain("signal failure at Euston");
    expect(text).toContain("Victoria line: Euston Underground Station → Oxford Circus Underground Station");
    expect(text).toContain("Leave by 08:03 to arrive by 09:00");
    expect(text).toContain("About 11 min longer than usual");
    expect(text).toContain("Avoid today: Northern");
    expect(text).toContain("Powered by the Transport for London Journey Planner API");
  });

  it("writes a short all-clear when nothing is wrong", async () => {
    const impact = await assessTrip(clean(), trip, TODAY);
    const alert = templateAlert(impact);
    expect(alert.headline).toBe("Commute: all clear");
    expect(alert.body).toContain("Good service on northern");
    expect(alert.avoid).toEqual([]);
  });

  it("gives the model only verified facts", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    const f = facts(impact);
    expect(f).toContain("Northern: Part Suspended");
    expect(f).toContain("Usual route (38 min)");
    expect(f).toContain("Best route today per TfL planner (49 min, leave 08:03, arrive 08:52)");
    expect(f).toContain("The planner has moved you off your usual lines.");
  });
});

describe("Claude composition", () => {
  const fakeClient = (parse: () => Promise<unknown>) => ({ messages: { parse } }) as unknown as Anthropic;

  it("renders the structured output the model returns", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    const client = fakeClient(async () => ({
      stop_reason: "end_turn",
      parsed_output: { headline: "Northern suspended: go via Euston", body: "Line 1\nLine 2", leaveBy: "08:03", avoid: ["Northern"] },
    }));
    const { text, source } = await compose(impact, { client });
    expect(source).toBe("claude");
    expect(text.startsWith("🔴 Northern suspended: go via Euston")).toBe(true);
    expect(text).toContain("Line 1\nLine 2");
  });

  it("falls back to the template if the call fails, so the alert still goes out", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    const client = fakeClient(async () => {
      throw new Error("boom");
    });
    const { text, source } = await compose(impact, { client });
    expect(source).toBe("template");
    expect(text).toContain("Leave by 08:03");
  });

  it("falls back to the template on a refusal", async () => {
    const impact = await assessTrip(disrupted(), trip, TODAY);
    const client = fakeClient(async () => ({ stop_reason: "refusal", parsed_output: null }));
    expect((await compose(impact, { client })).source).toBe("template");
  });
});
