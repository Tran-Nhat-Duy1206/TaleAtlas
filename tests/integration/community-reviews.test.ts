import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getDatabase } from "../../apps/web/src/server/database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  addLibraryEntry,
  updateLibraryEntry,
} from "../../apps/web/src/server/library/service";
import { getAuth } from "../../apps/web/src/server/auth";
import {
  createCommunityReview,
  listCommunityReviews,
  getCommunityReviewSlot,
  getOwnedCommunityReview,
  listOwnedCommunityReviews,
  moderateCommunityContent,
  withdrawCommunityContent,
} from "../../apps/web/src/server/community/service";
import {
  reviewListResponseSchema,
  reviewOwnedSchema,
} from "../../apps/web/src/features/community/review-http-contracts";

// Real PostgreSQL + current signed principals. Bulk fixtures below are bounded, UUID-owned synthetic data, not posting/quota bypass claims.
const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor;
const workIds: string[] = [],
  capacityUsers: string[] = [];
const freshIP = () => {
  const n = randomUUID().replaceAll("-", "");
  return `127.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}.${parseInt(n.slice(4, 6), 16)}`;
};
const h = (actor?: Actor) =>
  new Headers({
    Origin: f.origin,
    "Content-Type": "application/json",
    "x-real-ip": freshIP(),
    ...(actor ? { Cookie: actor.cookie } : {}),
  });
const input = (patch = {}) => ({
  mutationKey: randomUUID(),
  body: "Entirely synthetic independent public review.",
  bodySpoiler: false,
  spoilerContext: null,
  rating: null,
  publicSubmissionAcknowledged: true,
  ...patch,
});
const moderation = (revision: number, action = "HIDE") => ({
  mutationKey: randomUUID(),
  contentKind: "REVIEW",
  expectedRevision: revision,
  action,
  reportId: null,
  expectedReportRevision: null,
  reason: "Synthetic review moderation decision",
});
async function work() {
  requireTestDatabase();
  const w = (await createWork(
    {
      primaryTitle: `C reviews synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic review fixture only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(w.id);
  return w;
}
const list = async (workId: string, page = 1) =>
  reviewListResponseSchema.parse(
    await listCommunityReviews(workId, { locale: "en", page }, h()),
  );
async function deletion(actor: Actor) {
  const requested = await getAuth().handler(
    new Request(`${f.origin}/api/auth/delete-user`, {
      method: "POST",
      headers: h(actor),
      body: JSON.stringify({
        password: "Synthetic-only-password-17!",
        callbackURL: `${f.origin}/en`,
      }),
    }),
  );
  expect(requested.status).toBe(200);
  const message = [...f.messages]
    .reverse()
    .find((m) => m.includes(actor.email) && m.includes("delete-user"));
  const link = message?.match(
    /http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/,
  )?.[0];
  if (!link) throw new Error("Actual synthetic deletion link missing");
  expect([200, 302]).toContain(
    (await getAuth().handler(new Request(link, { headers: h(actor) }))).status,
  );
}
beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V4_COMMUNITIES_ENABLED = "true";
  admin = await f.account("admin");
  expect(getDatabase()).toBeDefined();
});
afterAll(async () => {
  requireTestDatabase();
  await sql`delete from community_contents where work_id=any(${workIds}::uuid[])`;
  for (const table of [
    "catalog_field_evidence",
    "catalog_audit_events",
    "work_creators",
    "work_titles",
    "work_descriptions",
    "work_genres",
    "work_covers",
    "work_identifiers",
    "editions",
  ])
    await sql`delete from ${sql(table)} where work_id=any(${workIds}::uuid[])`;
  await sql`delete from work_relations where from_work_id=any(${workIds}::uuid[]) or to_work_id=any(${workIds}::uuid[])`;
  await sql`delete from library_entries where work_id=any(${workIds}::uuid[])`;
  await sql`delete from works where id=any(${workIds}::uuid[])`;
  await sql`delete from users where id=any(${capacityUsers}::text[]) and email like ${`%${f.runId}%@example.invalid`}`;
  await sql`delete from catalog_sources where label=${f.sourceLabel}`;
  delete process.env.V4_COMMUNITIES_ENABLED;
  await f.stop();
});
describe("V4C real SQL review public aggregates and private reservation metadata", () => {
  it("returns exact zero/unrated/mixed half-star statistics without private V3 fingerprints", async () => {
    const w = await work(),
      owner = await f.account("user");
    expect((await list(w.id)).statistics).toEqual({
      reviewCount: 0,
      ratedReviewCount: 0,
      meanRating: null,
    });
    const entry = await addLibraryEntry(
      { workId: w.id, mutationKey: randomUUID() },
      h(owner),
    );
    await updateLibraryEntry(
      entry.id,
      {
        mutationKey: randomUUID(),
        revision: entry.revision,
        patch: { notes: "PRIVATE_C_RATING_FINGERPRINT", ratingHalfStars: 9 },
      },
      h(owner),
    );
    const own = await createCommunityReview(w.id, input(), h(owner));
    expect((await list(w.id)).statistics).toEqual({
      reviewCount: 1,
      ratedReviewCount: 0,
      meanRating: null,
    });
    for (const rating of [2, 8, 10])
      await createCommunityReview(
        w.id,
        input({ rating }),
        h(await f.account("user")),
      );
    const result = await list(w.id);
    expect(result.statistics).toEqual({
      reviewCount: 4,
      ratedReviewCount: 3,
      meanRating: 10 / 3,
    });
    expect(
      result.items.find((r) => r.id === own.content.id)?.ratingHalfStars,
    ).toBeNull();
    expect(JSON.stringify(result)).not.toContain(
      "PRIVATE_C_RATING_FINGERPRINT",
    );
    expect(Object.keys(result.statistics).sort()).toEqual([
      "meanRating",
      "ratedReviewCount",
      "reviewCount",
    ]);
  });
  it("hidden withdrawal keeps reservation; restore never resurrects deleted authored data", async () => {
    const w = await work(),
      owner = await f.account("user"),
      mod = await f.account("moderator");
    const review = await createCommunityReview(
      w.id,
      input({ rating: 10 }),
      h(owner),
    );
    await moderateCommunityContent(
      w.id,
      review.content.id,
      moderation(1),
      h(mod),
    );
    expect((await list(w.id)).statistics).toEqual({
      reviewCount: 0,
      ratedReviewCount: 0,
      meanRating: null,
    });
    await withdrawCommunityContent(
      w.id,
      review.content.id,
      { mutationKey: randomUUID(), contentKind: "REVIEW", expectedRevision: 2 },
      h(owner),
    );
    expect((await getCommunityReviewSlot(w.id, h(owner))).item).toMatchObject({
      id: review.content.id,
      authorState: "DELETED",
      moderationState: "HIDDEN",
      canEdit: false,
      canWithdraw: false,
    });
    await expect(
      createCommunityReview(w.id, input(), h(owner)),
    ).rejects.toMatchObject({ status: 409 });
    await moderateCommunityContent(
      w.id,
      review.content.id,
      moderation(3, "RESTORE"),
      h(mod),
    );
    expect((await list(w.id)).statistics.reviewCount).toBe(0);
    expect((await getCommunityReviewSlot(w.id, h(owner))).item).toBeNull();
    expect(
      (
        await sql`select body,rating_half_stars,author_state from community_contents where id=${review.content.id}`
      )[0],
    ).toMatchObject({
      body: "",
      rating_half_stars: null,
      author_state: "DELETED",
    });
  });
  it("unmoderated withdrawal frees slot and concurrent new UUID attempts permit exactly one", async () => {
    const w = await work(),
      owner = await f.account("user");
    const original = await createCommunityReview(w.id, input(), h(owner));
    await withdrawCommunityContent(
      w.id,
      original.content.id,
      { mutationKey: randomUUID(), contentKind: "REVIEW", expectedRevision: 1 },
      h(owner),
    );
    expect(await getCommunityReviewSlot(w.id, h(owner))).toEqual({
      item: null,
    });
    const races = await Promise.allSettled([
      createCommunityReview(w.id, input({ rating: 2 }), h(owner)),
      createCommunityReview(w.id, input({ rating: 10 }), h(owner)),
    ]);
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(races.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const result = await list(w.id);
    expect(result.statistics.reviewCount).toBe(1);
    expect(result.items[0]!.id).not.toBe(original.content.id);
    expect(
      (await listOwnedCommunityReviews({ locale: "vi" }, h(owner))).items,
    ).toHaveLength(2);
  });
  it("unavailable Work still permits minimal owner metadata, wrong owner/admin404, public no DTO", async () => {
    const w = await work(),
      owner = await f.account("user");
    const review = await createCommunityReview(
      w.id,
      input({
        rating: 6,
        bodySpoiler: true,
        spoilerContext: "Synthetic explicit context",
      }),
      h(owner),
    );
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    const value = reviewOwnedSchema.parse(
      await getOwnedCommunityReview(
        w.id,
        review.content.id,
        { locale: "en", contentKind: "REVIEW" },
        h(owner),
      ),
    );
    expect(value).toMatchObject({
      workAvailable: false,
      canEdit: false,
      canWithdraw: true,
    });
    expect(Object.keys(value).sort()).toEqual(
      [
        "id",
        "workId",
        "kind",
        "threadId",
        "parentId",
        "depth",
        "revision",
        "authorState",
        "moderationState",
        "workAvailable",
        "canEdit",
        "canWithdraw",
      ].sort(),
    );
    await expect(
      getOwnedCommunityReview(
        w.id,
        review.content.id,
        { locale: "en", contentKind: "REVIEW" },
        h(admin),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(list(w.id)).rejects.toMatchObject({ status: 404 });
    const serialized = JSON.stringify(
      await listOwnedCommunityReviews({ locale: "en" }, h(owner)),
    );
    for (const needle of [
      input().body,
      "Synthetic explicit context",
      owner.id,
      owner.email,
      w.primaryTitle,
    ])
      expect(serialized).not.toContain(needle);
  });
  it("actual verified account erasure blanks review author/text/dates/rating and public statistics", async () => {
    const w = await work(),
      owner = await f.account("user");
    const review = await createCommunityReview(
      w.id,
      input({ rating: 8 }),
      h(owner),
    );
    await deletion(owner);
    expect((await list(w.id)).statistics).toEqual({
      reviewCount: 0,
      ratedReviewCount: 0,
      meanRating: null,
    });
    expect(
      (
        await sql`select author_id,author_state,body,rating_half_stars,created_at,updated_at,edited_at,last_activity_at from community_contents where id=${review.content.id}`
      )[0],
    ).toMatchObject({
      author_id: null,
      author_state: "ERASED",
      body: "",
      rating_half_stars: null,
      created_at: null,
      updated_at: null,
      edited_at: null,
      last_activity_at: null,
    });
  });
  it("measures unchanged-plan bounded 2000 typed aggregation and rejects cap overflow", async () => {
    const w = await work();
    requireTestDatabase();
    const actors =
      await sql`insert into users(id,name,email,email_verified,created_at,updated_at)
      select ${f.runId} || '-capacity-' || n::text, 'Synthetic capacity actor', ${f.runId} || '-capacity-' || n::text || '@example.invalid', true, now(), now() from generate_series(1,2000) n returning id`;
    capacityUsers.push(...actors.map((a) => String(a.id)));
    await sql`insert into community_contents(work_id,kind,author_id,body,rating_half_stars)
      select ${w.id}::uuid,'REVIEW',id,'Synthetic bounded review aggregation fixture.',case when row_number() over(order by id) % 2=0 then 2 else 10 end from users where id=any(${capacityUsers}::text[])`;
    const started = performance.now();
    const result = await list(w.id);
    const elapsed = performance.now() - started;
    expect(Number.isFinite(elapsed)).toBe(true);
    expect(result.items).toHaveLength(25);
    expect(result.statistics).toEqual({
      reviewCount: 2000,
      ratedReviewCount: 2000,
      meanRating: 3,
    });
    const plan =
      await sql`explain (analyze, buffers, format json) select count(*)::integer as review_count,count(rating_half_stars)::integer as rated_review_count,coalesce(sum(rating_half_stars),0)::integer as rating_sum from community_contents where work_id=${w.id}::uuid and kind='REVIEW' and author_state='ACTIVE' and moderation_state='VISIBLE'`;
    const measured = plan[0]!["QUERY PLAN"][0];
    expect(Number.isFinite(measured["Execution Time"])).toBe(true);
    expect(measured.Plan["Actual Rows"]).toBe(1);
    console.info("V4C bounded synthetic aggregate", {
      cardinality: 2000,
      serviceMs: elapsed,
      sqlMs: measured["Execution Time"],
    });
    await expect(
      createCommunityReview(w.id, input(), h(await f.account("user"))),
    ).rejects.toMatchObject({ status: 409 });
    expect((await list(w.id, 80)).statistics).toEqual(result.statistics);
  });
  it("concurrent unpublication yields either a coherent published list/stats or404, never partial DTO", async () => {
    const w = await work(),
      owner = await f.account("user");
    await createCommunityReview(w.id, input({ rating: 10 }), h(owner));
    const [read] = await Promise.allSettled([
      list(w.id),
      sql`update works set visibility='DRAFT' where id=${w.id}`,
    ]);
    if (read.status === "fulfilled") {
      expect(read.value.items).toHaveLength(1);
      expect(read.value.statistics).toEqual({
        reviewCount: 1,
        ratedReviewCount: 1,
        meanRating: 5,
      });
    } else expect(read.reason).toMatchObject({ status: 404 });
    await expect(list(w.id)).rejects.toMatchObject({ status: 404 });
  });
  it("metadata UUID-descending paging uses no dates, includes withdrawn unavailable and enforces ownread once", async () => {
    const w = await work(),
      owner = await f.account("user");
    requireTestDatabase();
    // Closed visible reviews do not reserve a slot; 28 lifetime rows on one synthetic Work are legitimate metadata fixtures.
    await sql`insert into community_contents(work_id,kind,author_id,author_state,body) select ${w.id}::uuid,'REVIEW',${owner.id},'DELETED','' from generate_series(1,28)`;
    const first = await listOwnedCommunityReviews({ locale: "en" }, h(owner));
    expect(first.items).toHaveLength(25);
    expect(first.items.map((r) => r.id)).toEqual(
      first.items
        .map((r) => r.id)
        .sort()
        .reverse(),
    );
    const rest = await listOwnedCommunityReviews(
      { locale: "en", cursor: { id: first.items[24]!.id, timestamp: null } },
      h(owner),
    );
    expect(rest.items).toHaveLength(3);
    expect(
      rest.items.every((r) => !first.items.some((a) => a.id === r.id)),
    ).toBe(true);
    await expect(
      listOwnedCommunityReviews(
        {
          locale: "en",
          cursor: { id: randomUUID(), timestamp: new Date().toISOString() },
        },
        h(owner),
      ),
    ).rejects.toThrow();
    expect(
      Number(
        (
          await sql`select count from rate_limits where key=${`community.ownread:${owner.id}`}`
        )[0]!.count,
      ),
    ).toBe(3);
  });
});
