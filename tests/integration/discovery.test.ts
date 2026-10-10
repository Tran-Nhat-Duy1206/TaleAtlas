import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import {
  createWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import {
  recentlyAdded,
  verifiedReleases,
  recordVerifiedRelease,
} from "../../apps/web/src/server/catalog/discovery";
import { POST } from "../../apps/web/src/app/api/admin/catalog/releases/route";

const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let admin: Actor, user: Actor;
const ids: string[] = [];
const headers = (actor: Actor) => new Headers({ cookie: actor.cookie });
const context = (value: unknown, actor?: Actor, origin = f.origin) =>
  new Request(`${f.origin}/api/admin/catalog/releases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(actor ? { cookie: actor.cookie } : {}),
    },
    body: JSON.stringify(value),
  });
async function work(visibility: "PUBLISHED" | "DRAFT" = "PUBLISHED") {
  const row = await createWork(
    {
      primaryTitle: `Discovery ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility,
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      publicationYear: 2024,
      source: {
        label: f.sourceLabel,
        citation:
          "Synthetic human-verified fixture, not live release evidence.",
      },
    },
    headers(admin),
  );
  ids.push(row.id);
  if (!("revision" in row)) throw new Error("Admin fixture lacks revision");
  return row;
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
  user = await f.account("user");
});
afterAll(async () => {
  for (const id of ids) {
    await f.client`delete from catalog_releases where work_id = ${id}`;
    await f.client`delete from catalog_field_evidence where work_id = ${id}`;
    await f.client`delete from catalog_audit_events where work_id = ${id}`;
    await f.client`delete from work_titles where work_id = ${id}`;
    await f.client`delete from works where id = ${id}`;
  }
  await f.client`delete from catalog_sources where label = ${f.sourceLabel}`;
  await f.stop();
});
describe("publication-backed discovery and manually evidenced exact releases", () => {
  it("does not infer a release from year/status; orders first attested publication, not draft creation", async () => {
    const published = await work();
    const draft = await work("DRAFT");
    await f.client`update works set created_at = '2000-01-01' where id = ${published.id}`;
    const result = await recentlyAdded({ pageSize: 30 });
    expect(result.items.some((r) => r.work.id === published.id)).toBe(true);
    expect(result.items.some((r) => r.work.id === draft.id)).toBe(false);
    const first = result.items.find((r) => r.work.id === published.id)!.addedAt;
    expect(first.slice(0, 4)).not.toBe("2000");
    // The public clock must equal the actual attested audit, not merely differ from draft time.
    const [attested] =
      await f.client`select min(timestamp) as published_at from catalog_audit_events where work_id = ${published.id} and changes->>'visibility' = 'PUBLISHED' and changes->>'publicationReviewAcknowledged' = 'true'`;
    expect(first).toBe(new Date(attested!.published_at).toISOString());
    expect(
      (await verifiedReleases({})).items.some(
        (r) => r.work.id === published.id,
      ),
    ).toBe(false);
    await setVisibility(
      published.id,
      { revision: published.revision, visibility: "HIDDEN" },
      headers(admin),
    );
    expect(
      (await recentlyAdded({ pageSize: 30 })).items.some(
        (r) => r.work.id === published.id,
      ),
    ).toBe(false);
    await setVisibility(
      published.id,
      {
        revision: published.revision + 1,
        visibility: "PUBLISHED",
        publicationReviewAcknowledged: true,
      },
      headers(admin),
    );
    expect(
      (await recentlyAdded({ pageSize: 30 })).items.find(
        (r) => r.work.id === published.id,
      )!.addedAt,
    ).toBe(first);
  });
  it("authenticates before body, guards Origin, rejects stale/unknown days without orphan sources", async () => {
    const row = await work();
    const input = {
      workId: row.id,
      workRevision: row.revision,
      releaseDate: "2024-02-29",
      language: "vi",
      label: "Synthetic print release",
      source: {
        label: f.sourceLabel,
        citation:
          "Synthetic exact-day publisher announcement manually checked.",
      },
      releaseReviewAcknowledged: true,
    };
    expect((await POST(context({}, undefined))).status).toBe(401);
    expect((await POST(context({}, user))).status).toBe(403);
    expect(
      (await POST(context(input, admin, "https://untrusted.invalid"))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          context({ ...input, releaseReviewAcknowledged: false }, admin),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(context({ ...input, releaseDate: "2024-02-30" }, admin)))
        .status,
    ).toBe(400);
    const before = (
      await f.client`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`
    )[0]!.n;
    expect(
      (await POST(context({ ...input, workRevision: row.revision + 1 }, admin)))
        .status,
    ).toBe(409);
    expect(
      (
        await f.client`select count(*)::int as n from catalog_sources where label = ${f.sourceLabel}`
      )[0]!.n,
    ).toBe(before);
    const release = await recordVerifiedRelease(input, headers(admin));
    const found = (
      await verifiedReleases({
        from: "2024-02-29",
        to: "2024-02-29",
        locale: "vi",
        pageSize: 30,
      })
    ).items.find((r) => r.id === release!.id)!;
    expect(found).toMatchObject({
      releaseDate: "2024-02-29",
      language: "vi",
      source: input.source,
    });
    expect(JSON.stringify(found)).not.toContain(admin.id);
    expect(JSON.stringify(found)).not.toContain("actorSnapshot");
    const persisted = (
      await f.client`select revision from works where id = ${row.id}`
    )[0]!;
    expect(persisted.revision).toBe(row.revision);
    await setVisibility(
      row.id,
      { revision: row.revision, visibility: "HIDDEN" },
      headers(admin),
    );
    expect(
      (await verifiedReleases({ pageSize: 30 })).items.some(
        (r) => r.id === release!.id,
      ),
    ).toBe(false);
    expect((await POST(context(input, admin))).status).toBe(404);
  });
});
