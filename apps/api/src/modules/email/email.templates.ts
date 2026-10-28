// Plain-text email templates. Messages are queued as data (template name +
// fields) and rendered by the worker, so the API never blocks on SMTP.
// Never put secrets in `data` beyond a one-time link token.
import { APP_NAME } from "@repo/types";

export type EmailMessage = { to: string } & (
  | { template: "verify_email"; data: { link: string } }
  | { template: "signup_existing"; data: { loginLink: string; recoverLink: string } }
  | { template: "new_device"; data: { deviceName: string; ip: string; at: string } }
  | { template: "password_changed"; data: { at: string } }
  | { template: "recovery_used"; data: { at: string } }
  | { template: "recovery_key_changed"; data: { at: string } }
  | { template: "mfa_removed"; data: { method: string; at: string } }
);

export interface RenderedEmail {
  subject: string;
  text: string;
}

const NOT_YOU = `If this wasn't you, sign in and change your master password, then review your devices in Settings → Security.`;

export function renderEmail(message: EmailMessage): RenderedEmail {
  switch (message.template) {
    case "verify_email":
      return {
        subject: `Verify your email for ${APP_NAME}`,
        text: `Confirm this address to finish creating your ${APP_NAME} account:\n\n${message.data.link}\n\nThe link expires in 24 hours. If you didn't sign up, ignore this email.`,
      };
    case "signup_existing":
      return {
        subject: `Someone tried to sign up with your email`,
        text: `Someone tried to create a ${APP_NAME} account with this address, but you already have one.\n\nSign in: ${message.data.loginLink}\nForgot your master password? Use your recovery kit: ${message.data.recoverLink}\n\nIf this wasn't you, you don't need to do anything.`,
      };
    case "new_device":
      return {
        subject: `New sign-in to ${APP_NAME}`,
        text: `Your account was signed in from a new device.\n\nDevice: ${message.data.deviceName}\nIP address: ${message.data.ip}\nTime: ${message.data.at}\n\n${NOT_YOU}`,
      };
    case "password_changed":
      return {
        subject: `Your ${APP_NAME} master password was changed`,
        text: `Your master password was changed at ${message.data.at}. Other sessions were signed out.\n\n${NOT_YOU}`,
      };
    case "recovery_used":
      return {
        subject: `Your ${APP_NAME} account was recovered`,
        text: `Your recovery key was used at ${message.data.at} to set a new master password. Every session was signed out and a new recovery key was issued.\n\nIf this wasn't you, contact support immediately.`,
      };
    case "recovery_key_changed":
      return {
        subject: `Your ${APP_NAME} recovery kit was replaced`,
        text: `A new recovery kit was created at ${message.data.at}. The old recovery key no longer works.\n\n${NOT_YOU}`,
      };
    case "mfa_removed":
      return {
        subject: `A two-step login method was removed`,
        text: `Your ${message.data.method} was removed from two-step login at ${message.data.at}.\n\n${NOT_YOU}`,
      };
  }
}
