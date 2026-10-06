import { readFile } from "node:fs/promises";
import { z } from "zod";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

/** TfL journey planner mode ids. */
export const MODES = [
  "tube",
  "overground",
  "elizabeth-line",
  "dlr",
  "tram",
  "bus",
  "national-rail",
  "river-bus",
  "cable-car",
] as const;
export type Mode = (typeof MODES)[number];

const TimeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM in 24h time");

export const TripSchema = z.object({
  /** Shown in the message, e.g. "Commute" or "Dentist". */
  name: z.string().min(1),
  /** Station name, postcode, or "lat,lon". Anything TfL's planner accepts. */
  from: z.string().min(1),
  to: z.string().min(1),
  /** When you need to be there, HH:MM, Europe/London. */
  arriveBy: TimeString,
  days: z.array(z.enum(DAYS)).min(1).default(["mon", "tue", "wed", "thu", "fri"]),
  /** Modes the planner may use. Walking is always allowed as a connector. */
  modes: z.array(z.enum(MODES)).min(1).default(["tube", "overground", "elizabeth-line", "dlr", "bus"]),
  maxWalkingMinutes: z.number().int().min(0).max(120).default(20),
  /**
   * Optional: the lines you normally ride, e.g. ["northern", "central"].
   * If omitted the usual route is worked out by planning the same trip a week ahead,
   * which uses the timetable without today's live disruptions.
   */
  usualLines: z.array(z.string().min(1)).optional(),
});
export type Trip = z.infer<typeof TripSchema>;

export const ConfigSchema = z.object({
  $comment: z.string().optional(),
  telegramChatId: z.string().min(1),
  /** Send an "all clear" message on days with no disruption. Default: stay silent. */
  notifyWhenClear: z.boolean().default(false),
  trips: z.array(TripSchema).min(1),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid commute config:\n${issues}`);
  }
  return result.data;
}

export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read ${path}. Copy commute.config.example.json to commute.config.json and edit it. (${(err as Error).message})`,
    );
  }
  return parseConfig(JSON.parse(text));
}

export interface Secrets {
  tflAppKey?: string;
  telegramBotToken?: string;
  anthropicApiKey?: string;
}

export function secretsFromEnv(env: NodeJS.ProcessEnv = process.env): Secrets {
  return {
    tflAppKey: env.TFL_APP_KEY || undefined,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
  };
}
