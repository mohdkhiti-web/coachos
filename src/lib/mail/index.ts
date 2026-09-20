import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { newId } from "@/lib/ids";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Transports (ARCHITECTURE.md §5.4):
 *  - resend:  production. Requires a verified sending domain (SPF/DKIM/DMARC).
 *  - console: development default. Prints the full email — including verify/reset links — to the
 *             server terminal so every auth flow is testable without an email account.
 *  - file:    automated tests. Writes JSON files that Playwright reads.
 */
export async function sendMail(mail: Mail): Promise<void> {
  switch (env.MAIL_TRANSPORT) {
    case "resend": {
      const resend = new Resend(env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: env.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (error) {
        logger.error({ err: error.message }, "mail.resend_failed");
        throw new Error("Failed to send email");
      }
      return;
    }
    case "file": {
      // Test-only transport writing under a configured directory; keep the bundler from tracing the whole project.
      const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.MAIL_FILE_DIR);
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${newId()}.json`);
      await writeFile(file, JSON.stringify({ ...mail, sentAt: new Date().toISOString() }, null, 2));
      return;
    }
    case "console": {
      const bar = "─".repeat(72);
      // Intentionally console (not pino): this output is meant for a developer to read and click.
      console.log(
        `\n${bar}\n✉  DEV MAIL (not actually sent)\nTo:      ${mail.to}\nSubject: ${mail.subject}\n${bar}\n${mail.text}\n${bar}\n`,
      );
      return;
    }
  }
}

/**
 * Fire-and-forget wrapper for emails whose failure must not fail the user's request
 * (also avoids response-time differences that leak whether an account exists).
 */
export function sendMailInBackground(mail: Mail): void {
  sendMail(mail).catch((err: unknown) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "mail.send_failed");
  });
}
