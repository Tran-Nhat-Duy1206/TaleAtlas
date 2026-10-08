import "server-only";
import pino from "pino";

// Never attach request bodies, headers, email URLs, or raw exception objects.
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "taleatlas-web" },
  redact: {
    paths: [
      "password",
      "token",
      "secret",
      "authorization",
      "cookie",
      "req.headers",
      "req.body",
    ],
    censor: "[REDACTED]",
  },
});
export function logServerError(operation: string, error: unknown) {
  void error;
  // Error messages/stacks from providers can contain credentials and reset URLs.
  logger.error({ operation }, "Server operation failed");
}
