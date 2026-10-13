import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getDatabase } from "../../apps/web/src/server/database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { createCommunityThread } from "../../apps/web/src/server/community/service";
import {
  reviewMutationResponseSchema,
  reviewListResponseSchema,
  reviewOwnedSchema,
  reviewOwnedListResponseSchema,
  reviewSlotResponseSchema,
  reviewRevealResponseSchema,
} from "../../apps/web/src/features/community/review-http-contracts";
import * as reviews from "../../apps/web/src/app/api/community/works/[workId]/reviews/route";
import * as edit from "../../apps/web/src/app/api/community/works/[workId]/reviews/[reviewId]/route";
import * as withdraw from "../../apps/web/src/app/api/community/works/[workId]/reviews/[reviewId]/withdraw/route";
import * as reveal from "../../apps/web/src/app/api/community/works/[workId]/reviews/[reviewId]/reveal/route";
import * as detail from "../../apps/web/src/app/api/community/works/[workId]/reviews/[reviewId]/owned/route";
import * as slot from "../../apps/web/src/app/api/community/works/[workId]/reviews/owned/route";
import * as owned from "../../apps/web/src/app/api/community/reviews/owned/route";
import * as discussionEdit from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/route";

// Actual signed cookies + persisted SQL, no auth/database/rate mocks or limiter resets.
const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const workIds: string[] = [];
const freshIP = () => {
  const n = randomUUID().replaceAll("-", "");
  return `127.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}.${parseInt(n.slice(4, 6), 16)}`;
};
const headers = (actor?: Actor, origin = f.origin, ip = freshIP()) =>
  new Headers({
    Origin: origin,
    "Content-Type": "application/json",
    "x-real-ip": ip,
    ...(actor ? { Cookie: actor.cookie } : {}),
  });
const request = (
  method: string,
  actor?: Actor,
  body?: unknown,
  query = "",
  origin = f.origin,
  ip?: string,
) =>
  new Request(`${f.origin}/api/community${query}`, {
    method,
    headers: headers(actor, origin, ip),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (workId: string, reviewId: string = randomUUID()) => ({
  params: Promise.resolve({ workId, reviewId, contentId: reviewId }),
});
const input = (patch: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  body: "Synthetic public HTTP review body only.",
  bodySpoiler: false,
  spoilerContext: null,
  rating: null,
  publicSubmissionAcknowledged: true,
  ...patch,
});
const selection = (workId: string, targetId: string, patch = {}) => ({
  workId,
  targetId,
  contentKind: "REVIEW",
  expectedRevision: 1,
  title: false,
  body: true,
  spoilerRevealAcknowledged: true,
  ...patch,
});
async function work() {
  requireTestDatabase();
  const w = (await createWork(
    {
      primaryTitle: `C HTTP synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic HTTP review fixture only.",
      },
    },
    headers(admin),
  )) as AdminWork;
  workIds.push(w.id);
  return w;
}
async function error(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["error"]);
  if (code) expect(body).toEqual({ error: code });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
}
async function charge(actor: Actor, key = "catalog.write") {
  return Number(
    (
      await sql`select count from rate_limits where key=${`${key}:${actor.id}`}`
    )[0]?.count ?? 0,
  );
}
async function create(workId: string, body = input()) {
  const response = await reviews.POST(
    request("POST", owner, body),
    context(workId),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("cache-control")).toBe("no-store");
  return reviewMutationResponseSchema.parse(await response.json());
}
beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V4_COMMUNITIES_ENABLED = "true";
  admin = await f.account("admin");
  expect(getDatabase()).toBeDefined();
});
beforeEach(async () => {
  owner = await f.account("user");
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
  await sql`delete from works where id=any(${workIds}::uuid[])`;
  await sql`delete from catalog_sources where label=${f.sourceLabel}`;
  delete process.env.V4_COMMUNITIES_ENABLED;
  await f.stop();
});
describe("V4C additive real SQL review HTTP routes", () => {
  it("gate wins before any params/query/body/auth/SQL across every review route", async () => {
    process.env.V4_COMMUNITIES_ENABLED = "false";
    const untouched = {
      get params(): Promise<{
        workId: string;
        reviewId: string;
        contentId: string;
      }> {
        throw new Error("Params touched before gate");
      },
    };
    const before = await charge(owner);
    try {
      for (const handler of [
        reviews.GET,
        reviews.POST,
        edit.PATCH,
        withdraw.POST,
        reveal.POST,
        detail.GET,
        slot.GET,
      ]) {
        const req = new Request(`${f.origin}/api/community?unknown=1`, {
          method: "POST",
          headers: headers(owner),
          body: "{",
        });
        await error(
          await handler(req, untouched),
          404,
          "COMMUNITY_UNAVAILABLE",
        );
        expect(req.bodyUsed).toBe(false);
      }
      await error(
        await owned.GET(request("GET", owner, undefined, "?unknown=1")),
        404,
        "COMMUNITY_UNAVAILABLE",
      );
      expect(await charge(owner)).toBe(before);
    } finally {
      process.env.V4_COMMUNITIES_ENABLED = "true";
    }
  });
  it("anonymous401/unverified403 precede parsing and charging mutation/owner metadata", async () => {
    const w = await work();
    const malformed = (actor?: Actor) =>
      new Request(`${f.origin}/api/community?unknown=1`, {
        method: "POST",
        headers: headers(actor),
        body: "{",
      });
    const anon = malformed();
    await error(
      await reviews.POST(anon, context(w.id)),
      401,
      "AUTHENTICATION_REQUIRED",
    );
    expect(anon.bodyUsed).toBe(false);
    await error(
      await slot.GET(
        request("GET", undefined, undefined, "?unknown=1"),
        context(w.id),
      ),
      401,
    );
    await error(
      await owned.GET(request("GET", undefined, undefined, "?unknown=1")),
      401,
    );
    await sql`update users set email_verified=false where id=${owner.id}`;
    const req = malformed(owner);
    await error(await reviews.POST(req, context(w.id)), 403, "ACCESS_DENIED");
    expect(req.bodyUsed).toBe(false);
    await error(
      await detail.GET(
        request("GET", owner, undefined, "?unknown=1"),
        context(w.id),
      ),
      403,
    );
    expect(await charge(owner)).toBe(0);
    expect(await charge(owner, "community.ownread")).toBe(0);
  });
  it("malformed JSON, wrong origin, unknown query, missing acknowledgement and malformed rating each charge once", async () => {
    const w = await work();
    const malformed = new Request(`${f.origin}/api/community`, {
      method: "POST",
      headers: headers(owner),
      body: "{",
    });
    await error(await reviews.POST(malformed, context(w.id)), 400);
    expect(await charge(owner)).toBe(1);
    await error(
      await reviews.POST(
        request("POST", owner, input(), "", "http://evil.invalid"),
        context(w.id),
      ),
      403,
    );
    expect(await charge(owner)).toBe(2);
    await error(
      await reviews.POST(
        request("POST", owner, input(), "?privateRating=2"),
        context(w.id),
      ),
      400,
    );
    expect(await charge(owner)).toBe(3);
    await error(
      await reviews.POST(
        request("POST", owner, input({ publicSubmissionAcknowledged: false })),
        context(w.id),
      ),
      400,
    );
    expect(await charge(owner)).toBe(4);
    await error(
      await reviews.POST(
        request("POST", owner, input({ rating: 2.5 })),
        context(w.id),
      ),
      400,
    );
    expect(await charge(owner)).toBe(5);
    await error(
      await reviews.POST(request("POST", owner, input()), context(w.id)),
      429,
    );
    expect(await charge(owner)).toBe(6);
    expect(
      Number(
        (
          await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
        )[0]!.count,
      ),
    ).toBe(0);
    expect(await charge(owner, "community.post")).toBe(6);
  });
  it("enforces UTF8 64KiB limit before JSON while charging once", async () => {
    const w = await work();
    const req = new Request(`${f.origin}/api/community`, {
      method: "POST",
      headers: headers(owner),
      body: JSON.stringify(input({ body: "😀".repeat(17000) })),
    });
    await error(await reviews.POST(req, context(w.id)), 413);
    expect(await charge(owner)).toBe(1);
    expect(
      await sql`select id from community_contents where work_id=${w.id}`,
    ).toHaveLength(0);
  });
  it("creates independent unrated review, returns bounded public list plus exact statistics", async () => {
    const w = await work(),
      body = input();
    delete (body as Partial<typeof body>).rating;
    const created = await create(w.id, body);
    expect(created.content.ratingHalfStars).toBeNull();
    const response = await reviews.GET(
      request("GET", undefined, undefined, "?locale=vi"),
      context(w.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const result = reviewListResponseSchema.parse(await response.json());
    expect(result.statistics).toEqual({
      reviewCount: 1,
      ratedReviewCount: 0,
      meanRating: null,
    });
    expect(result.items[0]!.id).toBe(created.content.id);
    expect(result.items[0]!.kind).toBe("REVIEW");
    expect(result.items[0]!.spoilerContext).toBeNull();
    expect(
      await sql`select id from library_entries where user_id=${owner.id}`,
    ).toHaveLength(0);
  });
  it("uncertain same UUID replay charges once per attempt, remains masked, and edits keep current masked DTO", async () => {
    const w = await work(),
      body = input({
        bodySpoiler: true,
        spoilerContext: "Synthetic explicit context",
        rating: 6,
      });
    const first = await create(w.id, body),
      replay = await create(w.id, body);
    expect(replay).toMatchObject({
      replayed: true,
      content: {
        id: first.content.id,
        body: { state: "MASKED", text: null },
        spoilerContext: null,
      },
    });
    const response = await edit.PATCH(
      request(
        "PATCH",
        owner,
        input({
          contentKind: "REVIEW",
          expectedRevision: 1,
          bodySpoiler: true,
          rating: 10,
        }),
      ),
      context(w.id, first.content.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      reviewMutationResponseSchema.parse(await response.json()).content,
    ).toMatchObject({
      revision: 2,
      ratingHalfStars: 10,
      body: { state: "MASKED", text: null },
    });
    expect(await charge(owner)).toBe(3);
    expect(
      Number(
        (
          await sql`select count(*)::int as count from community_mutation_receipts where actor_id=${owner.id}`
        )[0]!.count,
      ),
    ).toBe(2);
  });
  it("explicit body reveal binds route IDs/kind/revision, stale409 and wrong scope400", async () => {
    const w = await work(),
      body = input({
        bodySpoiler: true,
        spoilerContext: "Synthetic selected context",
      });
    const created = await create(w.id, body),
      ctx = context(w.id, created.content.id);
    const response = await reveal.POST(
      request("POST", undefined, selection(w.id, created.content.id)),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      reviewRevealResponseSchema.parse(await response.json()),
    ).toMatchObject({ body: body.body, spoilerContext: body.spoilerContext });
    await error(
      await reveal.POST(
        request(
          "POST",
          undefined,
          selection(w.id, created.content.id, { expectedRevision: 2 }),
        ),
        ctx,
      ),
      409,
      "STALE_REVISION",
    );
    await error(
      await reveal.POST(
        request("POST", undefined, selection(randomUUID(), created.content.id)),
        ctx,
      ),
      400,
    );
    await error(
      await reveal.POST(
        request(
          "POST",
          undefined,
          selection(w.id, created.content.id, { title: true }),
        ),
        ctx,
      ),
      400,
    );
    await error(
      await reveal.POST(
        request(
          "POST",
          undefined,
          selection(w.id, created.content.id),
          "",
          "http://evil.invalid",
        ),
        ctx,
      ),
      403,
    );
  });
  it("private owner detail/list/slot return exact metadata only, never admin authority or unavailable catalog facts", async () => {
    const w = await work(),
      created = await create(
        w.id,
        input({
          rating: 8,
          bodySpoiler: true,
          spoilerContext: "Synthetic never-prefill context",
        }),
      );
    const ctx = context(w.id, created.content.id),
      query = "?locale=vi&contentKind=REVIEW";
    const response = await detail.GET(
      request("GET", owner, undefined, query),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const meta = reviewOwnedSchema.parse(await response.json());
    expect(meta.canEdit).toBe(true);
    await error(
      await detail.GET(request("GET", admin, undefined, query), ctx),
      404,
    );
    await error(
      await detail.GET(
        request("GET", owner, undefined, query),
        context(randomUUID(), created.content.id),
      ),
      404,
    );
    await error(
      await detail.GET(
        request("GET", owner, undefined, "?locale=en&contentKind=THREAD"),
        ctx,
      ),
      400,
    );
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    const privateResult = await detail.GET(
      request("GET", owner, undefined, query),
      ctx,
    );
    expect(privateResult.status).toBe(200);
    expect(privateResult.headers.get("x-robots-tag")).toBe("noindex");
    expect(reviewOwnedSchema.parse(await privateResult.json())).toMatchObject({
      workAvailable: false,
      canEdit: false,
      canWithdraw: true,
    });
    const slots = await slot.GET(
      request("GET", owner, undefined, "?locale=en"),
      ctx,
    );
    expect(slots.status).toBe(200);
    expect(slots.headers.get("x-robots-tag")).toBe("noindex");
    expect(reviewSlotResponseSchema.parse(await slots.json()).item?.id).toBe(
      created.content.id,
    );
    const all = await owned.GET(request("GET", owner, undefined, "?locale=en"));
    expect(all.status).toBe(200);
    expect(all.headers.get("x-robots-tag")).toBe("noindex");
    const listed = reviewOwnedListResponseSchema.parse(await all.json());
    expect(listed.items).toHaveLength(1);
    for (const needle of [
      input().body,
      "Synthetic never-prefill context",
      owner.id,
      owner.email,
      w.primaryTitle,
    ])
      expect(JSON.stringify(listed)).not.toContain(needle);
    await error(await reviews.GET(request("GET"), ctx), 404);
    expect(await charge(owner, "community.ownread")).toBe(6);
  });
  it("review adapters reject discussion kinds and B discussion HTTP still rejects REVIEW", async () => {
    const w = await work();
    const thread = await createCommunityThread(
      w.id,
      {
        mutationKey: randomUUID(),
        title: "Synthetic cross-kind topic",
        body: "Synthetic cross-kind discussion",
        titleSpoiler: false,
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      headers(owner),
    );
    await error(
      await edit.PATCH(
        request(
          "PATCH",
          owner,
          input({ contentKind: "REVIEW", expectedRevision: 1 }),
        ),
        context(w.id, thread.content.id),
      ),
      404,
    );
    await error(
      await withdraw.POST(
        request("POST", owner, {
          mutationKey: randomUUID(),
          contentKind: "THREAD",
          expectedRevision: 1,
        }),
        context(w.id, thread.content.id),
      ),
      400,
    );
    const review = await create(w.id);
    // Frozen B response headers are outside C ownership; preserve its rejection assertions.
    const discussionResponse = await discussionEdit.PATCH(
      request(
        "PATCH",
        owner,
        input({ contentKind: "REVIEW", expectedRevision: 1 }),
      ),
      context(w.id, review.content.id),
    );
    expect(discussionResponse.status).toBe(400);
    expect(await discussionResponse.json()).toEqual({
      error: "VALIDATION_ERROR",
    });
    expect(discussionResponse.headers.get("cache-control")).toContain(
      "no-store",
    );
    await error(
      await detail.GET(
        request("GET", owner, undefined, "?contentKind=REVIEW"),
        context(w.id, thread.content.id),
      ),
      404,
    );
  });
  it("withdraw erases persisted authored values and public statistics, remains private metadata", async () => {
    const w = await work(),
      created = await create(w.id, input({ rating: 2 }));
    const response = await withdraw.POST(
      request("POST", owner, {
        mutationKey: randomUUID(),
        contentKind: "REVIEW",
        expectedRevision: 1,
      }),
      context(w.id, created.content.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      reviewMutationResponseSchema.parse(await response.json()).content,
    ).toMatchObject({
      state: "DELETED",
      ratingHalfStars: null,
      body: { state: "UNAVAILABLE", text: null },
      author: null,
      createdAt: null,
    });
    expect(
      (
        await sql`select body,rating_half_stars from community_contents where id=${created.content.id}`
      )[0],
    ).toMatchObject({ body: "", rating_half_stars: null });
    const publicResponse = await reviews.GET(request("GET"), context(w.id));
    expect(publicResponse.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      reviewListResponseSchema.parse(await publicResponse.json()).statistics,
    ).toEqual({ reviewCount: 0, ratedReviewCount: 0, meanRating: null });
    const slotResponse = await slot.GET(request("GET", owner), context(w.id));
    expect(slotResponse.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      reviewSlotResponseSchema.parse(await slotResponse.json()).item,
    ).toBeNull();
  });
  it("public malformed negative reads consume read60 once through the61st429 without authored DTO", async () => {
    const w = await work(),
      ip = freshIP();
    for (let attempt = 1; attempt <= 61; attempt++) {
      await error(
        await reviews.GET(
          request("GET", undefined, undefined, "?unknown=1", f.origin, ip),
          context(w.id),
        ),
        attempt <= 60 ? 400 : 429,
      );
    }
    // Derive the key exactly as the service: only the synthetic secret and local IP are involved.
    const { createHash } = await import("node:crypto");
    const subject = createHash("sha256")
      .update(process.env.BETTER_AUTH_SECRET!)
      .update("\0community-read\0")
      .update(ip)
      .digest("hex");
    expect(
      Number(
        (
          await sql`select count from rate_limits where key=${`community.read:${subject}`}`
        )[0]!.count,
      ),
    ).toBe(61);
  });
  it("private owner malformed reads consume ownread60 exactly once and reject61st429", async () => {
    for (let attempt = 1; attempt <= 61; attempt++) {
      await error(
        await owned.GET(request("GET", owner, undefined, "?unknown=1")),
        attempt <= 60 ? 400 : 429,
      );
    }
    expect(await charge(owner, "community.ownread")).toBe(61);
    expect(await charge(owner)).toBe(0);
  });
  it("negative body reveals consume reveal20 exactly once through21st429", async () => {
    const w = await work(),
      ip = freshIP(),
      ctx = context(w.id);
    for (let attempt = 1; attempt <= 21; attempt++) {
      await error(
        await reveal.POST(
          request(
            "POST",
            undefined,
            selection(w.id, randomUUID(), { body: false }),
            "",
            f.origin,
            ip,
          ),
          ctx,
        ),
        attempt <= 20 ? 400 : 429,
      );
    }
    const { createHash } = await import("node:crypto");
    const subject = createHash("sha256")
      .update(process.env.BETTER_AUTH_SECRET!)
      .update("\0community-read\0")
      .update(ip)
      .digest("hex");
    expect(
      Number(
        (
          await sql`select count from rate_limits where key=${`community.reveal:${subject}`}`
        )[0]!.count,
      ),
    ).toBe(21);
  });
  it("malformed owner/slot inputs are charged exactly once, auth budget cannot be bypassed by lazy query", async () => {
    const w = await work();
    await error(
      await slot.GET(
        request("GET", owner, undefined, "?locale=en&locale=vi"),
        context(w.id),
      ),
      400,
    );
    await error(
      await owned.GET(
        request(
          "GET",
          owner,
          undefined,
          `?cursorId=${randomUUID()}&cursorTimestamp=2026-01-01T00:00:00.000Z`,
        ),
      ),
      400,
    );
    await error(
      await detail.GET(
        request(
          "GET",
          owner,
          undefined,
          "?contentKind=REVIEW&contentKind=REVIEW",
        ),
        context(w.id),
      ),
      400,
    );
    expect(await charge(owner, "community.ownread")).toBe(3);
    expect(await charge(owner)).toBe(0);
  });
});
