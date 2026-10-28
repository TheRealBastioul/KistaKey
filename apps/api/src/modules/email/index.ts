// Public API of the email module.
export {
  createQueueEmailSender,
  createSmtpDelivery,
  type EmailSender,
  type MailConfig,
} from "./email.service";
export { type EmailMessage, renderEmail } from "./email.templates";
