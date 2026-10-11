import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { getAuth } from "../../apps/web/src/server/auth";
import { catalogAuthFixture } from "./catalog-auth-fixture";
import { requireTestDatabase } from "./test-database";

/**
 * Real C accounts retain one synthetic forwarded client identity across signup,
 * SMTP-token verification and login. No authority mock, limiter reset or bypass.
 * The original fixture and all its existing consumers remain unchanged.
 */
export function readingAuthFixture() {
  const fixture = catalogAuthFixture();
  return Object.assign(fixture, {
    async account(role: "user" | "moderator" | "admin") {
      requireTestDatabase();
      const email = `${randomUUID()}@example.invalid`;
      const ip = `127.${Math.floor(Math.random() * 250) + 2}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
      const password = "Synthetic-only-password-17!";
      const identityRequests: {
        method: string;
        path: string;
        ip: string | null;
      }[] = [];
      const dispatch = (request: Request) => {
        identityRequests.push({
          method: request.method,
          path: new URL(request.url).pathname,
          ip: request.headers.get("x-real-ip"),
        });
        expect(request.headers.get("x-real-ip")).toBe(ip);
        return getAuth().handler(request);
      };
      const request = (path: string, body: object) =>
        dispatch(
          new Request(`${fixture.origin}/api/auth/${path}`, {
            method: "POST",
            headers: {
              Origin: fixture.origin,
              "Content-Type": "application/json",
              "x-real-ip": ip,
            },
            body: JSON.stringify(body),
          }),
        );
      const signup = await request("sign-up/email", {
        email,
        password,
        name: `Synthetic ${fixture.runId}`,
        callbackURL: `${fixture.origin}/en/verify-email`,
      });
      expect(signup.status).toBe(200);
      const [row] =
        await fixture.client`select id, role, email_verified from users where email = ${email}`;
      if (!row) throw new Error("Registration did not persist");
      const account = { id: String(row.id), email, cookie: "" };
      fixture.users.push(account);
      expect(row.role).toBe("user");
      expect(row.email_verified).toBe(false);
      // Access the original live getter after SMTP delivery, not a spread copy.
      const message = [...fixture.messages]
        .reverse()
        .find((m) => m.includes(email) && m.includes("verify-email"));
      const link = message?.match(
        /http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/,
      )?.[0];
      if (!link) throw new Error(`No verification mail for ${email}`);
      const verification = await dispatch(
        new Request(link, {
          headers: { "x-real-ip": ip },
        }),
      );
      expect(verification.status).not.toBe(429);
      expect([200, 302]).toContain(verification.status);
      expect(
        (
          await fixture.client`select email_verified from users where id = ${account.id}`
        )[0]?.email_verified,
      ).toBe(true);
      const login = await request("sign-in/email", { email, password });
      expect(login.status).toBe(200);
      expect(identityRequests).toEqual([
        { method: "POST", path: "/api/auth/sign-up/email", ip },
        { method: "GET", path: "/api/auth/verify-email", ip },
        { method: "POST", path: "/api/auth/sign-in/email", ip },
      ]);
      account.cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      expect(account.cookie).toContain("session_token");
      // Fixture-only role grant occurs after actual SMTP verification and login.
      requireTestDatabase();
      await fixture.client`update users set role = ${role} where id = ${account.id} and email = ${email}`;
      return account;
    },
  });
}
