/**
 * Sends a plain-text message through a Telegram bot.
 * Create the bot with @BotFather, then message it once and read your chat id from
 * https://api.telegram.org/bot<TOKEN>/getUpdates
 */
export interface Notifier {
  send(text: string): Promise<void>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TelegramNotifier implements Notifier {
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
  ) {}

  async send(text: string): Promise<void> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Telegram ${res.status}: ${body.slice(0, 300)}`);
    }
  }
}

/** Prints instead of sending. Used by --dry-run. */
export class ConsoleNotifier implements Notifier {
  async send(text: string): Promise<void> {
    console.log("\n----- message (not sent) -----\n" + text + "\n------------------------------\n");
  }
}
