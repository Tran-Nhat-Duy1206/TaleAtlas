import "server-only";
import { z } from "zod";
import { branding } from "../lib/branding";

const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(ql)?:\/\//.test(value)),
});
const authSchema = databaseSchema.extend({
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    }),
});
const smtpSchema = z
  .object({
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1),
  })
  .refine((value) => Boolean(value.SMTP_USER) === Boolean(value.SMTP_PASSWORD));
export class ConfigurationError extends Error {
  constructor() {
    super("Server configuration is unavailable or invalid");
    this.name = "ConfigurationError";
  }
}
export function getDatabaseEnv() {
  const result = databaseSchema.safeParse(process.env);
  if (!result.success) throw new ConfigurationError();
  return result.data;
}
export function getAuthEnv() {
  const result = authSchema.safeParse(process.env);
  if (
    !result.success ||
    (process.env.NODE_ENV === "production" &&
      !result.data.APP_ORIGIN.startsWith("https://"))
  )
    throw new ConfigurationError();
  return { ...result.data, APP_ORIGIN: new URL(result.data.APP_ORIGIN).origin };
}
export function getMailEnv() {
  const production = process.env.NODE_ENV === "production";
  const result = smtpSchema.safeParse({
    SMTP_HOST: process.env.SMTP_HOST ?? (production ? undefined : "localhost"),
    SMTP_PORT: process.env.SMTP_PORT ?? (production ? undefined : "1025"),
    SMTP_FROM:
      process.env.SMTP_FROM ??
      (production ? undefined : `${branding.name} <noreply@localhost>`),
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  });
  if (!result.success) throw new ConfigurationError();
  return result.data;
}
