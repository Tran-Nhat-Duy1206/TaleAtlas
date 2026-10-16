import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getDatabase } from "../../apps/web/src/server/database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  createCommunityThread,
  createCommunityReply,
  createCommunityReview,
  listOwnedCommunityContents,
} from "../../apps/web/src/server/community/service";
import {
  communityCommandResponseSchema,
  ownedReportSchema,
  ownedReportListResponseSchema,
  moderationTargetSchema,
  moderationQueueResponseSchema,
  moderationHistoryResponseSchema,
  moderationEvidenceResponseSchema,
} from "../../apps/web/src/features/community/moderation-http-contracts";
import * as reports from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/reports/route";
import * as ownList from "../../apps/web/src/app/api/community/reports/owned/route";
import * as ownDetail from "../../apps/web/src/app/api/community/reports/[reportId]/owned/route";
import * as queue from "../../apps/web/src/app/api/community/moderation/reports/route";
import * as metadata from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/moderation/metadata/route";
import * as evidenceRoute from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/moderation/context/route";
import * as history from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/moderation/history/route";
import * as decisions from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/moderation/route";

// Direct real route dispatch with PostgreSQL, actual verified signed cookies and unchanged budgets. No authority/db/limiter mocks.
const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor, reporter: Actor, mod: Actor;
const workIds: string[] = [];
const ip = () => {
  const n = randomUUID().replaceAll("-", "");
  return `127.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}.${parseInt(n.slice(4, 6), 16)}`;
};
const h = (actor?: Actor, origin = f.origin) =>
  new Headers({
    Origin: origin,
    "Content-Type": "application/json",
    "x-real-ip": ip(),
    ...(actor ? { Cookie: actor.cookie } : {}),
  });
const request = (
  method: string,
  actor?: Actor,
  body?: unknown,
  query = "",
  origin = f.origin,
) =>
  new Request(`${f.origin}/api/community${query}`, {
    method,
    headers: h(actor, origin),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (
  workId: string,
  contentId: string = randomUUID(),
  reportId: string = randomUUID(),
) => ({ params: Promise.resolve({ workId, contentId, reportId }) });
const report = (patch: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  contentKind: "THREAD",
  expectedRevision: 1,
  reason: "OTHER",
  explanation: `Synthetic selected HTTP report ${randomUUID()}`,
  ...patch,
});
const command = (patch: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  contentKind: "THREAD",
  expectedRevision: 1,
  action: "HIDE",
  reportId: null,
  expectedReportRevision: null,
  reason: `Synthetic selected HTTP decision ${randomUUID()}`,
  ...patch,
});
const selection = (
  workId: string,
  targetId: string,
  patch: Record<string, unknown> = {},
) => ({
  workId,
  targetId,
  contentKind: "THREAD",
  expectedRevision: 1,
  selection: "BODY",
  reportId: null,
  expectedReportRevision: null,
  actionId: null,
  actionSequence: null,
  evidenceSelectionAcknowledged: true,
  spoilerRevealAcknowledged: true,
  ...patch,
});
async function work() {
  requireTestDatabase();
  const row = (await createWork(
    {
      primaryTitle: `D HTTP synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic D HTTP fixture only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(row.id);
  return row;
}
async function thread(workId: string) {
  return createCommunityThread(
    workId,
    {
      mutationKey: randomUUID(),
      title: "Synthetic HTTP concealed topic",
      body: "Synthetic HTTP concealed body independent of private V3",
      titleSpoiler: true,
      bodySpoiler: true,
      spoilerContext: "Synthetic concealed context",
      publicSubmissionAcknowledged: true,
    },
    h(owner),
  );
}
async function privateError(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  const value = await response.json();
  expect(Object.keys(value)).toEqual(["error"]);
  if (code) expect(value).toEqual({ error: code });
}
async function success(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  return response.json();
}
const charge = async (actor: Actor, family = "catalog.write") =>
  Number(
    (
      await sql`select count from rate_limits where key=${`${family}:${actor.id}`}`
    )[0]?.count ?? 0,
  );
async function submit(
  workId: string,
  contentId: string,
  input = report(),
  actor = reporter,
) {
  return communityCommandResponseSchema.parse(
    await success(
      await reports.POST(
        request("POST", actor, input),
        context(workId, contentId),
      ),
    ),
  );
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
  reporter = await f.account("user");
  mod = await f.account("moderator");
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
describe("V4D real signed HTTP report and private moderation adapters", () => {
  it("all eight routes gate before params, query, payload, auth and charging, with private noindex errors", async () => {
    process.env.V4_COMMUNITIES_ENABLED = "false";
    const untouched = {
      get params(): Promise<{
        workId: string;
        contentId: string;
        reportId: string;
      }> {
        throw new Error("Params touched before gate");
      },
    };
    const before = await charge(reporter);
    try {
      for (const handler of [
        reports.POST,
        ownDetail.GET,
        metadata.GET,
        evidenceRoute.POST,
        history.GET,
        decisions.POST,
      ]) {
        const req = new Request(`${f.origin}/api/community?unknown=1`, {
          method: "POST",
          headers: h(mod),
          body: "{",
        });
        await privateError(
          await handler(req, untouched),
          404,
          "COMMUNITY_UNAVAILABLE",
        );
        expect(req.bodyUsed).toBe(false);
      }
      for (const handler of [ownList.GET, queue.GET])
        await privateError(
          await handler(request("GET", mod, undefined, "?unknown=1")),
          404,
          "COMMUNITY_UNAVAILABLE",
        );
      expect(await charge(reporter)).toBe(before);
      expect(await charge(mod, "community.modread")).toBe(0);
    } finally {
      process.env.V4_COMMUNITIES_ENABLED = "true";
    }
  });
  it("anonymous401/unverified403/current ordinary user403 win before privileged body or query parse", async () => {
    const w = await work(),
      ctx = context(w.id);
    const malformed = (actor?: Actor) =>
      new Request(`${f.origin}/api/community?unknown=1`, {
        method: "POST",
        headers: h(actor),
        body: "{",
      });
    const anon = malformed();
    await privateError(await reports.POST(anon, ctx), 401);
    expect(anon.bodyUsed).toBe(false);
    await privateError(
      await ownList.GET(request("GET", undefined, undefined, "?unknown=1")),
      401,
    );
    await privateError(
      await queue.GET(request("GET", reporter, undefined, "?unknown=1")),
      403,
    );
    const ordinary = malformed(reporter);
    await privateError(await evidenceRoute.POST(ordinary, ctx), 403);
    expect(ordinary.bodyUsed).toBe(false);
    await sql`update users set email_verified=false where id=${reporter.id}`;
    const unverified = malformed(reporter);
    await privateError(await reports.POST(unverified, ctx), 403);
    expect(unverified.bodyUsed).toBe(false);
    await privateError(
      await ownDetail.GET(
        request("GET", reporter, undefined, "?unknown=1"),
        ctx,
      ),
      403,
    );
    expect(await charge(reporter)).toBe(0);
    expect(await charge(reporter, "community.ownread")).toBe(0);
    expect(await charge(reporter, "community.modread")).toBe(0);
  });
  it("three kinds report with no invented ack and minimal scope/receipt only", async () => {
    const w = await work(),
      root = await thread(w.id);
    const reply = await createCommunityReply(
      w.id,
      {
        mutationKey: randomUUID(),
        threadId: root.content.id,
        parentId: null,
        depth: 0,
        body: "Synthetic reported HTTP reply",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      h(owner),
    );
    const review = await createCommunityReview(
      w.id,
      {
        mutationKey: randomUUID(),
        body: "Synthetic reported HTTP independent review",
        rating: 10,
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      h(owner),
    );
    for (const [contentKind, row] of [
      ["THREAD", root],
      ["REPLY", reply],
      ["REVIEW", review],
    ] as const) {
      const value = await submit(w.id, row.content.id, report({ contentKind }));
      expect(value).toMatchObject({
        content: {
          id: row.content.id,
          workId: w.id,
          kind: contentKind,
          revision: 1,
        },
        report: { state: "OPEN", revision: 1 },
        replayed: false,
      });
      expect(Object.keys(value.content).sort()).toEqual(
        ["id", "workId", "kind", "revision"].sort(),
      );
      expect(JSON.stringify(value)).not.toContain("Synthetic reported");
      expect(JSON.stringify(value)).not.toContain("concealed");
    }
    expect(await charge(reporter)).toBe(3);
    expect(await charge(reporter, "community.report")).toBe(3);
  });
  it.each([
    "SPAM",
    "HARASSMENT",
    "HATE",
    "SEXUAL_CONTENT",
    "ILLEGAL_CONTENT",
    "COPYRIGHT",
    "OTHER",
  ])(
    "actual signed report reason %s has a minimal private receipt with no narrative taxonomy leakage",
    async (reason) => {
      const w = await work(),
        root = await thread(w.id);
      const value = await submit(
        w.id,
        root.content.id,
        report({
          reason,
          explanation:
            reason === "OTHER" ? "Synthetic meaningful OTHER detail" : "",
        }),
      );
      expect(value.report).toMatchObject({ state: "OPEN", revision: 1 });
      expect(Object.keys(value.report!).sort()).toEqual(
        ["id", "state", "revision"].sort(),
      );
      expect(JSON.stringify(value)).not.toContain(reason);
      expect(await charge(reporter)).toBe(1);
      expect(await charge(reporter, "community.report")).toBe(1);
    },
  );
  it("malformed JSON, exact Origin and OTHER validation each charge shared/report once; fourth429 never writes", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    const malformed = new Request(`${f.origin}/api/community`, {
      method: "POST",
      headers: h(reporter),
      body: "{",
    });
    await privateError(await reports.POST(malformed, ctx), 400);
    await privateError(
      await reports.POST(
        request("POST", reporter, report(), "", "http://evil.invalid"),
        ctx,
      ),
      403,
      "UNTRUSTED_ORIGIN",
    );
    await privateError(
      await reports.POST(
        request("POST", reporter, report({ explanation: "xx" })),
        ctx,
      ),
      400,
    );
    await privateError(
      await reports.POST(request("POST", reporter, report()), ctx),
      429,
      "RATE_LIMITED",
    );
    expect(await charge(reporter)).toBe(4);
    expect(await charge(reporter, "community.report")).toBe(4);
    expect(
      await sql`select id from community_reports where content_id=${root.content.id}`,
    ).toHaveLength(0);
  });
  it("same UUID report replay has current receipt and changed-payload conflict still charges once", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = report();
    const first = await submit(w.id, root.content.id, input),
      replay = await submit(w.id, root.content.id, input);
    expect(replay).toEqual({ ...first, replayed: true });
    await privateError(
      await reports.POST(
        request("POST", reporter, {
          ...input,
          explanation: "Synthetic deliberately changed replay payload",
        }),
        context(w.id, root.content.id),
      ),
      409,
    );
    expect(await charge(reporter)).toBe(3);
    expect(await charge(reporter, "community.report")).toBe(3);
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${reporter.id}`,
    ).toHaveLength(1);
  });
  it("public report ingress rejects crosskind/work/UUID scope and unknown query without body leakage", async () => {
    const w = await work(),
      root = await thread(w.id);
    await privateError(
      await reports.POST(
        request("POST", reporter, report({ contentKind: "REVIEW" })),
        context(w.id, root.content.id),
      ),
      404,
    );
    await privateError(
      await reports.POST(
        request("POST", reporter, report()),
        context(randomUUID(), root.content.id),
      ),
      404,
    );
    const bad = request("POST", reporter, report(), "?unknown=1");
    await privateError(
      await reports.POST(bad, context(w.id, root.content.id)),
      400,
    );
    expect(bad.bodyUsed).toBe(false);
    expect(await charge(reporter)).toBe(3);
  });
  it("64KiB/fatal UTF8/content type failures preserve charges and private noindex", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    const tooLarge = request(
      "POST",
      reporter,
      report({ explanation: "😀".repeat(17000) }),
    );
    await privateError(await reports.POST(tooLarge, ctx), 413);
    const invalidUTF8 = new Request(`${f.origin}/api/community`, {
      method: "POST",
      headers: h(reporter),
      body: new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]),
    });
    await privateError(
      await reports.POST(invalidUTF8, ctx),
      400,
      "INVALID_JSON",
    );
    const wrongTypeHeaders = h(reporter);
    wrongTypeHeaders.set("Content-Type", "text/plain");
    await privateError(
      await reports.POST(
        new Request(`${f.origin}/api/community`, {
          method: "POST",
          headers: wrongTypeHeaders,
          body: JSON.stringify(report()),
        }),
        ctx,
      ),
      415,
      "JSON_REQUIRED",
    );
    expect(await charge(reporter)).toBe(3);
    expect(
      await sql`select id from community_reports where content_id=${root.content.id}`,
    ).toHaveLength(0);
  });
  it("owned report status is reporter-only, survives unavailable Work, and shares existing metadata60 bucket", async () => {
    const w = await work(),
      root = await thread(w.id),
      posted = await submit(w.id, root.content.id);
    const reportId = posted.report!.id,
      ctx = context(w.id, root.content.id, reportId);
    await listOwnedCommunityContents({ locale: "en" }, h(reporter));
    const status = ownedReportSchema.parse(
      await success(
        await ownDetail.GET(
          request("GET", reporter, undefined, "?locale=vi"),
          ctx,
        ),
      ),
    );
    expect(status).toMatchObject({
      id: reportId,
      contentId: root.content.id,
      state: "OPEN",
    });
    await privateError(await ownDetail.GET(request("GET", admin), ctx), 404);
    await privateError(await ownDetail.GET(request("GET", owner), ctx), 404);
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    const all = ownedReportListResponseSchema.parse(
      await success(await ownList.GET(request("GET", reporter))),
    );
    expect(all.items[0]!.workAvailable).toBe(false);
    for (const needle of [
      "concealed",
      reporter.id,
      owner.id,
      w.primaryTitle,
      "explanation",
      "reason",
    ])
      expect(JSON.stringify(all)).not.toContain(needle);
    await privateError(
      await ownDetail.GET(
        request("GET", reporter, undefined, "?unknown=1"),
        ctx,
      ),
      400,
    );
    expect(await charge(reporter, "community.ownread")).toBe(4);
    expect(await charge(reporter)).toBe(1);
  });
  it("queue/target/history initial JSON contains metadata only and consumes only shared moderator read60", async () => {
    const w = await work(),
      root = await thread(w.id),
      posted = await submit(w.id, root.content.id);
    const queued = moderationQueueResponseSchema.parse(
      await success(
        await queue.GET(
          request("GET", mod, undefined, "?locale=vi&state=OPEN"),
        ),
      ),
    );
    expect(queued.items.some((item) => item.id === posted.report!.id)).toBe(
      true,
    );
    const ctx = context(w.id, root.content.id);
    const target = moderationTargetSchema.parse(
      await success(
        await metadata.GET(request("GET", mod, undefined, "?kind=THREAD"), ctx),
      ),
    );
    const events = moderationHistoryResponseSchema.parse(
      await success(
        await history.GET(
          request(
            "GET",
            mod,
            undefined,
            "?kind=THREAD&expectedRevision=1&stream=EVENTS",
          ),
          ctx,
        ),
      ),
    );
    expect(events.items).toHaveLength(1);
    expect(target.revision).toBe(1);
    for (const needle of [
      "concealed",
      owner.id,
      reporter.id,
      w.primaryTitle,
      "explanation",
      "reason",
      "ratingHalfStars",
    ])
      expect(JSON.stringify({ queued, target, events })).not.toContain(needle);
    expect(await charge(mod, "community.modread")).toBe(3);
    expect(await charge(mod)).toBe(0);
    expect(await charge(mod, "community.safety")).toBe(0);
  });
  it("explicit selected evidence returns one narrative only and binds route/content/report/action revisions", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = report(),
      posted = await submit(w.id, root.content.id, input),
      ctx = context(w.id, root.content.id);
    for (const [selected, text] of [
      ["TITLE", "Synthetic HTTP concealed topic"],
      ["BODY", "Synthetic HTTP concealed body independent of private V3"],
      ["SPOILER_CONTEXT", "Synthetic concealed context"],
    ] as const) {
      const value = moderationEvidenceResponseSchema.parse(
        await success(
          await evidenceRoute.POST(
            request(
              "POST",
              mod,
              selection(w.id, root.content.id, {
                selection: selected,
                reportId: posted.report!.id,
                expectedReportRevision: 1,
              }),
            ),
            ctx,
          ),
        ),
      );
      expect(value).toMatchObject({ selection: selected, text });
      expect(JSON.stringify(value)).not.toContain(input.explanation);
    }
    const value = await success(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, {
            selection: "REPORT",
            reportId: posted.report!.id,
            expectedReportRevision: 1,
          }),
        ),
        ctx,
      ),
    );
    expect(value).toMatchObject({
      selection: "REPORT",
      reason: "OTHER",
      explanation: input.explanation,
    });
    expect(JSON.stringify(value)).not.toContain("concealed");
    await privateError(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, { expectedRevision: 2 }),
        ),
        ctx,
      ),
      409,
      "STALE_REVISION",
    );
    await privateError(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, {
            reportId: posted.report!.id,
            expectedReportRevision: 2,
          }),
        ),
        ctx,
      ),
      409,
      "STALE_REPORT_REVISION",
    );
    await privateError(
      await evidenceRoute.POST(
        request("POST", mod, selection(randomUUID(), root.content.id)),
        ctx,
      ),
      400,
    );
    const decision = command();
    await success(await decisions.POST(request("POST", mod, decision), ctx));
    const [action] =
      await sql`select id,sequence from community_moderation_actions where content_id=${root.content.id}`;
    const narrative = await success(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, {
            expectedRevision: 2,
            selection: "ACTION_REASON",
            actionId: String(action!.id),
            actionSequence: 1,
          }),
        ),
        ctx,
      ),
    );
    expect(narrative).toMatchObject({ text: decision.reason });
    await privateError(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, {
            expectedRevision: 2,
            selection: "ACTION_REASON",
            actionId: String(action!.id),
            actionSequence: 2,
          }),
        ),
        ctx,
      ),
      409,
      "STALE_ACTION_SEQUENCE",
    );
  });
  it("paired decisions fence current content/report revision, closed pairs conflict and null restore remains minimal", async () => {
    const w = await work(),
      root = await thread(w.id),
      posted = await submit(w.id, root.content.id),
      ctx = context(w.id, root.content.id);
    const input = command({
      reportId: posted.report!.id,
      expectedReportRevision: 1,
    });
    const hidden = communityCommandResponseSchema.parse(
      await success(await decisions.POST(request("POST", mod, input), ctx)),
    );
    expect(hidden).toMatchObject({
      content: { revision: 2 },
      report: { id: posted.report!.id, state: "UPHELD", revision: 2 },
    });
    expect(JSON.stringify(hidden)).not.toContain(input.reason);
    const replay = communityCommandResponseSchema.parse(
      await success(await decisions.POST(request("POST", mod, input), ctx)),
    );
    expect(replay.replayed).toBe(true);
    await privateError(
      await decisions.POST(
        request(
          "POST",
          mod,
          command({
            expectedRevision: 2,
            action: "RESTORE",
            reportId: posted.report!.id,
            expectedReportRevision: 2,
          }),
        ),
        ctx,
      ),
      409,
      "STALE_REPORT_REVISION",
    );
    const restored = communityCommandResponseSchema.parse(
      await success(
        await decisions.POST(
          request(
            "POST",
            mod,
            command({ expectedRevision: 2, action: "RESTORE" }),
          ),
          ctx,
        ),
      ),
    );
    expect(restored).toMatchObject({ content: { revision: 3 }, report: null });
    const currentReplay = communityCommandResponseSchema.parse(
      await success(await decisions.POST(request("POST", mod, input), ctx)),
    );
    expect(currentReplay).toMatchObject({
      replayed: true,
      content: { revision: 3 },
      report: { id: posted.report!.id, state: "UPHELD", revision: 2 },
    });
    expect(await charge(mod)).toBe(5);
    expect(await charge(mod, "community.safety")).toBe(5);
  });
  it("unavailable Work supports private evidence/hide/dismiss but restoration404 and no catalog facts", async () => {
    const w = await work(),
      root = await thread(w.id),
      posted = await submit(w.id, root.content.id),
      ctx = context(w.id, root.content.id);
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    const meta = await success(
      await metadata.GET(request("GET", mod, undefined, "?kind=THREAD"), ctx),
    );
    expect(meta).toMatchObject({ workAvailable: false, canRestore: false });
    expect(JSON.stringify(meta)).not.toContain(w.primaryTitle);
    expect(
      await success(
        await evidenceRoute.POST(
          request("POST", mod, selection(w.id, root.content.id)),
          ctx,
        ),
      ),
    ).toMatchObject({ state: "AVAILABLE", selection: "BODY" });
    await success(
      await decisions.POST(
        request(
          "POST",
          mod,
          command({
            action: "DISMISS",
            reportId: posted.report!.id,
            expectedReportRevision: 1,
          }),
        ),
        ctx,
      ),
    );
    await success(
      await decisions.POST(
        request("POST", mod, command({ expectedRevision: 2 })),
        ctx,
      ),
    );
    await privateError(
      await decisions.POST(
        request(
          "POST",
          mod,
          command({ expectedRevision: 3, action: "RESTORE" }),
        ),
        ctx,
      ),
      404,
    );
  });
  it("malformed read queries and unacknowledged evidence/Origin failures charge modread once without any write bucket", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    await privateError(
      await queue.GET(
        request("GET", mod, undefined, "?state=OPEN&state=UPHELD"),
      ),
      400,
    );
    await privateError(
      await metadata.GET(request("GET", mod, undefined, "?kind=UNKNOWN"), ctx),
      400,
    );
    await privateError(
      await history.GET(
        request(
          "GET",
          mod,
          undefined,
          "?kind=THREAD&expectedRevision=1&stream=ACTIONS&page=1&cursor=2",
        ),
        ctx,
      ),
      400,
    );
    await privateError(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id, {
            evidenceSelectionAcknowledged: false,
          }),
        ),
        ctx,
      ),
      400,
    );
    await privateError(
      await evidenceRoute.POST(
        request(
          "POST",
          mod,
          selection(w.id, root.content.id),
          "",
          "http://evil.invalid",
        ),
        ctx,
      ),
      403,
      "UNTRUSTED_ORIGIN",
    );
    expect(await charge(mod, "community.modread")).toBe(5);
    expect(await charge(mod)).toBe(0);
    expect(await charge(mod, "community.safety")).toBe(0);
  });
  it("NOOP and replay moderation attempts still consume shared30+safety10 exactly once through eleventh429", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id),
      input = command({ action: "RESTORE" });
    const first = communityCommandResponseSchema.parse(
      await success(await decisions.POST(request("POST", mod, input), ctx)),
    );
    expect(first.content.revision).toBe(1);
    expect(first.replayed).toBe(false);
    const replay = communityCommandResponseSchema.parse(
      await success(await decisions.POST(request("POST", mod, input), ctx)),
    );
    expect(replay.replayed).toBe(true);
    for (let attempt = 3; attempt <= 11; attempt++)
      await privateError(
        await decisions.POST(
          request("POST", mod, command({ reason: "" })),
          ctx,
        ),
        attempt <= 10 ? 400 : 429,
      );
    expect(await charge(mod)).toBe(11);
    expect(await charge(mod, "community.safety")).toBe(11);
    expect(
      await sql`select id from community_moderation_actions where content_id=${root.content.id}`,
    ).toHaveLength(0);
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${mod.id}`,
    ).toHaveLength(1);
  });
  it("all moderator read families share read60 and owner status shares own60 with content metadata through61st429", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    await listOwnedCommunityContents({ locale: "en" }, h(reporter));
    for (let attempt = 1; attempt <= 60; attempt++)
      await privateError(
        await ownList.GET(request("GET", reporter, undefined, "?unknown=1")),
        attempt < 60 ? 400 : 429,
      );
    for (let attempt = 1; attempt <= 61; attempt++) {
      const which = attempt % 4;
      const response =
        which === 0
          ? await queue.GET(request("GET", mod, undefined, "?unknown=1"))
          : which === 1
            ? await metadata.GET(
                request("GET", mod, undefined, "?unknown=1"),
                ctx,
              )
            : which === 2
              ? await history.GET(
                  request("GET", mod, undefined, "?unknown=1"),
                  ctx,
                )
              : await evidenceRoute.POST(
                  request(
                    "POST",
                    mod,
                    selection(w.id, root.content.id, {
                      evidenceSelectionAcknowledged: false,
                    }),
                  ),
                  ctx,
                );
      await privateError(response, attempt <= 60 ? 400 : 429);
    }
    expect(await charge(reporter, "community.ownread")).toBe(61);
    expect(await charge(mod, "community.modread")).toBe(61);
    expect(await charge(mod)).toBe(0);
  });
  it("persisted role/email/session revocation prevents privileged reads and commands before lazy body consumption", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    for (const change of ["role", "email", "session"] as const) {
      const actor = await f.account("moderator");
      if (change === "role")
        await sql`update users set role='user' where id=${actor.id}`;
      else if (change === "email")
        await sql`update users set email_verified=false where id=${actor.id}`;
      else
        await sql`update sessions set expires_at=now()-interval '1 second' where user_id=${actor.id}`;
      const req = new Request(`${f.origin}/api/community?unknown=1`, {
        method: "POST",
        headers: h(actor),
        body: "{",
      });
      await privateError(
        await evidenceRoute.POST(req, ctx),
        change === "session" ? 401 : 403,
      );
      expect(req.bodyUsed).toBe(false);
      const cmd = new Request(`${f.origin}/api/community`, {
        method: "POST",
        headers: h(actor),
        body: "{",
      });
      await privateError(
        await decisions.POST(cmd, ctx),
        change === "session" ? 401 : 403,
      );
      expect(cmd.bodyUsed).toBe(false);
      expect(await charge(actor, "community.modread")).toBe(0);
      expect(await charge(actor)).toBe(0);
    }
  });
  it("shared frozen catalog30 still charges after safety10 rejections and31st attempt cannot reach any narrower charge", async () => {
    const w = await work(),
      root = await thread(w.id),
      ctx = context(w.id, root.content.id);
    for (let attempt = 1; attempt <= 31; attempt++)
      await privateError(
        await decisions.POST(
          request("POST", mod, command({ reason: "" })),
          ctx,
        ),
        attempt <= 10 ? 400 : 429,
      );
    expect(await charge(mod)).toBe(31);
    expect(await charge(mod, "community.safety")).toBe(30);
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${mod.id}`,
    ).toHaveLength(0);
  });
});
