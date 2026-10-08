import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

const { client } = createDatabase(requireTestDatabase());
beforeAll(async () => {
  await client`select 1`;
});
afterAll(async () => {
  await client.end();
});
describe("real PostgreSQL integrity", () => {
  it("rolls back a multi-statement transaction", async () => {
    const id = randomUUID();
    await expect(
      client.begin(async (tx) => {
        await tx`insert into users (id, name, email) values (${id}, 'Rollback', ${`${id}@example.invalid`})`;
        throw new Error("deliberate rollback");
      }),
    ).rejects.toThrow("deliberate rollback");
    const rows = await client`select id from users where id = ${id}`;
    expect(rows).toHaveLength(0);
  });
  it("serializes concurrent unique account creation and cascades owned sessions", async () => {
    const email = `${randomUUID()}@example.invalid`;
    const ids = [randomUUID(), randomUUID()];
    try {
      const outcomes = await Promise.allSettled(
        ids.map(
          (id) =>
            client`insert into users (id, name, email) values (${id}, 'Concurrent', ${email}) returning id`,
        ),
      );
      expect(
        outcomes.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const users =
        await client`select id, role, email_verified from users where email = ${email}`;
      expect(users[0]?.role).toBe("user");
      expect(users[0]?.email_verified).toBe(false);
      await client`insert into sessions (id, token, user_id, expires_at) values (${randomUUID()}, ${randomUUID()}, ${users[0]!.id}, now() + interval '1 hour')`;
      await client`delete from users where email = ${email}`;
      expect(
        await client`select id from sessions where user_id = ${users[0]!.id}`,
      ).toHaveLength(0);
    } finally {
      await client`delete from users where email = ${email}`;
    }
  });
  it("rejects invalid roles and orphaned sessions", async () => {
    await expect(
      client`insert into users (id, name, email, role) values (${randomUUID()}, 'Invalid', ${`${randomUUID()}@example.invalid`}, 'superuser')`,
    ).rejects.toMatchObject({ code: "22P02" });
    await expect(
      client`insert into sessions (id, token, user_id, expires_at) values (${randomUUID()}, ${randomUUID()}, ${randomUUID()}, now())`,
    ).rejects.toMatchObject({ code: "23503" });
  });
});
