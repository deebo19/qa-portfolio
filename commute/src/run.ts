/**
 * Entry point. Checks every trip due today and sends an alert for the affected ones.
 *
 *   npm run morning                      live TfL, sends to Telegram
 *   npm run morning -- --dry-run         live TfL, prints instead of sending
 *   npm run demo                         recorded disrupted day, prints
 *   --fixture <dir>   use recorded TfL responses instead of the live API
 *   --date YYYY-MM-DD pretend it is this date (default: today in London)
 *   --force           send even if nothing is affected
 *   --config <path>   default commute.config.json
 */
import { parseArgs } from "node:util";
import { compose } from "./compose.js";
import { loadConfig, secretsFromEnv, type Config, type Secrets } from "./config.js";
import { assessTrip, type Impact } from "./impact.js";
import { ConsoleNotifier, TelegramNotifier, type Notifier } from "./notify/telegram.js";
import { FixtureTfl, TflClient, type TflSource } from "./tfl.js";
import { dayOf, londonDate, londonTime } from "./time.js";

export interface RunOptions {
  config: Config;
  secrets: Secrets;
  tfl: TflSource;
  notifier: Notifier;
  date: string;
  force?: boolean;
}

export interface RunResult {
  date: string;
  checked: Impact[];
  sent: { trip: string; source: "claude" | "template"; text: string }[];
  skipped: string[];
}

export async function run(o: RunOptions): Promise<RunResult> {
  const day = dayOf(o.date);
  const result: RunResult = { date: o.date, checked: [], sent: [], skipped: [] };

  for (const trip of o.config.trips) {
    if (!trip.days.includes(day)) {
      result.skipped.push(`${trip.name}: not due on ${day}`);
      continue;
    }
    const impact = await assessTrip(o.tfl, trip, o.date);
    result.checked.push(impact);
    const shouldSend = impact.affected || o.config.notifyWhenClear || o.force;
    if (!shouldSend) {
      result.skipped.push(`${trip.name}: not affected`);
      continue;
    }
    const composed = await compose(impact, { anthropicApiKey: o.secrets.anthropicApiKey });
    await o.notifier.send(composed.text);
    result.sent.push({ trip: trip.name, source: composed.source, text: composed.text });
  }
  return result;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      fixture: { type: "string" },
      date: { type: "string" },
      force: { type: "boolean", default: false },
      config: { type: "string", default: "commute.config.json" },
    },
  });

  const date = values.date ?? londonDate();
  const secrets = secretsFromEnv();
  const config = await loadConfig(values.config!);
  const tfl: TflSource = values.fixture ? new FixtureTfl(values.fixture, date) : new TflClient(secrets.tflAppKey);

  let notifier: Notifier;
  if (values["dry-run"]) notifier = new ConsoleNotifier();
  else if (secrets.telegramBotToken) notifier = new TelegramNotifier(secrets.telegramBotToken, config.telegramChatId);
  else throw new Error("TELEGRAM_BOT_TOKEN is not set. Set it, or pass --dry-run.");

  console.log(`Commute check for ${date} (${dayOf(date)}), London time ${londonTime()}${values.fixture ? `, fixtures from ${values.fixture}` : ""}`);
  const res = await run({ config, secrets, tfl, notifier, date, force: values.force });

  for (const i of res.checked) {
    console.log(
      `• ${i.trip.name}: ${i.affected ? `AFFECTED (${i.severity})` : "ok"}; usual lines ${i.usualLines.join(", ") || "?"}; problems ${i.problems.map((p) => `${p.lineName}=${p.status}`).join(", ") || "none"}; rerouted=${i.rerouted}; extra=${i.extraMinutes}min`,
    );
  }
  for (const s of res.skipped) console.log(`• ${s}`);
  console.log(`Sent ${res.sent.length} message(s)${res.sent.length ? ` (${res.sent.map((s) => s.source).join(", ")})` : ""}.`);
}

// Only run when executed directly, not when imported by tests.
if (process.argv[1] && /run\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
