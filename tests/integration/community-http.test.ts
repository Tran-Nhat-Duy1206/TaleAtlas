import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { getAuth } from "../../apps/web/src/server/auth";
import {
  discussionMutationResponseSchema,
  discussionPublicSchema,
  discussionRevealResponseSchema,
  communityOwnedSchema,
  communityOwnedListResponseSchema,
} from "../../apps/web/src/features/community/http-contracts";
import * as threads from "../../apps/web/src/app/api/community/works/[workId]/threads/route";
import * as detail from "../../apps/web/src/app/api/community/works/[workId]/threads/[threadId]/route";
import * as replies from "../../apps/web/src/app/api/community/works/[workId]/threads/[threadId]/replies/route";
import * as edit from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/route";
import * as withdraw from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/withdraw/route";
import * as reveal from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/reveal/route";
import * as owned from "../../apps/web/src/app/api/community/owned/route";
import * as ownedDetail from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/owned/route";

// Direct Next route dispatch + real PostgreSQL/Better Auth/SMTP. No SQL/auth/limiter mocks or resets.
const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const workIds: string[] = [],
  actorIPs = new Map<string, string>();
const freshIP = () => {
  const n = randomUUID().replaceAll("-", "");
  return `127.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}.${parseInt(n.slice(4, 6), 16)}`;
};
const headers = (actor?: Actor, origin = f.origin, ip?: string) => {
  if (actor && !actorIPs.has(actor.id)) actorIPs.set(actor.id, freshIP());
  return new Headers({
    Origin: origin,
    "Content-Type": "application/json",
    "x-real-ip": ip ?? (actor ? actorIPs.get(actor.id)! : freshIP()),
    ...(actor ? { Cookie: actor.cookie } : {}),
  });
};
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
const context = (workId: string, targetId: string = randomUUID()) => ({
  params: Promise.resolve({ workId, threadId: targetId, contentId: targetId }),
});
const input = (overrides: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  title: "Deliberately synthetic public topic",
  body: "Synthetic public body, never a private library note.",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  ...overrides,
});
const replyInput = (
  threadId: string,
  overrides: Record<string, unknown> = {},
) => ({
  mutationKey: randomUUID(),
  threadId,
  parentId: null,
  depth: 0,
  body: "Deliberately synthetic public reply",
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  ...overrides,
});
async function work() {
  const w = (await createWork(
    {
      primaryTitle: `HTTP synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation:
          "UUID-owned synthetic HTTP fixture, never production metadata.",
      },
    },
    headers(admin),
  )) as AdminWork;
  workIds.push(w.id);
  return w;
}
async function createThread(workId: string, actor = owner, body = input()) {
  const response = await threads.POST(
    request("POST", actor, body),
    context(workId),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return discussionMutationResponseSchema.parse(await response.json());
}
async function shared(actor: Actor) {
  return Number(
    (
      await sql`select count from rate_limits where key=${`catalog.write:${actor.id}`}`
    )[0]?.count ?? 0,
  );
}
async function persisted(id: string) {
  return (await sql`select * from community_contents where id=${id}`)[0];
}
async function assertError(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["error"]);
  if (code) expect(body).toEqual({ error: code });
  expect(response.headers.get("cache-control")).toContain("no-store");
}
async function confirmedDeletion(actor: Actor) {
  const requested = await getAuth().handler(
    new Request(`${f.origin}/api/auth/delete-user`, {
      method: "POST",
      headers: headers(actor),
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
  if (!link) throw new Error("Actual synthetic deletion SMTP link missing");
  expect([200, 302]).toContain(
    (await getAuth().handler(new Request(link, { headers: headers(actor) })))
      .status,
  );
}
beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V4_COMMUNITIES_ENABLED = "true";
  admin = await f.account("admin");
});
beforeEach(async () => {
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  for (const depth of [2, 1, 0])
    await sql`delete from community_contents where work_id=any(${workIds}::uuid[]) and kind='REPLY' and depth=${depth}`;
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

describe("V4B real SQL HTTP adapters with actual signed SMTP actors", () => {
  it("actual disabled flag wins before promised params, payload and signed session", async () => {
    process.env.V4_COMMUNITIES_ENABLED = "false";
    const untouched = {
      get params(): Promise<{
        workId: string;
        threadId: string;
        contentId: string;
      }> {
        throw new Error("Params accessed before gate");
      },
    };
    const before = await shared(owner);
    try {
      for (const handler of [
        threads.GET,
        threads.POST,
        detail.GET,
        replies.GET,
        replies.POST,
        edit.PATCH,
        withdraw.POST,
        reveal.POST,
        ownedDetail.GET,
      ]) {
        const req = new Request(`${f.origin}/api/community?unknown=1`, {
          method: "POST",
          headers: headers(owner),
          body: "{",
        });
        await assertError(
          await handler(req, untouched),
          404,
          "COMMUNITY_UNAVAILABLE",
        );
        expect(req.bodyUsed).toBe(false);
      }
      await assertError(
        await owned.GET(request("GET", owner, undefined, "?unknown=1")),
        404,
        "COMMUNITY_UNAVAILABLE",
      );
      expect(await shared(owner)).toBe(before);
    } finally {
      process.env.V4_COMMUNITIES_ENABLED = "true";
    }
  });
  it("anonymous401/unverified403 happen before malformed JSON and shared charge", async () => {
    const w = await work();
    const malformed = (actor?: Actor) =>
      new Request(`${f.origin}/api/community?unknown=1`, {
        method: "POST",
        headers: headers(actor),
        body: "{",
      });
    await assertError(
      await threads.POST(malformed(), context(w.id)),
      401,
      "AUTHENTICATION_REQUIRED",
    );
    await sql`update users set email_verified=false where id=${owner.id}`;
    const req = malformed(owner);
    await assertError(
      await threads.POST(req, context(w.id)),
      403,
      "ACCESS_DENIED",
    );
    expect(req.bodyUsed).toBe(false);
    expect(await shared(owner)).toBe(0);
    expect(
      (
        await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
      )[0].count,
    ).toBe(0);
  });
  it("malformed JSON and unknown query each consume shared once, no authored rows", async () => {
    const w = await work();
    const req = new Request(`${f.origin}/api/community`, {
      method: "POST",
      headers: headers(owner),
      body: "{",
    });
    await assertError(
      await threads.POST(req, context(w.id)),
      400,
      "INVALID_JSON",
    );
    expect(await shared(owner)).toBe(1);
    await assertError(
      await threads.POST(
        request("POST", owner, input(), "?unknown=1"),
        context(w.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(await shared(owner)).toBe(2);
    expect(
      (
        await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
      )[0].count,
    ).toBe(0);
  });
  it("persisted create/replay/noop each charge once; foundation report is absent", async () => {
    const w = await work(),
      body = input();
    const first = await createThread(w.id, owner, body);
    const replayed = await createThread(w.id, owner, body);
    expect(replayed).toEqual({ content: first.content, replayed: true });
    const patch = {
      ...body,
      mutationKey: randomUUID(),
      contentKind: "THREAD",
      expectedRevision: 1,
    };
    const response = await edit.PATCH(
      request("PATCH", owner, patch),
      context(w.id, first.content.id),
    );
    expect(response.status).toBe(200);
    expect(
      discussionMutationResponseSchema.parse(await response.json()),
    ).toEqual({ content: first.content, replayed: false });
    expect(await shared(owner)).toBe(3);
    expect((await persisted(first.content.id)).revision).toBe(1);
    expect(
      (
        await sql`select count(*)::int as count from community_content_events where content_id=${first.content.id}`
      )[0].count,
    ).toBe(1);
    expect(
      (
        await sql`select count(*)::int as count from community_mutation_receipts where actor_id=${owner.id}`
      )[0].count,
    ).toBe(2);
  });
  it("B rejects rating and REVIEW at lazy charged boundaries", async () => {
    const w = await work();
    await assertError(
      await threads.POST(
        request("POST", owner, input({ rating: null })),
        context(w.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    await assertError(
      await edit.PATCH(
        request("PATCH", owner, {
          mutationKey: randomUUID(),
          contentKind: "REVIEW",
          expectedRevision: 1,
          body: "Long enough synthetic independent review text",
          bodySpoiler: false,
          spoilerContext: null,
          rating: null,
          publicSubmissionAcknowledged: true,
        }),
        context(w.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    await assertError(
      await withdraw.POST(
        request("POST", owner, {
          mutationKey: randomUUID(),
          contentKind: "REVIEW",
          expectedRevision: 1,
        }),
        context(w.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(await shared(owner)).toBe(3);
    expect(
      (
        await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
      )[0].count,
    ).toBe(0);
  });
  it("narrow reject still charges shared once; malformed replay attempts never reset quota", async () => {
    const w = await work();
    for (let i = 0; i < 5; i++) {
      const req = new Request(`${f.origin}/api/community`, {
        method: "POST",
        headers: headers(owner),
        body: "{",
      });
      await assertError(
        await threads.POST(req, context(w.id)),
        400,
        "INVALID_JSON",
      );
    }
    const sixth = request("POST", owner, input());
    await assertError(
      await threads.POST(sixth, context(w.id)),
      429,
      "RATE_LIMITED",
    );
    expect(sixth.bodyUsed).toBe(false);
    expect(await shared(owner)).toBe(6);
  });
  it("public query duplicate/unknown/page bounds reject and list/detail emit safe projections", async () => {
    const w = await work(),
      first = await createThread(w.id);
    const ip = freshIP();
    for (const query of [
      "?page=1&page=2",
      "?unknown=1",
      "?page=201",
      "?cursorTimestamp=null",
      "?locale=fr",
    ])
      await assertError(
        await threads.GET(
          request("GET", undefined, undefined, query, f.origin, ip),
          context(w.id),
        ),
        400,
        "VALIDATION_ERROR",
      );
    const response = await threads.GET(
      request("GET", undefined, undefined, "?locale=vi&page=1", f.origin, ip),
      context(w.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [first.content],
      pageSize: 25,
    });
    const single = await detail.GET(
      request("GET"),
      context(w.id, first.content.id),
    );
    expect(single.status).toBe(200);
    expect(discussionPublicSchema.parse(await single.json())).toEqual(
      first.content,
    );
    expect(await shared(owner)).toBe(1);
  });
  it("anonymous reveal obeys exact Origin, current revision, selected scope and no shared/owner charge", async () => {
    const w = await work(),
      first = await createThread(
        w.id,
        owner,
        input({
          titleSpoiler: true,
          bodySpoiler: true,
          spoilerContext: "Synthetic chapter 3",
        }),
      );
    expect(first.content.title).toEqual({ state: "MASKED", text: null });
    expect(first.content.body).toEqual({ state: "MASKED", text: null });
    expect(first.content.spoilerContext).toBeNull();
    const selected = {
      workId: w.id,
      targetId: first.content.id,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: true,
      body: false,
      spoilerRevealAcknowledged: true,
    };
    const ip = freshIP();
    await assertError(
      await reveal.POST(
        request(
          "POST",
          undefined,
          selected,
          "",
          "http://untrusted.invalid",
          ip,
        ),
        context(w.id, first.content.id),
      ),
      403,
      "UNTRUSTED_ORIGIN",
    );
    const one = await reveal.POST(
      request("POST", undefined, selected, "", f.origin, ip),
      context(w.id, first.content.id),
    );
    expect(one.status).toBe(200);
    expect(discussionRevealResponseSchema.parse(await one.json())).toEqual({
      id: first.content.id,
      workId: w.id,
      kind: "THREAD",
      revision: 1,
      title: "Deliberately synthetic public topic",
    });
    const both = await reveal.POST(
      request("POST", undefined, { ...selected, body: true }, "", f.origin, ip),
      context(w.id, first.content.id),
    );
    expect(both.status).toBe(200);
    expect(
      discussionRevealResponseSchema.parse(await both.json()).spoilerContext,
    ).toBe("Synthetic chapter 3");
    await assertError(
      await reveal.POST(
        request(
          "POST",
          undefined,
          { ...selected, expectedRevision: 2 },
          "",
          f.origin,
          ip,
        ),
        context(w.id, first.content.id),
      ),
      409,
      "STALE_REVISION",
    );
    await assertError(
      await reveal.POST(
        request(
          "POST",
          undefined,
          { ...selected, targetId: randomUUID() },
          "",
          f.origin,
          ip,
        ),
        context(w.id, first.content.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(await shared(owner)).toBe(1);
    expect(
      (
        await sql`select count from rate_limits where key=${`community.ownread:${owner.id}`}`
      ).length,
    ).toBe(0);
    expect((await persisted(first.content.id)).revision).toBe(1);
  });
  it("reply depth0..2 persists, wrongwork/parent scopes reject and thread path refuses a reply", async () => {
    const w = await work(),
      other = await work(),
      first = await createThread(w.id);
    const reply = async (body: ReturnType<typeof replyInput>) => {
      const response = await replies.POST(
        request("POST", owner, body),
        context(w.id, first.content.id),
      );
      expect(response.status).toBe(200);
      return discussionMutationResponseSchema.parse(await response.json())
        .content;
    };
    const r0 = await reply(replyInput(first.content.id));
    const r1 = await reply(
      replyInput(first.content.id, { parentId: r0.id, depth: 1 }),
    );
    const r2 = await reply(
      replyInput(first.content.id, { parentId: r1.id, depth: 2 }),
    );
    expect((await persisted(r2.id)).depth).toBe(2);
    const response = await replies.GET(
      request("GET"),
      context(w.id, first.content.id),
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map((item: { id: string }) => item.id),
    ).toEqual([r2.id, r1.id, r0.id]);
    await assertError(
      await detail.GET(request("GET"), context(w.id, r0.id)),
      404,
      "COMMUNITY_NOT_FOUND",
    );
    await assertError(
      await replies.POST(
        request(
          "POST",
          owner,
          replyInput(first.content.id, { parentId: r2.id, depth: 3 }),
        ),
        context(w.id, first.content.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    const outsider = await f.account("user");
    await assertError(
      await replies.POST(
        request("POST", outsider, replyInput(first.content.id)),
        context(other.id, first.content.id),
      ),
      404,
      "COMMUNITY_NOT_FOUND",
    );
    await assertError(
      await replies.POST(
        request(
          "POST",
          outsider,
          replyInput(first.content.id, { parentId: r0.id, depth: 2 }),
        ),
        context(w.id, first.content.id),
      ),
      404,
      "COMMUNITY_NOT_FOUND",
    );
    await assertError(
      await replies.POST(
        request("POST", outsider, replyInput(randomUUID())),
        context(w.id, first.content.id),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(await shared(owner)).toBe(5);
    expect(await shared(outsider)).toBe(3);
  });
  it("current owner only even admin; UUID-only unpublished owner context permits text-free withdrawal", async () => {
    const w = await work(),
      first = await createThread(w.id);
    await assertError(
      await owned.GET(request("GET")),
      401,
      "AUTHENTICATION_REQUIRED",
    );
    await assertError(
      await ownedDetail.GET(
        request("GET", admin, undefined, "?contentKind=THREAD"),
        context(w.id, first.content.id),
      ),
      404,
      "COMMUNITY_NOT_FOUND",
    );
    await assertError(
      await withdraw.POST(
        request("POST", admin, {
          mutationKey: randomUUID(),
          contentKind: "THREAD",
          expectedRevision: 1,
        }),
        context(w.id, first.content.id),
      ),
      404,
      "COMMUNITY_NOT_FOUND",
    );
    await setVisibility(
      w.id,
      { revision: w.revision, visibility: "HIDDEN" },
      headers(admin),
    );
    const response = await ownedDetail.GET(
      request("GET", owner, undefined, "?contentKind=THREAD"),
      context(w.id, first.content.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const own = communityOwnedSchema.parse(await response.json());
    expect(own).toEqual({
      id: first.content.id,
      workId: w.id,
      kind: "THREAD",
      threadId: null,
      parentId: null,
      depth: null,
      revision: 1,
      authorState: "ACTIVE",
      moderationState: "VISIBLE",
      workAvailable: false,
      canEdit: false,
      canWithdraw: true,
    });
    await assertError(
      await owned.GET(request("GET", owner, undefined, "?locale=en&locale=vi")),
      400,
      "VALIDATION_ERROR",
    );
    const list = await owned.GET(request("GET", owner));
    expect(list.status).toBe(200);
    expect(communityOwnedListResponseSchema.parse(await list.json())).toEqual({
      items: [own],
      pageSize: 25,
    });
    const withdrawn = await withdraw.POST(
      request("POST", owner, {
        mutationKey: randomUUID(),
        contentKind: "THREAD",
        expectedRevision: 1,
      }),
      context(w.id, first.content.id),
    );
    expect(withdrawn.status).toBe(200);
    const result = discussionMutationResponseSchema.parse(
      await withdrawn.json(),
    );
    expect(result.content.state).toBe("DELETED");
    expect(result.content.body).toEqual({ state: "UNAVAILABLE", text: null });
    expect(result.content.title).toEqual({ state: "UNAVAILABLE", text: null });
    expect(result.content.author).toBeNull();
    expect((await persisted(first.content.id)).author_state).toBe("DELETED");
    expect(
      Number(
        (
          await sql`select count from rate_limits where key=${`community.ownread:${owner.id}`}`
        )[0].count,
      ),
    ).toBe(3);
  });
  it("revoked current session during lazy HTTP parsing cannot persist authored rows", async () => {
    const w = await work();
    const stream = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          await sql`delete from sessions where user_id=${owner.id}`;
          controller.enqueue(new TextEncoder().encode(JSON.stringify(input())));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: headers(owner),
      body: stream,
      duplex: "half",
    };
    await assertError(
      await threads.POST(
        new Request(`${f.origin}/api/community`, init),
        context(w.id),
      ),
      401,
      "AUTHENTICATION_REQUIRED",
    );
    expect(await shared(owner)).toBe(1);
    expect(
      (
        await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
      )[0].count,
    ).toBe(0);
  });
  it("actual SMTP-confirmed account erasure during lazy parsing cannot recreate identity-bearing budgets", async () => {
    const w = await work();
    type SharedBudgetRow = {
      id: string;
      key: string;
      count: number;
      last_request: string;
    };
    let sharedBeforeErasure: SharedBudgetRow | undefined;
    const stream = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          // Parsing follows the frozen shared charge. Capture its exact row before actual erasure.
          [sharedBeforeErasure] = await sql<
            SharedBudgetRow[]
          >`select id, key, count, last_request::text as last_request from rate_limits where key=${`catalog.write:${owner.id}`}`;
          expect(sharedBeforeErasure?.count).toBe(1);
          await confirmedDeletion(owner);
          controller.enqueue(new TextEncoder().encode(JSON.stringify(input())));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: headers(owner),
      body: stream,
      duplex: "half",
    };
    await assertError(
      await threads.POST(
        new Request(`${f.origin}/api/community`, init),
        context(w.id),
      ),
      403,
      "ACCESS_DENIED",
    );
    expect((await sql`select id from users where id=${owner.id}`).length).toBe(
      0,
    );
    // Only the five V4 actor namespaces are erased; legacy catalog/auth retention is frozen.
    expect(
      (
        await sql`select key from rate_limits where key=any(${["community.post:", "community.report:", "community.safety:", "community.modread:", "community.ownread:"].map((prefix) => prefix + owner.id)}::text[])`
      ).length,
    ).toBe(0);
    expect(sharedBeforeErasure).toBeDefined();
    const sharedAfterErasure = await sql<
      SharedBudgetRow[]
    >`select id, key, count, last_request::text as last_request from rate_limits where key=${`catalog.write:${owner.id}`}`;
    expect(sharedAfterErasure).toEqual([sharedBeforeErasure]);
    expect(
      (
        await sql`select count(*)::int as count from community_contents where work_id=${w.id}`
      )[0].count,
    ).toBe(0);
  });
});
