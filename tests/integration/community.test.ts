import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import { getAuth } from "../../apps/web/src/server/auth";
import { checkDatabaseHealth } from "../../apps/web/src/server/database";
import {
  addLibraryEntry,
  updateLibraryEntry,
} from "../../apps/web/src/server/library/service";
import {
  createCommunityThread,
  createCommunityReply,
  createCommunityReview,
  editCommunityContent,
  withdrawCommunityContent,
  reportCommunityContent,
  moderateCommunityContent,
  getCommunityContent,
  revealCommunityContent,
  listCommunityContents,
  communityModerationContext,
} from "../../apps/web/src/server/community/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { readJson } from "../../apps/web/src/server/http";
import { communityThreadCreateSchema } from "../../apps/web/src/features/community/contracts";

const f = readingAuthFixture(),
  sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const workIds: string[] = [];
const ips = new Map<string, string>();
const h = (actor?: Actor, origin = f.origin) => {
  if (actor && !ips.has(actor.id)) {
    const value = randomUUID().replaceAll("-", "");
    ips.set(
      actor.id,
      `127.${parseInt(value.slice(0, 2), 16)}.${parseInt(value.slice(2, 4), 16)}.${parseInt(value.slice(4, 6), 16)}`,
    );
  }
  return new Headers({
    Origin: origin,
    ...(actor ? { Cookie: actor.cookie, "x-real-ip": ips.get(actor.id)! } : {}),
  });
};
const threadInput = (overrides: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  title: "Deliberately public invented topic",
  body: "Entirely synthetic public discussion, unrelated to private notes.",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
  ...overrides,
});
const reviewInput = (overrides: Record<string, unknown> = {}) => ({
  mutationKey: randomUUID(),
  body: "Deliberately public invented independent review text.",
  bodySpoiler: false,
  spoilerContext: null,
  rating: null,
  publicSubmissionAcknowledged: true,
  ...overrides,
});
async function work() {
  const row = (await createWork(
    {
      primaryTitle: `V4 SQL synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation:
          "UUID-owned synthetic community fixture, not production metadata.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(row.id);
  return row;
}
const thread = (w: AdminWork, actor = owner, overrides = {}) =>
  createCommunityThread(w.id, threadInput(overrides), h(actor));
const row = async (id: string) =>
  (await sql`select * from community_contents where id=${id}`)[0];
const editInput = (revision: number, overrides = {}) => ({
  ...threadInput(),
  contentKind: "THREAD",
  expectedRevision: revision,
  ...overrides,
});
const moderation = (revision: number, overrides = {}) => ({
  mutationKey: randomUUID(),
  action: "HIDE",
  contentKind: "THREAD",
  expectedRevision: revision,
  reportId: null,
  expectedReportRevision: null,
  reason: "Manual synthetic moderator decision, no automatic certification.",
  ...overrides,
});
async function confirmedDeletion(actor: Actor) {
  const requested = await getAuth().handler(
    new Request(`${f.origin}/api/auth/delete-user`, {
      method: "POST",
      headers: {
        ...Object.fromEntries(h(actor)),
        "Content-Type": "application/json",
      },
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
  if (!link)
    throw new Error("Actual synthetic account-deletion SMTP link missing");
  const confirmed = await getAuth().handler(
    new Request(link, { headers: h(actor) }),
  );
  expect([200, 302]).toContain(confirmed.status);
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
  await sql`delete from library_entries where user_id=any(${f.users.map((u) => u.id)}::text[])`;
  // Catalog audit/evidence retention is frozen; erase only this UUID-owned fixture's rows first.
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

describe("V4A real signed PostgreSQL foundation", () => {
  it("default-off stops before authority/body/database access and preserves existing auth scope", async () => {
    process.env.V4_COMMUNITIES_ENABLED = "false";
    let parsed = false;
    try {
      await expect(
        createCommunityThread(
          "invalid",
          async () => {
            parsed = true;
            return {};
          },
          new Headers(),
        ),
      ).rejects.toMatchObject({ status: 404, code: "COMMUNITY_UNAVAILABLE" });
      expect(parsed).toBe(false);
    } finally {
      process.env.V4_COMMUNITIES_ENABLED = "true";
    }
  });
  it("requires real verified signed owner/moderator before privileged lazy parsing", async () => {
    const w = await work();
    let parsed = false;
    const input = async () => {
      parsed = true;
      return {};
    };
    await expect(createCommunityThread(w.id, input, h())).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      moderateCommunityContent("bad", "bad", input, h(owner)),
    ).rejects.toMatchObject({ status: 403 });
    expect(parsed).toBe(false);
    await sql`update users set email_verified=false where id=${owner.id}`;
    await expect(
      createCommunityThread(w.id, input, h(owner)),
    ).rejects.toMatchObject({ status: 403 });
    expect(parsed).toBe(false);
  });
  it("creates independent public content without any private-library membership and projects allowlists", async () => {
    const w = await work(),
      created = await thread(w);
    expect(created.content.body.text).toContain("synthetic public");
    expect(
      await sql`select id from library_entries where user_id=${owner.id}`,
    ).toHaveLength(0);
    const output = JSON.stringify(
      await getCommunityContent(w.id, created.content.id, h(owner)),
    );
    expect(output).not.toContain(owner.id);
    expect(output).not.toContain(owner.email);
    expect(output).not.toContain("requestHash");
    expect(
      await sql`select id from community_content_events where content_id=${created.content.id}`,
    ).toHaveLength(1);
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${owner.id}`,
    ).toHaveLength(1);
  });
  it("omits independently masked title/body/context and explicitly reveals only selected text", async () => {
    const w = await work(),
      created = await thread(w, owner, {
        title: "SECRET title ending",
        body: "SECRET body ending",
        titleSpoiler: true,
        bodySpoiler: true,
        spoilerContext: "SECRET context",
      });
    expect(JSON.stringify(created)).not.toContain("SECRET");
    const selected = {
      workId: w.id,
      targetId: created.content.id,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: true,
      body: false,
      spoilerRevealAcknowledged: true,
    };
    const output = await revealCommunityContent(selected, h(owner));
    expect(output.title).toBe("SECRET title ending");
    expect(output).not.toHaveProperty("body");
    expect(output).not.toHaveProperty("spoilerContext");
    await expect(
      revealCommunityContent({ ...selected, expectedRevision: 2 }, h(owner)),
    ).rejects.toMatchObject({ status: 409, code: "STALE_REVISION" });
  });
  it("binds canonical idempotency to signed owner/Work/input and returns current revision without duplicate history", async () => {
    const w = await work(),
      input = threadInput(),
      first = await createCommunityThread(w.id, input, h(owner));
    const edited = await editCommunityContent(
      w.id,
      first.content.id,
      editInput(1, { title: "Current changed public title" }),
      h(owner),
    );
    const replay = await createCommunityThread(
      w.id.toUpperCase(),
      { ...input, mutationKey: input.mutationKey.toUpperCase() },
      h(owner),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.content.id).toBe(first.content.id);
    expect(replay.content.revision).toBe(edited.content.revision);
    await expect(
      createCommunityThread(
        w.id,
        { ...input, title: "Changed binding" },
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await sql`select id from community_content_events where content_id=${first.content.id}`,
    ).toHaveLength(2);
  });
  it("owner scopes edits/deletion with404 even for administrator and rejects submitted private/owner fields", async () => {
    const w = await work(),
      created = await thread(w);
    await expect(
      editCommunityContent(w.id, created.content.id, editInput(1), h(admin)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withdrawCommunityContent(
        w.id,
        created.content.id,
        {
          mutationKey: randomUUID(),
          contentKind: "THREAD",
          expectedRevision: 1,
        },
        h(admin),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createCommunityThread(
        w.id,
        threadInput({
          userId: owner.id,
          notes: "Do not publish private input",
        }),
        h(owner),
      ),
    ).rejects.toBeInstanceOf(Error);
    expect((await row(created.content.id)).revision).toBe(1);
  });
  it("fences concurrent edits, typed nested parents, same Work and maximum depth in service and SQL", async () => {
    const w = await work(),
      other = await work(),
      root = await thread(w),
      otherRoot = await thread(other, admin);
    const a = await createCommunityReply(
      w.id,
      {
        ...reviewInput(),
        rating: undefined,
        threadId: root.content.id,
        parentId: null,
        depth: 0,
        body: "A root reply",
      },
      h(owner),
    ).catch(() => null);
    // Unknown rating (even undefined) is forbidden; construct only the deliberate reply fields.
    expect(a).toBeNull();
    const replyInput = {
      mutationKey: randomUUID(),
      body: "A root reply",
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
      threadId: root.content.id,
      parentId: null,
      depth: 0,
    };
    const reply = await createCommunityReply(w.id, replyInput, h(owner));
    await expect(
      createCommunityReply(
        w.id,
        {
          ...replyInput,
          mutationKey: randomUUID(),
          threadId: otherRoot.content.id,
        },
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      sql`insert into community_contents(work_id,kind,author_id,body,thread_id,thread_kind,depth) values(${w.id},'REPLY',${admin.id},'Cross Work SQL',${otherRoot.content.id},'THREAD',0)`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`insert into community_contents(work_id,kind,author_id,body,thread_id,thread_kind,parent_id,parent_kind,parent_depth,depth) values(${w.id},'REPLY',${admin.id},'Wrong parent depth',${root.content.id},'THREAD',${reply.content.id},'REPLY',1,2)`,
    ).rejects.toMatchObject({ code: "23503" });
    const editor = await f.account("user");
    const own = await thread(w, editor);
    const races = await Promise.allSettled([
      editCommunityContent(
        w.id,
        own.content.id,
        editInput(1, { title: "Race A" }),
        h(editor),
      ),
      editCommunityContent(
        w.id,
        own.content.id,
        editInput(1, { title: "Race B" }),
        h(editor),
      ),
    ]);
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(races.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409, code: "STALE_REVISION" },
    });
  });
  it("never copies private rating/notes and atomically enforces one independent public review slot", async () => {
    const w = await work(),
      entry = await addLibraryEntry(
        { workId: w.id, mutationKey: randomUUID() },
        h(owner),
      );
    await updateLibraryEntry(
      entry.id,
      {
        mutationKey: randomUUID(),
        revision: entry.revision,
        patch: { notes: "PRIVATE_V3_NEEDLE", ratingHalfStars: 8 },
      },
      h(owner),
    );
    const races = await Promise.allSettled([
      createCommunityReview(w.id, reviewInput(), h(owner)),
      createCommunityReview(w.id, reviewInput({ rating: 5 }), h(owner)),
    ]);
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(races.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const visible = await listCommunityContents(
      w.id,
      "REVIEW",
      { locale: "vi" },
      undefined,
      h(owner),
    );
    expect(visible.items).toHaveLength(1);
    expect(JSON.stringify(visible)).not.toContain("PRIVATE_V3_NEEDLE");
    expect([null, 5]).toContain(visible.items[0].ratingHalfStars);
    expect(
      (
        await sql`select rating_half_stars,notes from library_entries where id=${entry.id}`
      )[0],
    ).toMatchObject({ rating_half_stars: 8, notes: "PRIVATE_V3_NEEDLE" });
  });
  it("rechecks unpublished Work for public detail/list/reveal/replay and keeps moderator catalog context unavailable", async () => {
    const w = await work(),
      input = threadInput(),
      created = await createCommunityThread(w.id, input, h(owner));
    await setVisibility(
      w.id,
      { revision: w.revision, visibility: "HIDDEN" },
      h(admin),
    );
    await expect(
      getCommunityContent(w.id, created.content.id, h(owner)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      listCommunityContents(
        w.id,
        "THREAD",
        { locale: "en" },
        undefined,
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createCommunityThread(w.id, input, h(owner)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      revealCommunityContent(
        {
          workId: w.id,
          targetId: created.content.id,
          contentKind: "THREAD",
          expectedRevision: 1,
          title: false,
          body: true,
          spoilerRevealAcknowledged: true,
        },
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 404 });
    const context = await communityModerationContext(
      w.id,
      created.content.id,
      h(admin),
    );
    expect(context.work).toEqual({ id: w.id, available: false });
    expect(JSON.stringify(context)).not.toContain(w.primaryTitle);
    const privacyInput = {
      mutationKey: randomUUID(),
      contentKind: "THREAD",
      expectedRevision: 1,
    };
    const withdrawn = await withdrawCommunityContent(
      w.id,
      created.content.id,
      privacyInput,
      h(owner),
    );
    expect(withdrawn.content.body.text).toBeNull();
    expect(withdrawn.content.title.text).toBeNull();
    expect(JSON.stringify(withdrawn)).not.toContain(w.primaryTitle);
    expect(
      (
        await withdrawCommunityContent(
          w.id,
          created.content.id,
          privacyInput,
          h(owner),
        )
      ).replayed,
    ).toBe(true);
    await expect(
      withdrawCommunityContent(
        w.id,
        created.content.id,
        { ...privacyInput, mutationKey: randomUUID() },
        h(admin),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("revalidates role/session/verification after guard before transaction so lazy callbacks cannot race revocation", async () => {
    const w = await work(),
      created = await thread(w),
      mod = await f.account("moderator"),
      reader = await f.account("user");
    await expect(
      moderateCommunityContent(
        w.id,
        created.content.id,
        async () => {
          await sql`update users set role='user' where id=${mod.id}`;
          return moderation(1);
        },
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createCommunityThread(
        w.id,
        async () => {
          await sql`delete from sessions where user_id=${reader.id}`;
          return threadInput();
        },
        h(reader),
      ),
    ).rejects.toMatchObject({ status: 401 });
    const unverified = await f.account("user");
    await expect(
      createCommunityThread(
        w.id,
        async () => {
          await sql`update users set email_verified=false where id=${unverified.id}`;
          return threadInput();
        },
        h(unverified),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await row(created.content.id)).moderation_state).toBe("VISIBLE");
  });
  it("keeps duplicate reports private, resolves with exact revisions and preserves slot against moderated-review resubmission", async () => {
    const w = await work(),
      created = await createCommunityReview(
        w.id,
        reviewInput({ rating: 7 }),
        h(owner),
      ),
      reporter = await f.account("user"),
      mod = await f.account("moderator");
    const input = {
      mutationKey: randomUUID(),
      contentKind: "REVIEW",
      expectedRevision: 1,
      reason: "OTHER",
      explanation: "Synthetic manual report with no private facts.",
    };
    const reported = await reportCommunityContent(
      w.id,
      created.content.id,
      input,
      h(reporter),
    );
    const replay = await reportCommunityContent(
      w.id,
      created.content.id,
      input,
      h(reporter),
    );
    expect(replay.report).toEqual(reported.report);
    await expect(
      reportCommunityContent(
        w.id,
        created.content.id,
        { ...input, mutationKey: randomUUID() },
        h(reporter),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const hidden = await moderateCommunityContent(
      w.id,
      created.content.id,
      moderation(1, {
        contentKind: "REVIEW",
        reportId: reported.report!.id,
        expectedReportRevision: 1,
      }),
      h(mod),
    );
    expect(hidden.report?.state).toBe("UPHELD");
    expect(hidden.content.body.text).toBeNull();
    await withdrawCommunityContent(
      w.id,
      created.content.id,
      {
        mutationKey: randomUUID(),
        contentKind: "REVIEW",
        expectedRevision: hidden.content.revision,
      },
      h(owner),
    );
    await expect(
      createCommunityReview(w.id, reviewInput(), h(owner)),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await listCommunityContents(
        w.id,
        "REVIEW",
        { locale: "en" },
        undefined,
        h(reporter),
      ),
    ).toMatchObject({ items: [] });
  });
  it("never replays visible child content after its thread/ancestor was hidden", async () => {
    const w = await work(),
      root = await thread(w, admin),
      input = {
        mutationKey: randomUUID(),
        body: "SECRET_CHILD_BRANCH",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
        threadId: root.content.id,
        parentId: null,
        depth: 0,
      };
    const reply = await createCommunityReply(w.id, input, h(owner));
    const edit = {
      mutationKey: randomUUID(),
      contentKind: "REPLY",
      expectedRevision: 1,
      body: "SECRET_CHILD_EDIT",
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
    };
    const edited = await editCommunityContent(
      w.id,
      reply.content.id,
      edit,
      h(owner),
    );
    const reporter = await f.account("user"),
      report = {
        mutationKey: randomUUID(),
        contentKind: "REPLY",
        expectedRevision: edited.content.revision,
        reason: "SPAM",
        explanation: "Private report evidence",
      };
    await reportCommunityContent(w.id, reply.content.id, report, h(reporter));
    await moderateCommunityContent(
      w.id,
      root.content.id,
      moderation(1),
      h(admin),
    );
    await expect(
      editCommunityContent(w.id, reply.content.id, edit, h(owner)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reportCommunityContent(w.id, reply.content.id, report, h(reporter)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getCommunityContent(w.id, reply.content.id, h(reporter)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("reserves withdrawal history after exhausted ordinary events and never resurrects text on moderator restore", async () => {
    const w = await work(),
      created = await thread(w),
      mod = await f.account("moderator");
    const hidden = await moderateCommunityContent(
      w.id,
      created.content.id,
      moderation(1),
      h(mod),
    );
    await sql`update community_contents set event_count=1000 where id=${created.content.id}`;
    const removed = await withdrawCommunityContent(
      w.id,
      created.content.id,
      {
        mutationKey: randomUUID(),
        contentKind: "THREAD",
        expectedRevision: hidden.content.revision,
      },
      h(owner),
    );
    expect(await row(created.content.id)).toMatchObject({
      author_state: "DELETED",
      body: "",
      title: "",
      rating_half_stars: null,
      event_count: 1001,
      moderation_state: "HIDDEN",
    });
    // Restoring visibility at exhausted event capacity fails, not a privacy resurrection.
    await expect(
      moderateCommunityContent(
        w.id,
        created.content.id,
        moderation(removed.content.revision, { action: "RESTORE" }),
        h(mod),
      ),
    ).rejects.toMatchObject({ status: 409, code: "HISTORY_LIMIT_REACHED" });
  });
  it("charges unchanged shared budget exactly once including stricter rejects and malformed attempts", async () => {
    const w = await work();
    let parsed = 0;
    for (let index = 0; index < 30; index++)
      await createCommunityThread(
        w.id,
        async () => {
          parsed++;
          return {};
        },
        h(owner),
      ).catch(() => undefined);
    await expect(
      createCommunityThread(w.id, threadInput(), h(owner)),
    ).rejects.toMatchObject({ status: 429 });
    expect(parsed).toBe(5);
    expect(
      (
        await sql`select count from rate_limits where key=${`catalog.write:${owner.id}`}`
      )[0].count,
    ).toBe(31);
    expect(
      (
        await sql`select count from rate_limits where key=${`community.post:${owner.id}`}`
      )[0].count,
    ).toBe(30);
    expect(
      await sql`select id from community_contents where author_id=${owner.id}`,
    ).toHaveLength(0);
  });
  it("enforces exact Origin, streamed64KiB/fatalUTF8 and atomic rollback with safe errors", async () => {
    const w = await work();
    let parsed = false;
    await expect(
      createCommunityThread(
        w.id,
        async () => {
          parsed = true;
          return threadInput();
        },
        h(owner, "https://untrusted.invalid"),
      ),
    ).rejects.toMatchObject({ status: 403, code: "UNTRUSTED_ORIGIN" });
    expect(parsed).toBe(false);
    const oversized = new Request(f.origin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(65537),
    });
    await expect(
      createCommunityThread(
        w.id,
        () => readJson(oversized, communityThreadCreateSchema),
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 413 });
    const invalidUtf8 = new Request(f.origin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new Uint8Array([0xc0, 0xaf]),
    });
    await expect(
      createCommunityThread(
        w.id,
        () => readJson(invalidUtf8, communityThreadCreateSchema),
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
    const name = `community_rollback_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(
      `create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'synthetic owned rollback'; end $$`,
    );
    try {
      await sql.unsafe(
        `create trigger ${name} before insert on community_mutation_receipts for each row when (NEW.actor_id='${owner.id}') execute function ${name}()`,
      );
      await expect(thread(w)).rejects.toMatchObject({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
      });
      expect(
        await sql`select id from community_contents where author_id=${owner.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from community_content_events where actor_id=${owner.id}`,
      ).toHaveLength(0);
    } finally {
      await sql.unsafe(
        `drop trigger if exists ${name} on community_mutation_receipts`,
      );
      await sql.unsafe(`drop function if exists ${name}()`);
    }
  });
  it("actual SMTP-confirmed account deletion erases text and quotes but retains unrelated reply skeletons and private independence", async () => {
    const w = await work(),
      created = await thread(w, owner, { body: "PUBLIC_ERASE_NEEDLE" }),
      other = await f.account("user"),
      mod = await f.account("moderator");
    const reply = await createCommunityReply(
      w.id,
      {
        mutationKey: randomUUID(),
        body: "Other author's independent reply",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
        threadId: created.content.id,
        parentId: null,
        depth: 0,
      },
      h(other),
    );
    const report = await reportCommunityContent(
      w.id,
      created.content.id,
      {
        mutationKey: randomUUID(),
        contentKind: "THREAD",
        expectedRevision: 1,
        reason: "OTHER",
        explanation: "Quoted PUBLIC_ERASE_NEEDLE",
      },
      h(other),
    );
    await moderateCommunityContent(
      w.id,
      created.content.id,
      moderation(1, {
        action: "DISMISS",
        reportId: report.report!.id,
        expectedReportRevision: 1,
        reason: "Quoted PUBLIC_ERASE_NEEDLE",
      }),
      h(mod),
    );
    const library = await addLibraryEntry(
      { workId: w.id, mutationKey: randomUUID() },
      h(owner),
    );
    await updateLibraryEntry(
      library.id,
      {
        mutationKey: randomUUID(),
        revision: library.revision,
        patch: { notes: "PRIVATE_ERASE_NEEDLE", ratingHalfStars: 9 },
      },
      h(owner),
    );
    const unchangedOther = await row(reply.content.id);
    await confirmedDeletion(owner);
    expect(await row(created.content.id)).toMatchObject({
      author_id: null,
      author_state: "ERASED",
      title: "",
      body: "",
      spoiler_context: null,
      rating_half_stars: null,
      created_at: null,
      updated_at: null,
      edited_at: null,
      last_activity_at: null,
    });
    expect(await row(reply.content.id)).toEqual(unchangedOther);
    expect(
      (
        await sql`select explanation,evidence_redacted from community_reports where id=${report.report!.id}`
      )[0],
    ).toEqual({ explanation: "", evidence_redacted: true });
    expect(
      (
        await sql`select reason,evidence_redacted from community_moderation_actions where content_id=${created.content.id}`
      )[0],
    ).toEqual({ reason: "", evidence_redacted: true });
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${owner.id}`,
    ).toHaveLength(0);
    expect(
      await sql`select id from community_content_events where actor_id=${owner.id}`,
    ).toHaveLength(0);
    expect(
      await sql`select id from library_entries where user_id=${owner.id}`,
    ).toHaveLength(0);
    const published = await listCommunityContents(
      w.id,
      "THREAD",
      { locale: "vi" },
      undefined,
      h(other),
    );
    expect(JSON.stringify(published)).not.toContain("ERASE_NEEDLE");
    expect(JSON.stringify(published)).not.toContain(owner.id);
    await expect(
      createCommunityThread(w.id, threadInput(), h(owner)),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("enforces actual three-level nesting and immutable same-thread bindings, including Unicode SQL bounds", async () => {
    const w = await work(),
      root = await thread(w);
    const payload = {
      mutationKey: randomUUID(),
      body: "Root nested reply",
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
      threadId: root.content.id,
      parentId: null,
      depth: 0,
    };
    const first = await createCommunityReply(w.id, payload, h(owner));
    const second = await createCommunityReply(
      w.id,
      {
        ...payload,
        mutationKey: randomUUID(),
        parentId: first.content.id,
        depth: 1,
      },
      h(owner),
    );
    const third = await createCommunityReply(
      w.id,
      {
        ...payload,
        mutationKey: randomUUID(),
        parentId: second.content.id,
        depth: 2,
      },
      h(owner),
    );
    expect(third.content.depth).toBe(2);
    await expect(
      createCommunityReply(
        w.id,
        {
          ...payload,
          mutationKey: randomUUID(),
          parentId: third.content.id,
          depth: 3,
        },
        h(owner),
      ),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      sql`insert into community_contents(work_id,kind,author_id,body,thread_id,thread_kind,parent_id,parent_kind,parent_depth,depth) values(${w.id},'REPLY',${admin.id},'Too deep',${root.content.id},'THREAD',${third.content.id},'REPLY',2,3)`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update community_contents set parent_id=${first.content.id},parent_depth=0,depth=1 where id=${third.content.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update community_contents set author_id=${admin.id} where id=${root.content.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update community_contents set author_id=null where id=${root.content.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`insert into community_contents(work_id,kind,author_id,title,body) values(${w.id},'THREAD',${admin.id},${"😀".repeat(81)},'UTF16 SQL bound')`,
    ).rejects.toMatchObject({ code: "23514" });
    await sql`insert into community_contents(work_id,kind,author_id,title,body) values(${w.id},'THREAD',${admin.id},${"😀".repeat(80)},'UTF16 SQL bound accepted')`;
  });
  it("normalizes public NFC and records no-op receipt without false editing/activity/history", async () => {
    const w = await work(),
      input = threadInput({ title: "Ca\u0300 phe\u0302" }),
      created = await createCommunityThread(w.id, input, h(owner)),
      before = await row(created.content.id);
    expect(created.content.title.text).toBe("Cà phê");
    const unchanged = await editCommunityContent(
      w.id,
      created.content.id,
      editInput(1, { title: input.title }),
      h(owner),
    );
    expect(unchanged.content.revision).toBe(1);
    expect(await row(created.content.id)).toEqual(before);
    expect(
      await sql`select id from community_content_events where content_id=${created.content.id}`,
    ).toHaveLength(1);
    expect(
      await sql`select outcome from community_mutation_receipts where actor_id=${owner.id} order by created_at`,
    ).toEqual([{ outcome: "APPLIED" }, { outcome: "NOOP" }]);
  });
  it("serializes concurrent posting anti-spam without resetting existing shared or unrelated limits", async () => {
    const w = await work(),
      unrelated = `v4-unrelated:${f.runId}:${randomUUID()}`;
    await sql`insert into rate_limits(id,key,count,last_request) values(${randomUUID()},${unrelated},19,1)`;
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 7 }, () => thread(w)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
      expect(
        (
          await sql`select count from rate_limits where key=${`catalog.write:${owner.id}`}`
        )[0].count,
      ).toBe(7);
      expect(
        (
          await sql`select count from rate_limits where key=${`community.post:${owner.id}`}`
        )[0].count,
      ).toBe(7);
      expect(
        (await sql`select count from rate_limits where key=${unrelated}`)[0]
          .count,
      ).toBe(19);
    } finally {
      await sql`delete from rate_limits where key=${unrelated}`;
    }
  });
  it("preserves shared V3 spending and independently caps malformed reports at three attempts", async () => {
    const w = await work();
    for (let index = 0; index < 30; index++)
      await addLibraryEntry(
        { workId: w.id, mutationKey: randomUUID() },
        h(owner),
      );
    await expect(thread(w)).rejects.toMatchObject({ status: 429 });
    expect(
      (
        await sql`select count from rate_limits where key=${`catalog.write:${owner.id}`}`
      )[0].count,
    ).toBe(31);
    expect(
      await sql`select count from rate_limits where key=${`community.post:${owner.id}`}`,
    ).toHaveLength(0);
    const reporter = await f.account("user"),
      target = await thread(w, admin);
    let parsed = 0;
    for (let index = 0; index < 3; index++)
      await reportCommunityContent(
        w.id,
        target.content.id,
        async () => {
          parsed++;
          return {};
        },
        h(reporter),
      ).catch(() => undefined);
    await expect(
      reportCommunityContent(
        w.id,
        target.content.id,
        async () => {
          parsed++;
          return {};
        },
        h(reporter),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(parsed).toBe(3);
    expect(
      (
        await sql`select count from rate_limits where key=${`catalog.write:${reporter.id}`}`
      )[0].count,
    ).toBe(4);
    expect(
      await sql`select id from community_reports where reporter_id=${reporter.id}`,
    ).toHaveLength(0);
  });
  it("reserves first withdrawal receipt/event after ordinary receipt and history limits", async () => {
    const w = await work(),
      created = await thread(w);
    await sql`update community_contents set event_count=1000 where id=${created.content.id}`;
    await sql`insert into community_mutation_receipts(content_id,work_id,target_kind,actor_id,mutation_key,request_hash,command,outcome,content_revision) select ${created.content.id},${w.id},'THREAD',${owner.id},gen_random_uuid(),repeat('a',64),'EDIT','NOOP',1 from generate_series(1,9999)`;
    await expect(
      editCommunityContent(
        w.id,
        created.content.id,
        editInput(1, { title: "Cannot add ordinary history" }),
        h(owner),
      ),
    ).rejects.toMatchObject({ status: 409, code: "RECEIPT_LIMIT_REACHED" });
    const withdrawn = await withdrawCommunityContent(
      w.id,
      created.content.id,
      { mutationKey: randomUUID(), contentKind: "THREAD", expectedRevision: 1 },
      h(owner),
    );
    expect(withdrawn.content.body.text).toBeNull();
    expect((await row(created.content.id)).event_count).toBe(1001);
    expect(
      (
        await sql`select count(*)::int as n from community_mutation_receipts where actor_id=${owner.id}`
      )[0].n,
    ).toBe(10001);
  });
  it("paginates erased null-date skeletons after live rows using exclusive stable UUID null cursors", async () => {
    const w = await work(),
      erasedAuthor = await f.account("user");
    await sql`insert into community_contents(work_id,kind,author_id,title,body) select ${w.id},'THREAD',${erasedAuthor.id},'Synthetic pagination topic','Synthetic pagination body' from generate_series(1,27)`;
    await sql`delete from users where id=${erasedAuthor.id} and email=${erasedAuthor.email}`;
    const live = await thread(w),
      page = await listCommunityContents(
        w.id,
        "THREAD",
        { locale: "en" },
        undefined,
        h(owner),
      );
    expect(page.items).toHaveLength(25);
    expect(page.items[0].id).toBe(live.content.id);
    expect(
      page.items
        .slice(1)
        .every(
          (item) =>
            item.state === "ERASED" &&
            item.createdAt === null &&
            item.lastActivityAt === null,
        ),
    ).toBe(true);
    const last = page.items.at(-1)!;
    const next = await listCommunityContents(
      w.id,
      "THREAD",
      { locale: "vi", cursor: { timestamp: null, id: last.id } },
      undefined,
      h(owner),
    );
    expect(next.items).toHaveLength(3);
    expect(
      next.items.every(
        (item) => !page.items.some((previous) => previous.id === item.id),
      ),
    ).toBe(true);
    const afterLive = await listCommunityContents(
      w.id,
      "THREAD",
      {
        locale: "en",
        cursor: { timestamp: live.content.lastActivityAt, id: live.content.id },
      },
      undefined,
      h(owner),
    );
    expect(afterLive.items).toHaveLength(25);
    expect(afterLive.items.every((item) => item.state === "ERASED")).toBe(true);
  });
  it("fences competing moderator decisions and typed cross-Work report/action scope", async () => {
    const w = await work(),
      otherWork = await work(),
      created = await thread(w),
      reporter = await f.account("user"),
      mod = await f.account("moderator"),
      otherMod = await f.account("moderator");
    await expect(
      sql`insert into community_reports(content_id,work_id,target_kind,reporter_id,reason) values(${created.content.id},${otherWork.id},'THREAD',${reporter.id},'SPAM')`,
    ).rejects.toMatchObject({ code: "23503" });
    const reported = await reportCommunityContent(
      w.id,
      created.content.id,
      {
        mutationKey: randomUUID(),
        contentKind: "THREAD",
        expectedRevision: 1,
        reason: "SPAM",
        explanation: "Synthetic report",
      },
      h(reporter),
    );
    const results = await Promise.allSettled([
      moderateCommunityContent(
        w.id,
        created.content.id,
        moderation(1, {
          reportId: reported.report!.id,
          expectedReportRevision: 1,
        }),
        h(mod),
      ),
      moderateCommunityContent(
        w.id,
        created.content.id,
        moderation(1, {
          action: "DISMISS",
          reportId: reported.report!.id,
          expectedReportRevision: 1,
        }),
        h(otherMod),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(
      await sql`select id from community_moderation_actions where content_id=${created.content.id}`,
    ).toHaveLength(1);
    await expect(
      sql`insert into community_moderation_actions(content_id,work_id,target_kind,actor_id,action,reason,sequence,content_revision,report_id,report_revision) values(${created.content.id},${w.id},'REVIEW',${mod.id},'HIDE','Synthetic invalid target type',2,2,${reported.report!.id},2)`,
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("uses separate bounded salted public read/reveal buckets without charging write budgets", async () => {
    const w = await work(),
      created = await thread(w);
    for (let index = 0; index < 60; index++)
      await getCommunityContent(w.id, created.content.id, h(owner));
    await expect(
      getCommunityContent(w.id, created.content.id, h(owner)),
    ).rejects.toMatchObject({ status: 429 });
    const selected = {
      workId: w.id,
      targetId: created.content.id,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: false,
      body: true,
      spoilerRevealAcknowledged: true,
    };
    for (let index = 0; index < 20; index++)
      await revealCommunityContent(selected, h(owner));
    await expect(
      revealCommunityContent(selected, h(owner)),
    ).rejects.toMatchObject({ status: 429 });
    expect(
      (
        await sql`select count from rate_limits where key=${`catalog.write:${owner.id}`}`
      )[0].count,
    ).toBe(1);
    const ip = ips.get(owner.id)!;
    expect(
      await sql`select key from rate_limits where key=${`community.read:${ip}`} or key=${`community.reveal:${ip}`}`,
    ).toHaveLength(0);
  });
  it("keeps exclusive public timestamp cursors aligned with millisecond DTO precision and deleted dates concealed", async () => {
    const w = await work();
    await sql`insert into community_contents(work_id,kind,author_id,title,body) select ${w.id},'THREAD',${owner.id},'Synthetic same-microsecond topic','Synthetic public page body' from generate_series(1,30)`;
    const first = await listCommunityContents(
      w.id,
      "THREAD",
      { locale: "en" },
      undefined,
      h(owner),
    );
    const last = first.items.at(-1)!;
    const second = await listCommunityContents(
      w.id,
      "THREAD",
      { locale: "en", cursor: { timestamp: last.lastActivityAt, id: last.id } },
      undefined,
      h(owner),
    );
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(5);
    expect(
      second.items.every(
        (item) => !first.items.some((previous) => previous.id === item.id),
      ),
    ).toBe(true);
    const deletedId = first.items[0].id;
    await withdrawCommunityContent(
      w.id,
      deletedId,
      { mutationKey: randomUUID(), contentKind: "THREAD", expectedRevision: 1 },
      h(owner),
    );
    const deleted = await listCommunityContents(
      w.id,
      "THREAD",
      { locale: "vi", page: 2 },
      undefined,
      h(owner),
    );
    expect(deleted.items.at(-1)).toMatchObject({
      id: deletedId,
      state: "DELETED",
      lastActivityAt: null,
      createdAt: null,
    });
  });
  it("enabled readiness checks privacy infrastructure while off preserves V3 readiness without a new dependency", async () => {
    requireTestDatabase();
    expect(await checkDatabaseHealth()).toEqual({ status: "ok" });
    await sql`alter table users disable trigger community_user_erasure_budgets`;
    try {
      expect(await checkDatabaseHealth()).toEqual({ status: "unavailable" });
      process.env.V4_COMMUNITIES_ENABLED = "false";
      expect(await checkDatabaseHealth()).toEqual({ status: "ok" });
    } finally {
      process.env.V4_COMMUNITIES_ENABLED = "true";
      await sql`alter table users enable trigger community_user_erasure_budgets`;
    }
    expect(await checkDatabaseHealth()).toEqual({ status: "ok" });
  });
});
