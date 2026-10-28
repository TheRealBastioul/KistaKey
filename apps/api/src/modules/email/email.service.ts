// Email adapter (decisions §11.11). The API enqueues; the worker renders and
// delivers over SMTP (Mailpit in dev). The production provider is chosen at
// launch: swap the transport, keep the interface.
import type { Queue } from "bullmq";
import { createTransport } from "nodemailer";
import { JOBS } from "../../jobs/queues";
import { type EmailMessage, renderEmail } from "./email.templates";

/** What services call. Fire-and-forget from the request's point of view. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function createQueueEmailSender(queue: Queue): EmailSender {
  return {
    async send(message) {
      // Remove on completion: the payload can hold a one-time link token.
      await queue.add(JOBS.sendEmail, message, { removeOnComplete: true, removeOnFail: 100 });
    },
  };
}

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Worker side: render a queued message and send it over SMTP. */
export function createSmtpDelivery(config: MailConfig): (message: EmailMessage) => Promise<void> {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
  });
  return async (message) => {
    const { subject, text } = renderEmail(message);
    await transport.sendMail({ from: config.from, to: message.to, subject, text });
  };
}
