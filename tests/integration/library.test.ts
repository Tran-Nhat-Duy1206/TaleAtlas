import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getAuth } from "../../apps/web/src/server/auth";
import { applyReviewedSuggestion } from "../../apps/web/src/features/catalog/edit-suggestions";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  adminGetWork,
  createWork,
  setVisibility,
  updateWork,
} from "../../apps/web/src/server/catalog/service";
import {
  addLibraryEntry,
  getLibraryEntry,
  getOwnWorkLibraryState,
  libraryEntryHistory,
  listLibraryEntries,
  readingProgressHistory,
  readingSessionAction,
  readingSessionHistory,
  recordReadingProgress,
  removeLibraryEntry,
  updateLibraryEntry,
  type LibraryEntryDetail,
} from "../../apps/web/src/server/library/service";

// Never falls back to DATABASE_URL. Every SQL write/cleanup belongs to this UUID run.
const f = catalogAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const h = (actor: Actor) => new Headers({ Cookie: actor.cookie });
const emptyHeaders = () => new Headers();
const citation = () => ({
  label: f.sourceLabel,
  citation:
    "Entirely invented UUID-owned V3A SQL fixture; not production metadata.",
});
async function work(overrides: Record<string, unknown> = {}) {
  return (await createWork(
    {
      primaryTitle: `Synthetic library ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: citation(),
      ...overrides,
    },
    h(admin),
  )) as AdminWork;
}
async function add(w: Pick<AdminWork, "id">, actor = owner) {
  return addLibraryEntry({ workId: w.id, mutationKey: randomUUID() }, h(actor));
}
async function patch(
  entry: LibraryEntryDetail,
  value: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return updateLibraryEntry(
    entry.id,
    {
      revision: entry.revision,
      mutationKey: randomUUID(),
      patch: value,
      ...extra,
    },
    h(owner),
  );
}
async function action(
  entry: LibraryEntryDetail,
  name: string,
  extra: Record<string, unknown> = {},
) {
  return readingSessionAction(
    entry.id,
    {
      revision: entry.revision,
      mutationKey: randomUUID(),
      action: name,
      ...extra,
    },
    h(owner),
  );
}
async function progress(
  entry: LibraryEntryDetail,
  value: Record<string, unknown>,
) {
  return recordReadingProgress(
    entry.id,
    {
      revision: entry.revision,
      mutationKey: randomUUID(),
      sessionId: entry.currentSession!.id,
      patch: value,
    },
    h(owner),
  );
}
async function rows(entryId: string) {
  const [entry] =
    await sql`select * from library_entries where id = ${entryId}`;
  const sessions =
    await sql`select * from reading_sessions where entry_id = ${entryId} order by sequence`;
  const events =
    await sql`select * from library_events where entry_id = ${entryId} order by entry_revision`;
  const progressEvents =
    await sql`select * from reading_progress_events where entry_id = ${entryId} order by entry_revision`;
  return {
    entry,
    sessions: [...sessions],
    events: [...events],
    progress: [...progressEvents],
  };
}
function rejected(results: PromiseSettledResult<unknown>[]) {
  return results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
}
function fulfilled(results: PromiseSettledResult<unknown>[]) {
  return results.filter(
    (r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled",
  );
}
async function pgCode(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toMatchObject({ code });
}
async function seedWorks(n: number) {
  requireTestDatabase();
  const base = await work();
  const [source] = await sql`select source_id from works where id = ${base.id}`;
  // Draft-only synthetic bulk rows cannot pollute other public catalog/browser fixtures.
  const ids: string[] = [];
  for (let start = 0; start < n; start += 500) {
    const count = Math.min(500, n - start);
    const created = await sql`
      insert into works (id, slug, primary_title, primary_title_language, format, visibility, source_id, search_text)
      select identity, 'library-bulk-' || identity::text, 'Synthetic bulk ' || identity::text, 'en', 'NOVEL', 'DRAFT', ${source.source_id}, 'synthetic bulk fixture'
      from (select gen_random_uuid() as identity from generate_series(1, ${count})) identities
      returning id`;
    ids.push(...created.map((r) => String(r.id)));
  }
  return { base, ids };
}
async function seedEntries(ids: string[], archived = false) {
  requireTestDatabase();
  await sql.begin(async (tx) => {
    // Keep each setup statement within the unchanged 5s production budget;
    // the complete entry/event seed remains one atomic, constraint-checked TX.
    for (let start = 0; start < ids.length; start += 500) {
      const batch = ids.slice(start, start + 500);
      await tx`
        insert into library_entries (user_id, work_id, removed_at)
        select ${owner.id}, id, case when ${archived} and id = ${ids[0]}::uuid then now() else null end
        from works where id = any(${batch}::uuid[])`;
      await tx`
        insert into library_events (entry_id, user_id, work_id, entry_revision, mutation_key, request_hash, kind, snapshot)
        select id, user_id, work_id, 1, gen_random_uuid(), repeat('a', 64), 'ADD', '{}'::jsonb
        from library_entries where user_id = ${owner.id} and work_id = any(${batch}::uuid[])`;
    }
  });
}
async function seedEvents(entry: LibraryEntryDetail, count: number) {
  requireTestDatabase();
  await sql.begin(async (tx) => {
    await tx`
      insert into library_events (entry_id, user_id, work_id, entry_revision, mutation_key, request_hash, kind, snapshot)
      select ${entry.id}, ${owner.id}, ${entry.workId}, revision, gen_random_uuid(), repeat('b', 64), 'UPDATE', '{}'::jsonb
      from generate_series(2, ${count}) revision`;
    await tx`update library_entries set revision = ${count}, event_count = ${count} where id = ${entry.id} and user_id = ${owner.id}`;
  });
  return getLibraryEntry(entry.id, h(owner));
}
async function seedSessions(entry: LibraryEntryDetail, count: number) {
  requireTestDatabase();
  await sql.begin(async (tx) => {
    await tx`
      insert into reading_sessions (entry_id, user_id, work_id, sequence, kind, state, started_at, closed_at)
      select ${entry.id}, ${owner.id}, ${entry.workId}, sequence, 'FIRST_READ', 'ABANDONED', now(), now()
      from generate_series(1, ${count}) sequence`;
    await tx`
      insert into library_events (entry_id, user_id, work_id, entry_revision, mutation_key, request_hash, kind, snapshot)
      select ${entry.id}, ${owner.id}, ${entry.workId}, revision, gen_random_uuid(), repeat('c', 64), 'START_READ', '{}'::jsonb
      from generate_series(2, ${count + 1}) revision`;
    await tx`update library_entries set session_count = ${count}, revision = ${count + 1}, event_count = ${count + 1} where id = ${entry.id} and user_id = ${owner.id}`;
  });
  return getLibraryEntry(entry.id, h(owner));
}

async function confirmedAccountDeletion(actor: Actor) {
  const requested = await getAuth().handler(
    new Request(`${f.origin}/api/auth/delete-user`, {
      method: "POST",
      headers: {
        Origin: f.origin,
        "Content-Type": "application/json",
        Cookie: actor.cookie,
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
    throw new Error(
      "Actual owned deletion verification mail was not delivered",
    );
  return getAuth().handler(
    new Request(link, { headers: { Cookie: actor.cookie } }),
  );
}

beforeAll(async () => {
  requireTestDatabase();
  console.info(`V3A UUID-owned fixture run ${f.runId}`);
  await f.start();
  admin = await f.account("admin");
});
beforeEach(async () => {
  // Real verified fresh sessions, never reset any user's shared 30/minute budget.
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  const userIds = f.users.map((u) => u.id);
  if (userIds.length) {
    // Cleanup honors the application's unchanged 5s statement budget. Cascades
    // over 20,000 synthetic cap rows are deliberately deleted in bounded batches.
    while (true) {
      const batch =
        await sql`select id from library_entries where user_id = any(${userIds}::text[]) limit 100`;
      if (!batch.length) break;
      const entryIds = batch.map((r) => String(r.id));
      await sql`delete from library_entries where id = any(${entryIds}::uuid[]) and user_id = any(${userIds}::text[])`;
    }
  }
  const own =
    await sql`select w.id from works w join catalog_sources s on s.id = w.source_id where s.label = ${f.sourceLabel}`;
  const ids = own.map((r) => String(r.id));
  if (ids.length) {
    // Entry Work RESTRICT requires private rows to be erased before fixture catalog rows.
    await sql`delete from catalog_field_evidence where work_id = any(${ids}::uuid[])`;
    await sql`delete from catalog_audit_events where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_relations where from_work_id = any(${ids}::uuid[]) or to_work_id = any(${ids}::uuid[])`;
    await sql`delete from work_creators where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_titles where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_descriptions where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_genres where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_covers where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_identifiers where work_id = any(${ids}::uuid[])`;
    await sql`delete from editions where work_id = any(${ids}::uuid[])`;
    for (let start = 0; start < ids.length; start += 250) {
      const batch = ids.slice(start, start + 250);
      await sql`delete from works where id = any(${batch}::uuid[])`;
    }
  }
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential(
  "V3A private library: real PostgreSQL and verified signed sessions",
  () => {
    it("serializes concurrent duplicate adds and exact replay into one canonical entry/event", async () => {
      const w = await work(),
        key = randomUUID();
      const entries = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          addLibraryEntry(
            { workId: w.id, mutationKey: i < 4 ? key : randomUUID() },
            h(owner),
          ),
        ),
      );
      expect(new Set(entries.map((e) => e.id)).size).toBe(1);
      expect(
        entries.every((e) => e.revision === 1 && e.status === "WANT_TO_READ"),
      ).toBe(true);
      const stored = await rows(entries[0]!.id);
      expect(stored.entry).toMatchObject({
        user_id: owner.id,
        work_id: w.id,
        event_count: 1,
        session_count: 0,
      });
      expect(stored.events).toHaveLength(1);
      expect(stored.sessions).toHaveLength(0);
    });

    it("shares Work identity but never private entry identity or keys between owners", async () => {
      const other = await f.account("user"),
        w = await work(),
        key = randomUUID();
      const a = await addLibraryEntry(
        { workId: w.id, mutationKey: key },
        h(owner),
      );
      const b = await addLibraryEntry(
        { workId: w.id, mutationKey: key },
        h(other),
      );
      expect(a.id).not.toBe(b.id);
      expect(a.workId).toBe(b.workId);
      expect(
        (await listLibraryEntries({}, h(owner))).items.map((e) => e.id),
      ).toEqual([a.id]);
      expect(
        (await listLibraryEntries({}, h(other))).items.map((e) => e.id),
      ).toEqual([b.id]);
    });

    it("binds replay to canonical command/scope/hash and returns newer state without overwriting it", async () => {
      let e = await add(await work());
      const command = {
        revision: e.revision,
        mutationKey: randomUUID(),
        patch: { notes: "First private fact", favorite: true },
      };
      e = await updateLibraryEntry(e.id, command, h(owner));
      e = await patch(e, { notes: "Newer private fact" });
      const before = await rows(e.id);
      const replay = await updateLibraryEntry(
        e.id,
        {
          patch: { favorite: true, notes: "First private fact" },
          mutationKey: command.mutationKey,
          revision: command.revision,
        },
        h(owner),
      );
      expect(replay).toMatchObject({
        revision: e.revision,
        notes: "Newer private fact",
      });
      expect(await rows(e.id)).toEqual(before);
      await expect(
        updateLibraryEntry(
          e.id,
          { ...command, patch: { notes: "Different content" } },
          h(owner),
        ),
      ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
      const other = await add(await work());
      await expect(
        updateLibraryEntry(
          other.id,
          { ...command, revision: other.revision },
          h(owner),
        ),
      ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    });

    it("canonicalizes uppercase UUIDs before exact replay, session comparisons and hashes", async () => {
      const w = await work(),
        key = randomUUID();
      let e = await addLibraryEntry(
        { workId: w.id.toUpperCase(), mutationKey: key.toUpperCase() },
        h(owner),
      );
      expect(
        (
          await addLibraryEntry(
            { workId: w.id.toUpperCase(), mutationKey: key.toUpperCase() },
            h(owner),
          )
        ).id,
      ).toBe(e.id);
      expect(
        (await addLibraryEntry({ workId: w.id, mutationKey: key }, h(owner)))
          .revision,
      ).toBe(1);
      e = await readingSessionAction(
        e.id.toUpperCase(),
        {
          revision: e.revision,
          mutationKey: randomUUID().toUpperCase(),
          action: "START_READ",
        },
        h(owner),
      );
      const pkey = randomUUID();
      const command = {
        revision: e.revision,
        mutationKey: pkey.toUpperCase(),
        sessionId: e.currentSession!.id.toUpperCase(),
        patch: { chapterNumber: 0 },
      };
      e = await recordReadingProgress(e.id.toUpperCase(), command, h(owner));
      expect(
        (
          await recordReadingProgress(
            e.id,
            {
              ...command,
              mutationKey: pkey,
              sessionId: command.sessionId.toLowerCase(),
            },
            h(owner),
          )
        ).revision,
      ).toBe(e.revision);
      expect(
        (
          await readingProgressHistory(
            e.id.toUpperCase(),
            e.currentSession!.id.toUpperCase(),
            {},
            h(owner),
          )
        ).items,
      ).toHaveLength(1);
    });

    it("projects current EN/VI verified titles through retitle without changing private canonical identity", async () => {
      const w = await work({
        titles: [
          { title: "Tên tiếng Việt ban đầu", language: "vi", kind: "PRIMARY" },
        ],
      });
      const e = await add(w);
      expect((await getLibraryEntry(e.id, h(owner), "vi")).work).toMatchObject({
        id: w.id,
        displayTitle: "Tên tiếng Việt ban đầu",
      });
      const current = (await adminGetWork(w.id, h(admin))) as AdminWork;
      const value = applyReviewedSuggestion(
        current,
        { primaryTitle: "Retitled canonical English" },
        citation(),
      );
      value.titles = [
        { title: "Tên tiếng Việt mới", language: "vi", kind: "PRIMARY" },
      ];
      await updateWork(
        w.id,
        { ...value, revision: current.revision },
        h(admin),
      );
      expect((await getLibraryEntry(e.id, h(owner), "en")).work).toMatchObject({
        displayTitle: "Retitled canonical English",
      });
      expect((await getLibraryEntry(e.id, h(owner), "vi")).work).toMatchObject({
        displayTitle: "Tên tiếng Việt mới",
      });
      expect((await add(w)).id).toBe(e.id);
      expect((await rows(e.id)).entry.revision).toBe(1);
      const history = JSON.stringify(
        await libraryEntryHistory(e.id, {}, h(owner)),
      );
      for (const title of [
        w.primaryTitle,
        "Retitled canonical English",
        "Tên tiếng Việt mới",
      ])
        expect(history).not.toContain(title);
    });

    it("requires explicit archive confirmation and exact restoration revision, preserving private history and UUID", async () => {
      const w = await work();
      let e = await patch(await add(w), {
        notes: "Retained private note",
        ratingHalfStars: 7,
        favorite: true,
      });
      e = await action(e, "START_READ", { notes: "Attempt note" });
      e = await progress(e, {
        chapterNumber: 12,
        progressNotes: "Retained progress",
      });
      await expect(
        removeLibraryEntry(
          e.id,
          {
            revision: e.revision,
            mutationKey: randomUUID(),
            confirmRemoval: false,
          },
          h(owner),
        ),
      ).rejects.toMatchObject({ name: "ZodError" });
      const before = await rows(e.id);
      const removed = await removeLibraryEntry(
        e.id,
        {
          revision: e.revision,
          mutationKey: randomUUID(),
          confirmRemoval: true,
        },
        h(owner),
      );
      expect(removed).toMatchObject({
        archived: true,
        notes: e.notes,
        ratingHalfStars: 7,
        favorite: true,
      });
      expect(removed.currentSession).toMatchObject({
        state: "ABANDONED",
        completedAt: null,
        chapterNumber: 12,
      });
      expect(removed.currentSession!.closedAt).not.toBeNull();
      expect((await listLibraryEntries({}, h(owner))).items).toEqual([]);
      expect(await getOwnWorkLibraryState(w.id, h(owner))).toMatchObject({
        archived: true,
        id: e.id,
      });
      await expect(getLibraryEntry(e.id, h(owner))).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        addLibraryEntry({ workId: w.id, mutationKey: randomUUID() }, h(owner)),
      ).rejects.toMatchObject({ code: "RESTORE_REVISION_REQUIRED" });
      await expect(
        addLibraryEntry(
          { workId: w.id, revision: e.revision, mutationKey: randomUUID() },
          h(owner),
        ),
      ).rejects.toMatchObject({ code: "STALE_REVISION" });
      const restored = await addLibraryEntry(
        { workId: w.id, revision: removed.revision, mutationKey: randomUUID() },
        h(owner),
      );
      expect(restored).toMatchObject({
        id: e.id,
        archived: false,
        status: "WANT_TO_READ",
        notes: e.notes,
        ratingHalfStars: 7,
      });
      const after = await rows(e.id);
      expect(after.progress).toEqual(before.progress);
      expect(after.events).toHaveLength(before.events.length + 2);
      expect(
        (await readingSessionHistory(e.id, {}, h(owner))).items[0],
      ).toMatchObject({ state: "ABANDONED", notes: "Attempt note" });
    });

    it("isolates every service read/write/history from another owner and non-owner administrator", async () => {
      const w = await work();
      let e = await action(await add(w), "START_READ");
      e = await progress(e, { chapterNumber: 3 });
      const other = await f.account("user");
      const before = await rows(e.id);
      for (const actor of [other, admin]) {
        const head = h(actor);
        for (const operation of [
          () => getLibraryEntry(e.id, head),
          () => libraryEntryHistory(e.id, {}, head),
          () => readingSessionHistory(e.id, {}, head),
          () => readingProgressHistory(e.id, e.currentSession!.id, {}, head),
          () =>
            updateLibraryEntry(
              e.id,
              {
                revision: e.revision,
                mutationKey: randomUUID(),
                patch: { notes: "Intrusion" },
              },
              head,
            ),
          () =>
            removeLibraryEntry(
              e.id,
              {
                revision: e.revision,
                mutationKey: randomUUID(),
                confirmRemoval: true,
              },
              head,
            ),
          () =>
            readingSessionAction(
              e.id,
              {
                revision: e.revision,
                mutationKey: randomUUID(),
                action: "RESUME",
                sessionId: e.currentSession!.id,
              },
              head,
            ),
          () =>
            recordReadingProgress(
              e.id,
              {
                revision: e.revision,
                mutationKey: randomUUID(),
                sessionId: e.currentSession!.id,
                patch: { chapterNumber: 99 },
              },
              head,
            ),
        ])
          await expect(operation()).rejects.toMatchObject({ status: 404 });
        expect(await getOwnWorkLibraryState(w.id, head)).toBeNull();
        expect((await listLibraryEntries({}, head)).items).toEqual([]);
      }
      expect(await rows(e.id)).toEqual(before);
    });

    it("authenticates anonymous and forged owner/role headers before parsing or evaluating lazy input", async () => {
      const w = await work(),
        e = await add(w);
      let evaluated = false;
      const lazy = async () => {
        evaluated = true;
        return {};
      };
      const head = new Headers({ "x-user-id": owner.id, "x-role": "admin" });
      for (const operation of [
        () => getLibraryEntry("invalid", head),
        () => getOwnWorkLibraryState("invalid", head),
        () => listLibraryEntries({ ownerId: owner.id }, head),
        () => libraryEntryHistory("invalid", {}, head),
        () => readingSessionHistory("invalid", {}, head),
        () => readingProgressHistory("invalid", "invalid", {}, head),
        () => addLibraryEntry(lazy, head),
        () => updateLibraryEntry(e.id, lazy, head),
        () => removeLibraryEntry(e.id, lazy, head),
        () => readingSessionAction(e.id, lazy, head),
        () => recordReadingProgress(e.id, lazy, emptyHeaders()),
      ])
        await expect(operation()).rejects.toMatchObject({
          name: "AuthorizationError",
          status: 401,
        });
      expect(evaluated).toBe(false);
      expect((await rows(e.id)).events).toHaveLength(1);
    });

    it("rejects unknown ownership fields, unsafe controls and invalid numeric progress without writing", async () => {
      let e = await action(await add(await work()), "START_READ");
      const before = await rows(e.id);
      for (const value of [
        { patch: { notes: "x" }, userId: owner.id },
        { patch: { ownerId: owner.id } },
        { patch: { status: "INVENTED" } },
        { patch: { ratingHalfStars: 1 } },
        { patch: { ratingHalfStars: 2.5 } },
        { patch: { notes: "x".repeat(4001) } },
        { patch: { notes: "before\u202Eafter" } },
        { patch: { notes: "before\u0000after" } },
      ])
        await expect(
          updateLibraryEntry(
            e.id,
            { revision: e.revision, mutationKey: randomUUID(), ...value },
            h(owner),
          ),
        ).rejects.toMatchObject({ name: "ZodError" });
      for (const value of [
        { chapterNumber: -1 },
        { chapterNumber: 1000001 },
        { chapterNumber: 0.5 },
        { volumeNumber: 100001 },
        { personalChapterTotal: 0 },
        { chapterLabel: "x".repeat(201) },
        { progressNotes: "x".repeat(2001) },
        { percentage: 50 },
        { finishedOn: "2026-01-01" },
      ])
        await expect(progress(e, value)).rejects.toMatchObject({
          name: "ZodError",
        });
      expect(await rows(e.id)).toEqual(before);
    });

    it("truthfully pauses/resumes the same unfinished session and abandons dropped attempts", async () => {
      let e = await patch(await add(await work()), { status: "READING" });
      const first = e.currentSession!.id;
      expect(e.currentSession).toMatchObject({
        sequence: 1,
        kind: "FIRST_READ",
        state: "ACTIVE",
      });
      e = await patch(e, { status: "ON_HOLD" });
      expect(e.currentSession).toMatchObject({ id: first, state: "PAUSED" });
      e = await patch(e, { status: "WANT_TO_READ" });
      expect(e.currentSession).toMatchObject({ id: first, state: "PAUSED" });
      e = await patch(e, { status: "READING" });
      expect(e.currentSession).toMatchObject({ id: first, state: "ACTIVE" });
      e = await patch(e, { status: "DROPPED" });
      expect(e.currentSession).toMatchObject({
        id: first,
        state: "ABANDONED",
        completedAt: null,
        finishedOn: null,
      });
      expect(e.currentSession!.closedAt).not.toBeNull();
      await expect(
        action(e, "START_REREAD", { acknowledgeReread: true }),
      ).rejects.toMatchObject({ code: "NO_COMPLETED_READ" });
      e = await action(e, "START_READ");
      expect(e.currentSession).toMatchObject({
        sequence: 2,
        kind: "FIRST_READ",
        state: "ACTIVE",
      });
      expect(e.currentSession!.id).not.toBe(first);
      expect(
        (await readingSessionHistory(e.id, {}, h(owner))).items.map(
          (s) => s.state,
        ),
      ).toEqual(["ACTIVE", "ABANDONED"]);
    });

    it("marks previously read without fabricating personal dates, percentages or elapsed duration", async () => {
      let e = await patch(await add(await work()), { status: "COMPLETED" });
      expect(e.currentSession).toMatchObject({
        sequence: 1,
        kind: "FIRST_READ",
        state: "COMPLETED",
        startedOn: null,
        finishedOn: null,
        chapterNumber: null,
        personalChapterTotal: null,
      });
      expect(e.currentSession!.startedAt).toBe(e.currentSession!.completedAt);
      expect(e.currentSession!.closedAt).toBe(e.currentSession!.completedAt);
      for (const key of [
        "percentage",
        "duration",
        "elapsedReadingTime",
        "chapterCount",
        "volumeCount",
      ])
        expect(e.currentSession).not.toHaveProperty(key);
      e = await patch(e, { status: "WANT_TO_READ" });
      await expect(patch(e, { status: "READING" })).rejects.toMatchObject({
        code: "REREAD_ACKNOWLEDGMENT_REQUIRED",
      });
      await expect(action(e, "START_READ")).rejects.toMatchObject({
        code: "REREAD_ACKNOWLEDGMENT_REQUIRED",
      });
      e = await action(e, "START_REREAD", { acknowledgeReread: true });
      expect(e.currentSession).toMatchObject({
        sequence: 2,
        kind: "REREAD",
        startedOn: null,
        finishedOn: null,
      });
    });

    it("keeps first completion/progress distinguishable across explicit reread and never reopens a terminal session", async () => {
      let e = await action(await add(await work()), "START_READ", {
        startedOn: "2024-02-29",
        notes: "First attempt",
      });
      const first = e.currentSession!.id;
      e = await progress(e, {
        chapterNumber: 100,
        personalChapterTotal: 100,
        progressNotes: "First final progress",
      });
      e = await action(e, "COMPLETE", {
        sessionId: first,
        finishedOn: "2024-03-01",
        notes: "Completed privately",
      });
      const final = (await readingSessionHistory(e.id, {}, h(owner))).items[0];
      await expect(
        action(e, "RESUME", { sessionId: first }),
      ).rejects.toMatchObject({ code: "SESSION_NOT_OPEN" });
      await expect(progress(e, { chapterNumber: 101 })).rejects.toMatchObject({
        code: "SESSION_NOT_OPEN",
      });
      e = await action(e, "START_REREAD", { acknowledgeReread: true });
      expect(e.currentSession).toMatchObject({
        kind: "REREAD",
        sequence: 2,
        chapterNumber: null,
        personalChapterTotal: null,
      });
      await expect(
        action(e, "START_REREAD", { acknowledgeReread: true }),
      ).rejects.toMatchObject({ code: "SESSION_ALREADY_OPEN" });
      const history = await readingSessionHistory(e.id, {}, h(owner));
      expect(history.items[1]).toEqual(final);
      expect(
        (await readingProgressHistory(e.id, first, {}, h(owner))).items[0],
      ).toMatchObject({
        chapterNumber: 100,
        progressNotes: "First final progress",
      });
    });

    it("stores zero, labels, volume and private totals independently, then explicitly clears nullable progress", async () => {
      let e = await action(await add(await work()), "START_READ");
      e = await progress(e, {
        chapterNumber: 0,
        chapterLabel: "Prologue",
        volumeNumber: 0,
        volumeLabel: "Opening",
        personalChapterTotal: 1000000,
        progressNotes: "<b>plain private text</b>\nnot HTML",
      });
      expect(e.currentSession).toMatchObject({
        chapterNumber: 0,
        volumeNumber: 0,
        chapterLabel: "Prologue",
        personalChapterTotal: 1000000,
      });
      expect(e.work).not.toHaveProperty("personalChapterTotal");
      e = await progress(e, {
        chapterNumber: 1000000,
        volumeNumber: 100000,
        personalChapterTotal: null,
        chapterLabel: null,
        volumeLabel: null,
        progressNotes: null,
      });
      expect(e.currentSession).toMatchObject({
        chapterNumber: 1000000,
        volumeNumber: 100000,
        personalChapterTotal: null,
        chapterLabel: null,
        volumeLabel: null,
        progressNotes: "",
      });
      e = await progress(e, { chapterNumber: null, volumeNumber: null });
      expect(e.currentSession).toMatchObject({
        chapterNumber: null,
        volumeNumber: null,
        startedOn: null,
        finishedOn: null,
      });
      const history = await readingProgressHistory(
        e.id,
        e.currentSession!.id,
        {},
        h(owner),
      );
      expect(history.items).toHaveLength(3);
      expect(history.items[2]).toMatchObject({
        chapterNumber: 0,
        volumeNumber: 0,
        chapterLabel: "Prologue",
      });
      for (const item of history.items)
        expect(item).not.toHaveProperty("percentage");
    });

    it("validates exact Gregorian dates including inherited chronology without JS rollover", async () => {
      let e = await add(await work());
      for (const date of [
        "2023-02-29",
        "2024-04-31",
        "0000-01-01",
        "2024-2-01",
        "2024-02-29T00:00:00Z",
      ])
        await expect(
          action(e, "START_READ", { startedOn: date }),
        ).rejects.toMatchObject({ name: "ZodError" });
      e = await action(e, "START_READ", { startedOn: "0001-01-02" });
      const before = await rows(e.id);
      await expect(
        action(e, "COMPLETE", {
          sessionId: e.currentSession!.id,
          finishedOn: "0001-01-01",
        }),
      ).rejects.toMatchObject({ code: "INVALID_PERSONAL_DATES" });
      expect(await rows(e.id)).toEqual(before);
      e = await action(e, "COMPLETE", {
        sessionId: e.currentSession!.id,
        finishedOn: "9999-12-31",
      });
      expect(e.currentSession).toMatchObject({
        startedOn: "0001-01-02",
        finishedOn: "9999-12-31",
      });
    });

    it("rejects Edition UUIDs from a different Work or absent catalog identity", async () => {
      const w = await work({ editions: [{ title: "Scoped Edition" }] });
      const other = await work({ editions: [{ title: "Other Work Edition" }] });
      let e = await action(await add(w), "START_READ");
      const before = await rows(e.id);
      for (const editionId of [other.editions[0]!.id!, randomUUID()])
        await expect(progress(e, { editionId })).rejects.toMatchObject({
          code: "INVALID_EDITION",
        });
      expect(await rows(e.id)).toEqual(before);
      e = await progress(e, {
        editionId: w.editions[0]!.id!.toUpperCase(),
        chapterNumber: 2,
      });
      expect(e.currentSession!.editionId).toBe(w.editions[0]!.id);
      e = await progress(e, { editionId: null });
      expect(e.currentSession!.editionId).toBeNull();
    });

    it("allows real V1 selected-Edition removal while preserving session facts and old progress", async () => {
      const w = await work({
        editions: [
          { title: "Remove this Edition" },
          { title: "Keep stable Edition" },
        ],
      });
      let e = await action(await add(w), "START_READ");
      e = await progress(e, {
        editionId: w.editions[0]!.id!,
        chapterNumber: 42,
        volumeLabel: "Private volume",
        progressNotes: "Keep history",
      });
      const before = await rows(e.id);
      const current = (await adminGetWork(w.id, h(admin))) as AdminWork;
      const value = applyReviewedSuggestion(current, {}, citation());
      value.editions = current.editions.filter(
        (edition) => edition.id !== w.editions[0]!.id,
      );
      const updated = (await updateWork(
        w.id,
        { ...value, revision: current.revision },
        h(admin),
      )) as AdminWork;
      expect(updated.editions.map((edition) => edition.id)).toEqual([
        w.editions[1]!.id,
      ]);
      const after = await rows(e.id);
      expect(after.entry).toEqual(before.entry);
      expect(after.events).toEqual(before.events);
      expect(after.sessions[0]).toEqual({
        ...before.sessions[0],
        edition_id: null,
        edition_work_id: null,
      });
      expect(after.progress[0]).toEqual({
        ...before.progress[0],
        edition_id: null,
        edition_work_id: null,
      });
      expect(
        (await getLibraryEntry(e.id, h(owner))).currentSession,
      ).toMatchObject({
        chapterNumber: 42,
        volumeLabel: "Private volume",
        progressNotes: "Keep history",
        editionId: null,
      });
    });

    it("fences stale revisions and commits exactly one winner for parallel same-revision mutations", async () => {
      const e = await add(await work());
      const results = await Promise.allSettled([
        patch(e, { notes: "Concurrent notes" }),
        patch(e, { favorite: true }),
      ]);
      expect(fulfilled(results)).toHaveLength(1);
      expect(rejected(results)).toHaveLength(1);
      expect(rejected(results)[0]!.reason).toMatchObject({
        code: "STALE_REVISION",
      });
      const stored = await rows(e.id);
      expect(stored.entry).toMatchObject({ revision: 2, event_count: 2 });
      expect(stored.events).toHaveLength(2);
      await expect(patch(e, { status: "READING" })).rejects.toMatchObject({
        code: "STALE_REVISION",
      });
      expect((await rows(e.id)).sessions).toHaveLength(0);
    });

    it("atomically prevents parallel owner-key reuse across different entries/commands", async () => {
      const a = await add(await work()),
        b = await add(await work()),
        key = randomUUID();
      const results = await Promise.allSettled(
        [a, b].map((e) =>
          updateLibraryEntry(
            e.id,
            {
              revision: e.revision,
              mutationKey: key,
              patch: { favorite: true },
            },
            h(owner),
          ),
        ),
      );
      expect(fulfilled(results)).toHaveLength(1);
      expect(rejected(results)).toHaveLength(1);
      expect(rejected(results)[0]!.reason).toMatchObject({ status: 409 });
      const events =
        await sql`select entry_id from library_events where user_id = ${owner.id} and mutation_key = ${key}`;
      expect(events).toHaveLength(1);
      const saved =
        await sql`select revision, event_count, favorite from library_entries where user_id = ${owner.id} order by revision`;
      expect(saved).toMatchObject([
        { revision: 1, event_count: 1, favorite: false },
        { revision: 2, event_count: 2, favorite: true },
      ]);
    });

    it("no-ops unchanged favorite/notes/rating/progress/active RESUME without receipts, revisions or activity", async () => {
      let e = await action(await add(await work()), "START_READ", {
        notes: "Unchanged session note",
      });
      e = await progress(e, {
        chapterNumber: 0,
        progressNotes: "Current note",
      });
      const before = await rows(e.id);
      for (const value of [
        { favorite: false },
        { notes: "" },
        { ratingHalfStars: null },
        { status: "READING" },
      ]) {
        expect((await patch(e, value)).revision).toBe(e.revision);
      }
      expect(
        (await progress(e, { chapterNumber: 0, progressNotes: "Current note" }))
          .revision,
      ).toBe(e.revision);
      expect(
        (
          await action(e, "RESUME", {
            sessionId: e.currentSession!.id,
            notes: "Unchanged session note",
          })
        ).revision,
      ).toBe(e.revision);
      expect(await rows(e.id)).toEqual(before);
      // A session-note-only command is a real private edit, NOT reading activity.
      e = await action(e, "RESUME", {
        sessionId: e.currentSession!.id,
        notes: "Changed session note",
      });
      expect(e.revision).toBe(before.entry.revision + 1);
      expect(e.currentSession!.lastActivityAt).toBe(
        new Date(before.sessions[0]!.last_activity_at).toISOString(),
      );
    });

    it("no-ops already-completed status and terminal COMPLETE with identical facts but rejects terminal rewrites", async () => {
      let e = await action(await add(await work()), "START_READ", {
        startedOn: "2024-01-01",
      });
      e = await action(e, "COMPLETE", {
        sessionId: e.currentSession!.id,
        finishedOn: "2024-01-02",
        notes: "Final session note",
      });
      const before = await rows(e.id);
      expect((await patch(e, { status: "COMPLETED" })).revision).toBe(
        e.revision,
      );
      expect(
        (
          await action(e, "COMPLETE", {
            sessionId: e.currentSession!.id,
            finishedOn: "2024-01-02",
            notes: "Final session note",
          })
        ).revision,
      ).toBe(e.revision);
      await expect(
        action(e, "COMPLETE", {
          sessionId: e.currentSession!.id,
          notes: "Overwrite terminal",
        }),
      ).rejects.toMatchObject({ code: "SESSION_NOT_OPEN" });
      expect(await rows(e.id)).toEqual(before);
    });

    it("stores each half-star value and plain private notes, supports clears, and never changes catalog facts", async () => {
      const w = await work(),
        original = await adminGetWork(w.id, h(admin));
      let e = await action(await add(w), "START_READ");
      const activity = e.currentSession!.lastActivityAt;
      for (let rating = 2; rating <= 10; rating++) {
        e = await patch(e, { ratingHalfStars: rating });
        expect(e.ratingHalfStars).toBe(rating);
      }
      const note = "<script>private plain text</script>\nline\twith tab";
      e = await patch(e, { notes: note, favorite: true });
      expect(e.notes).toBe(note);
      expect(e.currentSession!.lastActivityAt).toBe(activity);
      e = await patch(e, { ratingHalfStars: null, notes: "" });
      expect(e).toMatchObject({ ratingHalfStars: null, notes: "" });
      expect(await adminGetWork(w.id, h(admin))).toEqual(original);
      const history = await libraryEntryHistory(e.id, {}, h(owner));
      expect(JSON.stringify(history)).toContain("private plain text");
      expect(JSON.stringify(history)).not.toContain(w.primaryTitle);
    });

    it("hides draft/hidden catalog metadata while retaining editable owner facts and existing Edition pointers", async () => {
      const w = await work({
        primaryTitle: `SECRET TITLE ${randomUUID()}`,
        descriptions: [{ language: "en", text: "SECRET DESCRIPTION" }],
        editions: [
          { title: "SECRET EDITION ONE" },
          { title: "SECRET EDITION TWO" },
        ],
        cover: {
          rights: "UNKNOWN",
          assetPath: "/covers/synthetic-secret.webp",
        },
      });
      let e = await action(await add(w), "START_READ");
      e = await progress(e, {
        editionId: w.editions[0]!.id!,
        chapterNumber: 1,
      });
      e = await patch(e, { notes: "Own private fact" });
      let current = (await adminGetWork(w.id, h(admin))) as AdminWork;
      await setVisibility(
        w.id,
        { revision: current.revision, visibility: "HIDDEN" },
        h(admin),
      );
      e = await progress(e, {
        editionId: w.editions[0]!.id!,
        chapterNumber: 2,
      });
      expect(e.work).toEqual({ available: false, id: w.id });
      expect(e.currentSession).toMatchObject({
        editionId: w.editions[0]!.id,
        chapterNumber: 2,
      });
      await expect(
        progress(e, { editionId: w.editions[1]!.id! }),
      ).rejects.toMatchObject({ code: "WORK_UNAVAILABLE" });
      e = await patch(e, { favorite: true, notes: "Updated own private fact" });
      const serialized = JSON.stringify({
        detail: await getLibraryEntry(e.id, h(owner)),
        list: await listLibraryEntries({ sort: "TITLE_ASC" }, h(owner)),
        history: await libraryEntryHistory(e.id, {}, h(owner)),
      });
      for (const secret of [
        w.primaryTitle,
        w.slug,
        "SECRET DESCRIPTION",
        "SECRET EDITION",
        "synthetic-secret.webp",
      ])
        expect(serialized).not.toContain(secret);
      current = (await adminGetWork(w.id, h(admin))) as AdminWork;
      await setVisibility(
        w.id,
        { revision: current.revision, visibility: "DRAFT" },
        h(admin),
      );
      expect((await getLibraryEntry(e.id, h(owner))).work).toEqual({
        available: false,
        id: w.id,
      });
      e = await progress(e, {
        editionId: null,
        chapterLabel: "Private draft label",
      });
      expect(e.currentSession).toMatchObject({
        editionId: null,
        chapterLabel: "Private draft label",
      });
      const other = await f.account("user");
      await expect(add(w, other)).rejects.toMatchObject({
        code: "WORK_UNAVAILABLE",
      });
      await expect(
        add(await work({ visibility: "HIDDEN" })),
      ).rejects.toMatchObject({ code: "WORK_UNAVAILABLE" });
    });

    it("sorts current locale titles, private ratings and favorites with no hidden-title ordering leak", async () => {
      const a = await work({
        primaryTitle: "Zulu English",
        titles: [
          { title: "Alpha Vietnamese", language: "vi", kind: "PRIMARY" },
        ],
      });
      const b = await work({
        primaryTitle: "Alpha English",
        titles: [{ title: "Zulu Vietnamese", language: "vi", kind: "PRIMARY" }],
      });
      const c = await work({ primaryTitle: "A Hidden Secret" });
      let ea = await add(a),
        eb = await add(b);
      const ec = await add(c);
      ea = await patch(ea, {
        favorite: true,
        ratingHalfStars: 4,
        status: "ON_HOLD",
      });
      eb = await patch(eb, { ratingHalfStars: 9 });
      await setVisibility(
        c.id,
        { revision: c.revision, visibility: "HIDDEN" },
        h(admin),
      );
      expect(
        (
          await listLibraryEntries(
            { sort: "TITLE_ASC", locale: "en" },
            h(owner),
          )
        ).items.map((e) => e.id),
      ).toEqual([eb.id, ea.id, ec.id]);
      expect(
        (
          await listLibraryEntries(
            { sort: "TITLE_ASC", locale: "vi" },
            h(owner),
          )
        ).items.map((e) => e.id),
      ).toEqual([ea.id, eb.id, ec.id]);
      expect(
        (await listLibraryEntries({ sort: "RATING_DESC" }, h(owner))).items.map(
          (e) => e.id,
        ),
      ).toEqual([eb.id, ea.id, ec.id]);
      expect(
        (
          await listLibraryEntries(
            { favorite: "true", status: "ON_HOLD" },
            h(owner),
          )
        ).items.map((e) => e.id),
      ).toEqual([ea.id]);
      expect(
        (await listLibraryEntries({ favorite: "false" }, h(owner))).items.map(
          (e) => e.id,
        ),
      ).not.toContain(ea.id);
      expect((await listLibraryEntries({}, h(owner))).items[0]!.id).toBe(eb.id);
      expect(
        (await listLibraryEntries({ sort: "ADDED_DESC" }, h(owner))).items[0]!
          .id,
      ).toBe(ec.id);
      for (const query of [
        { page: 401 },
        { page: true },
        { page: "" },
        { page: "01" },
        { locale: "xx" },
        { favorite: "yes" },
        { userId: owner.id },
      ])
        await expect(listLibraryEntries(query, h(owner))).rejects.toMatchObject(
          { name: "ZodError" },
        );
    });

    it("caps entry pages at50 with stable UUID ties and exact bounded history cursors", async () => {
      const seeded = await seedWorks(56);
      await seedEntries(seeded.ids);
      const p1 = await listLibraryEntries({}, h(owner)),
        p2 = await listLibraryEntries({ page: "2" }, h(owner));
      expect(p1).toMatchObject({
        total: 56,
        page: 1,
        pageSize: 50,
        hasNext: true,
      });
      expect(p1.items).toHaveLength(50);
      expect(p2.items).toHaveLength(6);
      expect(new Set([...p1.items, ...p2.items].map((e) => e.id)).size).toBe(
        56,
      );
      expect(
        (await listLibraryEntries({}, h(owner))).items.map((e) => e.id),
      ).toEqual(p1.items.map((e) => e.id));
      const e = await seedEvents(await add(seeded.base), 61);
      const first = await libraryEntryHistory(e.id, {}, h(owner));
      expect(first.items.map((event) => event.revision)).toEqual(
        Array.from({ length: 50 }, (_, i) => 61 - i),
      );
      expect(first.nextBeforeRevision).toBe(12);
      const second = await libraryEntryHistory(
        e.id,
        { beforeRevision: first.nextBeforeRevision },
        h(owner),
      );
      expect(second.items.map((event) => event.revision)).toEqual(
        Array.from({ length: 11 }, (_, i) => 11 - i),
      );
      expect(second.nextBeforeRevision).toBeNull();
      await expect(
        libraryEntryHistory(e.id, { beforeSequence: 1 }, h(owner)),
      ).rejects.toMatchObject({ code: "INVALID_HISTORY_CURSOR" });
      await expect(
        libraryEntryHistory(e.id, { beforeRevision: 10002 }, h(owner)),
      ).rejects.toMatchObject({ name: "ZodError" });
    });

    it("caps progress/session timelines at50 with exact sequence/revision continuation and no overlap", async () => {
      let e = await seedSessions(await add(await work()), 60);
      const sessions = await readingSessionHistory(e.id, {}, h(owner));
      expect(sessions.items).toHaveLength(50);
      expect(sessions.nextBeforeSequence).toBe(11);
      expect(
        (
          await readingSessionHistory(e.id, { beforeSequence: 11 }, h(owner))
        ).items.map((s) => s.sequence),
      ).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      e = await action(e, "START_READ");
      const start = e.revision,
        sid = e.currentSession!.id;
      requireTestDatabase();
      await sql.begin(async (tx) => {
        await tx`insert into library_events (entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) select ${e.id},${owner.id},${e.workId},${start} + n,gen_random_uuid(),repeat('d',64),'PROGRESS','{}'::jsonb from generate_series(1,60) n`;
        await tx`insert into reading_progress_events (entry_id,user_id,work_id,session_id,entry_revision,chapter_number) select ${e.id},${owner.id},${e.workId},${sid},${start} + n,n from generate_series(1,60) n`;
        await tx`update library_entries set revision=${start + 60},event_count=${start + 60} where id=${e.id} and user_id=${owner.id}`;
        await tx`update reading_sessions set revision=61,chapter_number=60 where id=${sid} and user_id=${owner.id}`;
      });
      const first = await readingProgressHistory(e.id, sid, {}, h(owner));
      expect(first.items).toHaveLength(50);
      expect(first.items.map((p) => p.chapterNumber)).toEqual(
        Array.from({ length: 50 }, (_, i) => 60 - i),
      );
      const second = await readingProgressHistory(
        e.id,
        sid,
        { beforeRevision: first.nextBeforeRevision },
        h(owner),
      );
      expect(second.items.map((p) => p.chapterNumber)).toEqual([
        10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
      ]);
      expect(second.nextBeforeRevision).toBeNull();
      await expect(
        readingSessionHistory(e.id, { beforeRevision: 1 }, h(owner)),
      ).rejects.toMatchObject({ code: "INVALID_HISTORY_CURSOR" });
      await expect(
        readingProgressHistory(e.id, sid, { beforeSequence: 1 }, h(owner)),
      ).rejects.toMatchObject({ code: "INVALID_HISTORY_CURSOR" });
    });

    it("rejects history growth above10000 without pruning and permits genuine no-op at the boundary", async () => {
      let e = await seedEvents(await add(await work()), 9999);
      e = await patch(e, { notes: "Boundary event" });
      expect(e.revision).toBe(10000);
      const before = await rows(e.id);
      expect(before.events).toHaveLength(10000);
      expect((await patch(e, { notes: "Boundary event" })).revision).toBe(
        10000,
      );
      await expect(patch(e, { favorite: true })).rejects.toMatchObject({
        code: "HISTORY_LIMIT_REACHED",
      });
      await expect(action(e, "START_READ")).rejects.toMatchObject({
        code: "HISTORY_LIMIT_REACHED",
      });
      await expect(
        removeLibraryEntry(
          e.id,
          {
            revision: e.revision,
            mutationKey: randomUUID(),
            confirmRemoval: true,
          },
          h(owner),
        ),
      ).rejects.toMatchObject({ code: "HISTORY_LIMIT_REACHED" });
      expect(await rows(e.id)).toEqual(before);
    }, 60000);

    it("accepts the1000th distinguishable attempt then rejects new sessions without losing retained history", async () => {
      let e = await seedSessions(await add(await work()), 999);
      e = await action(e, "START_READ");
      expect(e.currentSession).toMatchObject({
        sequence: 1000,
        kind: "FIRST_READ",
        state: "ACTIVE",
      });
      e = await patch(e, { status: "DROPPED" });
      const before = await rows(e.id);
      await expect(action(e, "START_READ")).rejects.toMatchObject({
        code: "SESSION_LIMIT_REACHED",
      });
      expect(before.sessions).toHaveLength(1000);
      expect(before.entry.session_count).toBe(1000);
      expect(await rows(e.id)).toEqual(before);
    }, 60000);

    it("counts archived entries toward20000, admits boundary creation, rejects overflow and never prunes", async () => {
      const seeded = await seedWorks(19999);
      await seedEntries(seeded.ids, true);
      const competing = await work();
      const result = await Promise.allSettled([
        add(seeded.base),
        add(competing),
      ]);
      expect(fulfilled(result)).toHaveLength(1);
      expect(rejected(result)).toHaveLength(1);
      expect(rejected(result)[0]!.reason).toMatchObject({
        code: "LIBRARY_LIMIT_REACHED",
      });
      const boundary = fulfilled(result)[0]!.value as LibraryEntryDetail;
      expect(boundary.revision).toBe(1);
      const [count] =
        await sql`select count(*)::int as total,count(*) filter(where removed_at is not null)::int as archived from library_entries where user_id=${owner.id}`;
      expect(count).toMatchObject({ total: 20000, archived: 1 });
      await expect(add(await work())).rejects.toMatchObject({
        code: "LIBRARY_LIMIT_REACHED",
      });
      expect(
        (
          await sql`select count(*)::int as total from library_entries where user_id=${owner.id}`
        )[0]!.total,
      ).toBe(20000);
      expect(
        (
          await sql`select count(*)::int as total from library_events where user_id=${owner.id}`
        )[0]!.total,
      ).toBe(20000);
      expect((await add({ id: boundary.workId })).id).toBe(boundary.id);
      // Measure the real signed, emailed account-deletion path at the owner cap,
      // under the same production-configured 5s SQL statement budget.
      const began = Date.now();
      const confirmed = await confirmedAccountDeletion(owner);
      const [remaining] =
        await sql`select (select count(*)::int from library_entries where user_id=${owner.id}) as entries, (select count(*)::int from library_events where user_id=${owner.id}) as events, (select count(*)::int from users where id=${owner.id}) as users`;
      console.info(
        JSON.stringify({
          probe: "max-owner-account-deletion",
          runId: f.runId,
          status: confirmed.status,
          elapsedMs: Date.now() - began,
          remaining,
        }),
      );
      expect([200, 302]).toContain(confirmed.status);
      expect(remaining).toMatchObject({ entries: 0, events: 0, users: 0 });
    }, 60000);

    it("enforces stored SQL bounds/hash/JSON/paired pointers/terminal chronology independently of service parsing", async () => {
      const w = await work({ editions: [{ title: "SQL scoped edition" }] });
      const editionId = w.editions[0]?.id;
      if (!editionId)
        throw new Error("Owned SQL fixture Edition was not persisted");
      const e = await action(await add(w), "START_READ");
      const sid = e.currentSession!.id;
      requireTestDatabase();
      for (const [column, value] of [
        ["rating_half_stars", 1],
        ["rating_half_stars", 11],
        ["revision", 0],
        ["revision", 10001],
        ["event_count", 0],
        ["event_count", 10001],
        ["session_count", -1],
        ["session_count", 1001],
      ] as const)
        await pgCode(
          sql`update library_entries set ${sql(column)}=${value} where id=${e.id} and user_id=${owner.id}`,
          "23514",
        );
      await pgCode(
        sql`update library_entries set notes=${"x".repeat(4001)} where id=${e.id}`,
        "23514",
      );
      for (const [column, value] of [
        ["sequence", 0],
        ["sequence", 1001],
        ["revision", 0],
        ["chapter_number", -1],
        ["chapter_number", 1000001],
        ["volume_number", -1],
        ["volume_number", 100001],
        ["personal_chapter_total", 0],
        ["personal_chapter_total", 1000001],
      ] as const)
        await pgCode(
          sql`update reading_sessions set ${sql(column)}=${value} where id=${sid} and user_id=${owner.id}`,
          "23514",
        );
      await pgCode(
        sql`update reading_sessions set chapter_label=${"x".repeat(201)} where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set notes=${"x".repeat(2001)} where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set progress_notes=${"x".repeat(2001)} where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set volume_label=${"x".repeat(201)} where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set edition_id=${editionId},edition_work_id=null where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set state='COMPLETED' where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set state='ABANDONED',closed_at=started_at-interval '1 day' where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set started_on=date '2024-02-02',finished_on=date '2024-02-01' where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`update reading_sessions set started_on=date 'infinity' where id=${sid}`,
        "23514",
      );
      await pgCode(
        sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${e.id},${owner.id},${w.id},3,gen_random_uuid(),repeat('A',64),'UPDATE','{}')`,
        "23514",
      );
      await pgCode(
        sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${e.id},${owner.id},${w.id},3,gen_random_uuid(),repeat('a',64),'UPDATE','[]')`,
        "23514",
      );
      await pgCode(
        sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${e.id},${owner.id},${w.id},3,gen_random_uuid(),repeat('a',64),'UPDATE',jsonb_build_object('n',repeat('é',20000)))`,
        "23514",
      );
      // Actual octet boundary, not JavaScript code-unit length.
      const [size] =
        await sql`select octet_length(jsonb_build_object('n',repeat('x',32759))::text) as bytes`;
      expect(size.bytes).toBe(32768);
      await sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${e.id},${owner.id},${w.id},3,gen_random_uuid(),repeat('a',64),'UPDATE',jsonb_build_object('n',repeat('x',32759)))`;
      await sql`update library_entries set revision=3,event_count=3,notes='' where id=${e.id} and user_id=${owner.id}`;
      expect((await rows(e.id)).events).toHaveLength(3);
    });

    it("enforces scoped composite FKs, owner-key uniqueness, one unfinished session and Work RESTRICT in PostgreSQL", async () => {
      const w = await work(),
        otherWork = await work(),
        other = await f.account("user");
      const e = await action(await add(w), "START_READ");
      const before = await rows(e.id),
        existingKey = before.events[0]!.mutation_key;
      requireTestDatabase();
      await pgCode(
        sql`insert into reading_sessions(entry_id,user_id,work_id,sequence,kind,state,closed_at) values(${e.id},${other.id},${w.id},2,'FIRST_READ','ABANDONED',now())`,
        "23503",
      );
      await pgCode(
        sql`insert into reading_sessions(entry_id,user_id,work_id,sequence,kind,state,closed_at) values(${e.id},${owner.id},${otherWork.id},2,'FIRST_READ','ABANDONED',now())`,
        "23503",
      );
      await pgCode(
        sql`insert into reading_sessions(entry_id,user_id,work_id,sequence,kind,state) values(${e.id},${owner.id},${w.id},2,'FIRST_READ','PAUSED')`,
        "23505",
      );
      await pgCode(
        sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${e.id},${other.id},${w.id},3,gen_random_uuid(),repeat('a',64),'UPDATE','{}')`,
        "23503",
      );
      const b = await add(otherWork);
      await pgCode(
        sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) values(${b.id},${owner.id},${otherWork.id},2,${existingKey},repeat('a',64),'UPDATE','{}')`,
        "23505",
      );
      await pgCode(
        sql`insert into reading_progress_events(entry_id,user_id,work_id,session_id,entry_revision) values(${b.id},${owner.id},${otherWork.id},${e.currentSession!.id},1)`,
        "23503",
      );
      await pgCode(
        sql`insert into reading_progress_events(entry_id,user_id,work_id,session_id,entry_revision) values(${e.id},${owner.id},${w.id},${e.currentSession!.id},999)`,
        "23503",
      );
      // Restrict is measured without unrelated catalog children masking its FK.
      const bare = await seedWorks(1);
      await seedEntries(bare.ids);
      const failure = await sql`delete from works where id=${bare.ids[0]}`.then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toMatchObject({
        constraint_name: "library_entries_work_id_works_id_fk",
      });
      expect(["23503", "23001"]).toContain((failure as { code: string }).code);
      expect(
        await sql`select id from works where id=${bare.ids[0]}`,
      ).toHaveLength(1);
      expect(
        await sql`select id from library_entries where user_id=${owner.id} and work_id=${bare.ids[0]}`,
      ).toHaveLength(1);
      expect(await rows(e.id)).toEqual(before);
    });

    it("rolls back entry/session/event/progress atomically when an entry-scoped event trigger rejects PROGRESS", async () => {
      let e = await action(await add(await work()), "START_READ");
      e = await progress(e, { chapterNumber: 1 });
      const before = await rows(e.id),
        name = `library_test_${randomUUID().replaceAll("-", "")}`;
      requireTestDatabase();
      // UUID/name are generated internally; trigger predicate affects only our entry.
      await sql.unsafe(
        `create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'synthetic owned rollback probe'; end $$`,
      );
      try {
        await sql.unsafe(
          `create trigger ${name} before insert on library_events for each row when (NEW.entry_id = '${e.id}'::uuid and NEW.kind = 'PROGRESS') execute function ${name}()`,
        );
        await expect(
          progress(e, { chapterNumber: 999, progressNotes: "Must roll back" }),
        ).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
        expect(await rows(e.id)).toEqual(before);
      } finally {
        await sql.unsafe(`drop trigger if exists ${name} on library_events`);
        await sql.unsafe(`drop function if exists ${name}()`);
      }
      e = await progress(e, { chapterNumber: 2 });
      expect(e.currentSession!.chapterNumber).toBe(2);
      expect((await rows(e.id)).progress).toHaveLength(2);
    });

    it("erases all private rows by actual SMTP-confirmed Better Auth account deletion without detached history", async () => {
      let e = await action(await add(await work()), "START_READ");
      e = await progress(e, {
        chapterNumber: 7,
        progressNotes: "Erase private history",
      });
      e = await patch(e, { notes: "Erase owner notes", ratingHalfStars: 8 });
      let archived = await action(await add(await work()), "START_READ");
      archived = await progress(archived, {
        chapterNumber: 9,
        progressNotes: "Erase archived private history too",
      });
      await removeLibraryEntry(
        archived.id,
        {
          revision: archived.revision,
          mutationKey: randomUUID(),
          confirmRemoval: true,
        },
        h(owner),
      );
      expect(
        await sql`select id from library_entries where user_id=${owner.id}`,
      ).toHaveLength(2);
      expect(
        await sql`select id from reading_progress_events where user_id=${owner.id}`,
      ).toHaveLength(2);
      const confirmed = await confirmedAccountDeletion(owner);
      expect([200, 302]).toContain(confirmed.status);
      expect(await sql`select id from users where id=${owner.id}`).toHaveLength(
        0,
      );
      for (const table of [
        "library_entries",
        "reading_sessions",
        "library_events",
        "reading_progress_events",
      ])
        expect(
          await sql`select id from ${sql(table)} where user_id=${owner.id}`,
        ).toHaveLength(0);
      expect(
        await sql`select id from accounts where user_id=${owner.id}`,
      ).toHaveLength(0);
      expect(
        await sql`select id from sessions where user_id=${owner.id}`,
      ).toHaveLength(0);
      await expect(getLibraryEntry(e.id, h(owner))).rejects.toMatchObject({
        status: 401,
      });
    });

    it("atomically applies exactly30 shared mutations/minute without double-charging or resetting unrelated rows", async () => {
      const w = await work(),
        unrelatedKey = `library-test:${f.runId}:${randomUUID()}`,
        unrelatedId = randomUUID();
      requireTestDatabase();
      await sql`insert into rate_limits(id,key,count,last_request) values(${unrelatedId},${unrelatedKey},17,1)`;
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 32 }, () => add(w)),
        );
        expect(fulfilled(results)).toHaveLength(30);
        expect(rejected(results)).toHaveLength(2);
        expect(
          rejected(results).every(
            (r) => r.reason.status === 429 && r.reason.code === "RATE_LIMITED",
          ),
        ).toBe(true);
        const [limit] =
          await sql`select count,last_request from rate_limits where key=${`catalog.write:${owner.id}`}`;
        expect(limit.count).toBe(32);
        const [unrelated] =
          await sql`select count,last_request from rate_limits where id=${unrelatedId} and key=${unrelatedKey}`;
        expect(unrelated).toMatchObject({ count: 17, last_request: "1" });
        expect(
          await sql`select id from library_entries where user_id=${owner.id}`,
        ).toHaveLength(1);
        expect(
          await sql`select id from library_events where user_id=${owner.id}`,
        ).toHaveLength(1);
        const independent = await f.account("user");
        expect((await add(w, independent)).revision).toBe(1);
        expect(
          (
            await sql`select count from rate_limits where key=${`catalog.write:${independent.id}`}`
          )[0]!.count,
        ).toBe(1);
      } finally {
        await sql`delete from rate_limits where id=${unrelatedId} and key=${unrelatedKey}`;
      }
    });
  },
);
