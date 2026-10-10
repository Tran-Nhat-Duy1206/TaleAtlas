import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./schema";
import * as catalogSchema from "./catalog-schema";

import * as ingestionSchema from "./ingestion-schema";

import * as editSuggestionSchema from "./edit-suggestion-schema";
import * as releaseSchema from "./release-schema";

const schema = {
  ...authSchema,
  ...catalogSchema,
  ...ingestionSchema,
  ...editSuggestionSchema,
  ...releaseSchema,
};

export function createDatabase(url: string) {
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  const mode = parsed.searchParams.get("sslmode");
  const tlsRequested = mode !== null && !["disable", "false"].includes(mode);
  const client = postgres(url, {
    // postgres.js sslmode=require disables certificate verification by default.
    // Remote databases always require verified TLS; only local test/dev can omit TLS.
    ssl: !loopback || tlsRequested ? { rejectUnauthorized: true } : false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
    connection: { statement_timeout: 5000 },
  });
  return { db: drizzle(client, { schema }), client };
}
export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type Database = DatabaseConnection["db"];
