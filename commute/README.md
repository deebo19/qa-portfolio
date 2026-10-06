# London commute alerts

Every weekday morning this checks your commute against live Transport for London data and sends you a Telegram message **only if you're affected**, with the best alternative route and the time to leave. Quiet on good days.

```
🔴 Commute: Northern part suspended

Northern: Part Suspended. No service between Camden Town and Kennington via Bank
while we fix a signal failure at Euston.
Alternative (49 min):
  • Walk: Home → Finchley Central Underground Station (4 min)
  • Northern line: Finchley Central → Euston (22 min)
  • Victoria line: Euston → Oxford Circus (7 min)
  • Central line: Oxford Circus → Bank (10 min)
  • Walk: Bank → Work (2 min)
Leave by 08:03 to arrive by 09:00.
About 11 min longer than usual.

Avoid today: Northern
```

## How it decides you're affected

1. Plans your trip for **today** with TfL's journey planner (which already routes around closures).
2. Plans the same trip **a week ahead** to learn your usual route from the timetable alone. Or you set `usualLines` yourself.
3. Pulls live line status and checks every line on the usual route.
4. You're affected if a usual line is suspended, closed, severely delayed or similar, if the planner has moved you onto different lines, or if today's journey is 10+ minutes longer. Minor delays count as a minor alert.
5. With an Anthropic key, Claude writes the message from those verified facts only (structured output). Without one, or if the call fails, a plain template is sent instead so the alert never silently disappears.

## Setup (about 15 minutes)

1. **TfL key** (free): register at https://api-portal.tfl.gov.uk/, subscribe to the "500 requests per min" product, copy the primary key.
2. **Telegram bot**: message [@BotFather](https://t.me/BotFather), send `/newbot`, keep the token. Then send your new bot any message and open `https://api.telegram.org/bot<TOKEN>/getUpdates`; the number at `message.chat.id` is your chat id.
3. **Anthropic key** (optional): https://console.anthropic.com/.
4. Copy `commute.config.example.json` to `commute.config.json` and fill it in:

   | Field | Meaning |
   |---|---|
   | `telegramChatId` | Your chat id from step 2. Safe to commit; the bot token is the secret. |
   | `notifyWhenClear` | `true` to get a short "all clear" every morning. Default `false`. |
   | `trips[].name` | Shown in the message, e.g. `Commute`. |
   | `trips[].from` / `to` | Station name, postcode or `lat,lon`. Full names like `Bank Underground Station` resolve best. |
   | `trips[].arriveBy` | `HH:MM`, London time. |
   | `trips[].days` | `mon`..`sun`. Default Monday to Friday. |
   | `trips[].modes` | Any of `tube`, `overground`, `elizabeth-line`, `dlr`, `tram`, `bus`, `national-rail`, `river-bus`, `cable-car`. |
   | `trips[].maxWalkingMinutes` | Default 20. |
   | `trips[].usualLines` | Optional, e.g. `["northern"]`. Skips the week-ahead plan. |

   Add more trips to the list for a second commute, the gym, or anywhere else you go on a schedule. Calendar-driven trips are the next step on the roadmap.

   **National Rail (c2c, Thameslink, Southeastern, Greater Anglia and others).** Put `national-rail` in `modes`. TfL's planner then routes over those trains and names the operator on each leg (`c2c`), and the status check fetches the national-rail lines from TfL as well. TfL's National Rail status is thinner than its Tube status, so a c2c problem that TfL hasn't picked up can still slip through; if that happens the planner's reroute or a longer journey still triggers an alert. The fuller Darwin feed from the Rail Data Marketplace is on the roadmap. The example config is a c2c commute from Upminster to Fenchurch Street.

5. Run it locally:

   ```bash
   npm install
   npm run demo                 # recorded disrupted day, prints the message, no keys needed
   TFL_APP_KEY=... npm run morning:dry           # live TfL, prints instead of sending
   TFL_APP_KEY=... TELEGRAM_BOT_TOKEN=... npm run morning -- --force   # live, sends now
   ```

6. **Schedule it** with the GitHub Actions workflow at `.github/workflows/commute-morning.yml`. Add `TFL_APP_KEY`, `TELEGRAM_BOT_TOKEN` and optionally `ANTHROPIC_API_KEY` as repository secrets, commit `commute.config.json`, then use "Run workflow" once with *force* ticked to confirm the message arrives. After that it runs itself at about 06:15 London time on weekdays.

## Flags

```
--dry-run          print instead of sending
--force            send even when nothing is affected
--date YYYY-MM-DD  check a different day
--fixture <dir>    use recorded TfL responses (see tests/fixtures)
--config <path>    default commute.config.json
```

## Tests

```bash
npm test          # vitest: config, time, TfL client, impact rules, message, full run
npm run typecheck
```

Fixtures in `tests/fixtures/disrupted` (Northern line part suspended, planner reroutes via Victoria and Central), `tests/fixtures/c2c` (c2c severe delays, planner falls back to the District line) and `tests/fixtures/clean` (good service on the usual route, severe delays on a line you don't use) pin down the "affected" rules and the no-spam rule. Live calls are only made by the real run. Try `npx tsx src/run.ts --dry-run --fixture tests/fixtures/c2c --date 2026-10-07` to see the c2c message.

## Layout

```
src/config.ts          config schema and env secrets
src/time.ts            London dates and TfL date formats
src/tfl.ts             TfL client (status, journey planner with disambiguation retry) and fixture reader
src/impact.ts          usual route vs today, line status classification
src/compose.ts         Claude structured output, template fallback, rendering
src/notify/telegram.ts Telegram sender and console sender
src/run.ts             entry point
```

## Roadmap

- Calendar trips: read a private ICS feed, keep today's events with a location, plan each as a trip.
- National Rail via the Rail Data Marketplace (Thameslink, Southeastern and friends).
- Evening check for the way home; engineering-works preview the night before.
- Native push (ntfy or a small PWA) as an alternative to Telegram.

## Moving this to its own repository

The folder is self-contained. Copy `commute/` to the new repo root, move `.github/workflows/commute-morning.yml` to `.github/workflows/`, and delete the two `working-directory` lines and the `commute/` prefix in `cache-dependency-path`.

---

Powered by the Transport for London Journey Planner API. Not affiliated with or endorsed by TfL.
