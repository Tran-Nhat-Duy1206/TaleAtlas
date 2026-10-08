import { readFile } from "node:fs/promises";
import { createDatabase } from "../packages/database/src/client";
const { url }: { url: string } = JSON.parse(
  await readFile(".local/database.json", "utf8"),
);
const parsed = new URL(url);
if (
  parsed.hostname !== "127.0.0.1" ||
  parsed.port !== "55432" ||
  parsed.pathname !== "/taleatlas_test"
)
  throw new Error("Not the isolated local test database");
const admin = new URL(url);
admin.pathname = "/postgres";
const { client } = createDatabase(admin.toString());
try {
  const [database] =
    await client`select pg_encoding_to_char(encoding) as encoding from pg_database where datname = 'taleatlas_test'`;
  if (database?.encoding !== "UTF8") {
    // Only newly created disposable local test data; fail closed if any application table exists.
    const test = createDatabase(url);
    const tables =
      await test.client`select tablename from pg_tables where schemaname = 'public'`;
    await test.client.end();
    if (tables.length)
      throw new Error("Refuse recreation of a nonempty database");
    await client.unsafe("DROP DATABASE taleatlas_test");
    await client.unsafe(
      "CREATE DATABASE taleatlas_test ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
    );
  }
  console.log("Isolated test database uses UTF8");
} finally {
  await client.end();
}
