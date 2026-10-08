import "server-only";
import nodemailer from "nodemailer";
import { getMailEnv } from "./env";
import { logServerError } from "./logger";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
export async function sendAuthMail(to: string, subject: string, text: string) {
  const env = getMailEnv();
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
    requireTLS:
      process.env.NODE_ENV === "production" && env.SMTP_SECURE !== "true",
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (error) {
    logServerError("auth.mail", error);
    throw new Error("Email delivery unavailable");
  }
}
