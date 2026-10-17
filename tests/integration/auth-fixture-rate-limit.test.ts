import { afterAll, beforeAll, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { getAuth } from "../../apps/web/src/server/auth";

const f = catalogAuthFixture();
beforeAll(() => f.start());
afterAll(() => f.stop());

it("keeps real verified fixture accounts isolated from the exhausted headerless verification bucket", async () => {
  // Real requests exercise the production database limiter. No bucket seeding,
  // limiter reset, clock manipulation, mocks or limit override.
  const headerless = () =>
    getAuth().handler(
      new Request(`${f.origin}/api/auth/verify-email?token=synthetic-invalid`),
    );
  let limited = false;
  for (let attempt = 0; attempt <= 100; attempt++) {
    if ((await headerless()).status === 429) {
      limited = true;
      break;
    }
  }
  expect(limited).toBe(true);

  // Before the fix, the fixture's real SMTP verification also enters that
  // shared bucket and fails with429. Afterwards all three account phases use
  // the same synthetic client IP, while the shared bucket remains limited.
  const actor = await f.account("user");
  expect(actor.cookie).toContain("session_token");
  const session = await getAuth().api.getSession({
    headers: new Headers({ Cookie: actor.cookie }),
  });
  expect(session?.user.id).toBe(actor.id);
  expect(session?.user.emailVerified).toBe(true);
  expect(session?.user.role).toBe("user");
  expect((await headerless()).status).toBe(429);
});
