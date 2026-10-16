import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import { communityBrowserFixture } from "../helpers/community-browser-fixture";

test.describe.configure({ retries: 0 });
test("default-off EN/VI canonical works have no community link and every dedicated surface fails closed", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const fixture = await communityBrowserFixture(page, browser, baseURL!, false);
  try {
    for (const locale of ["en", "vi"] as const) {
      const canonical = await page.goto(
        `/${locale}/works/${fixture.work.slug}`,
      );
      expect(canonical?.status()).toBe(200);
      await expect(
        page.getByRole("link", {
          name: locale === "en" ? "Discussions" : "Thảo luận",
          exact: true,
        }),
      ).toHaveCount(0);
      for (const path of [
        `/${locale}/works/${fixture.work.slug}/discussions`,
        `/${locale}/works/${fixture.work.slug}/discussions/${randomUUID()}`,
        `/${locale}/community/manage`,
      ]) {
        // Assert the actual HTTP/SSR boundary independently of client navigation.
        // The rejected document probe aborted; a separate real HTTP probe stayed404.
        const blocked = await page.request.get(path, { timeout: 30_000 });
        expect(blocked.status()).toBe(404);
        expect(blocked.headers()["content-type"]).toContain("text/html");
        expect(await blocked.text()).toContain("404");
      }
    }
    const denied = await fixture.admin.request.post(
      `/api/community/works/${fixture.work.id}/threads`,
      {
        timeout: 45_000,
        headers: { Origin: baseURL!, "Content-Type": "application/json" },
        data: "{",
      },
    );
    expect(denied.status()).toBe(404);
    expect(denied.headers()["cache-control"]).toBe("no-store");
    expect(
      (
        await fixture.sql`select count(*)::int as count from community_contents where work_id=${fixture.work.id}`
      )[0].count,
    ).toBe(0);
  } finally {
    await fixture.close();
  }
});
