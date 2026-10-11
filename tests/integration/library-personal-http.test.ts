import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  GET as personal,
  PATCH as personalPatch,
} from "../../apps/web/src/app/api/library/[id]/personal/route";
import {
  POST as add,
  GET as bList,
} from "../../apps/web/src/app/api/library/route";
import {
  GET as bDetail,
  PATCH as bPatch,
  DELETE as remove,
} from "../../apps/web/src/app/api/library/[id]/route";
import { GET as reading } from "../../apps/web/src/app/api/library/[id]/reading/route";
import {
  POST as action,
  GET as sessions,
} from "../../apps/web/src/app/api/library/[id]/sessions/route";
import { POST as progress } from "../../apps/web/src/app/api/library/[id]/progress/route";
import { GET as progressHistory } from "../../apps/web/src/app/api/library/[id]/sessions/[sessionId]/progress/route";
import { GET as history } from "../../apps/web/src/app/api/library/[id]/history/route";
import { GET as publicDetail } from "../../apps/web/src/app/api/catalog/works/[slug]/route";
import { GET as publicSearch } from "../../apps/web/src/app/api/catalog/works/route";
import {
  personalHttpDetailsSchema,
  type PersonalHttpDetails,
} from "../../apps/web/src/features/library/personal-http-contracts";

const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const sessionContext = (id: string, sessionId: string) => ({
  params: Promise.resolve({ id, sessionId }),
});
function request(
  path = "",
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
async function work() {
  return (await createWork(
    {
      primaryTitle: `Synthetic D HTTP ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation:
          "Invented UUID-owned V3D HTTP fixture; no production metadata.",
      },
    },
    new Headers({ Cookie: admin.cookie }),
  )) as AdminWork;
}
async function read(id: string) {
  const value = await json(
    await personal(request(`/${id}/personal`), context(id)),
  );
  return personalHttpDetailsSchema.parse(value);
}
async function entry(w: Pick<AdminWork, "id">) {
  const e = await json(
    await add(request("", "POST", { workId: w.id, mutationKey: randomUUID() })),
  );
  return read(e.id);
}
function command(
  e: Pick<PersonalHttpDetails, "revision">,
  patch: object,
  mutationKey: string = randomUUID(),
) {
  return { revision: e.revision, mutationKey, patch };
}
async function change(e: PersonalHttpDetails, patch: object) {
  const value = await json(
    await personalPatch(
      request(`/${e.id}/personal`, "PATCH", command(e, patch)),
      context(e.id),
    ),
  );
  return personalHttpDetailsSchema.parse(value);
}
async function start(e: PersonalHttpDetails) {
  return json(
    await action(
      request(`/${e.id}/sessions`, "POST", {
        revision: e.revision,
        mutationKey: randomUUID(),
        action: "START_READ",
        notes: "C attempt-only note",
      }),
      context(e.id),
    ),
  );
}
async function budget(actor = owner) {
  const [row] =
    await sql`select count from rate_limits where key = ${`catalog.write:${actor.id}`}`;
  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  requireTestDatabase();
  console.info(`V3D HTTP UUID-owned fixture run ${f.runId}`);
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
  "V3D personal ENTRY HTTP: real SMTP, PostgreSQL and verified signed accounts",
  () => {
    it("starts unrated, accepts all9 exact half-star choices and clears only by explicit null", async () => {
      let e = await entry(await work());
      expect(e).toEqual({
        id: e.id,
        workId: e.workId,
        revision: 1,
        ratingHalfStars: null,
        notes: "",
        archived: false,
      });
      for (let ratingHalfStars = 2; ratingHalfStars <= 10; ratingHalfStars++) {
        e = await change(e, { ratingHalfStars });
        expect(e.ratingHalfStars).toBe(ratingHalfStars);
        expect(e.notes).toBe("");
        expect(await read(e.id)).toEqual(e);
      }
      e = await change(e, { notes: "Personal entry note" });
      expect(e.ratingHalfStars).toBe(10);
      e = await change(e, { ratingHalfStars: null });
      expect(e).toMatchObject({
        ratingHalfStars: null,
        notes: "Personal entry note",
      });
      e = await change(e, { notes: "" });
      expect(e).toMatchObject({ ratingHalfStars: null, notes: "" });
      expect(Object.keys(e)).toEqual([
        "id",
        "workId",
        "revision",
        "ratingHalfStars",
        "notes",
        "archived",
      ]);
    });

    it("retains bounded Unicode plain ENTRY notes, trims safely and rejects unsafe controls before trimming", async () => {
      let e = await entry(await work());
      e = await change(e, { notes: "  Tiếng Việt 📚\n\tPlain <text>  " });
      expect(e.notes).toBe("Tiếng Việt 📚\n\tPlain <text>");
      e = await change(e, { notes: "界".repeat(4000) });
      expect(e.notes).toHaveLength(4000);
      for (const notes of [
        "界".repeat(4001),
        "\u0000text",
        "\u000btext",
        "\u001ftext",
        "\u007ftext",
        "\u0085text",
        "\u202etext",
        "\u2066text",
        null,
      ])
        await error(
          await personalPatch(
            request(`/${e.id}/personal`, "PATCH", command(e, { notes })),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
      expect(await read(e.id)).toEqual(e);
      e = await change(e, { notes: "\t\n  " });
      expect(e.notes).toBe("");
    });

    it("rejects rating coercion/bounds and all B/C/identity or unsupported personal input", async () => {
      const e = await entry(await work());
      const before = await budget();
      const invalid = [
        ...[0, 1, 11, 2.5, "8", true, {}, []].map((ratingHalfStars) => ({
          ratingHalfStars,
        })),
        { status: "COMPLETED" },
        { favorite: true },
        { progressNotes: "C" },
        { sessionId: randomUUID() },
        { stars: 4 },
        { rating: 4 },
        { ownerId: owner.id },
        {},
      ];
      for (const patch of invalid)
        await error(
          await personalPatch(
            request(`/${e.id}/personal`, "PATCH", command(e, patch)),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
      for (const extra of [
        { acknowledgeReread: true },
        { userId: owner.id },
        { snapshot: {} },
        { admin: true },
      ])
        await error(
          await personalPatch(
            request(`/${e.id}/personal`, "PATCH", {
              ...command(e, { notes: "D" }),
              ...extra,
            }),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
      expect(await budget()).toBe(before + invalid.length + 4);
      expect(await read(e.id)).toEqual(e);
    });

    it("authenticates first and isolates other-owner/admin/nonexistent access with no forged-header authority", async () => {
      const e = await change(await entry(await work()), {
        ratingHalfStars: 7,
        notes: `Owner-private ${randomUUID()}`,
      });
      for (const handler of [personal, personalPatch]) {
        const method = handler === personal ? "GET" : "PATCH";
        await error(
          await handler(
            request(
              "/bad/personal?locale=xx&owner=x",
              method,
              method === "GET" ? undefined : {},
              null,
              { Origin: "https://evil.invalid", "x-user-id": owner.id },
            ),
            context("bad"),
          ),
          401,
          "AUTHENTICATION_REQUIRED",
        );
      }
      await error(
        await personal(
          request(`/${e.id}/personal`, "GET", undefined, null, {
            Cookie: "better-auth.session_token=forged",
            "x-user-id": owner.id,
            "x-role": "admin",
          }),
          context(e.id),
        ),
        401,
        "AUTHENTICATION_REQUIRED",
      );
      const other = await f.account("user");
      for (const actor of [other, admin]) {
        await error(
          await personal(
            request(`/${e.id}/personal`, "GET", undefined, actor, {
              "x-owner-id": owner.id,
              "x-user-id": owner.id,
              "x-role": "admin",
            }),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
        await error(
          await personalPatch(
            request(
              `/${e.id}/personal`,
              "PATCH",
              command(e, { notes: "forged" }),
              actor,
            ),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
      }
      const missing = randomUUID();
      await error(
        await personal(request(`/${missing}/personal`), context(missing)),
        404,
        "ENTRY_NOT_FOUND",
      );
      await error(
        await personalPatch(
          request(
            `/${missing}/personal`,
            "PATCH",
            command(e, { notes: "missing" }),
          ),
          context(missing),
        ),
        404,
        "ENTRY_NOT_FOUND",
      );
      await error(
        await personal(request("/bad/personal"), context("bad")),
        400,
        "VALIDATION_ERROR",
      );
      expect(await read(e.id)).toEqual(e);
    });

    it("strictly bounds duplicate/unknown locale queries and charges origin/query failures once without consuming rejected bodies", async () => {
      const e = await entry(await work()),
        before = await budget();
      for (const query of [
        "locale=en&locale=vi",
        "locale=xx",
        "owner=x",
        "page=1",
        "ratingHalfStars=8",
        "__proto__=x",
      ]) {
        await error(
          await personal(request(`/${e.id}/personal?${query}`), context(e.id)),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await personalPatch(
            request(
              `/${e.id}/personal?${query}`,
              "PATCH",
              command(e, { notes: "D" }),
            ),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
      }
      for (const Origin of [
        "",
        "null",
        `${f.origin}/`,
        "https://evil.invalid",
      ]) {
        const req = request(`/${e.id}/personal`, "PATCH", {}, owner, {
          Origin,
        });
        await error(
          await personalPatch(req, context(e.id)),
          403,
          "UNTRUSTED_ORIGIN",
        );
        expect(req.bodyUsed).toBe(false);
      }
      const absent = request(`/${e.id}/personal`, "PATCH", {});
      absent.headers.delete("origin");
      await error(
        await personalPatch(absent, context(e.id)),
        403,
        "UNTRUSTED_ORIGIN",
      );
      expect(absent.bodyUsed).toBe(false);
      expect(await budget()).toBe(before + 11);
      expect(
        await json(
          await personal(request(`/${e.id}/personal?locale=vi`), context(e.id)),
        ),
      ).toEqual(e);
      expect(await read(e.id)).toEqual(e);
    });

    it("preserves malformed JSON, fatal UTF8 and the unchanged64KiB body/header bounds", async () => {
      const id = randomUUID();
      const raw = (body: BodyInit, extra: Record<string, string> = {}) =>
        new Request(`${f.origin}/api/library/${id}/personal`, {
          method: "PATCH",
          headers: {
            Cookie: owner.cookie,
            Origin: f.origin,
            "Content-Type": "application/json",
            ...extra,
          },
          body,
        });
      for (const body of [
        "{",
        '{"patch":{"ratingHalfStars":NaN}}',
        " ".repeat(65536),
      ])
        await error(
          await personalPatch(raw(body), context(id)),
          400,
          "INVALID_JSON",
        );
      await error(
        await personalPatch(
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
      await error(
        await personalPatch(
          raw("{}", { "Content-Length": "65537" }),
          context(id),
        ),
        413,
        "BODY_TOO_LARGE",
      );
      await error(
        await personalPatch(raw("{}", { "Content-Length": "-1" }), context(id)),
        413,
        "BODY_TOO_LARGE",
      );
      await error(
        await personalPatch(
          raw(JSON.stringify({ notes: "é".repeat(32768) })),
          context(id),
        ),
        413,
        "BODY_TOO_LARGE",
      );
      await error(
        await personalPatch(
          raw("{}", { "Content-Type": "text/plain" }),
          context(id),
        ),
        415,
        "JSON_REQUIRED",
      );
      await error(
        await personalPatch(raw("null"), context(id)),
        400,
        "VALIDATION_ERROR",
      );
      expect(await budget()).toBe(9);
    });

    it("never changes reading activity/completion or Work/public catalog and keeps B/C envelopes free of D ENTRY fields", async () => {
      const w = await work();
      const started = await start(await entry(w));
      const c = await json(
        await progress(
          request(`/${started.id}/progress`, "POST", {
            revision: started.revision,
            mutationKey: randomUUID(),
            sessionId: started.readingSession.id,
            patch: { chapterNumber: 0, progressNotes: "C progress-only note" },
          }),
          context(started.id),
        ),
      );
      const sid = c.readingSession.id,
        marker = `D ENTRY private ${randomUUID()}`;
      const [beforeWork] = await sql`select * from works where id=${w.id}`;
      const beforeSessions =
        await sql`select * from reading_sessions where entry_id=${c.id} and user_id=${owner.id}`;
      const publicBefore = await json(
        await publicDetail(
          new Request(`${f.origin}/api/catalog/works/${w.slug}`),
          { params: Promise.resolve({ slug: w.slug }) },
        ),
      );
      const e = await change(await read(c.id), {
        ratingHalfStars: 9,
        notes: marker,
      });
      expect(e).toMatchObject({
        revision: c.revision + 1,
        notes: marker,
        ratingHalfStars: 9,
      });
      const after = await json(
        await reading(request(`/${e.id}/reading`), context(e.id)),
      );
      expect(after).toMatchObject({
        status: "READING",
        favorite: false,
        hasCompletedRead: false,
      });
      expect(after.readingSession).toEqual(c.readingSession);
      expect(
        await sql`select * from reading_sessions where entry_id=${e.id} and user_id=${owner.id}`,
      ).toEqual(beforeSessions);
      expect((await sql`select * from works where id=${w.id}`)[0]).toEqual(
        beforeWork,
      );
      expect(
        await json(
          await publicDetail(
            new Request(`${f.origin}/api/catalog/works/${w.slug}`),
            { params: Promise.resolve({ slug: w.slug }) },
          ),
        ),
      ).toEqual(publicBefore);
      const envelopes = [
        await json(await bDetail(request(`/${e.id}`), context(e.id))),
        await json(await bList(request())),
        after,
        await json(await sessions(request(`/${e.id}/sessions`), context(e.id))),
        await json(
          await progressHistory(
            request(`/${e.id}/sessions/${sid}/progress`),
            sessionContext(e.id, sid),
          ),
        ),
        await json(await history(request(`/${e.id}/history`), context(e.id))),
        await json(
          await publicSearch(new Request(`${f.origin}/api/catalog/works`)),
        ),
      ];
      for (const value of envelopes) {
        expect(value).not.toHaveProperty("ratingHalfStars");
        expect(value).not.toHaveProperty("notes");
        expect(JSON.stringify(value)).not.toContain(marker);
      }
      expect(after.readingSession.notes).toBe("C attempt-only note");
      expect(after.readingSession.progressNotes).toBe("C progress-only note");
    });

    it("preserves private values through B archive/restore and permits own unavailable Work without metadata disclosure", async () => {
      const w = await work();
      let e = await change(await entry(w), {
        ratingHalfStars: 6,
        notes: "Retained private entry",
      });
      const archived = await json(
        await remove(
          request(`/${e.id}`, "DELETE", {
            revision: e.revision,
            mutationKey: randomUUID(),
            confirmRemoval: true,
          }),
          context(e.id),
        ),
      );
      await error(
        await personal(request(`/${e.id}/personal`), context(e.id)),
        404,
        "ENTRY_NOT_FOUND",
      );
      await error(
        await personalPatch(
          request(
            `/${e.id}/personal`,
            "PATCH",
            command(e, { notes: "not allowed" }),
          ),
          context(e.id),
        ),
        404,
        "ENTRY_NOT_FOUND",
      );
      await json(
        await add(
          request("", "POST", {
            workId: w.id,
            revision: archived.revision,
            mutationKey: randomUUID(),
          }),
        ),
      );
      e = await read(e.id);
      expect(e).toMatchObject({
        ratingHalfStars: 6,
        notes: "Retained private entry",
        archived: false,
        revision: archived.revision + 1,
      });
      await setVisibility(
        w.id,
        { visibility: "HIDDEN", revision: w.revision },
        new Headers({ Cookie: admin.cookie }),
      );
      e = await change(e, { notes: "Own unavailable Work entry" });
      expect(await read(e.id)).toEqual(e);
      expect(e).not.toHaveProperty("work");
      expect(JSON.stringify(e)).not.toContain(w.primaryTitle);
      const c = await json(
        await reading(request(`/${e.id}/reading`), context(e.id)),
      );
      expect(c.work).toEqual({ available: false, id: w.id });
      expect(c).not.toHaveProperty("notes");
      expect(c).not.toHaveProperty("ratingHalfStars");
      expect(c).toMatchObject({
        status: "WANT_TO_READ",
        hasCompletedRead: false,
        currentSession: null,
      });
    });

    it("replays exact normalized commands into current state, rejects global key conflicts and does not reserve genuine noop keys", async () => {
      let e = await entry(await work());
      const key = randomUUID(),
        initial = command(
          e,
          { notes: "  D original  ", ratingHalfStars: 5 },
          key.toUpperCase(),
        );
      e = personalHttpDetailsSchema.parse(
        await json(
          await personalPatch(
            request(`/${e.id}/personal`, "PATCH", initial),
            context(e.id),
          ),
        ),
      );
      e = await change(e, { notes: "D newer" });
      expect(
        await json(
          await personalPatch(
            request(`/${e.id}/personal`, "PATCH", initial),
            context(e.id),
          ),
        ),
      ).toEqual(e);
      await error(
        await personalPatch(
          request(`/${e.id}/personal`, "PATCH", {
            ...initial,
            patch: { notes: "D conflict", ratingHalfStars: 5 },
          }),
          context(e.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      await error(
        await bPatch(
          request(`/${e.id}`, "PATCH", {
            revision: e.revision,
            mutationKey: key,
            patch: { favorite: true },
          }),
          context(e.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      const other = await entry(await work());
      await error(
        await personalPatch(
          request(
            `/${other.id}/personal`,
            "PATCH",
            command(other, { notes: "other" }, key),
          ),
          context(other.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      const noopKey = randomUUID(),
        before = await budget();
      expect(
        await json(
          await personalPatch(
            request(
              `/${e.id}/personal`,
              "PATCH",
              command(e, { ratingHalfStars: e.ratingHalfStars }, noopKey),
            ),
            context(e.id),
          ),
        ),
      ).toEqual(e);
      expect(await budget()).toBe(before + 1);
      const [noEvent] =
        await sql`select count(*)::int as n from library_events where user_id=${owner.id} and mutation_key=${noopKey}`;
      expect(noEvent.n).toBe(0);
      const changed = await json(
        await personalPatch(
          request(
            `/${e.id}/personal`,
            "PATCH",
            command(e, { notes: "Noop key can bind actual change" }, noopKey),
          ),
          context(e.id),
        ),
      );
      expect(changed.revision).toBe(e.revision + 1);
      await error(
        await personalPatch(
          request(`/${e.id}/personal`, "PATCH", command(e, { notes: "stale" })),
          context(e.id),
        ),
        409,
        "STALE_REVISION",
      );
    });

    it("serializes D/B/C races on the same entry fence without double revision or reading facts", async () => {
      const e = await start(await entry(await work()));
      const results = await Promise.all([
        personalPatch(
          request(`/${e.id}/personal`, "PATCH", {
            revision: e.revision,
            mutationKey: randomUUID(),
            patch: { ratingHalfStars: 8 },
          }),
          context(e.id),
        ),
        bPatch(
          request(`/${e.id}`, "PATCH", {
            revision: e.revision,
            mutationKey: randomUUID(),
            patch: { favorite: true },
          }),
          context(e.id),
        ),
        progress(
          request(`/${e.id}/progress`, "POST", {
            revision: e.revision,
            mutationKey: randomUUID(),
            sessionId: e.readingSession.id,
            patch: { chapterNumber: 1 },
          }),
          context(e.id),
        ),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      for (const result of results)
        if (result.status === 409) await error(result, 409, "STALE_REVISION");
      const actual = await json(
        await reading(request(`/${e.id}/reading`), context(e.id)),
      );
      expect(actual.revision).toBe(e.revision + 1);
      expect(actual).toMatchObject({
        status: "READING",
        hasCompletedRead: false,
        readingSession: { id: e.readingSession.id, state: "ACTIVE" },
      });
      const [count] =
        await sql`select count(*)::int as n from library_events where entry_id=${e.id} and user_id=${owner.id}`;
      expect(count.n).toBe(e.revision + 1);
      const d = await read(e.id);
      expect(
        [
          d.ratingHalfStars === 8,
          actual.favorite === true,
          actual.readingSession.chapterNumber === 1,
        ].filter(Boolean),
      ).toHaveLength(1);
    });

    it("redacts actual scoped database failure as503 and atomically rolls back ENTRY/event state", async () => {
      const e = await entry(await work()),
        other = await entry(await work());
      const facts = async () => ({
        entries: [
          ...(await sql`select * from library_entries where id=${e.id} and user_id=${owner.id}`),
        ],
        events: [
          ...(await sql`select * from library_events where entry_id=${e.id} and user_id=${owner.id} order by entry_revision`),
        ],
        sessions: [
          ...(await sql`select * from reading_sessions where entry_id=${e.id} and user_id=${owner.id}`),
        ],
        progress: [
          ...(await sql`select * from reading_progress_events where entry_id=${e.id} and user_id=${owner.id}`),
        ],
      });
      const before = await facts(),
        beforeBudget = await budget();
      const name = `personal_http_test_${randomUUID().replaceAll("-", "")}`;
      requireTestDatabase();
      expect(
        f.users.some((u) => u.id === owner.id && u.email === owner.email),
      ).toBe(true);
      expect(owner.id).toMatch(/^[a-zA-Z0-9-]+$/);
      expect(e.id).toMatch(/^[a-f0-9-]+$/);
      await sql.unsafe(
        `create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'private synthetic D failure'; end $$`,
      );
      try {
        await sql.unsafe(
          `create trigger ${name} before insert on library_events for each row when (NEW.entry_id='${e.id}'::uuid and NEW.user_id='${owner.id}' and NEW.kind='UPDATE') execute function ${name}()`,
        );
        await error(
          await personalPatch(
            request(
              `/${e.id}/personal`,
              "PATCH",
              command(e, { notes: "Private rollback", ratingHalfStars: 10 }),
            ),
            context(e.id),
          ),
          503,
          "SERVICE_UNAVAILABLE",
        );
        expect(await facts()).toEqual(before);
        expect(await budget()).toBe(beforeBudget + 1);
        expect(await change(other, { ratingHalfStars: 2 })).toMatchObject({
          ratingHalfStars: 2,
          revision: 2,
        });
      } finally {
        await sql.unsafe(`drop trigger if exists ${name} on library_events`);
        await sql.unsafe(`drop function if exists ${name}()`);
      }
      expect(
        await change(e, { notes: "Actual retry", ratingHalfStars: 10 }),
      ).toMatchObject({
        notes: "Actual retry",
        ratingHalfStars: 10,
        revision: 2,
      });
    });

    it("shares atomic30 budget with B/C including malformed D, Dnoop and exact Creplay without weakening quota", async () => {
      const initial = await entry(await work());
      const key = randomUUID(),
        startCommand = {
          revision: initial.revision,
          mutationKey: key,
          action: "START_READ",
        };
      const c = await json(
        await action(
          request(`/${initial.id}/sessions`, "POST", startCommand),
          context(initial.id),
        ),
      );
      const e = await read(initial.id);
      await Promise.all(
        Array.from({ length: 28 }, async (_, i) => {
          if (i % 4 === 0)
            await error(
              await personalPatch(
                request(`/${e.id}/personal`, "PATCH", {}),
                context(e.id),
              ),
              400,
              "VALIDATION_ERROR",
            );
          else if (i % 4 === 1)
            expect(
              await json(
                await personalPatch(
                  request(
                    `/${e.id}/personal`,
                    "PATCH",
                    command(e, { ratingHalfStars: null }),
                  ),
                  context(e.id),
                ),
              ),
            ).toEqual(e);
          else if (i % 4 === 2)
            expect(
              (
                await json(
                  await action(
                    request(`/${e.id}/sessions`, "POST", startCommand),
                    context(e.id),
                  ),
                )
              ).revision,
            ).toBe(e.revision);
          else
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
        }),
      );
      expect(await budget()).toBe(30);
      await error(
        await personalPatch(
          request(
            `/${e.id}/personal`,
            "PATCH",
            command(e, { ratingHalfStars: 8 }),
          ),
          context(e.id),
        ),
        429,
        "RATE_LIMITED",
      );
      await error(
        await progress(
          request(`/${e.id}/progress`, "POST", {
            revision: e.revision,
            mutationKey: randomUUID(),
            sessionId: c.readingSession.id,
            patch: { chapterNumber: 1 },
          }),
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
      expect(await read(e.id)).toEqual(e);
      const [events] =
        await sql`select count(*)::int as n from library_events where entry_id=${e.id} and user_id=${owner.id}`;
      expect(events.n).toBe(2);
    });
  },
);
