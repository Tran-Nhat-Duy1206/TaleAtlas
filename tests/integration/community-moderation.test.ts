import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getDatabase } from "../../apps/web/src/server/database";
import { getAuth } from "../../apps/web/src/server/auth";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  createCommunityThread,
  createCommunityReply,
  createCommunityReview,
  reportCommunityContent,
  moderateCommunityContent,
  withdrawCommunityContent,
  listCommunityContents,
  listCommunityReviews,
  getCommunityReviewSlot,
  listOwnedCommunityContents,
  listOwnedCommunityReports,
  getOwnedCommunityReport,
  listCommunityModerationReports,
  getCommunityModerationMetadata,
  getCommunityModerationEvidence,
  listCommunityModerationHistory,
} from "../../apps/web/src/server/community/service";
import {
  ownedReportSchema,
  moderationQueueResponseSchema,
  moderationEvidenceResponseSchema,
  moderationHistoryResponseSchema,
} from "../../apps/web/src/features/community/moderation-http-contracts";
import {
  addLibraryEntry,
  updateLibraryEntry,
} from "../../apps/web/src/server/library/service";

// Actual isolated SQL/verified SMTP actors. Bounded bulk fixtures are synthetic capacity metadata, not quota bypass claims.
const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor, reporter: Actor, mod: Actor;
const workIds: string[] = [];
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
async function work() {
  requireTestDatabase();
  const w = (await createWork(
    {
      primaryTitle: `D SQL synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic moderation test only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(w.id);
  return w;
}
const thread = (workId: string, actor = owner) =>
  createCommunityThread(
    workId,
    {
      mutationKey: randomUUID(),
      title: `SYNTHETIC_SELECTED_TITLE_${randomUUID()}`,
      body: `SYNTHETIC_SELECTED_BODY_${randomUUID()}`,
      titleSpoiler: true,
      bodySpoiler: true,
      spoilerContext: `SYNTHETIC_CONTEXT_${randomUUID()}`,
      publicSubmissionAcknowledged: true,
    },
    h(actor),
  );
const reportInput = (
  contentKind = "THREAD",
  expectedRevision = 1,
  patch = {},
) => ({
  mutationKey: randomUUID(),
  contentKind,
  expectedRevision,
  reason: "OTHER",
  explanation: `SYNTHETIC_REPORT_EVIDENCE_${randomUUID()}`,
  ...patch,
});
const command = (contentKind = "THREAD", expectedRevision = 1, patch = {}) => ({
  mutationKey: randomUUID(),
  contentKind,
  expectedRevision,
  action: "HIDE",
  reportId: null,
  expectedReportRevision: null,
  reason: `SYNTHETIC_ACTION_REASON_${randomUUID()}`,
  ...patch,
});
const evidence = (workId: string, targetId: string, patch = {}) => ({
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
async function deletion(actor: Actor) {
  const response = await getAuth().handler(
    new Request(`${f.origin}/api/auth/delete-user`, {
      method: "POST",
      headers: h(actor),
      body: JSON.stringify({
        password: "Synthetic-only-password-17!",
        callbackURL: `${f.origin}/en`,
      }),
    }),
  );
  expect(response.status).toBe(200);
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
const ownReport = (id: string, actor = reporter) =>
  getOwnedCommunityReport(id, { locale: "en" }, h(actor));
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
  await sql`delete from library_entries where work_id=any(${workIds}::uuid[])`;
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
describe("V4D real SQL private report metadata, explicit evidence and deterministic decisions", () => {
  it("reports all three kinds independently of V3 and returns own metadata without narratives or administrator override", async () => {
    const w = await work(),
      root = await thread(w.id);
    const reply = await createCommunityReply(
      w.id,
      {
        mutationKey: randomUUID(),
        threadId: root.content.id,
        parentId: null,
        depth: 0,
        body: "Synthetic independent reported reply",
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
        body: "Synthetic independent reported review",
        rating: null,
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      },
      h(owner),
    );
    const entry = await addLibraryEntry(
      { workId: w.id, mutationKey: randomUUID() },
      h(reporter),
    );
    await updateLibraryEntry(
      entry.id,
      {
        mutationKey: randomUUID(),
        revision: entry.revision,
        patch: { notes: "PRIVATE_D_V3_FINGERPRINT", ratingHalfStars: 9 },
      },
      h(reporter),
    );
    for (const [kind, row] of [
      ["THREAD", root],
      ["REPLY", reply],
      ["REVIEW", review],
    ] as const) {
      const value = await reportCommunityContent(
        w.id,
        row.content.id,
        reportInput(kind),
        h(reporter),
      );
      const status = ownedReportSchema.parse(await ownReport(value.report!.id));
      expect(status).toMatchObject({
        contentKind: kind,
        contentId: row.content.id,
        state: "OPEN",
        revision: 1,
        targetRevision: 1,
      });
      await expect(ownReport(value.report!.id, admin)).rejects.toMatchObject({
        status: 404,
      });
    }
    const statuses = await listOwnedCommunityReports(
      { locale: "vi" },
      h(reporter),
    );
    expect(statuses.items).toHaveLength(3);
    const serialized = JSON.stringify(statuses);
    for (const needle of [
      "PRIVATE_D_V3_FINGERPRINT",
      "SYNTHETIC_SELECTED",
      "SYNTHETIC_REPORT_EVIDENCE",
      owner.id,
      reporter.id,
      reporter.email,
      w.primaryTitle,
    ])
      expect(serialized).not.toContain(needle);
  });
  it("same-key report replay stays current, duplicate OPEN reports and concurrent decisions safely conflict", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = reportInput();
    const first = await reportCommunityContent(
      w.id,
      root.content.id,
      input,
      h(reporter),
    );
    expect(
      (await reportCommunityContent(w.id, root.content.id, input, h(reporter)))
        .replayed,
    ).toBe(true);
    await expect(
      reportCommunityContent(w.id, root.content.id, reportInput(), h(reporter)),
    ).rejects.toMatchObject({ status: 409 });
    const decision = command("THREAD", 1, {
      reportId: first.report!.id,
      expectedReportRevision: 1,
    });
    const race = await Promise.allSettled([
      moderateCommunityContent(w.id, root.content.id, decision, h(mod)),
      moderateCommunityContent(
        w.id,
        root.content.id,
        { ...decision, mutationKey: randomUUID(), action: "DISMISS" },
        h(admin),
      ),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const status = await ownReport(first.report!.id);
    expect(status.revision).toBe(2);
    expect(["UPHELD", "DISMISSED"]).toContain(status.state);
    expect(status.targetRevision).toBe(2);
    expect(
      Number(
        (
          await sql`select count(*)::int as count from community_moderation_actions where content_id=${root.content.id}`
        )[0]!.count,
      ),
    ).toBe(1);
  });
  it("concurrent reporters cannot bypass unique OPEN ownership reservation", async () => {
    const w = await work(),
      root = await thread(w.id);
    const results = await Promise.allSettled([
      reportCommunityContent(w.id, root.content.id, reportInput(), h(reporter)),
      reportCommunityContent(w.id, root.content.id, reportInput(), h(reporter)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(
      (await listOwnedCommunityReports({ locale: "en" }, h(reporter))).items,
    ).toHaveLength(1);
  });
  it("explicit evidence selects one field only, fences report/action scope, and keeps metadata/history narrative-free", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = reportInput();
    const reported = await reportCommunityContent(
      w.id,
      root.content.id,
      input,
      h(reporter),
    );
    const original = (
      await sql`select title,body,spoiler_context from community_contents where id=${root.content.id}`
    )[0]!;
    for (const [selection, expected] of [
      ["TITLE", original.title],
      ["BODY", original.body],
      ["SPOILER_CONTEXT", original.spoiler_context],
    ] as const) {
      const value = moderationEvidenceResponseSchema.parse(
        await getCommunityModerationEvidence(
          evidence(w.id, root.content.id, {
            selection,
            reportId: reported.report!.id,
            expectedReportRevision: 1,
          }),
          h(mod),
        ),
      );
      expect(value).toMatchObject({
        state: "AVAILABLE",
        text: expected,
        selection,
      });
      for (const other of [
        original.title,
        original.body,
        original.spoiler_context,
      ].filter((t) => t !== expected))
        expect(JSON.stringify(value)).not.toContain(other);
      expect(JSON.stringify(value)).not.toContain(input.explanation);
    }
    const reportEvidence = await getCommunityModerationEvidence(
      evidence(w.id, root.content.id, {
        selection: "REPORT",
        reportId: reported.report!.id,
        expectedReportRevision: 1,
      }),
      h(mod),
    );
    expect(reportEvidence).toMatchObject({
      selection: "REPORT",
      reason: "OTHER",
      explanation: input.explanation,
    });
    expect(JSON.stringify(reportEvidence)).not.toContain(original.body);
    await expect(
      getCommunityModerationEvidence(
        evidence(w.id, root.content.id, {
          selection: "REPORT",
          reportId: randomUUID(),
          expectedReportRevision: 1,
        }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getCommunityModerationEvidence(
        evidence(w.id, root.content.id, {
          reportId: reported.report!.id,
          expectedReportRevision: 2,
        }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 409, code: "STALE_REPORT_REVISION" });
    const decision = command();
    await moderateCommunityContent(w.id, root.content.id, decision, h(mod));
    const [action] =
      await sql`select id,sequence from community_moderation_actions where content_id=${root.content.id}`;
    const actionEvidence = await getCommunityModerationEvidence(
      evidence(w.id, root.content.id, {
        expectedRevision: 2,
        selection: "ACTION_REASON",
        actionId: String(action!.id),
        actionSequence: 1,
      }),
      h(mod),
    );
    expect(actionEvidence).toMatchObject({
      text: decision.reason,
      selection: "ACTION_REASON",
    });
    await expect(
      getCommunityModerationEvidence(
        evidence(w.id, root.content.id, {
          expectedRevision: 2,
          selection: "ACTION_REASON",
          actionId: String(action!.id),
          actionSequence: 2,
        }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const metadata = await getCommunityModerationMetadata(
      w.id,
      root.content.id,
      { locale: "en", kind: "THREAD" },
      h(mod),
    );
    const history = moderationHistoryResponseSchema.parse(
      await listCommunityModerationHistory(
        w.id,
        root.content.id,
        {
          locale: "en",
          kind: "THREAD",
          expectedRevision: 2,
          stream: "ACTIONS",
        },
        h(mod),
      ),
    );
    for (const needle of [
      original.body,
      original.title,
      original.spoiler_context,
      input.explanation,
      decision.reason,
      owner.id,
      mod.id,
      reporter.id,
    ])
      expect(JSON.stringify({ metadata, history })).not.toContain(needle);
  });
  it("unavailable Work retains UUID-only metadata and selected private evidence, permits hide/dismiss but denies restoration", async () => {
    const w = await work(),
      root = await thread(w.id),
      reported = await reportCommunityContent(
        w.id,
        root.content.id,
        reportInput(),
        h(reporter),
      );
    await sql`update works set visibility='DRAFT' where id=${w.id}`;
    expect(
      await getCommunityModerationMetadata(
        w.id,
        root.content.id,
        { locale: "en", kind: "THREAD" },
        h(mod),
      ),
    ).toMatchObject({ workAvailable: false, canHide: true, canRestore: false });
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, root.content.id),
        h(mod),
      ),
    ).toMatchObject({ state: "AVAILABLE", selection: "BODY" });
    await moderateCommunityContent(
      w.id,
      root.content.id,
      command("THREAD", 1, {
        action: "DISMISS",
        reportId: reported.report!.id,
        expectedReportRevision: 1,
      }),
      h(mod),
    );
    expect(await ownReport(reported.report!.id)).toMatchObject({
      state: "DISMISSED",
      workAvailable: false,
      targetRevision: 2,
    });
    await moderateCommunityContent(
      w.id,
      root.content.id,
      command("THREAD", 2),
      h(mod),
    );
    await expect(
      moderateCommunityContent(
        w.id,
        root.content.id,
        command("THREAD", 3, { action: "RESTORE" }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      listCommunityContents(w.id, "THREAD", { locale: "en" }, undefined, h()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("closed report pairs conflict; null-pair restore of deleted review keeps blank text and releases hidden reservation", async () => {
    const w = await work(),
      review = await createCommunityReview(
        w.id,
        {
          mutationKey: randomUUID(),
          body: "Synthetic reported review preservation fixture",
          rating: 10,
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
        },
        h(owner),
      );
    const reported = await reportCommunityContent(
      w.id,
      review.content.id,
      reportInput("REVIEW"),
      h(reporter),
    );
    await moderateCommunityContent(
      w.id,
      review.content.id,
      command("REVIEW", 1, {
        reportId: reported.report!.id,
        expectedReportRevision: 1,
      }),
      h(mod),
    );
    await withdrawCommunityContent(
      w.id,
      review.content.id,
      { mutationKey: randomUUID(), contentKind: "REVIEW", expectedRevision: 2 },
      h(owner),
    );
    expect((await getCommunityReviewSlot(w.id, h(owner))).item).toMatchObject({
      authorState: "DELETED",
      moderationState: "HIDDEN",
    });
    await expect(
      moderateCommunityContent(
        w.id,
        review.content.id,
        command("REVIEW", 3, {
          action: "RESTORE",
          reportId: reported.report!.id,
          expectedReportRevision: 2,
        }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await moderateCommunityContent(
      w.id,
      review.content.id,
      command("REVIEW", 3, { action: "RESTORE" }),
      h(mod),
    );
    expect((await getCommunityReviewSlot(w.id, h(owner))).item).toBeNull();
    expect(
      (await listCommunityReviews(w.id, { locale: "en" }, h())).statistics,
    ).toEqual({ reviewCount: 0, ratedReviewCount: 0, meanRating: null });
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, review.content.id, {
          contentKind: "REVIEW",
          expectedRevision: 4,
        }),
        h(mod),
      ),
    ).toMatchObject({ state: "UNAVAILABLE", text: null });
    expect(
      (
        await sql`select body,rating_half_stars from community_contents where id=${review.content.id}`
      )[0],
    ).toMatchObject({ body: "", rating_half_stars: null });
  });
  it("restoring a hidden reply never unhides its still-hidden ancestor branch", async () => {
    const w = await work(),
      root = await thread(w.id),
      reply = await createCommunityReply(
        w.id,
        {
          mutationKey: randomUUID(),
          threadId: root.content.id,
          parentId: null,
          depth: 0,
          body: "Synthetic independently moderated reply",
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
        },
        h(owner),
      );
    await moderateCommunityContent(w.id, root.content.id, command(), h(mod));
    await moderateCommunityContent(
      w.id,
      reply.content.id,
      command("REPLY"),
      h(mod),
    );
    await moderateCommunityContent(
      w.id,
      reply.content.id,
      command("REPLY", 2, { action: "RESTORE" }),
      h(mod),
    );
    await expect(
      listCommunityContents(
        w.id,
        "THREAD",
        { locale: "en" },
        root.content.id,
        h(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, reply.content.id, {
          contentKind: "REPLY",
          expectedRevision: 3,
        }),
        h(mod),
      ),
    ).toMatchObject({ state: "AVAILABLE" });
  });
  it("queue preserves actual microsecond cursor precision and measured metadata query stays bounded without planner changes", async () => {
    const w = await work();
    requireTestDatabase();
    const targets =
      await sql`insert into community_contents(work_id,kind,author_id,title,body) select ${w.id}::uuid,'THREAD',${owner.id},'Synthetic queue title','Synthetic queue private body' from generate_series(1,28) returning id`;
    const ids = targets.map((row) => String(row.id));
    await sql`insert into community_reports(content_id,work_id,target_kind,reporter_id,reason,explanation,created_at)
      select id,${w.id}::uuid,'THREAD',${reporter.id},'OTHER','Synthetic queue private narrative',timestamptz '2299-01-01T00:00:00.123456Z' + row_number() over(order by id) * interval '1 microsecond' from community_contents where id=any(${ids}::uuid[])`;
    const started = performance.now();
    const first = moderationQueueResponseSchema.parse(
      await listCommunityModerationReports({ locale: "en" }, h(mod)),
    );
    const elapsed = performance.now() - started;
    expect(first.items).toHaveLength(25);
    expect(first.items.every((row) => ids.includes(row.target.id))).toBe(true);
    expect(first.nextCursor?.timestamp).toMatch(/\.\d{6}Z$/);
    const next = moderationQueueResponseSchema.parse(
      await listCommunityModerationReports(
        { locale: "en", state: "OPEN", cursor: first.nextCursor! },
        h(mod),
      ),
    );
    const remaining = next.items.filter((row) => ids.includes(row.target.id));
    expect(remaining).toHaveLength(3);
    expect(
      remaining.every(
        (row) => !first.items.some((previous) => previous.id === row.id),
      ),
    ).toBe(true);
    expect(JSON.stringify({ first, next })).not.toContain(
      "Synthetic queue private",
    );
    const plan =
      await sql`explain (analyze,buffers,format json) select r.id,r.state,r.revision,r.evidence_redacted,c.id,c.work_id,c.kind,c.revision,c.author_state,c.moderation_state,(w.visibility='PUBLISHED') from community_reports r join community_contents c on c.id=r.content_id and c.work_id=r.work_id and c.kind=r.target_kind join works w on w.id=r.work_id where r.state='OPEN' order by r.created_at desc,r.id desc limit 25`;
    const measured = plan[0]!["QUERY PLAN"][0];
    expect(Number.isFinite(measured["Execution Time"])).toBe(true);
    console.info("V4D bounded synthetic metadata queue", {
      fixtureReports: 28,
      serviceMs: elapsed,
      sqlMs: measured["Execution Time"],
    });
    const own = await listOwnedCommunityReports({ locale: "en" }, h(reporter));
    expect(own.items).toHaveLength(25);
    const rest = await listOwnedCommunityReports(
      { locale: "en", cursor: { id: own.items[24]!.id, timestamp: null } },
      h(reporter),
    );
    expect(rest.items).toHaveLength(3);
  });
  it("separate event/action history has25-row exclusive revision/sequence pages with no snapshots, actors or reasons", async () => {
    const w = await work(),
      root = await thread(w.id);
    requireTestDatabase();
    await sql`update community_contents set revision=29,event_count=28,moderation_action_count=28 where id=${root.content.id}`;
    await sql`insert into community_content_events(content_id,work_id,target_kind,actor_id,content_revision,command,before_author_state,after_author_state,before_moderation_state,after_moderation_state)
      select ${root.content.id}::uuid,${w.id}::uuid,'THREAD',${mod.id},n+1,'HIDE','ACTIVE','ACTIVE','VISIBLE','HIDDEN' from generate_series(1,28)n`;
    await sql`insert into community_moderation_actions(content_id,work_id,target_kind,actor_id,action,reason,sequence,content_revision)
      select ${root.content.id}::uuid,${w.id}::uuid,'THREAD',${mod.id},'HIDE','SYNTHETIC_PRIVATE_ACTION_REASON',n,n+1 from generate_series(1,28)n`;
    for (const stream of ["EVENTS", "ACTIONS"] as const) {
      const first = await listCommunityModerationHistory(
        w.id,
        root.content.id,
        { locale: "en", kind: "THREAD", expectedRevision: 29, stream },
        h(mod),
      );
      expect(first.items).toHaveLength(25);
      const second = await listCommunityModerationHistory(
        w.id,
        root.content.id,
        {
          locale: "en",
          kind: "THREAD",
          expectedRevision: 29,
          stream,
          cursor: first.nextCursor!,
        },
        h(mod),
      );
      expect(second.items).toHaveLength(stream === "EVENTS" ? 4 : 3); // The accepted CREATE_THREAD event is retained.
      expect(
        second.items.every(
          (row) => !first.items.some((previous) => previous.id === row.id),
        ),
      ).toBe(true);
      for (const needle of [
        "SYNTHETIC_PRIVATE_ACTION_REASON",
        mod.id,
        owner.id,
        "SYNTHETIC_SELECTED",
      ])
        expect(JSON.stringify({ first, second })).not.toContain(needle);
    }
    await expect(
      listCommunityModerationHistory(
        w.id,
        root.content.id,
        {
          locale: "en",
          kind: "THREAD",
          expectedRevision: 28,
          stream: "EVENTS",
        },
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("second persisted role/verification/session checks fence privileged lazy parsers and shared ownread charges", async () => {
    const w = await work(),
      root = await thread(w.id),
      reported = await reportCommunityContent(
        w.id,
        root.content.id,
        reportInput(),
        h(reporter),
      );
    await listOwnedCommunityContents({ locale: "en" }, h(reporter));
    await ownReport(reported.report!.id);
    expect(
      Number(
        (
          await sql`select count from rate_limits where key=${`community.ownread:${reporter.id}`}`
        )[0]!.count,
      ),
    ).toBe(2);
    for (const mutation of ["role", "verification", "session"] as const) {
      const actor = await f.account("moderator");
      await expect(
        getCommunityModerationMetadata(
          w.id,
          root.content.id,
          async () => {
            if (mutation === "role")
              await sql`update users set role='user' where id=${actor.id}`;
            else if (mutation === "verification")
              await sql`update users set email_verified=false where id=${actor.id}`;
            else
              await sql`update sessions set expires_at=now()-interval '1 second' where user_id=${actor.id}`;
            return { locale: "en", kind: "THREAD" };
          },
          h(actor),
        ),
      ).rejects.toMatchObject({ status: mutation === "session" ? 401 : 403 });
      expect(
        Number(
          (
            await sql`select count from rate_limits where key=${`community.modread:${actor.id}`}`
          )[0]!.count,
        ),
      ).toBe(1);
    }
  });
  it("actual reporter/moderator/target erasure keeps unrelated actors, redacts narratives and supports erased-target dismissal", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = reportInput(),
      reported = await reportCommunityContent(
        w.id,
        root.content.id,
        input,
        h(reporter),
      );
    const decision = command("THREAD", 1, {
      reportId: reported.report!.id,
      expectedReportRevision: 1,
    });
    await moderateCommunityContent(w.id, root.content.id, decision, h(mod));
    const [action] =
      await sql`select id from community_moderation_actions where content_id=${root.content.id}`;
    await deletion(reporter);
    expect(
      (
        await sql`select report_id,reason,evidence_redacted from community_moderation_actions where id=${action!.id}`
      )[0],
    ).toMatchObject({ report_id: null, reason: "", evidence_redacted: true });
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, root.content.id, {
          expectedRevision: 2,
          selection: "ACTION_REASON",
          actionId: String(action!.id),
          actionSequence: 1,
        }),
        h(mod),
      ),
    ).toMatchObject({ state: "REDACTED", text: null });
    await deletion(mod);
    expect(
      await sql`select id from community_moderation_actions where id=${action!.id}`,
    ).toHaveLength(0);
    expect(await sql`select id from users where id=${owner.id}`).toHaveLength(
      1,
    );
    const otherReporter = await f.account("user"),
      otherMod = await f.account("moderator"),
      other = await thread(w.id);
    const pending = await reportCommunityContent(
      w.id,
      other.content.id,
      reportInput(),
      h(otherReporter),
    );
    await deletion(owner);
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, other.content.id),
        h(otherMod),
      ),
    ).toMatchObject({ state: "UNAVAILABLE", text: null });
    expect(
      await getCommunityModerationEvidence(
        evidence(w.id, other.content.id, {
          selection: "REPORT",
          reportId: pending.report!.id,
          expectedReportRevision: 1,
        }),
        h(otherMod),
      ),
    ).toMatchObject({ state: "REDACTED", reason: null, explanation: null });
    await moderateCommunityContent(
      w.id,
      other.content.id,
      command("THREAD", 1, {
        action: "DISMISS",
        reportId: pending.report!.id,
        expectedReportRevision: 1,
      }),
      h(otherMod),
    );
    const [redacted] =
      await sql`select reason,evidence_redacted from community_moderation_actions where content_id=${other.content.id}`;
    expect(redacted).toMatchObject({ reason: "", evidence_redacted: true });
    await expect(
      moderateCommunityContent(
        w.id,
        other.content.id,
        command("THREAD", 2, { action: "RESTORE" }),
        h(otherMod),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await ownReport(pending.report!.id, otherReporter)).toMatchObject({
      targetAuthorState: "ERASED",
      state: "DISMISSED",
    });
  });
  it("rollback restores typed authored/report evidence and the existing committed owner-read key", async () => {
    const w = await work(),
      root = await thread(w.id),
      reported = await reportCommunityContent(
        w.id,
        root.content.id,
        reportInput(),
        h(reporter),
      );
    await moderateCommunityContent(
      w.id,
      root.content.id,
      command("THREAD", 1, {
        reportId: reported.report!.id,
        expectedReportRevision: 1,
      }),
      h(mod),
    );
    await listOwnedCommunityContents({ locale: "en" }, h(owner));
    const before = (
      await sql`select body,title,author_id,author_state from community_contents where id=${root.content.id}`
    )[0]!;
    requireTestDatabase();
    let observedErased = false;
    const rollback = new Error("Synthetic deliberate rollback only");
    await expect(
      sql.begin(async (tx) => {
        await tx`delete from users where id=${owner.id} and email=${owner.email}`;
        expect(
          (
            await tx`select author_state,body,title from community_contents where id=${root.content.id}`
          )[0],
        ).toMatchObject({ author_state: "ERASED", body: "", title: "" });
        expect(
          (
            await tx`select explanation,evidence_redacted from community_reports where id=${reported.report!.id}`
          )[0],
        ).toMatchObject({ explanation: "", evidence_redacted: true });
        expect(
          await tx`select id from rate_limits where key=${`community.ownread:${owner.id}`}`,
        ).toHaveLength(0);
        observedErased = true;
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(observedErased).toBe(true);
    expect(
      (
        await sql`select body,title,author_id,author_state from community_contents where id=${root.content.id}`
      )[0],
    ).toEqual(before);
    expect(
      (
        await sql`select evidence_redacted from community_reports where id=${reported.report!.id}`
      )[0]!.evidence_redacted,
    ).toBe(false);
    expect(
      await sql`select id from rate_limits where key=${`community.ownread:${owner.id}`}`,
    ).toHaveLength(1);
    expect(
      await sql`select id from users where id=${reporter.id}`,
    ).toHaveLength(1);
  });
  it("root erasure after metadata budget commitment removes only the existing five keys and fences the captured principal", async () => {
    const w = await work(),
      root = await thread(w.id),
      input = reportInput();
    await reportCommunityContent(w.id, root.content.id, input, h(reporter));
    await listOwnedCommunityReports({ locale: "en" }, h(reporter));
    const liveKey = `community.ownread:${owner.id}`;
    await listOwnedCommunityContents({ locale: "en" }, h(owner));
    await expect(
      listOwnedCommunityReports(async () => {
        await deletion(reporter);
        return { locale: "en" };
      }, h(reporter)),
    ).rejects.toMatchObject({ status: 403 });
    for (const family of ["post", "report", "safety", "modread", "ownread"])
      expect(
        await sql`select id from rate_limits where key=${`community.${family}:${reporter.id}`}`,
      ).toHaveLength(0);
    expect(
      await sql`select id from rate_limits where key=${liveKey}`,
    ).toHaveLength(1);
    expect(await sql`select id from users where id=${owner.id}`).toHaveLength(
      1,
    );
  });
});
