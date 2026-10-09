import { randomUUID } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { expect } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { getAuth } from "../../apps/web/src/server/auth";
import { requireTestDatabase } from "./test-database";

/** Real Better Auth accounts, SMTP verification and signed session cookies. No auth mocks. */
export function catalogAuthFixture() {
  const url = requireTestDatabase();
  const { client } = createDatabase(url);
  const runId = randomUUID();
  const sourceLabel = `ModelSource UUID-synthetic ${runId}`;
  const origin = "http://localhost:3000";
  const messages: string[] = [];
  const users: { id: string; email: string; cookie: string }[] = [];
  const mail = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS", "AUTH"],
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        messages.push(
          Buffer.concat(chunks)
            .toString("utf8")
            .replace(/=\r?\n/g, "")
            .replace(/=3D/g, "="),
        );
        callback();
      });
    },
  });
  return {
    client,
    runId,
    sourceLabel,
    origin,
    users,
    async start() {
      requireTestDatabase();
      await new Promise<void>((resolve) =>
        mail.listen(0, "127.0.0.1", resolve),
      );
      const address = mail.server.address();
      if (!address || typeof address === "string")
        throw new Error("SMTP not listening");
      Object.assign(process.env, {
        DATABASE_URL: url,
        BETTER_AUTH_SECRET: "synthetic-test-auth-secret-only-1234567890",
        APP_ORIGIN: origin,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(address.port),
        SMTP_FROM: "TaleAtlas <test@example.invalid>",
        SMTP_SECURE: "false",
      });
    },
    async account(role: "user" | "moderator" | "admin") {
      requireTestDatabase();
      const email = `${randomUUID()}@example.invalid`;
      const ip = `127.${Math.floor(Math.random() * 250) + 2}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
      const password = "Synthetic-only-password-17!";
      const request = (path: string, body: object) =>
        getAuth().handler(
          new Request(`${origin}/api/auth/${path}`, {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "x-real-ip": ip,
            },
            body: JSON.stringify(body),
          }),
        );
      const signup = await request("sign-up/email", {
        email,
        password,
        name: `Synthetic ${runId}`,
        callbackURL: `${origin}/en/verify-email`,
      });
      expect(signup.status).toBe(200);
      const [row] =
        await client`select id, role, email_verified from users where email = ${email}`;
      if (!row) throw new Error("Registration did not persist");
      const account = { id: String(row.id), email, cookie: "" };
      users.push(account);
      expect(row.role).toBe("user");
      expect(row.email_verified).toBe(false);
      const message = [...messages]
        .reverse()
        .find((m) => m.includes(email) && m.includes("verify-email"));
      const link = message?.match(
        /http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/,
      )?.[0];
      if (!link) throw new Error(`No verification mail for ${email}`);
      expect([200, 302]).toContain(
        (await getAuth().handler(new Request(link))).status,
      );
      expect(
        (
          await client`select email_verified from users where id = ${account.id}`
        )[0]?.email_verified,
      ).toBe(true);
      const login = await request("sign-in/email", { email, password });
      expect(login.status).toBe(200);
      account.cookie = login.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      expect(account.cookie).toContain("session_token");
      // Fixture-only grant, after actual verified login, on a guarded isolated database.
      requireTestDatabase();
      await client`update users set role = ${role} where id = ${account.id} and email = ${email}`;
      return account;
    },
    async stop() {
      requireTestDatabase();
      for (const user of users) {
        await client`delete from users where id = ${user.id} and email = ${user.email}`;
        await client`delete from verifications where identifier like ${`%${user.email}%`}`;
        await client`delete from rate_limits where key = ${`catalog.write:${user.id}`}`;
      }
      await client.end();
      await new Promise<void>((resolve) => mail.close(resolve));
    },
  };
}
