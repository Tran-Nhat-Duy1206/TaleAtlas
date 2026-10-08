import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { getAuth } from "../../apps/web/src/server/auth";
import { requireRole } from "../../apps/web/src/server/session";

const url = requireTestDatabase();
const { client } = createDatabase(url);
const messages: string[] = [];
const origin = "http://localhost:3000";
const password = "Synthetic-only-password-17!";
const email = `${randomUUID()}@example.invalid`;
const ip = `127.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const throttleIP = `127.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
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
async function request(
  path: string,
  body?: object,
  cookie?: string,
  requestOrigin = origin,
) {
  return getAuth().handler(
    new Request(`${origin}/api/auth/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "x-real-ip": ip,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
function mailURL(marker: string): string {
  const text = [...messages]
    .reverse()
    .find((message) => message.includes(marker));
  const found = text?.match(/http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/);
  if (!found) throw new Error(`No ${marker} mail captured`);
  return found[0];
}
beforeAll(async () => {
  await new Promise<void>((resolve) => mail.listen(0, "127.0.0.1", resolve));
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
});
afterAll(async () => {
  await client`delete from users where email = ${email}`;
  await client`delete from verifications where identifier like ${`%${email}%`}`;
  await client.end();
  await new Promise<void>((resolve) => mail.close(resolve));
});
describe("real persisted authentication", () => {
  it("verifies email, denies role escalation, revokes sessions, resets password and deletes account", async () => {
    const signup = await request("sign-up/email", {
      email,
      password,
      name: "Integration Reader",
      role: "admin",
      callbackURL: `${origin}/en/verify-email`,
    });
    expect(signup.status).toBe(200);
    const stored =
      await client`select id, role, email_verified from users where email = ${email}`;
    expect(stored[0]?.role).toBe("user");
    expect(stored[0]?.email_verified).toBe(false);
    const accounts =
      await client`select password from accounts where user_id = ${stored[0]!.id}`;
    expect(accounts[0]?.password).not.toBe(password);
    expect(accounts[0]?.password?.length).toBeGreaterThan(64);
    expect((await request("sign-in/email", { email, password })).status).toBe(
      403,
    );
    const verify = await getAuth().handler(
      new Request(mailURL("verify-email")),
    );
    expect([200, 302]).toContain(verify.status);
    expect(
      (await client`select email_verified from users where email = ${email}`)[0]
        ?.email_verified,
    ).toBe(true);
    const login = await request("sign-in/email", { email, password });
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    expect(cookie).toContain("session_token");
    expect(
      login.headers
        .getSetCookie()
        .some(
          (value) =>
            value.includes("HttpOnly") && value.includes("SameSite=Lax"),
        ),
    ).toBe(true);
    expect(
      (await (await request("get-session", undefined, cookie)).json()).user
        .email,
    ).toBe(email);
    await expect(
      requireRole(["admin"], new Headers({ Cookie: cookie })),
    ).rejects.toMatchObject({ status: 403 });
    await client`update users set role = 'admin' where email = ${email}`;
    expect(
      (await requireRole(["admin"], new Headers({ Cookie: cookie }))).user.role,
    ).toBe("admin");
    await client`update users set role = 'user' where email = ${email}`;
    await expect(
      requireRole(["admin"], new Headers({ Cookie: cookie })),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await request("sign-out", {}, cookie, "https://hostile.example")).status,
    ).toBe(403);
    expect((await request("sign-out", {}, cookie)).status).toBe(200);
    expect(
      await (await request("get-session", undefined, cookie)).json(),
    ).toBeNull();
    const secondLogin = await request("sign-in/email", { email, password });
    const secondCookie = cookieOf(secondLogin);
    expect(
      (
        await request("request-password-reset", {
          email,
          redirectTo: `${origin}/en/reset-password`,
        })
      ).status,
    ).toBe(200);
    const resetLink = new URL(mailURL("reset-password"));
    const resetToken = resetLink.pathname.split("/").at(-1);
    const newPassword = "New-synthetic-password-18!";
    expect(
      (await request("reset-password", { token: resetToken, newPassword }))
        .status,
    ).toBe(200);
    expect(
      await (await request("get-session", undefined, secondCookie)).json(),
    ).toBeNull();
    expect(
      (
        await request("reset-password", {
          token: resetToken,
          newPassword: password,
        })
      ).status,
    ).not.toBe(200);
    expect(
      (
        await request("reset-password", {
          token: "invalid-expired-token",
          newPassword,
        })
      ).status,
    ).not.toBe(200);
    expect(
      (await request("sign-in/email", { email, password })).status,
    ).not.toBe(200);
    const finalLogin = await request("sign-in/email", {
      email,
      password: newPassword,
    });
    expect(finalLogin.status).toBe(200);
    const finalCookie = cookieOf(finalLogin);
    expect(
      (
        await request(
          "delete-user",
          { password: newPassword, callbackURL: `${origin}/en` },
          finalCookie,
        )
      ).status,
    ).toBe(200);
    const deletion = await getAuth().handler(
      new Request(mailURL("delete-user"), { headers: { Cookie: finalCookie } }),
    );
    expect([200, 302]).toContain(deletion.status);
    expect(
      await client`select id from users where email = ${email}`,
    ).toHaveLength(0);
    expect(
      await client`select id from accounts where user_id = ${stored[0]!.id}`,
    ).toHaveLength(0);
    expect(
      await client`select id from sessions where user_id = ${stored[0]!.id}`,
    ).toHaveLength(0);
  });
  it("atomically limits concurrent authentication attempts", async () => {
    const concurrentIP = `127.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        getAuth().handler(
          new Request(`${origin}/api/auth/sign-in/email`, {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "x-real-ip": concurrentIP,
            },
            body: JSON.stringify({
              email: "absent-concurrent@example.invalid",
              password,
            }),
          }),
        ),
      ),
    );
    expect(
      responses.filter((response) => response.status === 401),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(7);
  });
  it("persists bounded sign-in throttling in PostgreSQL", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 6; index++) {
      const result = await getAuth().handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "x-real-ip": throttleIP,
          },
          body: JSON.stringify({ email: "absent@example.invalid", password }),
        }),
      );
      statuses.push(result.status);
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect((await client`select id from rate_limits`).length).toBeGreaterThan(
      0,
    );
  });
});
