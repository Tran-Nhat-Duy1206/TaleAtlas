import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
  createCommunityThread: vi.fn(),
  createCommunityReply: vi.fn(),
  editCommunityContent: vi.fn(),
  withdrawCommunityContent: vi.fn(),
  revealCommunityContent: vi.fn(),
  getCommunityContent: vi.fn(),
  listCommunityContents: vi.fn(),
  listOwnedCommunityContents: vi.fn(),
  getOwnedCommunityContent: vi.fn(),
}));
vi.mock("../../apps/web/src/server/community/service", () => services);
import { HttpError } from "../../apps/web/src/server/http";
import * as threads from "../../apps/web/src/app/api/community/works/[workId]/threads/route";
import * as detail from "../../apps/web/src/app/api/community/works/[workId]/threads/[threadId]/route";
import * as replies from "../../apps/web/src/app/api/community/works/[workId]/threads/[threadId]/replies/route";
import * as edit from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/route";
import * as withdraw from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/withdraw/route";
import * as reveal from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/reveal/route";
import * as owned from "../../apps/web/src/app/api/community/owned/route";
import * as ownedDetail from "../../apps/web/src/app/api/community/works/[workId]/contents/[contentId]/owned/route";
const workId = randomUUID(),
  threadId = randomUUID(),
  contentId = threadId;
const params = { params: Promise.resolve({ workId, threadId, contentId }) };
const at = "2026-01-01T00:00:00.000Z";
const dto = {
  id: contentId,
  workId,
  kind: "THREAD",
  threadId: null,
  parentId: null,
  depth: null,
  revision: 1,
  state: "ACTIVE",
  title: { state: "VISIBLE", text: "Synthetic title" },
  body: { state: "VISIBLE", text: "Synthetic body" },
  spoilerContext: null,
  ratingHalfStars: null,
  author: null,
  createdAt: at,
  editedAt: null,
  lastActivityAt: at,
};
const input = {
  mutationKey: randomUUID(),
  title: "Synthetic title",
  body: "Synthetic body",
  titleSpoiler: false,
  bodySpoiler: false,
  spoilerContext: null,
  publicSubmissionAcknowledged: true,
};
const req = (method = "GET", body?: unknown, query = "") =>
  new Request(`http://localhost/api/community${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("V4_COMMUNITIES_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("V4B adapters retain service-authoritative ordering", () => {
  it("all adapters gate before promised params/query/body or service access using the actual flag", async () => {
    vi.stubEnv("V4_COMMUNITIES_ENABLED", "false");
    const untouched = {
      get params(): Promise<{
        workId: string;
        threadId: string;
        contentId: string;
      }> {
        throw new Error("Params accessed before gate");
      },
    };
    for (const handler of [
      threads.GET,
      threads.POST,
      detail.GET,
      replies.GET,
      replies.POST,
      edit.PATCH,
      withdraw.POST,
      reveal.POST,
      ownedDetail.GET,
    ]) {
      const response = await handler(
        req("POST", { invalid: true }, "?unknown=1"),
        untouched,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "COMMUNITY_UNAVAILABLE" });
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    const response = await owned.GET(req());
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429])(
    "does not eagerly parse malformed requests before service rejection %s",
    async (status) => {
      services.createCommunityThread.mockRejectedValue(
        new HttpError(status, "REJECTED"),
      );
      const request = new Request("http://localhost/api/community?unknown=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      const response = await threads.POST(request, params);
      expect(response.status).toBe(status);
      expect(request.bodyUsed).toBe(false);
      expect(typeof services.createCommunityThread.mock.calls[0][1]).toBe(
        "function",
      );
    },
  );
  it("uses a single lazy streamed foundation parser and strips report:null", async () => {
    services.createCommunityThread.mockImplementation(async (_work, lazy) => {
      await lazy();
      return { content: dto, replayed: false, report: null };
    });
    const response = await threads.POST(req("POST", input), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: dto, replayed: false });
    expect(services.createCommunityThread).toHaveBeenCalledTimes(1);
  });
  it.each([
    { body: "{", status: 400 },
    { body: new Uint8Array([0xc3, 0x28]), status: 400 },
    { body: "x".repeat(65537), status: 413 },
  ])(
    "rejects malformed streamed payload generically %s",
    async ({ body, status }) => {
      services.createCommunityThread.mockImplementation(async (_work, lazy) =>
        lazy(),
      );
      const request = new Request("http://localhost/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const response = await threads.POST(request, params);
      expect(response.status).toBe(status);
      expect(Object.keys(await response.json())).toEqual(["error"]);
    },
  );
  it("passes list query as a callback and reply list uses THREAD plus actual thread id", async () => {
    services.listCommunityContents.mockImplementation(
      async (_work, kind, lazy, thread) => {
        expect(kind).toBe("THREAD");
        expect(thread).toBe(threadId);
        expect(await lazy()).toEqual({ locale: "vi", page: 2 });
        return { items: [], pageSize: 25 };
      },
    );
    expect(
      (await replies.GET(req("GET", undefined, "?locale=vi&page=2"), params))
        .status,
    ).toBe(200);
    expect(services.listCommunityContents).toHaveBeenCalledTimes(1);
  });
  it("rejects reply path/body thread disagreement only inside the lazy callback", async () => {
    services.createCommunityReply.mockImplementation(async (_work, lazy) =>
      lazy(),
    );
    const response = await replies.POST(
      req("POST", {
        mutationKey: randomUUID(),
        threadId: randomUUID(),
        parentId: null,
        depth: 0,
        body: "Synthetic",
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
      }),
      params,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "VALIDATION_ERROR" });
  });
  it("returns 404 rather than exposing generic detail replies/reviews", async () => {
    for (const kind of ["REPLY", "REVIEW"]) {
      services.getCommunityContent.mockResolvedValue({ ...dto, kind });
      const response = await detail.GET(req(), params);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "COMMUNITY_NOT_FOUND" });
    }
  });
  it("binds reveal selection/current revision and never emits unselected body", async () => {
    services.revealCommunityContent.mockImplementation(async (lazy) => {
      const selection = await lazy();
      return {
        id: selection.targetId,
        workId: selection.workId,
        kind: selection.contentKind,
        revision: selection.expectedRevision,
        title: "Selected synthetic",
      };
    });
    const body = {
      workId,
      targetId: contentId,
      contentKind: "THREAD",
      expectedRevision: 1,
      title: true,
      body: false,
      spoilerRevealAcknowledged: true,
    };
    const response = await reveal.POST(req("POST", body), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: contentId,
      workId,
      kind: "THREAD",
      revision: 1,
      title: "Selected synthetic",
    });
    const mismatch = await reveal.POST(
      req("POST", { ...body, targetId: randomUUID() }),
      params,
    );
    expect(mismatch.status).toBe(400);
  });
  it("owner context is lazy, UUID-only, private/noindex on success and failure", async () => {
    const ownerDto = {
      id: contentId,
      workId,
      kind: "THREAD",
      threadId: null,
      parentId: null,
      depth: null,
      revision: 1,
      authorState: "ACTIVE",
      moderationState: "VISIBLE",
      workAvailable: false,
      canEdit: false,
      canWithdraw: true,
    };
    services.getOwnedCommunityContent.mockImplementation(
      async (_work, _target, lazy) => {
        expect(await lazy()).toEqual({ contentKind: "THREAD" });
        return ownerDto;
      },
    );
    const response = await ownedDetail.GET(
      req("GET", undefined, "?contentKind=THREAD"),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ownerDto);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    services.getOwnedCommunityContent.mockRejectedValue(
      new HttpError(404, "COMMUNITY_NOT_FOUND"),
    );
    const failure = await ownedDetail.GET(
      req("GET", undefined, "?unknown=bad"),
      params,
    );
    expect(failure.status).toBe(404);
    expect(failure.headers.get("x-robots-tag")).toBe("noindex");
  });
});
