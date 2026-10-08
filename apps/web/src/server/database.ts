import "server-only";
import {
  createDatabase,
  type DatabaseConnection,
} from "@taleatlas/database/client";
import { getDatabaseEnv } from "./env";
import { logServerError } from "./logger";

let connection: DatabaseConnection | undefined;
export function getDatabaseConnection() {
  connection ??= createDatabase(getDatabaseEnv().DATABASE_URL);
  return connection;
}
export function getDatabase() {
  return getDatabaseConnection().db;
}
export type DatabaseHealth = { status: "ok" | "unavailable" };
export async function checkDatabaseHealth(
  timeoutMs = 2000,
): Promise<DatabaseHealth> {
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(100, Math.min(timeoutMs, 5000))
    : 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Parse/plan a zero-row identity query: readiness includes applied auth schema.
    const query = getDatabaseConnection().client`
      select u.id, s.id, a.id, v.id, r.id
      from users u, sessions s, accounts a, verifications v, rate_limits r
      limit 0
    `;
    await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            query.cancel();
          } catch {
            /* Cancellation must not bypass timeout handling. */
          }
          reject(new Error("Database health timeout"));
        }, boundedTimeout);
      }),
    ]);
    return { status: "ok" };
  } catch (error) {
    logServerError("database.health", error);
    return { status: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
