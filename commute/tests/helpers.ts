import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseConfig, type Config, type Trip } from "../src/config.js";
import { FixtureTfl } from "../src/tfl.js";
import type { Notifier } from "../src/notify/telegram.js";

const here = dirname(fileURLToPath(import.meta.url));
export const fixtures = (name: string) => join(here, "fixtures", name);

/** A Wednesday with a recorded Northern line suspension. */
export const TODAY = "2026-10-07";

export const trip: Trip = {
  name: "Commute",
  from: "Finchley Central Underground Station",
  to: "Bank Underground Station",
  arriveBy: "09:00",
  days: ["mon", "tue", "wed", "thu", "fri"],
  modes: ["tube", "overground", "elizabeth-line", "dlr", "bus"],
  maxWalkingMinutes: 20,
};

export function config(overrides: Partial<Config> = {}): Config {
  return parseConfig({ telegramChatId: "1", trips: [trip], ...overrides });
}

export const disrupted = () => new FixtureTfl(fixtures("disrupted"), TODAY);
export const clean = () => new FixtureTfl(fixtures("clean"), TODAY);
/** c2c severe delays; planner falls back to the District line. */
export const c2c = () => new FixtureTfl(fixtures("c2c"), TODAY);

export const c2cTrip: Trip = {
  name: "Commute",
  from: "Upminster Rail Station",
  to: "Fenchurch Street Rail Station",
  arriveBy: "09:00",
  days: ["mon", "tue", "wed", "thu", "fri"],
  modes: ["national-rail", "tube", "overground", "elizabeth-line", "dlr", "bus"],
  maxWalkingMinutes: 20,
};

export class MemoryNotifier implements Notifier {
  sent: string[] = [];
  async send(text: string) {
    this.sent.push(text);
  }
}
