import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import {
  GET as list,
  POST as create,
} from "../../apps/web/src/app/api/requests/route";
import {
  GET as detail,
  PATCH as amend,
} from "../../apps/web/src/app/api/requests/[id]/route";
import { POST as cancel } from "../../apps/web/src/app/api/requests/[id]/cancel/route";
import {
  POST as support,
  DELETE as unsupport,
} from "../../apps/web/src/app/api/requests/[id]/support/route";
import { GET as search } from "../../apps/web/src/app/api/requests/search/route";
import { GET as following } from "../../apps/web/src/app/api/requests/following/route";
import { POST as review } from "../../apps/web/src/app/api/admin/requests/[id]/summary/route";
const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
let owner: Actor, other: Actor, admin: Actor;
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
      ...(actor ? { cookie: actor.cookie } : {}),
      origin: f.origin,
      "content-type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const input = () => ({
  submitKey: randomUUID(),
  details: {
    title: `Private raw ${f.runId}`,
    format: "UNKNOWN",
    notes: "NEVER_PUBLIC_NOTES",
    additionalEvidence: "NEVER_PUBLIC_EVIDENCE",
  },
});
async function submitted() {
  const r = await create(req("requests", owner, "POST", input()));
  expect(r.status).toBe(200);
  return r.json();
}
async function reviewed(id: string, revision: number) {
  const r = await review(
    req(`admin/requests/${id}/summary`, admin, "POST", {
      revision,
      title: `Reviewed ${f.runId}`,
      format: "UNKNOWN",
      alternativeTitles: ["Curated alias"],
      sourceUrl: "https://example.com/citation",
      reason: "Human-reviewed identity evidence",
      equivalenceReviewAcknowledged: true,
    }),
    context(id),
  );
  expect(r.status).toBe(200);
  return r.json();
}
beforeAll(async () => {
  await f.start();
  owner = await f.account("user");
  other = await f.account("user");
  admin = await f.account("admin");
});
afterAll(async () => {
  const ids = f.users.map((u) => u.id);
  if (ids.length) {
    await f.client`delete from work_request_supporters where user_id in ${f.client(ids)} or request_id in (select id from work_requests where owner_user_id in ${f.client(ids)})`;
    await f.client`delete from ingestion_jobs where request_id in (select id from work_requests where owner_user_id in ${f.client(ids)})`;
    await f.client`delete from request_events where request_id in (select id from work_requests where owner_user_id in ${f.client(ids)})`;
    await f.client`delete from work_requests where owner_user_id in ${f.client(ids)}`;
  }
  await f.stop();
});
describe.sequential("V2B real signed-session request HTTP boundary", () => {
  it("serves more concurrent owned details than the SQL pool capacity without nested transactions", async () => {
    const row = await submitted();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        detail(req(`requests/${row.id}`, owner), context(row.id)),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    for (const body of bodies) {
      expect(body.kind).toBe("OWNED");
      expect(body.request.id).toBe(row.id);
      expect(body.request.revision).toBe(1);
      expect(
        body.request.events.map(
          (event: { revision: number }) => event.revision,
        ),
      ).toEqual([1]);
      expect(body.supporterCount).toBe(0);
      expect(body.work).toBeNull();
    }
  }, 15000);
  it("authenticates before parsing and enforces roles, origin, JSON and bounds", async () => {
    expect(
      (
        await create(
          req(
            "requests",
            undefined,
            "POST",
            { broken: true },
            { "x-user-id": owner.id },
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await review(
          req("admin/requests/bad/summary", other, "POST", {}),
          context("bad"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await create(
          req("requests", owner, "POST", input(), {
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await create(
          req("requests", owner, "POST", input(), {
            "content-type": "text/plain",
          }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await create(
          req("requests", owner, "POST", input(), {
            "content-length": "65537",
          }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await create(
          req("requests", owner, "POST", { ...input(), ownerUserId: other.id }),
        )
      ).status,
    ).toBe(400);
    expect((await list(req("requests?page=1001", owner))).status).toBe(400);
    expect((await list(req("requests?pageSize=51", owner))).status).toBe(400);
    expect((await search(req("requests/search?q=x"))).status).toBe(401);
  });
  it("searches only reviewed input; supports are conservative, concurrent and identity-safe", async () => {
    const row = await submitted();
    const ctx = context(row.id);
    expect(
      (
        await detail(
          req(`requests/${row.id}`, other, "GET", undefined, {
            "x-user-id": owner.id,
          }),
          ctx,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await support(
          req(`requests/${row.id}/support`, other, "POST", {
            equivalenceAcknowledged: true,
          }),
          ctx,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await (
          await search(
            req(`requests/search?q=${encodeURIComponent(f.runId)}`, other),
          )
        ).json()
      ).items,
    ).toHaveLength(0);
    await reviewed(row.id, row.revision);
    expect(
      (
        await support(
          req(`requests/${row.id}/support`, owner, "POST", {
            equivalenceAcknowledged: true,
          }),
          ctx,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await support(
          req(`requests/${row.id}/support`, other, "POST", {
            equivalenceAcknowledged: false,
          }),
          ctx,
        )
      ).status,
    ).toBe(400);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        support(
          req(`requests/${row.id}/support`, other, "POST", {
            equivalenceAcknowledged: true,
          }),
          ctx,
        ),
      ),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(
      await f.client`select * from work_request_supporters where request_id = ${row.id}`,
    ).toHaveLength(1);
    const detailResponse = await detail(req(`requests/${row.id}`, other), ctx);
    const visible = await detailResponse.json();
    expect(detailResponse.status, JSON.stringify(visible)).toBe(200);
    expect(visible.kind).toBe("FOLLOWED");
    expect(visible.request.following).toBe(true);
    expect(visible.request.supporterCount).toBe(1);
    for (const id of [row.id, randomUUID()]) {
      const blind = await unsupport(
        req(`requests/${id}/support`, owner, "DELETE"),
        context(id),
      );
      expect(blind.status).toBe(200);
      expect(await blind.json()).toEqual({ following: false });
    }
    const found = await (
      await search(req("requests/search?q=Curated%20alias", other))
    ).json();
    expect(found.items.some((v: { id: string }) => v.id === row.id)).toBe(true);
    const encoded = JSON.stringify({ found, visible });
    for (const secret of [
      "Private raw",
      "NEVER_PUBLIC",
      owner.id,
      other.id,
      owner.email,
      "citation",
    ])
      expect(encoded).not.toContain(secret);
    expect(
      (
        await (
          await search(req("requests/search?q=Private%20raw", other))
        ).json()
      ).items,
    ).toHaveLength(0);
    const patched = await amend(
      req(`requests/${row.id}`, owner, "PATCH", {
        revision: 2,
        details: input().details,
      }),
      ctx,
    );
    expect(patched.status).toBe(200);
    const followed = await (
      await following(req("requests/following", other))
    ).json();
    const redacted = followed.items.find(
      (v: { id: string }) => v.id === row.id,
    );
    expect(redacted.title).toBeNull();
    expect(redacted.format).toBeNull();
    expect(
      (
        await (
          await search(req("requests/search?q=Curated%20alias", other))
        ).json()
      ).items,
    ).toHaveLength(0);
    await reviewed(row.id, 3);
    expect(
      (
        await cancel(
          req(`requests/${row.id}/cancel`, owner, "POST", { revision: 4 }),
          ctx,
        )
      ).status,
    ).toBe(200);
    const cancelled = await (
      await detail(req(`requests/${row.id}`, other), ctx)
    ).json();
    expect(cancelled.request.title).toBeNull();
    expect(cancelled.request.state).toBe("CANCELLED");
    for (let i = 0; i < 2; i++)
      expect(
        (
          await unsupport(
            req(`requests/${row.id}/support`, other, "DELETE"),
            ctx,
          )
        ).status,
      ).toBe(200);
    expect((await detail(req(`requests/${row.id}`, other), ctx)).status).toBe(
      404,
    );
    const events =
      await f.client`select revision, event_kind, payload from request_events where request_id = ${row.id} order by revision`;
    expect(events.map((e) => e.revision)).toEqual([1, 2, 3, 4, 5]);
    expect(events[1]!.event_kind).toBe("SUMMARY_REVIEWED");
    expect(events[1]!.payload.humanReviewed).toBe(true);
  });
  it("limits new mutations to thirty per authenticated actor without double-counting owner writes", async () => {
    const actor = await f.account("user");
    const row = await submitted();
    await reviewed(row.id, 1);
    const results = await Promise.all(
      Array.from({ length: 31 }, () =>
        support(
          req(`requests/${row.id}/support`, actor, "POST", {
            equivalenceAcknowledged: true,
          }),
          context(row.id),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(30);
    expect(results.filter((r) => r.status === 429)).toHaveLength(1);
    expect(
      await f.client`select * from work_request_supporters where request_id = ${row.id} and user_id = ${actor.id}`,
    ).toHaveLength(1);
  });
});
