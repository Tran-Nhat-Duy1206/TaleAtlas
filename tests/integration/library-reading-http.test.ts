import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { POST as add } from "../../apps/web/src/app/api/library/route";
import {
  GET as bDetail,
  PATCH as bPatch,
  DELETE as remove,
} from "../../apps/web/src/app/api/library/[id]/route";
import { GET as detail } from "../../apps/web/src/app/api/library/[id]/reading/route";
import { POST as progress } from "../../apps/web/src/app/api/library/[id]/progress/route";
import {
  GET as sessions,
  POST as action,
} from "../../apps/web/src/app/api/library/[id]/sessions/route";
import { GET as progressHistory } from "../../apps/web/src/app/api/library/[id]/sessions/[sessionId]/progress/route";
import { GET as history } from "../../apps/web/src/app/api/library/[id]/history/route";
import {
  readingMutationResponseSchema,
  readingSessionHistoryResponseSchema,
  readingProgressHistoryResponseSchema,
  readingEntryHistoryResponseSchema,
  type ReadingHttpDetails,
} from "../../apps/web/src/features/library/reading-http-contracts";

const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const sessionContext = (id: string, sessionId: string) => ({
  params: Promise.resolve({ id, sessionId }),
});
function request(
  path: string,
  method = "GET",
  body?: unknown,
  actor: Actor | null = owner,
  extra: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/library${path}`, {
    method,
    headers: {
      ...(actor ? { Cookie: actor.cookie } : {}),
      ...(method === "GET"
        ? {}
        : { Origin: f.origin, "Content-Type": "application/json" }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}
async function error(response: Response, status: number, code: string) {
  expect(await json(response, status)).toEqual({ error: code });
}
async function work(editions: { title: string }[] = []) {
  return (await createWork(
    {
      primaryTitle: `Synthetic C HTTP ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      editions,
      source: {
        label: f.sourceLabel,
        citation:
          "Invented UUID-owned V3C HTTP fixture; no production metadata.",
      },
    },
    new Headers({ Cookie: admin.cookie }),
  )) as AdminWork;
}
async function entry(w: Pick<AdminWork, "id">) {
  const e = await json(
    await add(request("", "POST", { workId: w.id, mutationKey: randomUUID() })),
  );
  return read(e.id);
}
async function read(id: string) {
  const value = await json(
    await detail(request(`/${id}/reading`), context(id)),
  );
  readingMutationResponseSchema.parse(value);
  return value as ReadingHttpDetails;
}
async function start(e: ReadingHttpDetails, extra: object = {}) {
  const value = await json(
    await action(
      request(`/${e.id}/sessions`, "POST", {
        revision: e.revision,
        mutationKey: randomUUID(),
        action: "START_READ",
        ...extra,
      }),
      context(e.id),
    ),
  );
  readingMutationResponseSchema.parse(value);
  return value as ReadingHttpDetails;
}
function command(e: ReadingHttpDetails, extra: object = {}) {
  return {
    revision: e.revision,
    mutationKey: randomUUID(),
    sessionId: e.readingSession!.id,
    ...extra,
  };
}
async function update(e: ReadingHttpDetails, patch: object) {
  const value = await json(
    await progress(
      request(`/${e.id}/progress`, "POST", command(e, { patch })),
      context(e.id),
    ),
  );
  readingMutationResponseSchema.parse(value);
  return value as ReadingHttpDetails;
}
async function budget(actor = owner) {
  const [row] =
    await sql`select count from rate_limits where key = ${`catalog.write:${actor.id}`}`;
  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  requireTestDatabase();
  console.info(`V3C HTTP UUID-owned fixture run ${f.runId}`);
  await f.start();
  admin = await f.account("admin");
});
beforeEach(async () => {
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  const users = f.users.map((u) => u.id);
  if (users.length)
    await sql`delete from library_entries where user_id = any(${users}::text[])`;
  const rows =
    await sql`select w.id from works w join catalog_sources s on s.id = w.source_id where s.label = ${f.sourceLabel}`;
  const ids = rows.map((r) => String(r.id));
  if (ids.length) {
    await sql`delete from catalog_field_evidence where work_id = any(${ids}::uuid[])`;
    await sql`delete from catalog_audit_events where work_id = any(${ids}::uuid[])`;
    await sql`delete from editions where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_titles where work_id = any(${ids}::uuid[])`;
    await sql`delete from works where id = any(${ids}::uuid[])`;
  }
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential(
  "V3C reading HTTP: actual verified signed accounts, SMTP and PostgreSQL",
  () => {
    it("records numeric/personal-total and free-label/volume progress without inventing totals or changing B DTO", async () => {
      let e = await start(await entry(await work()), {
        notes: "Attempt note",
        startedOn: "2024-02-29",
      });
      expect(e.readingSession).toMatchObject({
        chapterNumber: null,
        personalChapterTotal: null,
        startedOn: "2024-02-29",
        finishedOn: null,
      });
      e = await update(e, {
        chapterNumber: 0,
        personalChapterTotal: 120,
        chapterLabel: "Prologue",
        volumeNumber: 0,
        volumeLabel: "Opening",
        progressNotes: "Personal marker",
      });
      expect(e.readingSession).toMatchObject({
        chapterNumber: 0,
        personalChapterTotal: 120,
        volumeNumber: 0,
        notes: "Attempt note",
      });
      e = await update(e, {
        chapterLabel: "Unnumbered epilogue",
        volumeLabel: "Final volume",
      });
      expect(e.readingSession).toMatchObject({
        chapterNumber: 0,
        personalChapterTotal: 120,
        volumeNumber: 0,
        chapterLabel: "Unnumbered epilogue",
      });
      e = await update(e, {
        chapterNumber: null,
        volumeNumber: null,
        personalChapterTotal: null,
        progressNotes: null,
      });
      expect(e.readingSession).toMatchObject({
        chapterNumber: null,
        volumeNumber: null,
        personalChapterTotal: null,
        progressNotes: "",
      });
      for (const field of [
        "ratingHalfStars",
        "notes",
        "userId",
        "snapshot",
        "mutationKey",
        "requestHash",
        "percentage",
        "duration",
      ])
        expect(e).not.toHaveProperty(field);
      const b = await json(await bDetail(request(`/${e.id}`), context(e.id)));
      expect(b).not.toHaveProperty("readingSession");
      expect(b.currentSession).toEqual(e.currentSession);
      expect(Object.keys(b.currentSession)).toEqual(["id", "state", "kind"]);
    });

    it("binds live Editions to the own Work and never returns hidden catalog metadata", async () => {
      const w = await work([{ title: "Own Edition" }]),
        other = await work([{ title: "Other Edition" }]);
      let e = await start(await entry(w));
      for (const editionId of [other.editions[0]!.id, randomUUID()])
        await error(
          await progress(
            request(
              `/${e.id}/progress`,
              "POST",
              command(e, { patch: { editionId } }),
            ),
            context(e.id),
          ),
          400,
          "INVALID_EDITION",
        );
      e = await update(e, { editionId: w.editions[0]!.id!.toUpperCase() });
      expect(e.readingSession!.editionId).toBe(w.editions[0]!.id);
      await setVisibility(
        w.id,
        { visibility: "HIDDEN", revision: w.revision },
        new Headers({ Cookie: admin.cookie }),
      );
      e = await read(e.id);
      expect(e.work).toEqual({ available: false, id: w.id });
      expect(JSON.stringify(e)).not.toContain(w.primaryTitle);
      e = await update(e, {
        chapterLabel: "Own hidden-work progress",
        editionId: null,
      });
      expect(e.work).toEqual({ available: false, id: w.id });
      await error(
        await progress(
          request(
            `/${e.id}/progress`,
            "POST",
            command(e, { patch: { editionId: w.editions[0]!.id } }),
          ),
          context(e.id),
        ),
        404,
        "WORK_UNAVAILABLE",
      );
      for (const response of [
        await sessions(request(`/${e.id}/sessions`), context(e.id)),
        await history(request(`/${e.id}/history`), context(e.id)),
        await progressHistory(
          request(`/${e.id}/sessions/${e.readingSession!.id}/progress`),
          sessionContext(e.id, e.readingSession!.id),
        ),
      ])
        expect(JSON.stringify(await json(response))).not.toContain(
          w.primaryTitle,
        );
    });

    it("pauses through unchanged B status and resumes the same attempt with explicit C completion and reread", async () => {
      let e = await start(await entry(await work()), {
        startedOn: "2024-02-29",
      });
      const sid = e.readingSession!.id;
      const b = await json(
        await bPatch(
          request(`/${e.id}`, "PATCH", {
            revision: e.revision,
            mutationKey: randomUUID(),
            patch: { status: "ON_HOLD" },
          }),
          context(e.id),
        ),
      );
      e = await read(e.id);
      expect(e).toMatchObject({
        revision: b.revision,
        readingSession: { id: sid, state: "PAUSED", sequence: 1 },
      });
      e = await json(
        await action(
          request(
            `/${e.id}/sessions`,
            "POST",
            command(e, { action: "RESUME" }),
          ),
          context(e.id),
        ),
      );
      expect(e.readingSession).toMatchObject({
        id: sid,
        state: "ACTIVE",
        sequence: 1,
      });
      const unconfirmed = command(e, {
        action: "COMPLETE",
        finishedOn: "2024-03-01",
      });
      await error(
        await action(
          request(`/${e.id}/sessions`, "POST", unconfirmed),
          context(e.id),
        ),
        400,
        "VALIDATION_ERROR",
      );
      await error(
        await action(
          request(
            `/${e.id}/sessions`,
            "POST",
            command(e, {
              action: "COMPLETE",
              confirmCompletion: true,
              finishedOn: "2024-02-28",
            }),
          ),
          context(e.id),
        ),
        400,
        "INVALID_PERSONAL_DATES",
      );
      const complete = { ...unconfirmed, confirmCompletion: true };
      e = await json(
        await action(
          request(`/${e.id}/sessions`, "POST", complete),
          context(e.id),
        ),
      );
      expect(e).toMatchObject({
        status: "COMPLETED",
        hasCompletedRead: true,
        readingSession: {
          id: sid,
          startedOn: "2024-02-29",
          finishedOn: "2024-03-01",
          state: "COMPLETED",
        },
      });
      expect(e.readingSession!.completedAt).toBeTruthy();
      expect(e.readingSession!.closedAt).toBe(e.readingSession!.completedAt);
      expect(
        await json(
          await action(
            request(`/${e.id}/sessions`, "POST", complete),
            context(e.id),
          ),
        ),
      ).toEqual(e);
      expect(
        await json(
          await action(
            request(
              `/${e.id}/sessions`,
              "POST",
              command(e, {
                action: "COMPLETE",
                confirmCompletion: true,
                finishedOn: "2024-03-01",
              }),
            ),
            context(e.id),
          ),
        ),
      ).toEqual(e);
      await error(
        await action(
          request(`/${e.id}/sessions`, "POST", {
            revision: e.revision,
            mutationKey: randomUUID(),
            action: "START_REREAD",
          }),
          context(e.id),
        ),
        400,
        "VALIDATION_ERROR",
      );
      e = await json(
        await action(
          request(`/${e.id}/sessions`, "POST", {
            revision: e.revision,
            mutationKey: randomUUID(),
            action: "START_REREAD",
            acknowledgeReread: true,
          }),
          context(e.id),
        ),
      );
      expect(e.readingSession).toMatchObject({
        sequence: 2,
        kind: "REREAD",
        state: "ACTIVE",
        startedOn: null,
        finishedOn: null,
        chapterNumber: null,
        personalChapterTotal: null,
      });
      expect(e.readingSession!.id).not.toBe(sid);
    });

    it("serializes competing starts and progress, rejects stale commands and preserves exact replay/noop", async () => {
      let e = await entry(await work());
      const starts = await Promise.all(
        Array.from({ length: 2 }, () =>
          action(
            request(`/${e.id}/sessions`, "POST", {
              revision: 1,
              mutationKey: randomUUID(),
              action: "START_READ",
            }),
            context(e.id),
          ),
        ),
      );
      expect(starts.map((r) => r.status).sort()).toEqual([200, 409]);
      await error(starts.find((r) => r.status === 409)!, 409, "STALE_REVISION");
      e = await read(e.id);
      await error(
        await action(
          request(`/${e.id}/sessions`, "POST", {
            revision: e.revision,
            mutationKey: randomUUID(),
            action: "START_READ",
          }),
          context(e.id),
        ),
        409,
        "SESSION_ALREADY_OPEN",
      );
      const commands = [
        command(e, { patch: { chapterNumber: 1 } }),
        command(e, { patch: { chapterNumber: 2 } }),
      ];
      const results = await Promise.all(
        commands.map((c) =>
          progress(request(`/${e.id}/progress`, "POST", c), context(e.id)),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      await error(
        results.find((r) => r.status === 409)!,
        409,
        "STALE_REVISION",
      );
      const winner = results.findIndex((r) => r.status === 200);
      e = await json(results[winner]!);
      expect(
        await json(
          await progress(
            request(`/${e.id}/progress`, "POST", commands[winner]),
            context(e.id),
          ),
        ),
      ).toEqual(e);
      await error(
        await progress(
          request(`/${e.id}/progress`, "POST", {
            ...commands[winner],
            patch: { chapterNumber: 999 },
          }),
          context(e.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      const before = await budget();
      expect(
        await update(e, { chapterNumber: e.readingSession!.chapterNumber }),
      ).toEqual(e);
      expect(await budget()).toBe(before + 1);
      const [row] =
        await sql`select count(*)::int as n from reading_sessions where entry_id=${e.id} and user_id=${owner.id} and state in ('ACTIVE','PAUSED')`;
      expect(row.n).toBe(1);
      const page = await json(
        await progressHistory(
          request(`/${e.id}/sessions/${e.readingSession!.id}/progress`),
          sessionContext(e.id, e.readingSession!.id),
        ),
      );
      expect(page.items).toHaveLength(1);
    });

    it("isolates owner-only detail, commands and every history from other users and administrators", async () => {
      const e = await start(await entry(await work())),
        sid = e.readingSession!.id;
      const other = await f.account("user");
      for (const actor of [other, admin]) {
        for (const [handler, path] of [
          [detail, "reading"],
          [sessions, "sessions"],
          [history, "history"],
        ] as const)
          await error(
            await handler(
              request(`/${e.id}/${path}`, "GET", undefined, actor),
              context(e.id),
            ),
            404,
            "ENTRY_NOT_FOUND",
          );
        await error(
          await progressHistory(
            request(
              `/${e.id}/sessions/${sid}/progress`,
              "GET",
              undefined,
              actor,
            ),
            sessionContext(e.id, sid),
          ),
          404,
          "SESSION_NOT_FOUND",
        );
        await error(
          await progress(
            request(
              `/${e.id}/progress`,
              "POST",
              command(e, { patch: { chapterNumber: 3 } }),
              actor,
            ),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
        await error(
          await action(
            request(
              `/${e.id}/sessions`,
              "POST",
              command(e, { action: "RESUME" }),
              actor,
            ),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
      }
      const otherEntry = await start(await entry(await work()));
      await error(
        await progressHistory(
          request(
            `/${e.id}/sessions/${otherEntry.readingSession!.id}/progress`,
          ),
          sessionContext(e.id, otherEntry.readingSession!.id),
        ),
        404,
        "SESSION_NOT_FOUND",
      );
      await error(
        await progress(
          request(
            `/${e.id}/progress`,
            "POST",
            command(e, { ownerId: owner.id, patch: { chapterNumber: 3 } }),
          ),
          context(e.id),
        ),
        400,
        "VALIDATION_ERROR",
      );
      await error(
        await detail(
          request(`/${randomUUID()}/reading`),
          context(randomUUID()),
        ),
        404,
        "ENTRY_NOT_FOUND",
      );
      await json(
        await remove(
          request(`/${e.id}`, "DELETE", {
            revision: e.revision,
            mutationKey: randomUUID(),
            confirmRemoval: true,
          }),
          context(e.id),
        ),
      );
      for (const handler of [detail, sessions, history])
        await error(
          await handler(request(`/${e.id}/reading`), context(e.id)),
          404,
          "ENTRY_NOT_FOUND",
        );
      await error(
        await progressHistory(
          request(`/${e.id}/sessions/${sid}/progress`),
          sessionContext(e.id, sid),
        ),
        404,
        "SESSION_NOT_FOUND",
      );
      await error(
        await progress(
          request(
            `/${e.id}/progress`,
            "POST",
            command(e, { patch: { chapterNumber: 3 } }),
          ),
          context(e.id),
        ),
        404,
        "ENTRY_NOT_FOUND",
      );
      await error(
        await action(
          request(
            `/${e.id}/sessions`,
            "POST",
            command(e, { action: "RESUME" }),
          ),
          context(e.id),
        ),
        404,
        "ENTRY_NOT_FOUND",
      );
    });

    it("authenticates first and rejects forged identity headers/cookies before query, ID, body and origin", async () => {
      for (const handler of [detail, sessions, history])
        await error(
          await handler(
            request("/bad/reading?locale=xx&owner=x", "GET", undefined, null),
            context("bad"),
          ),
          401,
          "AUTHENTICATION_REQUIRED",
        );
      await error(
        await progressHistory(
          request(
            "/bad/sessions/bad/progress?beforeRevision=0",
            "GET",
            undefined,
            null,
          ),
          sessionContext("bad", "bad"),
        ),
        401,
        "AUTHENTICATION_REQUIRED",
      );
      for (const handler of [progress, action])
        await error(
          await handler(
            request("/bad/progress?owner=x", "POST", {}, null, {
              Origin: "https://evil.invalid",
              "x-user-id": owner.id,
            }),
            context("bad"),
          ),
          401,
          "AUTHENTICATION_REQUIRED",
        );
      await error(
        await detail(
          request("/bad/reading", "GET", undefined, null, {
            Cookie: "better-auth.session_token=forged",
            "x-user-id": owner.id,
            "x-role": "admin",
          }),
          context("bad"),
        ),
        401,
        "AUTHENTICATION_REQUIRED",
      );
      expect(await budget()).toBe(0);
    });

    it("charges authenticated origin/query/malformed-input failures exactly once and never consumes rejected-origin bodies", async () => {
      const e = await start(await entry(await work()));
      const before = await budget();
      for (const handler of [progress, action]) {
        const badOrigin = request(`/${e.id}/progress`, "POST", {}, owner, {
          Origin: "https://evil.invalid",
        });
        await error(
          await handler(badOrigin, context(e.id)),
          403,
          "UNTRUSTED_ORIGIN",
        );
        expect(badOrigin.bodyUsed).toBe(false);
        const absentOrigin = request(`/${e.id}/progress`, "POST", {});
        absentOrigin.headers.delete("origin");
        await error(
          await handler(absentOrigin, context(e.id)),
          403,
          "UNTRUSTED_ORIGIN",
        );
        await error(
          await handler(
            request(`/${e.id}/progress?locale=en&locale=vi`, "POST", {}),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await handler(
            request(`/${e.id}/progress?owner=x`, "POST", {}),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await handler(
            request(`/${e.id}/progress`, "POST", {}),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await handler(
            request(`/${e.id}/progress`, "POST", {}, owner, {
              "Content-Type": "text/plain",
            }),
            context(e.id),
          ),
          415,
          "JSON_REQUIRED",
        );
      }
      expect(await budget()).toBe(before + 12);
      expect((await read(e.id)).revision).toBe(e.revision);
    });

    it("retains bounded 64KiB JSON and fatal UTF-8 decoding for both C mutations", async () => {
      const id = randomUUID();
      const raw = (body: BodyInit, extra: Record<string, string> = {}) =>
        new Request(`${f.origin}/api/library/${id}/progress`, {
          method: "POST",
          headers: {
            Cookie: owner.cookie,
            Origin: f.origin,
            "Content-Type": "application/json",
            ...extra,
          },
          body,
        });
      for (const handler of [progress, action]) {
        await error(
          await handler(raw("{}", { "Content-Length": "65537" }), context(id)),
          413,
          "BODY_TOO_LARGE",
        );
        await error(
          await handler(
            raw(JSON.stringify({ value: "é".repeat(32768) })),
            context(id),
          ),
          413,
          "BODY_TOO_LARGE",
        );
        await error(
          await handler(raw(" ".repeat(65536)), context(id)),
          400,
          "INVALID_JSON",
        );
        await error(
          await handler(
            raw(
              new Uint8Array([
                0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
              ]),
            ),
            context(id),
          ),
          400,
          "INVALID_JSON",
        );
      }
      expect(await budget()).toBe(8);
    });

    it("uses strict cursor bounds/fences and rejects duplicate, wrong-kind and injected history query keys without charging reads", async () => {
      const e = await start(await entry(await work())),
        sid = e.readingSession!.id,
        before = await budget();
      for (const query of [
        "locale=en&locale=vi",
        "beforeRevision=1&beforeRevision=2",
        "beforeRevision=0",
        "beforeRevision=10002",
        "beforeSequence=1002",
        "beforeSequence=01",
        "beforeRevision=1&beforeSequence=1",
        "owner=x",
        "limit=1",
        "snapshot=x",
      ])
        for (const handler of [sessions, history])
          await error(
            await handler(request(`/${e.id}/history?${query}`), context(e.id)),
            400,
            "VALIDATION_ERROR",
          );
      await error(
        await sessions(
          request(`/${e.id}/sessions?beforeRevision=1`),
          context(e.id),
        ),
        400,
        "INVALID_HISTORY_CURSOR",
      );
      await error(
        await history(
          request(`/${e.id}/history?beforeSequence=1`),
          context(e.id),
        ),
        400,
        "INVALID_HISTORY_CURSOR",
      );
      await error(
        await progressHistory(
          request(`/${e.id}/sessions/${sid}/progress?beforeSequence=1`),
          sessionContext(e.id, sid),
        ),
        400,
        "INVALID_HISTORY_CURSOR",
      );
      expect(await budget()).toBe(before);
    });

    it("paginates retained session/progress/event histories at exactly50 with exclusive cursors and no D snapshots", async () => {
      let e = await entry(await work());
      // Guarded fixture-owned bulk setup, not 60 requests evading the real shared 30/minute budget.
      requireTestDatabase();
      await sql.begin(async (tx) => {
        await tx`insert into reading_sessions (entry_id,user_id,work_id,sequence,kind,state,started_at,closed_at) select ${e.id},${owner.id},${e.workId},n,'FIRST_READ','ABANDONED',now(),now() from generate_series(1,60) n`;
        await tx`insert into library_events (entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) select ${e.id},${owner.id},${e.workId},n,gen_random_uuid(),repeat('c',64),'START_READ','{"notes":"D ENTRY SECRET","ratingHalfStars":8}'::jsonb from generate_series(2,61) n`;
        await tx`update library_entries set session_count=60,revision=61,event_count=61 where id=${e.id} and user_id=${owner.id}`;
      });
      let page = await json(
        await sessions(request(`/${e.id}/sessions?locale=vi`), context(e.id)),
      );
      readingSessionHistoryResponseSchema.parse(page);
      expect(page.items).toHaveLength(50);
      expect(page.nextBeforeSequence).toBe(11);
      const older = await json(
        await sessions(
          request(`/${e.id}/sessions?beforeSequence=11`),
          context(e.id),
        ),
      );
      expect(older.items.map((s: { sequence: number }) => s.sequence)).toEqual([
        10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
      ]);
      expect(older.nextBeforeSequence).toBeNull();
      e = await start(await read(e.id));
      const sid = e.readingSession!.id,
        base = e.revision;
      await sql.begin(async (tx) => {
        await tx`insert into library_events (entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot) select ${e.id},${owner.id},${e.workId},${base}+n,gen_random_uuid(),repeat('d',64),'PROGRESS','{"notes":"D ENTRY SECRET","ratingHalfStars":8}'::jsonb from generate_series(1,60) n`;
        await tx`insert into reading_progress_events (entry_id,user_id,work_id,session_id,entry_revision,chapter_number) select ${e.id},${owner.id},${e.workId},${sid},${base}+n,n from generate_series(1,60) n`;
        await tx`update library_entries set revision=${base + 60},event_count=${base + 60} where id=${e.id} and user_id=${owner.id}`;
        await tx`update reading_sessions set revision=61,chapter_number=60 where id=${sid} and user_id=${owner.id}`;
      });
      page = await json(
        await progressHistory(
          request(`/${e.id}/sessions/${sid}/progress`),
          sessionContext(e.id, sid),
        ),
      );
      readingProgressHistoryResponseSchema.parse(page);
      expect(
        page.items.map((p: { chapterNumber: number }) => p.chapterNumber),
      ).toEqual(Array.from({ length: 50 }, (_, i) => 60 - i));
      const progressOlder = await json(
        await progressHistory(
          request(
            `/${e.id}/sessions/${sid}/progress?beforeRevision=${page.nextBeforeRevision}`,
          ),
          sessionContext(e.id, sid),
        ),
      );
      expect(
        progressOlder.items.map(
          (p: { chapterNumber: number }) => p.chapterNumber,
        ),
      ).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(progressOlder.nextBeforeRevision).toBeNull();
      const summaries = await json(
        await history(request(`/${e.id}/history`), context(e.id)),
      );
      readingEntryHistoryResponseSchema.parse(summaries);
      expect(summaries.items).toHaveLength(50);
      expect(
        summaries.items.map((s: { revision: number }) => s.revision),
      ).toEqual(Array.from({ length: 50 }, (_, i) => base + 60 - i));
      expect(Object.keys(summaries.items[0])).toEqual([
        "id",
        "revision",
        "kind",
        "recordedAt",
      ]);
      expect(JSON.stringify(summaries)).not.toContain("D ENTRY SECRET");
      const summariesOlder = await json(
        await history(
          request(
            `/${e.id}/history?beforeRevision=${summaries.nextBeforeRevision}`,
          ),
          context(e.id),
        ),
      );
      expect(summariesOlder.items[0].revision).toBe(
        summaries.nextBeforeRevision - 1,
      );
      for (const p of page.items)
        for (const key of [
          "userId",
          "workId",
          "mutationKey",
          "requestHash",
          "snapshot",
          "notes",
          "ratingHalfStars",
        ])
          expect(p).not.toHaveProperty(key);
    });

    it("redacts actual owner-scoped PostgreSQL failure as503 and rolls back progress/event state", async () => {
      const e = await start(await entry(await work())),
        sid = e.readingSession!.id;
      const name = `reading_http_test_${randomUUID().replaceAll("-", "")}`,
        before = await budget();
      requireTestDatabase();
      expect(
        f.users.some((u) => u.id === owner.id && u.email === owner.email),
      ).toBe(true);
      expect(owner.id).toMatch(/^[a-zA-Z0-9-]+$/);
      expect(e.id).toMatch(/^[a-f0-9-]+$/);
      await sql.unsafe(
        `create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'private synthetic C failure'; end $$`,
      );
      try {
        await sql.unsafe(
          `create trigger ${name} before insert on reading_progress_events for each row when (NEW.entry_id='${e.id}'::uuid and NEW.user_id='${owner.id}') execute function ${name}()`,
        );
        await error(
          await progress(
            request(
              `/${e.id}/progress`,
              "POST",
              command(e, { patch: { chapterNumber: 1 } }),
            ),
            context(e.id),
          ),
          503,
          "SERVICE_UNAVAILABLE",
        );
        expect(await read(e.id)).toEqual(e);
        const [count] =
          await sql`select count(*)::int as n from reading_progress_events where entry_id=${e.id} and user_id=${owner.id}`;
        expect(count.n).toBe(0);
        expect(await budget()).toBe(before + 1);
        expect(
          (
            await json(
              await progressHistory(
                request(`/${e.id}/sessions/${sid}/progress`),
                sessionContext(e.id, sid),
              ),
            )
          ).items,
        ).toEqual([]);
      } finally {
        await sql.unsafe(
          `drop trigger if exists ${name} on reading_progress_events`,
        );
        await sql.unsafe(`drop function if exists ${name}()`);
      }
      expect(
        (await update(e, { chapterNumber: 1 })).readingSession!.chapterNumber,
      ).toBe(1);
    });

    it("shares atomic30 budget across B and C including malformed attempts, noops and replay", async () => {
      const e = await start(await entry(await work()));
      const resume = command(e, { action: "RESUME" });
      // Two initial B/C writes, followed by 28 simultaneous authenticated attempts.
      await Promise.all(
        Array.from({ length: 28 }, async (_, i) => {
          if (i % 4 === 0)
            await error(
              await progress(
                request(`/${e.id}/progress`, "POST", {}),
                context(e.id),
              ),
              400,
              "VALIDATION_ERROR",
            );
          else if (i % 4 === 1)
            expect(
              (
                await json(
                  await action(
                    request(`/${e.id}/sessions`, "POST", resume),
                    context(e.id),
                  ),
                )
              ).revision,
            ).toBe(e.revision);
          else if (i % 4 === 2)
            expect(
              (
                await json(
                  await bPatch(
                    request(`/${e.id}`, "PATCH", {
                      revision: e.revision,
                      mutationKey: randomUUID(),
                      patch: { favorite: false },
                    }),
                    context(e.id),
                  ),
                )
              ).revision,
            ).toBe(e.revision);
          else
            expect(
              (
                await json(
                  await action(
                    request(`/${e.id}/sessions`, "POST", {
                      revision: 1,
                      mutationKey: (
                        await sql`select mutation_key from library_events where entry_id=${e.id} and user_id=${owner.id} and kind='START_READ'`
                      )[0]!.mutation_key,
                      action: "START_READ",
                    }),
                    context(e.id),
                  ),
                )
              ).revision,
            ).toBe(e.revision);
        }),
      );
      expect(await budget()).toBe(30);
      for (const handler of [progress, action])
        await error(
          await handler(
            request(`/${e.id}/progress`, "POST", {}),
            context(e.id),
          ),
          429,
          "RATE_LIMITED",
        );
      await error(
        await bPatch(request(`/${e.id}`, "PATCH", {}), context(e.id)),
        429,
        "RATE_LIMITED",
      );
      expect(await budget()).toBe(33);
      expect((await read(e.id)).revision).toBe(e.revision);
    });
  },
);
