import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Development provider: prints the message (and any links) to the server log. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage) {
    logger.info("email", `[console email] to=${message.to} subject="${message.subject}"`);
    // Print the body separately so reset links are easy to copy in dev.
    console.log(`\n──────── EMAIL to ${message.to} ────────\n${message.subject}\n\n${message.text}\n────────────────────────────────────\n`);
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  switch (env.EMAIL_PROVIDER) {
    case "console":
    default:
      provider = new ConsoleEmailProvider();
  }
  return provider;
}

export function setEmailProvider(next: EmailProvider) {
  provider = next;
}

export async function sendEmail(message: EmailMessage) {
  const from = env.EMAIL_FROM;
  try {
    await getEmailProvider().send({ ...message, text: message.text });
    logger.debug("email", "sent", { from, to: message.to });
  } catch (err) {
    logger.error("email", "failed to send", { to: message.to, error: String(err) });
    throw err;
  }
}
