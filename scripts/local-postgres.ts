import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Creates only a disposable, ignored local database. Never reads a production URL.
const directory = resolve(`.local/postgres-${randomUUID()}`);
await mkdir(resolve(".local"), { recursive: true });
const password = randomBytes(24).toString("hex");
const port = 55432;
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user: "taleatlas_test",
  password,
  port,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("taleatlas_test");
  const url = `postgresql://taleatlas_test:${password}@127.0.0.1:${port}/taleatlas_test`;
  await writeFile(resolve(".local/database.json"), JSON.stringify({ url }), {
    mode: 0o600,
  });
  console.log(
    `Isolated PostgreSQL ready on 127.0.0.1:${port}; credentials saved only in ignored .local/database.json`,
  );
  await new Promise<void>((resolveStop) => {
    process.once("SIGINT", resolveStop);
    process.once("SIGTERM", resolveStop);
  });
} finally {
  await postgres.stop();
}
