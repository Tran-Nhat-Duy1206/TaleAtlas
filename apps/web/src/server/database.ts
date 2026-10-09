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
    // Independent zero-row scalar plans avoid a large Cartesian join and never read user data.
    // Readiness verifies deployed auth/catalog schema and the required trigram extension.
    const query = getDatabaseConnection().client`
      select
        (select id from users limit 0), (select id from sessions limit 0),
        (select id from accounts limit 0), (select id from verifications limit 0),
        (select id from rate_limits limit 0), (select id from catalog_sources limit 0),
        (select concat(id::text, slug, revision::text, search_vector::text,
          similarity(search_text, search_text)::text) from works limit 0),
        (select id from work_titles limit 0), (select text from work_descriptions limit 0),
        (select id from editions limit 0), (select id from creators limit 0),
        (select edition_id from work_creators limit 0), (select slug from genres limit 0),
        (select genre_slug from work_genres limit 0), (select asset_path from work_covers limit 0),
        (select value from work_identifiers limit 0), (select type from work_relations limit 0),
        (select actor_id_snapshot from catalog_audit_events limit 0)
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
