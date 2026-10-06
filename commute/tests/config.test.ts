import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseConfig, secretsFromEnv } from "../src/config.js";

describe("config", () => {
  it("accepts the shipped example", async () => {
    const raw = JSON.parse(await readFile(new URL("../commute.config.example.json", import.meta.url), "utf8"));
    const c = parseConfig(raw);
    expect(c.trips).toHaveLength(1);
    expect(c.notifyWhenClear).toBe(false);
  });

  it("fills defaults for days, modes and walking", () => {
    const c = parseConfig({ telegramChatId: "1", trips: [{ name: "x", from: "a", to: "b", arriveBy: "09:00" }] });
    expect(c.trips[0]?.days).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(c.trips[0]?.modes).toContain("tube");
    expect(c.trips[0]?.maxWalkingMinutes).toBe(20);
  });

  it("rejects a bad arrive-by time with a readable message", () => {
    expect(() => parseConfig({ telegramChatId: "1", trips: [{ name: "x", from: "a", to: "b", arriveBy: "9am" }] })).toThrow(
      /trips\.0\.arriveBy: expected HH:MM/,
    );
  });

  it("rejects an empty trip list", () => {
    expect(() => parseConfig({ telegramChatId: "1", trips: [] })).toThrow(/trips/);
  });

  it("reads secrets from the environment and treats empty as unset", () => {
    const s = secretsFromEnv({ TFL_APP_KEY: "k", TELEGRAM_BOT_TOKEN: "", ANTHROPIC_API_KEY: undefined });
    expect(s).toEqual({ tflAppKey: "k", telegramBotToken: undefined, anthropicApiKey: undefined });
  });
});
