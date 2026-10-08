import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "@taleatlas/database/schema";
import { getDatabase } from "./database";
import { getAuthEnv, getMailEnv } from "./env";
import { sendAuthMail } from "./mail";
import { branding } from "../lib/branding";

function createAuth() {
  const env = getAuthEnv();
  getMailEnv(); // Fail closed before accepting auth requests when mail is misconfigured.
  return betterAuth({
    appName: branding.name,
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: drizzleAdapter(getDatabase(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthMail(
          user.email,
          `Reset your ${branding.name} password`,
          `Reset your password using this link:\n${url}\nIf you did not request this, ignore this email.`,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthMail(
          user.email,
          `Verify your ${branding.name} email`,
          `Verify your email using this link:\n${url}`,
        );
      },
    },
    user: {
      additionalFields: {
        role: {
          type: ["user", "moderator", "admin"],
          required: false,
          defaultValue: "user",
          input: false,
        },
        preferredLocale: {
          type: "string",
          required: false,
          defaultValue: "en",
          input: false,
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          await sendAuthMail(
            user.email,
            `Delete your ${branding.name} account`,
            `Confirm permanent account deletion using this link:\n${url}\nIf you did not request this, ignore this email.`,
          );
        },
      },
    },
    verification: { storeIdentifier: "hashed" },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 5,
      cookieCache: { enabled: false },
    },
    advanced: {
      // Better Auth otherwise disables origin validation automatically under NODE_ENV=test.
      // Keep integration and production behavior identical and fail closed.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.APP_ORIGIN.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // Vercel supplies this client header; self-hosted deployments must
      // overwrite x-real-ip at the proxy and prevent direct origin access.
      ipAddress: {
        ipAddressHeaders: [
          process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-real-ip",
        ],
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/delete-user": { window: 60, max: 3 },
      },
    },
    // Provider diagnostics can contain URLs/tokens; application boundary logs are sanitized.
    logger: { disabled: true },
  });
}
export type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
