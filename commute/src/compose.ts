/**
 * Turns an Impact into the message that gets sent.
 * With ANTHROPIC_API_KEY set, Claude writes it from the facts below (structured output).
 * Without a key, or if the call fails, a plain template is used so the alert still goes out.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Impact } from "./impact.js";
import { describeLeg, type Journey } from "./tfl.js";
import { hhmmFromIso, prettyDate } from "./time.js";

export const MODEL = "claude-opus-5-5";

export const AlertSchema = z.object({
  /** One line, under 60 characters, e.g. "Northern line part suspended: use Thameslink". */
  headline: z.string(),
  /** The full message, plain text, 3 to 6 short lines. */
  body: z.string(),
  /** HH:MM to leave home, or null if unchanged / unknown. */
  leaveBy: z.string().nullable(),
  /** Line names to avoid today. */
  avoid: z.array(z.string()),
});
export type Alert = z.infer<typeof AlertSchema>;

export interface Composed {
  text: string;
  source: "claude" | "template";
  alert: Alert;
}

/** Everything the writer (human or model) needs, as plain text. */
export function facts(impact: Impact): string {
  const lines: string[] = [];
  const t = impact.trip;
  lines.push(`Trip: ${t.name}, ${t.from} to ${t.to}, needs to arrive by ${t.arriveBy} on ${prettyDate(impact.date)}.`);
  lines.push(`Overall: ${impact.affected ? `affected (${impact.severity})` : "not affected"}.`);
  if (impact.problems.length) {
    lines.push("Line status on the usual route:");
    for (const p of impact.problems) lines.push(`- ${p.lineName}: ${p.status}${p.reason ? ` — ${p.reason}` : ""}`);
  } else {
    lines.push(`Lines on the usual route (${impact.usualLines.join(", ") || "unknown"}) report good service.`);
  }
  if (impact.usual) lines.push(`Usual route (${impact.usual.duration} min):\n${routeText(impact.usual)}`);
  if (impact.today) {
    lines.push(
      `Best route today per TfL planner (${impact.today.duration} min, leave ${hhmmFromIso(impact.today.startDateTime)}, arrive ${hhmmFromIso(impact.today.arrivalDateTime)}):\n${routeText(impact.today)}`,
    );
  }
  if (impact.rerouted) lines.push("The planner has moved you off your usual lines.");
  if (impact.extraMinutes > 0) lines.push(`Today's route is ${impact.extraMinutes} min longer than usual.`);
  return lines.join("\n");
}

function routeText(j: Journey): string {
  return j.legs.map((l) => `  • ${describeLeg(l)}`).join("\n");
}

export function templateAlert(impact: Impact): Alert {
  const t = impact.trip;
  const today = impact.today;
  const leaveBy = today ? hhmmFromIso(today.startDateTime) : null;
  if (!impact.affected) {
    return {
      headline: `${t.name}: all clear`,
      body: `Good service on ${impact.usualLines.join(", ") || "your route"}.${leaveBy ? ` Leave by ${leaveBy} to arrive by ${t.arriveBy}.` : ""}`,
      leaveBy,
      avoid: [],
    };
  }
  const worst = impact.problems[0];
  const headline = worst
    ? `${t.name}: ${worst.lineName} ${worst.status.toLowerCase()}`
    : `${t.name}: route changed today`;
  const body: string[] = [];
  for (const p of impact.problems) body.push(`${p.lineName}: ${p.status}${p.reason ? `. ${p.reason}` : ""}`);
  if (today) {
    body.push(`Alternative (${today.duration} min):`);
    body.push(routeText(today));
    body.push(`Leave by ${leaveBy} to arrive by ${t.arriveBy}.`);
  }
  if (impact.extraMinutes > 0) body.push(`About ${impact.extraMinutes} min longer than usual.`);
  return { headline, body: body.join("\n"), leaveBy, avoid: impact.problems.map((p) => p.lineName) };
}

export function render(alert: Alert, impact: Impact): string {
  const icon = impact.affected ? (impact.severity === "severe" ? "🔴" : "🟠") : "🟢";
  const parts = [`${icon} ${alert.headline}`, "", alert.body.trim()];
  if (alert.avoid.length) parts.push("", `Avoid today: ${alert.avoid.join(", ")}`);
  parts.push("", `${prettyDate(impact.date)} · Powered by the Transport for London Journey Planner API`);
  return parts.join("\n");
}

const SYSTEM = `You write a short morning transport alert for one London commuter. You are given verified facts from TfL; use only those facts and never invent lines, stations, times or reasons.
Write like a sharp friend who checked the apps for them: lead with whether they are affected and why, then the alternative route from the planner as a few short lines, then the time to leave. British English, plain text, no markdown, no emoji, no preamble. Keep the body to at most 6 short lines. If the trip is not affected, say so in one line.`;

export interface ComposeOptions {
  anthropicApiKey?: string;
  /** Test seam: a pre-built client (wins over the key). */
  client?: Anthropic;
}

export async function compose(impact: Impact, opts: ComposeOptions = {}): Promise<Composed> {
  if (!opts.anthropicApiKey && !opts.client) {
    const alert = templateAlert(impact);
    return { text: render(alert, impact), source: "template", alert };
  }
  try {
    const client = opts.client ?? new Anthropic({ apiKey: opts.anthropicApiKey });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(AlertSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: facts(impact) }],
    });
    const parsed = response.stop_reason === "refusal" ? null : response.parsed_output;
    if (!parsed) throw new Error(`no structured output (stop_reason=${response.stop_reason})`);
    return { text: render(parsed, impact), source: "claude", alert: parsed };
  } catch (err) {
    console.error(`Claude composition failed, using template: ${(err as Error).message}`);
    const alert = templateAlert(impact);
    return { text: render(alert, impact), source: "template", alert };
  }
}
