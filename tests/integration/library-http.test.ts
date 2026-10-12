import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { getAuth } from "../../apps/web/src/server/auth";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  GET as list,
  POST as add,
} from "../../apps/web/src/app/api/library/route";
import {
  GET as detail,
  PATCH as patch,
  DELETE as remove,
} from "../../apps/web/src/app/api/library/[id]/route";
import { GET as ownState } from "../../apps/web/src/app/api/library/work/[workId]/route";

const f = catalogAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, owner: Actor;
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const workContext = (workId: string) => ({
  params: Promise.resolve({ workId }),
});
function request(
  path = "",
  method = "GET",
  body?: unknown,
  actor: Actor | null = owner,
  headers: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/library${path}`, {
    method,
    headers: {
      ...(actor ? { Cookie: actor.cookie } : {}),
      ...(method === "GET"
        ? {}
        : { Origin: f.origin, "Content-Type": "application/json" }),
      ...headers,
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
      primaryTitle: `Synthetic HTTP ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation:
          "Invented UUID-owned V3B HTTP fixture; no production metadata.",
      },
    },
    new Headers({ Cookie: admin.cookie }),
  )) as AdminWork;
}
async function entry(w: Pick<AdminWork, "id">, actor = owner) {
  return json(
    await add(
      request("", "POST", { workId: w.id, mutationKey: randomUUID() }, actor),
    ),
  );
}
async function change(
  e: { id: string; revision: number },
  value: object,
  extra: object = {},
) {
  return patch(
    request(`/${e.id}`, "PATCH", {
      revision: e.revision,
      mutationKey: randomUUID(),
      patch: value,
      ...extra,
    }),
    context(e.id),
  );
}
async function budget(actor = owner) {
  const [row] =
    await sql`select count from rate_limits where key = ${`catalog.write:${actor.id}`}`;
  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  requireTestDatabase();
  console.info(`V3B HTTP UUID-owned fixture run ${f.runId}`);
  await f.start();
  admin = await f.account("admin");
});
beforeEach(async () => {
  owner = await f.account("user");
});
afterAll(async () => {
  requireTestDatabase();
  const users = f.users.map((u) => u.id);
  if (users.length) {
    const entries =
      await sql`select id from library_entries where user_id = any(${users}::text[])`;
    for (let start = 0; start < entries.length; start += 100) {
      const ids = entries.slice(start, start + 100).map((r) => String(r.id));
      await sql`delete from library_entries where id = any(${ids}::uuid[]) and user_id = any(${users}::text[])`;
    }
  }
  const rows =
    await sql`select w.id from works w join catalog_sources s on s.id = w.source_id where s.label = ${f.sourceLabel}`;
  const ids = rows.map((r) => String(r.id));
  if (ids.length) {
    await sql`delete from catalog_field_evidence where work_id = any(${ids}::uuid[])`;
    await sql`delete from catalog_audit_events where work_id = any(${ids}::uuid[])`;
    await sql`delete from work_titles where work_id = any(${ids}::uuid[])`;
    for (let start = 0; start < ids.length; start += 100) {
      await sql`delete from works where id = any(${ids.slice(start, start + 100)}::uuid[])`;
    }
  }
  await sql`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});

describe.sequential(
  "V3B HTTP facade: real verified signed sessions and PostgreSQL",
  () => {
    it("creates, retrieves and changes status/favorite without exposing later-stage fields", async () => {
      const w = await work();
      const e = await entry(w);
      expect(e).toMatchObject({
        workId: w.id,
        status: "WANT_TO_READ",
        favorite: false,
        revision: 1,
        archived: false,
        hasCompletedRead: false,
      });
      expect(e.work).toMatchObject({ id: w.id, available: true });
      for (const key of [
        "userId",
        "owner",
        "notes",
        "ratingHalfStars",
        "snapshot",
        "progress",
      ])
        expect(e).not.toHaveProperty(key);
      expect(
        await json(await detail(request(`/${e.id}?locale=vi`), context(e.id))),
      ).toMatchObject({ id: e.id, revision: 1 });
      expect(
        await json(await ownState(request(`/work/${w.id}`), workContext(w.id))),
      ).toEqual({
        id: e.id,
        revision: 1,
        status: "WANT_TO_READ",
        favorite: false,
        archived: false,
      });
      const updated = await json(
        await change(e, { status: "READING", favorite: true }),
      );
      expect(updated).toMatchObject({
        revision: 2,
        status: "READING",
        favorite: true,
      });
      expect(updated.currentSession).toEqual({
        id: expect.any(String),
        state: "ACTIVE",
        kind: "FIRST_READ",
      });
      const completed = await json(
        await change(updated, { status: "COMPLETED" }),
      );
      expect(completed).toMatchObject({ revision: 3, hasCompletedRead: true });
      await error(
        await change(completed, { status: "READING" }),
        409,
        "REREAD_ACKNOWLEDGMENT_REQUIRED",
      );
      const reread = await json(
        await change(
          completed,
          { status: "READING" },
          { acknowledgeReread: true },
        ),
      );
      expect(reread).toMatchObject({ revision: 4, hasCompletedRead: true });
      const page = await json(await list(request()));
      expect(page).toMatchObject({ pageSize: 50, total: 1 });
      expect(page.items[0]).not.toHaveProperty("currentSession");
      expect(page.items[0]).not.toHaveProperty("notes");
      expect(page.items[0]).not.toHaveProperty("ratingHalfStars");
    });

    it("archives only on explicit confirmation and restores only from exact archived own revision", async () => {
      const w = await work();
      const e = await json(await change(await entry(w), { status: "READING" }));
      const command = { revision: e.revision, mutationKey: randomUUID() };
      await error(
        await remove(request(`/${e.id}`, "DELETE", command), context(e.id)),
        400,
        "VALIDATION_ERROR",
      );
      await error(
        await remove(
          request(`/${e.id}`, "DELETE", { ...command, confirmRemoval: false }),
          context(e.id),
        ),
        400,
        "VALIDATION_ERROR",
      );
      const archived = await json(
        await remove(
          request(`/${e.id}`, "DELETE", { ...command, confirmRemoval: true }),
          context(e.id),
        ),
      );
      expect(archived).toMatchObject({ archived: true, revision: 3 });
      await error(
        await detail(request(`/${e.id}`), context(e.id)),
        404,
        "ENTRY_NOT_FOUND",
      );
      expect((await json(await list(request()))).items).toEqual([]);
      const state = await json(
        await ownState(request(`/work/${w.id}`), workContext(w.id)),
      );
      expect(state).toMatchObject({ id: e.id, archived: true, revision: 3 });
      const [active] =
        await sql`select count(*)::int as n from reading_sessions where entry_id = ${e.id} and user_id = ${owner.id} and state in ('ACTIVE', 'PAUSED')`;
      expect(active.n).toBe(0);
      await error(
        await add(
          request("", "POST", { workId: w.id, mutationKey: randomUUID() }),
        ),
        409,
        "RESTORE_REVISION_REQUIRED",
      );
      await error(
        await add(
          request("", "POST", {
            workId: w.id,
            mutationKey: randomUUID(),
            revision: 2,
          }),
        ),
        409,
        "STALE_REVISION",
      );
      const restored = await json(
        await add(
          request("", "POST", {
            workId: w.id,
            mutationKey: randomUUID(),
            revision: state.revision,
          }),
        ),
      );
      expect(restored).toMatchObject({
        id: e.id,
        archived: false,
        revision: 4,
        status: "WANT_TO_READ",
      });
    });

    it("isolates owners including admins and ignores forged identity headers", async () => {
      const w = await work();
      const e = await entry(w);
      const other = await f.account("user");
      for (const actor of [other, admin]) {
        await error(
          await detail(
            request(`/${e.id}`, "GET", undefined, actor),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
        await error(
          await patch(
            request(
              `/${e.id}`,
              "PATCH",
              {
                revision: 1,
                mutationKey: randomUUID(),
                patch: { favorite: true },
              },
              actor,
            ),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
        await error(
          await remove(
            request(
              `/${e.id}`,
              "DELETE",
              { revision: 1, mutationKey: randomUUID(), confirmRemoval: true },
              actor,
            ),
            context(e.id),
          ),
          404,
          "ENTRY_NOT_FOUND",
        );
        expect(
          await json(
            await ownState(
              request(`/work/${w.id}`, "GET", undefined, actor),
              workContext(w.id),
            ),
          ),
        ).toBeNull();
        expect(
          (await json(await list(request("", "GET", undefined, actor)))).total,
        ).toBe(0);
      }
      const headers = {
        "x-user-id": owner.id,
        "x-owner-id": owner.id,
        "x-role": "admin",
      };
      expect(
        (await json(await list(request("", "GET", undefined, other, headers))))
          .total,
      ).toBe(0);
      await error(
        await add(
          request(
            "",
            "POST",
            { workId: w.id, mutationKey: randomUUID(), userId: owner.id },
            other,
          ),
        ),
        400,
        "VALIDATION_ERROR",
      );
      const own = await entry(w, other);
      expect(own.id).not.toBe(e.id);
      expect(
        await json(
          await ownState(
            request(`/work/${w.id}`, "GET", undefined, other),
            workContext(w.id),
          ),
        ),
      ).toMatchObject({ id: own.id });
    });

    it("authenticates before origin, body, query and params validation and rejects forged cookies", async () => {
      const id = "not-a-uuid";
      const calls = [
        () => list(request("?unknown=x&page=bad", "GET", undefined, null)),
        () =>
          add(
            request("", "POST", { invalid: true }, null, {
              Origin: "https://evil.invalid",
            }),
          ),
        () =>
          detail(
            request(`/${id}?locale=xx`, "GET", undefined, null),
            context(id),
          ),
        () =>
          patch(
            request(`/${id}`, "PATCH", {}, null, { Origin: "" }),
            context(id),
          ),
        () => remove(request(`/${id}`, "DELETE", {}, null), context(id)),
        () =>
          ownState(
            request(`/work/${id}?unknown=x`, "GET", undefined, null),
            workContext(id),
          ),
      ];
      for (const call of calls)
        await error(await call(), 401, "AUTHENTICATION_REQUIRED");
      await error(
        await list(
          request("", "GET", undefined, null, {
            Cookie: "better-auth.session_token=forged",
            "x-user-id": owner.id,
          }),
        ),
        401,
        "AUTHENTICATION_REQUIRED",
      );
      expect(
        (
          await getAuth().api.getSession({
            headers: new Headers({ Cookie: owner.cookie }),
          })
        )?.user.id,
      ).toBe(owner.id);
      expect(await budget()).toBe(0);
      await sql`delete from sessions where user_id = ${owner.id}`;
      await error(await list(request()), 401, "AUTHENTICATION_REQUIRED");
    });

    it("charges untrusted-origin mutations once without consuming their bodies", async () => {
      const w = await work();
      const e = await entry(w);
      const before = await budget();
      for (const Origin of [
        "",
        "https://evil.invalid",
        `${f.origin}/`,
        "null",
      ]) {
        await error(
          await add(request("", "POST", {}, owner, { Origin })),
          403,
          "UNTRUSTED_ORIGIN",
        );
        await error(
          await patch(
            request(`/${e.id}`, "PATCH", {}, owner, { Origin }),
            context(e.id),
          ),
          403,
          "UNTRUSTED_ORIGIN",
        );
        await error(
          await remove(
            request(`/${e.id}`, "DELETE", {}, owner, { Origin }),
            context(e.id),
          ),
          403,
          "UNTRUSTED_ORIGIN",
        );
      }
      expect(await budget()).toBe(before + 12);
      const noOrigin = request("", "POST", {});
      noOrigin.headers.delete("origin");
      await error(await add(noOrigin), 403, "UNTRUSTED_ORIGIN");
      expect(await budget()).toBe(before + 13);
    });

    it("charges exactly once for malformed bodies, strict B facade validation and invalid IDs", async () => {
      const w = await work();
      const e = await entry(w);
      const before = await budget();
      for (const value of [
        { notes: "not yet" },
        { ratingHalfStars: 8 },
        { progress: 1 },
        {},
        { favorite: "true" },
      ]) {
        await error(await change(e, value), 400, "VALIDATION_ERROR");
      }
      await error(
        await change(e, { favorite: true }, { acknowledgeReread: false }),
        400,
        "VALIDATION_ERROR",
      );
      await error(
        await change(e, { favorite: true }, { owner: owner.id }),
        400,
        "VALIDATION_ERROR",
      );
      await error(
        await patch(
          request("/bad", "PATCH", {
            revision: 1,
            mutationKey: randomUUID(),
            patch: { favorite: true },
          }),
          context("bad"),
        ),
        400,
        "VALIDATION_ERROR",
      );
      const invalidJson = new Request(`${f.origin}/api/library`, {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: f.origin,
          "Content-Type": "application/json",
        },
        body: "{",
      });
      await error(await add(invalidJson), 400, "INVALID_JSON");
      await error(
        await add(
          request("", "POST", {}, owner, { "Content-Type": "text/plain" }),
        ),
        415,
        "JSON_REQUIRED",
      );
      expect(await budget()).toBe(before + 10);
      expect(
        (await json(await detail(request(`/${e.id}`), context(e.id)))).revision,
      ).toBe(1);
    });

    it("enforces the UTF-8 64KiB stream/header bound and fatal UTF-8 decode", async () => {
      const headers = {
        Cookie: owner.cookie,
        Origin: f.origin,
        "Content-Type": "application/json",
      };
      const raw = (body: BodyInit, extra: Record<string, string> = {}) =>
        new Request(`${f.origin}/api/library`, {
          method: "POST",
          headers: { ...headers, ...extra },
          body,
        });
      await error(
        await add(raw("{}", { "Content-Length": "65537" })),
        413,
        "BODY_TOO_LARGE",
      );
      await error(
        await add(raw("{}", { "Content-Length": "-1" })),
        413,
        "BODY_TOO_LARGE",
      );
      await error(
        await add(raw(JSON.stringify({ value: "é".repeat(32768) }))),
        413,
        "BODY_TOO_LARGE",
      );
      await error(await add(raw(" ".repeat(65536))), 400, "INVALID_JSON");
      await error(
        await add(
          raw(
            new Uint8Array([
              0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
            ]),
          ),
        ),
        400,
        "INVALID_JSON",
      );
      await error(
        await add(
          new Request(`${f.origin}/api/library`, { method: "POST", headers }),
        ),
        400,
        "INVALID_JSON",
      );
      expect(await budget()).toBe(6);
    });

    it("preserves exact replay, global mutation-key conflicts, stale revision and no-op semantics", async () => {
      const w = await work(),
        w2 = await work();
      const key = randomUUID();
      const command = { workId: w.id, mutationKey: key };
      const e = await json(await add(request("", "POST", command)));
      expect(await json(await add(request("", "POST", command)))).toMatchObject(
        { id: e.id, revision: 1 },
      );
      expect(await entry(w)).toMatchObject({ id: e.id, revision: 1 });
      await error(
        await add(request("", "POST", { workId: w2.id, mutationKey: key })),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      await error(
        await patch(
          request(`/${e.id}`, "PATCH", {
            revision: 1,
            mutationKey: key,
            patch: { favorite: true },
          }),
          context(e.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      const changeKey = randomUUID();
      const changeCommand = {
        revision: 1,
        mutationKey: changeKey,
        patch: { favorite: true },
      };
      expect(
        await json(
          await patch(
            request(`/${e.id}`, "PATCH", changeCommand),
            context(e.id),
          ),
        ),
      ).toMatchObject({ revision: 2 });
      expect(
        await json(
          await patch(
            request(`/${e.id}`, "PATCH", changeCommand),
            context(e.id),
          ),
        ),
      ).toMatchObject({ revision: 2 });
      await error(
        await patch(
          request(`/${e.id}`, "PATCH", {
            ...changeCommand,
            patch: { favorite: false },
          }),
          context(e.id),
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      await error(await change(e, { favorite: false }), 409, "STALE_REVISION");
      const before = await budget();
      expect(
        await json(await change({ ...e, revision: 2 }, { favorite: true })),
      ).toMatchObject({ revision: 2 });
      expect(await budget()).toBe(before + 1);
      const [counts] =
        await sql`select count(*)::int as n from library_events where entry_id = ${e.id} and user_id = ${owner.id}`;
      expect(counts.n).toBe(2);
    });

    it("never exposes hidden catalog metadata in detail/list or archived work state", async () => {
      const w = await work();
      const e = await entry(w);
      await setVisibility(
        w.id,
        {
          visibility: "HIDDEN",
          revision: w.revision,
        },
        new Headers({ Cookie: admin.cookie }),
      );
      const hidden = await json(
        await detail(request(`/${e.id}`), context(e.id)),
      );
      expect(hidden.work).toEqual({ available: false, id: w.id });
      expect(JSON.stringify(hidden)).not.toContain(w.primaryTitle);
      const page = await json(await list(request()));
      expect(page.items[0].work).toEqual({ available: false, id: w.id });
      const other = await f.account("user");
      await error(
        await add(
          request(
            "",
            "POST",
            { workId: w.id, mutationKey: randomUUID() },
            other,
          ),
        ),
        404,
        "WORK_UNAVAILABLE",
      );
      await json(
        await remove(
          request(`/${e.id}`, "DELETE", {
            revision: 1,
            mutationKey: randomUUID(),
            confirmRemoval: true,
          }),
          context(e.id),
        ),
      );
      const state = await json(
        await ownState(request(`/work/${w.id}`), workContext(w.id)),
      );
      expect(state).toMatchObject({ archived: true });
      expect(state).not.toHaveProperty("work");
      await error(
        await add(
          request("", "POST", {
            workId: w.id,
            mutationKey: randomUUID(),
            revision: state.revision,
          }),
        ),
        404,
        "WORK_UNAVAILABLE",
      );
      expect(
        await json(
          await ownState(
            request(`/work/${randomUUID()}`),
            workContext(randomUUID()),
          ),
        ),
      ).toBeNull();
    });

    it("rejects duplicate/unknown query keys and malformed bounds without charging reads", async () => {
      const invalid = [
        "page=1&page=2",
        "locale=en&locale=vi",
        "favorite=true&favorite=false",
        "status=WANT_TO_READ&status=READING",
        "sort=ADDED_DESC&sort=TITLE_ASC",
        "owner=x",
        "pageSize=1",
        "page=0",
        "page=401",
        "page=01",
        "page=1.5",
        "page=",
        "locale=xx",
        "favorite=1",
        "favorite=TRUE",
        "status=bad",
        "sort=bad",
        "__proto__=x",
      ];
      for (const query of invalid)
        await error(await list(request(`?${query}`)), 400, "VALIDATION_ERROR");
      const id = randomUUID();
      for (const query of [
        "locale=en&locale=en",
        "locale=xx",
        "owner=x",
        "page=1",
      ])
        await error(
          await detail(request(`/${id}?${query}`), context(id)),
          400,
          "VALIDATION_ERROR",
        );
      await error(
        await ownState(request(`/work/${id}?owner=x`), workContext(id)),
        400,
        "VALIDATION_ERROR",
      );
      expect(await budget()).toBe(0);
      const w = await work();
      const e = await json(
        await add(
          request("?locale=vi", "POST", {
            workId: w.id,
            mutationKey: randomUUID(),
          }),
        ),
      );
      const updated = await json(
        await patch(
          request(`/${e.id}?locale=vi`, "PATCH", {
            revision: 1,
            mutationKey: randomUUID(),
            patch: { favorite: true },
          }),
          context(e.id),
        ),
      );
      await json(
        await remove(
          request(`/${e.id}?locale=vi`, "DELETE", {
            revision: updated.revision,
            mutationKey: randomUUID(),
            confirmRemoval: true,
          }),
          context(e.id),
        ),
      );
      for (const query of ["locale=en&locale=vi", "locale=xx", "owner=x"]) {
        await error(
          await add(request(`?${query}`, "POST", {})),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await patch(request(`/${e.id}?${query}`, "PATCH", {}), context(e.id)),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await remove(
            request(`/${e.id}?${query}`, "DELETE", {}),
            context(e.id),
          ),
          400,
          "VALIDATION_ERROR",
        );
      }
      expect(await budget()).toBe(12);
    });

    it("filters explicit false/true and status, orders and fixes pagination at 50", async () => {
      const w = await work();
      const favorite = await json(
        await change(await entry(w), { favorite: true, status: "READING" }),
      );
      // Guarded synthetic SQL bulk setup avoids manufacturing 51 HTTP mutations beyond 30/minute.
      // Every Work belongs to this sourceLabel; every entry/event belongs to this actual verified owner.
      requireTestDatabase();
      const [source] =
        await sql`select source_id from works where id = ${w.id}`;
      const works = await sql`
      insert into works (id, slug, primary_title, primary_title_language, format, visibility, source_id, search_text)
      select identity, 'library-http-' || identity::text, 'Synthetic HTTP bulk ' || identity::text, 'en', 'NOVEL', 'DRAFT', ${source.source_id}, 'synthetic'
      from (select gen_random_uuid() as identity from generate_series(1, 51)) identities returning id`;
      const ids = works.map((r) => String(r.id));
      await sql.begin(async (tx) => {
        await tx`insert into library_entries (user_id, work_id) select ${owner.id}, id from works where id = any(${ids}::uuid[])`;
        await tx`insert into library_events (entry_id, user_id, work_id, entry_revision, mutation_key, request_hash, kind, snapshot)
          select id, user_id, work_id, 1, gen_random_uuid(), repeat('a', 64), 'ADD', '{}'::jsonb
          from library_entries where user_id = ${owner.id} and work_id = any(${ids}::uuid[])`;
      });
      const first = await json(
        await list(request("?sort=TITLE_ASC&locale=vi&page=1")),
      );
      const second = await json(
        await list(request("?sort=TITLE_ASC&locale=vi&page=2")),
      );
      expect(first).toMatchObject({
        total: 52,
        page: 1,
        pageSize: 50,
        hasNext: true,
      });
      expect(first.items).toHaveLength(50);
      expect(second).toMatchObject({
        total: 52,
        page: 2,
        pageSize: 50,
        hasNext: false,
      });
      expect(second.items).toHaveLength(2);
      expect(
        new Set([...first.items, ...second.items].map((e) => e.id)).size,
      ).toBe(52);
      expect(
        (
          await json(await list(request("?favorite=true&status=READING")))
        ).items.map((e: { id: string }) => e.id),
      ).toEqual([favorite.id]);
      expect(
        (await json(await list(request("?favorite=false&status=WANT_TO_READ"))))
          .total,
      ).toBe(51);
      expect(
        (await json(await list(request("?favorite=false&status=READING"))))
          .total,
      ).toBe(0);
      for (const sort of ["ADDED_DESC", "UPDATED_DESC", "RATING_DESC"])
        expect(
          (await json(await list(request(`?sort=${sort}`)))).items,
        ).toHaveLength(50);
      expect((await json(await list(request("?page=400")))).items).toEqual([]);
    });

    it("redacts real owner-scoped database failure as no-store 503 and rolls back atomically", async () => {
      const w = await work(),
        otherWork = await work();
      const e = await entry(w),
        other = await entry(otherWork);
      const facts = async () => ({
        entries: [
          ...(await sql`select * from library_entries where user_id = ${owner.id} and id = any(${[e.id, other.id]}::uuid[]) order by id`),
        ],
        sessions: [
          ...(await sql`select * from reading_sessions where user_id = ${owner.id} and entry_id = any(${[e.id, other.id]}::uuid[]) order by id`),
        ],
        events: [
          ...(await sql`select * from library_events where user_id = ${owner.id} and entry_id = any(${[e.id, other.id]}::uuid[]) order by id`),
        ],
        progress: [
          ...(await sql`select * from reading_progress_events where user_id = ${owner.id} and entry_id = any(${[e.id, other.id]}::uuid[]) order by id`),
        ],
      });
      const before = await facts(),
        beforeBudget = await budget();
      const name = `library_http_test_${randomUUID().replaceAll("-", "")}`;
      requireTestDatabase();
      expect(
        f.users.some((u) => u.id === owner.id && u.email === owner.email),
      ).toBe(true);
      expect(owner.id).toMatch(/^[a-zA-Z0-9-]+$/);
      expect(e.id).toMatch(/^[a-f0-9-]+$/);
      await sql.unsafe(
        `create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'private synthetic HTTP failure details'; end $$`,
      );
      try {
        await sql.unsafe(
          `create trigger ${name} before insert on library_events for each row when (NEW.entry_id = '${e.id}'::uuid and NEW.user_id = '${owner.id}' and NEW.kind = 'UPDATE') execute function ${name}()`,
        );
        await error(
          await change(e, { status: "READING", favorite: true }),
          503,
          "SERVICE_UNAVAILABLE",
        );
        expect(await facts()).toEqual(before);
        expect(await budget()).toBe(beforeBudget + 1);
        // The trigger affects only the target owner/entry; another owned entry can mutate normally.
        expect(
          await json(await change(other, { favorite: true })),
        ).toMatchObject({ revision: 2 });
      } finally {
        await sql.unsafe(`drop trigger if exists ${name} on library_events`);
        await sql.unsafe(`drop function if exists ${name}()`);
      }
      expect(
        await json(await change(e, { status: "READING", favorite: true })),
      ).toMatchObject({
        revision: 2,
        currentSession: { state: "ACTIVE", kind: "FIRST_READ" },
      });
    });

    it("shares the atomic 30/minute budget across POST/PATCH/DELETE including invalid attempts and noops", async () => {
      const w = await work();
      const e = await entry(w);
      await Promise.all(
        Array.from({ length: 29 }, async (_, i) => {
          if (i % 3 === 0)
            await error(
              await add(request("", "POST", {})),
              400,
              "VALIDATION_ERROR",
            );
          else if (i % 3 === 1)
            await error(
              await remove(request(`/${e.id}`, "DELETE", {}), context(e.id)),
              400,
              "VALIDATION_ERROR",
            );
          else
            expect(
              await json(await change(e, { favorite: false })),
            ).toMatchObject({ revision: 1 });
        }),
      );
      expect(await budget()).toBe(30);
      await error(await change(e, { favorite: true }), 429, "RATE_LIMITED");
      await error(await add(request("", "POST", {})), 429, "RATE_LIMITED");
      await error(
        await remove(request(`/${e.id}`, "DELETE", {}), context(e.id)),
        429,
        "RATE_LIMITED",
      );
      expect(await budget()).toBe(33);
      expect(
        (await json(await detail(request(`/${e.id}`), context(e.id)))).revision,
      ).toBe(1);
      expect((await json(await list(request()))).total).toBe(1);
    });
  },
);
