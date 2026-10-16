import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

test.describe.configure({ retries: 0 });
test("default-off public review API and document pages retain generic not-found with no community writes", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const workId = randomUUID(),
    reviewId = randomUUID();
  async function fingerprint() {
    return (
      await sql`select (select count(*)::int from community_contents) as contents,
      (select count(*)::int from community_mutation_receipts) as receipts,
      (select count(*)::int from community_content_events) as events,
      (select count(*)::int from rate_limits where key like 'community.%' or key like 'catalog.write:%') as budgets`
    )[0];
  }
  try {
    const before = await fingerprint();
    const root = `/api/community/works/${workId}/reviews`;
    for (const [method, path] of [
      ["GET", `${root}?unexpected=1`],
      ["POST", root],
      ["PATCH", `${root}/${reviewId}`],
      ["POST", `${root}/${reviewId}/withdraw`],
      ["POST", `${root}/${reviewId}/reveal`],
      ["GET", `${root}/${reviewId}/owned?unexpected=1`],
      ["GET", `${root}/owned?unexpected=1`],
      ["GET", "/api/community/reviews/owned?unexpected=1"],
    ] as const) {
      const response = await page.request.fetch(path, {
        method,
        timeout: method === "GET" ? 30_000 : 45_000,
        headers: { Origin: baseURL!, "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { data: "{invalid-json" }),
      });
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: "COMMUNITY_UNAVAILABLE" });
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toBe("noindex");
    }
    for (const locale of ["en", "vi"] as const) {
      for (const path of [
        `/${locale}/works/synthetic-disabled-review-${workId}/reviews`,
        `/${locale}/community/reviews/manage`,
      ]) {
        const response = await page.request.get(path, { timeout: 30_000 });
        expect(response.status()).toBe(404);
        const html = await response.text();
        expect(html).not.toContain("publicSubmissionAcknowledged");
        expect(html).not.toContain("ratingHalfStars");
        expect(html).not.toContain("meanRating");
      }
    }
    expect(await fingerprint()).toEqual(before);
  } finally {
    await sql.end();
  }
});
