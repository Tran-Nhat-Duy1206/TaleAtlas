import { describe, it, expect } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
describe("database transport defaults", () => {
  it.each([
    "postgresql://user:secret@example.invalid/db?sslmode=require",
    "postgresql://user:secret@example.invalid/db?sslmode=disable",
    "postgresql://user:secret@example.invalid/db",
  ])(
    "enforces certificate-verified TLS for remote databases: %s",
    async (url) => {
      const { client } = createDatabase(url);
      expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
      expect(client.options.prepare).toBe(false);
      await client.end();
    },
  );
  it("permits an isolated loopback database without TLS", async () => {
    const { client } = createDatabase(
      "postgresql://user:secret@127.0.0.1/test",
    );
    expect(client.options.ssl).toBe(false);
    await client.end();
  });
  it("keeps explicit loopback TLS certificate-verified", async () => {
    const { client } = createDatabase(
      "postgresql://user:secret@localhost/test?sslmode=require",
    );
    expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
    await client.end();
  });
});
