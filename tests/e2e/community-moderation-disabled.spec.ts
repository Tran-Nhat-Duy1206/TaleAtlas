import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

test.describe.configure({ retries: 0 });
test("default-off report and moderator boundaries deny before malformed bodies, sessions or community state", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  expect(baseURL).toBeTruthy();
  const sql = createDatabase(requireTestDatabase()).client;
  const workId = randomUUID();
  const targetId = randomUUID();
  const reportId = randomUUID();
  const root = `/api/community/works/${workId}/contents/${targetId}`;
  async function fingerprint() {
    return (
      await sql`select
        (select count(*)::int from community_contents) as contents,
        (select count(*)::int from community_content_events) as events,
        (select count(*)::int from community_reports) as reports,
        (select count(*)::int from community_moderation_actions) as actions,
        (select count(*)::int from community_mutation_receipts) as receipts,
        (select count(*)::int from rate_limits where key like 'community.%' or key like 'catalog.write:%') as budgets`
    )[0];
  }
  try {
    const before = await fingerprint();
    for (const [method, path] of [
      ["POST", `${root}/reports`],
      ["GET", "/api/community/reports/owned?unexpected=1"],
      ["GET", `/api/community/reports/${reportId}/owned?unexpected=1`],
      ["GET", "/api/community/moderation/reports?unexpected=1"],
      ["GET", `${root}/moderation/metadata?unexpected=1`],
      ["POST", `${root}/moderation/context`],
      ["GET", `${root}/moderation/history?unexpected=1`],
      ["POST", `${root}/moderation`],
    ] as const) {
      const response = await page.request.fetch(path, {
        method,
        timeout: method === "GET" ? 30_000 : 45_000,
        headers: {
          Origin: "https://synthetic-denied-origin.example.invalid",
          "Content-Type": "application/json",
          Cookie: "better-auth.session_token=synthetic-invalid-session",
        },
        ...(method === "GET" ? {} : { data: "{invalid-json" }),
      });
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: "COMMUNITY_UNAVAILABLE" });
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toBe("noindex");
    }
    for (const locale of ["en", "vi"] as const) {
      for (const path of [
        `/${locale}/community/reports/manage`,
        `/${locale}/community/moderation`,
      ]) {
        const response = await page.request.get(path, { timeout: 30_000 });
        expect(response.status()).toBe(404);
        const html = await response.text();
        for (const field of [
          "evidenceSelectionAcknowledged",
          "spoilerRevealAcknowledged",
          "expectedReportRevision",
          "ratingHalfStars",
          "reporterId",
          "moderatorId",
        ])
          expect(html).not.toContain(field);
      }
    }
    expect(await fingerprint()).toEqual(before);
  } finally {
    await sql.end();
  }
});
