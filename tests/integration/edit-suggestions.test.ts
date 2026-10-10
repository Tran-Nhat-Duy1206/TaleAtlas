import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  adminGetWork,
  updateWork,
  getWorkBySlug,
} from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import { applyReviewedSuggestion } from "../../apps/web/src/features/catalog/edit-suggestions";
import { POST as submit } from "../../apps/web/src/app/api/catalog/works/[slug]/suggestions/route";
import { GET as owned } from "../../apps/web/src/app/api/edit-suggestions/route";
import { GET as detail } from "../../apps/web/src/app/api/edit-suggestions/[id]/route";
import { GET as adminList } from "../../apps/web/src/app/api/admin/edit-suggestions/route";
import { POST as review } from "../../apps/web/src/app/api/admin/edit-suggestions/[id]/review/route";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, other: Actor, admin: Actor;
const workIds = new Set<string>(),
  creatorIds = new Set<string>();
const h = (actor: Actor) => new Headers({ cookie: actor.cookie });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(
  path: string,
  actor?: Actor,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${f.origin}/api/${path}`, {
    method,
    headers: {
      origin: f.origin,
      "content-type": "application/json",
      ...(actor ? { cookie: actor.cookie } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const citation = () => ({
  label: f.sourceLabel,
  citation: "PRIVATE HUMAN CITATION synthetic only",
});
const input = (work: AdminWork) => ({
  submitKey: randomUUID(),
  baseWorkRevision: work.revision,
  patch: { primaryTitle: `Private proposed ${f.runId}`, publicationYear: 2020 },
  citation: citation(),
});
async function work(visibility = "PUBLISHED") {
  const row = (await createWork(
    {
      primaryTitle: `Synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility,
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: { label: f.sourceLabel, citation: "Original synthetic evidence" },
      titles: [
        { title: "Original title", language: "ja", kind: "ORIGINAL" },
        { title: "Keep alias", language: "en", kind: "ALIAS" },
      ],
      descriptions: [{ language: "en", text: "Keep description" }],
      editions: [{ title: "Keep edition" }],
      creators: [{ name: "Keep creator", role: "AUTHOR", displayOrder: 0 }],
    },
    h(admin),
  )) as AdminWork;
  workIds.add(row.id);
  row.creators.forEach((c) => c.id && creatorIds.add(c.id));
  return row;
}
async function submitted(w: AdminWork, value = input(w)) {
  const response = await submit(
    req(`catalog/works/${w.id}/suggestions`, owner, "POST", value),
    { params: Promise.resolve({ slug: w.id }) },
  );
  expect(response.status).toBe(200);
  return response.json();
}
async function decide(
  row: { id: string; revision: number; baseWorkRevision: number },
  decision = "APPROVE",
  actor = admin,
) {
  return review(
    req(`admin/edit-suggestions/${row.id}/review`, actor, "POST", {
      revision: row.revision,
      baseWorkRevision: row.baseWorkRevision,
      decision,
      reason: "Manually verified synthetic correction",
      ...(decision === "APPROVE"
        ? {
            metadataReviewAcknowledged: true,
            publicationReviewAcknowledged: true,
          }
        : {}),
    }),
    ctx(row.id),
  );
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  other = await f.account("user");
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  for (const id of workIds) {
    await f.client`delete from edit_suggestion_events where suggestion_id in (select id from edit_suggestions where work_id = ${id})`;
    await f.client`delete from edit_suggestions where work_id = ${id}`;
    await f.client`delete from catalog_field_evidence where work_id = ${id}`;
    await f.client`delete from catalog_audit_events where work_id = ${id}`;
    await f.client`delete from work_relations where from_work_id = ${id} or to_work_id = ${id}`;
    await f.client`delete from work_creators where work_id = ${id}`;
    await f.client`delete from work_titles where work_id = ${id}`;
    await f.client`delete from work_descriptions where work_id = ${id}`;
    await f.client`delete from work_genres where work_id = ${id}`;
    await f.client`delete from work_covers where work_id = ${id}`;
    await f.client`delete from work_identifiers where work_id = ${id}`;
    await f.client`delete from editions where work_id = ${id}`;
    await f.client`delete from works where id = ${id}`;
  }
  for (const id of creatorIds)
    await f.client`delete from creators where id = ${id} and not exists(select 1 from work_creators where creator_id = ${id})`;
  await f.client`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});
describe.sequential(
  "V2D private edits real signed sessions and PostgreSQL",
  () => {
    it("enforces auth before parsing, verified sessions, role headers, origin and stream body bounds", async () => {
      const context = { params: Promise.resolve({ slug: "bad" }) };
      expect(
        (
          await submit(
            req(
              "catalog/works/bad/suggestions",
              undefined,
              "POST",
              {},
              { "x-user-id": owner.id },
            ),
            context,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await review(
            req(
              "admin/edit-suggestions/bad/review",
              other,
              "POST",
              {},
              { "x-role": "admin" },
            ),
            ctx("bad"),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await submit(
            req(
              "catalog/works/bad/suggestions",
              owner,
              "POST",
              {},
              { origin: "https://evil.invalid" },
            ),
            context,
          )
        ).status,
      ).toBe(403);
      const w = await work();
      expect(
        (
          await submit(
            req(`catalog/works/${w.id}/suggestions`, owner, "POST", input(w), {
              "content-type": "text/plain",
            }),
            { params: Promise.resolve({ slug: w.id }) },
          )
        ).status,
      ).toBe(415);
      expect(
        (
          await submit(
            req(`catalog/works/${w.id}/suggestions`, owner, "POST", {
              junk: "x".repeat(66000),
            }),
            { params: Promise.resolve({ slug: w.id }) },
          )
        ).status,
      ).toBe(413);
      const unverified = await f.account("user");
      await f.client`update users set email_verified = false where id = ${unverified.id}`;
      expect(
        (
          await submit(
            req(`catalog/works/${w.id}/suggestions`, unverified, "POST", {}),
            { params: Promise.resolve({ slug: w.id }) },
          )
        ).status,
      ).toBe(403);
      expect(
        (await adminList(req("admin/edit-suggestions", other))).status,
      ).toBe(403);
    });
    it("qualifies PUBLISHED visibility and current revisions, protects ownerA from ownerB, and never mutates catalog on submit", async () => {
      const privateWork = await work("DRAFT");
      expect(
        (
          await submit(
            req(
              `catalog/works/${privateWork.id}/suggestions`,
              owner,
              "POST",
              input(privateWork),
            ),
            { params: Promise.resolve({ slug: privateWork.id }) },
          )
        ).status,
      ).toBe(404);
      const w = await work();
      const value = input(w);
      const row = await submitted(w, value);
      expect(await adminGetWork(w.id, h(admin))).toEqual(w);
      expect(JSON.stringify(await getWorkBySlug(w.slug))).not.toContain(
        "PRIVATE HUMAN CITATION",
      );
      expect(
        (await detail(req(`edit-suggestions/${row.id}`, other), ctx(row.id)))
          .status,
      ).toBe(404);
      expect(
        (await detail(req(`edit-suggestions/${row.id}`), ctx(row.id))).status,
      ).toBe(401);
      expect(
        (await (await owned(req("edit-suggestions", other))).json()).items,
      ).toEqual([]);
      expect(
        (
          await submitted(w, {
            ...value,
            patch: {
              publicationYear: 2020,
              primaryTitle: value.patch.primaryTitle,
            },
          })
        ).id,
      ).toBe(row.id);
      expect(
        (
          await submit(
            req(`catalog/works/${w.id}/suggestions`, owner, "POST", {
              ...value,
              patch: { publicationYear: 2021 },
            }),
            { params: Promise.resolve({ slug: w.id }) },
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await f.client`select * from edit_suggestion_events where suggestion_id = ${row.id}`
        ).length,
      ).toBe(1);
      const stale = { ...input(w), baseWorkRevision: w.revision + 1 };
      expect(
        (
          await submit(
            req(`catalog/works/${w.id}/suggestions`, owner, "POST", stale),
            { params: Promise.resolve({ slug: w.id }) },
          )
        ).status,
      ).toBe(409);
    });
    it("rejection changes only suggestion; approval preserves children, identities and provenance and atomically records both audits", async () => {
      const w = await work();
      const rejected = await submitted(w);
      expect((await decide(rejected, "REJECT")).status).toBe(200);
      expect(await adminGetWork(w.id, h(admin))).toEqual(w);
      const row = await submitted(w);
      const unacknowledged = await review(
        req(`admin/edit-suggestions/${row.id}/review`, admin, "POST", {
          revision: row.revision,
          baseWorkRevision: row.baseWorkRevision,
          decision: "APPROVE",
          reason: "Manual review but missing attestation",
        }),
        ctx(row.id),
      );
      expect(unacknowledged.status).toBe(400);
      const response = await decide(row);
      expect(response.status).toBe(200);
      const updated = (await adminGetWork(w.id, h(admin))) as AdminWork;
      expect(updated.revision).toBe(w.revision + 1);
      expect(updated.primaryTitle).toBe(`Private proposed ${f.runId}`);
      expect(updated.creators).toEqual(w.creators);
      expect(updated.editions).toEqual(w.editions);
      expect(updated.descriptions).toEqual(w.descriptions);
      expect(updated.titles).toEqual(
        expect.arrayContaining(w.titles.filter((t) => t.kind !== "PRIMARY")),
      );
      const [oldSource] =
        await f.client`select source_id from catalog_field_evidence where work_id = ${w.id} and revision = 1 limit 1`;
      expect(oldSource).toBeTruthy();
      const audits =
        await f.client`select * from catalog_audit_events where work_id = ${w.id} order by new_revision`;
      expect(audits).toHaveLength(2);
      expect(audits[1].actor_user_id).toBe(admin.id);
      const mine = await (
        await detail(req(`edit-suggestions/${row.id}`, owner), ctx(row.id))
      ).json();
      expect(mine.state).toBe("APPROVED");
      expect(mine.reviewReason).toBe("Manually verified synthetic correction");
      expect(mine.events).toHaveLength(2);
      expect(JSON.stringify(mine.events)).not.toContain(
        "PRIVATE HUMAN CITATION",
      );
      expect((await decide(row)).status).toBe(409);
    });
    it("rolls back stale approvals without erasing administrator edits; rejection remains available", async () => {
      const w = await work();
      const row = await submitted(w);
      const updatedInput = applyReviewedSuggestion(
        w,
        { primaryTitle: "Concurrent admin edit" },
        w.source,
      );
      await updateWork(
        w.id,
        { ...updatedInput, revision: w.revision },
        h(admin),
      );
      expect((await decide(row)).status).toBe(409);
      const current = await adminGetWork(w.id, h(admin));
      expect(current.primaryTitle).toBe("Concurrent admin edit");
      expect(
        (
          await (
            await detail(req(`edit-suggestions/${row.id}`, owner), ctx(row.id))
          ).json()
        ).state,
      ).toBe("SUBMITTED");
      expect((await decide(row, "REJECT")).status).toBe(200);
    });
    it("handles concurrent deliveries and reviewers without nested transaction deadlock", async () => {
      const w = await work();
      const value = input(w);
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => submitted(w, value)),
      );
      expect(new Set(responses.map((r) => r.id)).size).toBe(1);
      const reviewed = await Promise.all([
        decide(responses[0]),
        decide(responses[0]),
      ]);
      expect(reviewed.map((r) => r.status).sort()).toEqual([200, 409]);
      const details = await Promise.all(
        Array.from({ length: 14 }, () =>
          detail(
            req(`edit-suggestions/${responses[0].id}`, owner),
            ctx(responses[0].id),
          ),
        ),
      );
      expect(details.every((r) => r.status === 200)).toBe(true);
    });
    it("enforces SQL bounds, revisions, foreign keys, work restrict and owner set-null retention", async () => {
      const w = await work();
      const row = await submitted(w);
      await expect(
        f.client`update edit_suggestions set revision = 0 where id = ${row.id}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client`update edit_suggestions set proposed = '[]'::jsonb where id = ${row.id}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client`update edit_suggestions set proposed = ${JSON.stringify({ primaryTitle: "x".repeat(17000) })}::jsonb where id = ${row.id}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client`update edit_suggestions set work_id = ${randomUUID()} where id = ${row.id}`,
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        f.client`delete from works where id = ${w.id}`,
      ).rejects.toMatchObject({ code: "23001" });
      const ephemeral = await f.account("user");
      const response = await submit(
        req(`catalog/works/${w.id}/suggestions`, ephemeral, "POST", input(w)),
        { params: Promise.resolve({ slug: w.id }) },
      );
      expect(response.status).toBe(200);
      const retained = await response.json();
      await f.client`delete from users where id = ${ephemeral.id}`;
      const [record] =
        await f.client`select owner_user_id from edit_suggestions where id = ${retained.id}`;
      expect(record.owner_user_id).toBeNull();
      const [event] =
        await f.client`select actor_user_id, actor_snapshot from edit_suggestion_events where suggestion_id = ${retained.id}`;
      expect(event.actor_user_id).toBeNull();
      expect(event.actor_snapshot).toBe(ephemeral.id);
    });
  },
);
