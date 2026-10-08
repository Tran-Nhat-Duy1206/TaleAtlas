import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  ConfigurationError,
  getAuthEnv,
  getDatabaseEnv,
  getMailEnv,
} from "../../apps/web/src/server/env";

const names = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "APP_ORIGIN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
];
beforeEach(() => {
  for (const name of names) vi.stubEnv(name, undefined);
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());
function validAuth() {
  vi.stubEnv("DATABASE_URL", "postgres://local:local@localhost/taleatlas");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "a-secure-development-secret-of-32-characters",
  );
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
}
describe("lazy runtime environment validation", () => {
  it("imports without credentials but refuses runtime database access", () => {
    expect(() => getDatabaseEnv()).toThrow(ConfigurationError);
  });
  it("accepts PostgreSQL and rejects unrelated URLs", () => {
    validAuth();
    expect(getDatabaseEnv().DATABASE_URL).toMatch(/^postgres:/);
    vi.stubEnv("DATABASE_URL", "https://example.com");
    expect(() => getDatabaseEnv()).toThrow(ConfigurationError);
  });
  it("requires auth origin and a sufficiently long secret", () => {
    validAuth();
    expect(getAuthEnv().APP_ORIGIN).toBe("http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_SECRET", "short");
    expect(() => getAuthEnv()).toThrow(ConfigurationError);
  });
  it.each([
    "https://example.com/path",
    "https://example.com?x=1",
    "https://user:password@example.com",
    "ftp://example.com",
  ])("rejects non-origin value %s", (origin) => {
    validAuth();
    vi.stubEnv("APP_ORIGIN", origin);
    expect(() => getAuthEnv()).toThrow(ConfigurationError);
  });
  it("requires HTTPS in production", () => {
    validAuth();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAuthEnv()).toThrow(ConfigurationError);
    vi.stubEnv("APP_ORIGIN", "https://taleatlas.example/");
    expect(getAuthEnv().APP_ORIGIN).toBe("https://taleatlas.example");
  });
  it("provides local SMTP only outside production", () => {
    expect(getMailEnv()).toMatchObject({
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      SMTP_SECURE: "false",
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getMailEnv()).toThrow(ConfigurationError);
  });
  it("validates SMTP credentials as a pair and bounded ports", () => {
    vi.stubEnv("SMTP_USER", "mailer");
    expect(() => getMailEnv()).toThrow(ConfigurationError);
    vi.stubEnv("SMTP_PASSWORD", "smtp-password");
    expect(getMailEnv().SMTP_USER).toBe("mailer");
    vi.stubEnv("SMTP_PORT", "65536");
    expect(() => getMailEnv()).toThrow(ConfigurationError);
  });
  it("does not disclose rejected values", () => {
    vi.stubEnv("DATABASE_URL", "private-secret-value");
    try {
      getDatabaseEnv();
    } catch (error) {
      expect(String(error)).not.toContain("private-secret-value");
    }
  });
});
