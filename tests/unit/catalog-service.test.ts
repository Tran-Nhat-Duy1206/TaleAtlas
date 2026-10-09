import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
  searchWorks: vi.fn(),
  loadWork: vi.fn(),
  findWorkBySlug: vi.fn(),
  saveWork: vi.fn(),
  changeVisibility: vi.fn(),
}));
vi.mock("../../apps/web/src/server/session", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("../../apps/web/src/server/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("../../apps/web/src/server/catalog/repository", () => mocks);
import {
  adminListWorks,
  adminGetWork,
  createWork,
  updateWork,
  setVisibility,
  listWorks,
} from "../../apps/web/src/server/catalog/service";
const headers = new Headers();
const id = "12345678-1234-4234-8234-123456789abc";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ user: { id: "actor" } });
});
it("each privileged entry reauthorizes explicit request headers before validation and DB", async () => {
  mocks.requireRole.mockRejectedValue({ status: 403, message: "private" });
  for (const call of [
    () => adminListWorks({}, headers),
    () => adminGetWork(id, headers),
    () => createWork({}, headers),
    () => updateWork(id, {}, headers),
    () => setVisibility(id, {}, headers),
  ])
    await expect(call()).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "FORBIDDEN",
    });
  expect(mocks.requireRole).toHaveBeenCalledTimes(5);
  expect(mocks.requireRole).toHaveBeenCalledWith(["admin"], headers);
  expect(mocks.getDatabase).not.toHaveBeenCalled();
  expect(mocks.saveWork).not.toHaveBeenCalled();
});
it("invalid mutation fails with sanitized validation and no repository write", async () => {
  await expect(
    createWork({ actorId: "trusted" }, headers),
  ).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
  expect(mocks.saveWork).not.toHaveBeenCalled();
});
it("rejects unacknowledged published commands before any repository access", async () => {
  const work = {
    primaryTitle: "Synthetic",
    format: "NOVEL",
    visibility: "PUBLISHED",
    releaseStatus: "UNKNOWN",
    source: { label: "Synthetic", citation: "Invented fixture" },
  };
  for (const acknowledgment of [undefined, false, "true", 1, null]) {
    const review =
      acknowledgment === undefined
        ? {}
        : { publicationReviewAcknowledged: acknowledgment };
    for (const call of [
      () => createWork({ ...work, ...review }, headers),
      () => updateWork(id, { ...work, revision: 1, ...review }, headers),
      () =>
        setVisibility(
          id,
          { visibility: "PUBLISHED", revision: 1, ...review },
          headers,
        ),
    ])
      await expect(call()).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION",
        message: "VALIDATION",
      });
  }
  expect(mocks.requireRole).toHaveBeenCalledWith(["admin"], headers);
  for (const repository of [
    mocks.getDatabase,
    mocks.saveWork,
    mocks.changeVisibility,
    mocks.loadWork,
    mocks.searchWorks,
    mocks.findWorkBySlug,
  ])
    expect(repository).not.toHaveBeenCalled();
});
it.each(["PUBLISHED", "DRAFT", "HIDDEN"])(
  "accepts valid %s commands after authorization",
  async (visibility) => {
    const review =
      visibility === "PUBLISHED"
        ? { publicationReviewAcknowledged: true }
        : { publicationReviewAcknowledged: false };
    const work = {
      primaryTitle: "Synthetic",
      format: "NOVEL",
      visibility,
      releaseStatus: "UNKNOWN",
      source: { label: "Synthetic", citation: "Invented fixture" },
      ...review,
    };
    await createWork(work, headers);
    await updateWork(id, { ...work, revision: 1 }, headers);
    await setVisibility(id, { visibility, revision: 1, ...review }, headers);
    expect(mocks.saveWork).toHaveBeenCalledTimes(2);
    expect(mocks.saveWork.mock.calls[1]).toEqual([
      expect.objectContaining(review),
      "actor",
      id,
      1,
    ]);
    expect(mocks.changeVisibility).toHaveBeenCalledOnce();
  },
);
it("does not expose query/driver errors", async () => {
  mocks.searchWorks.mockRejectedValue(new Error("SQL private token"));
  await expect(listWorks({})).rejects.toMatchObject({
    status: 503,
    code: "UNAVAILABLE",
    message: "UNAVAILABLE",
  });
});
it("guards revision input", async () => {
  await expect(
    setVisibility(id, { revision: 0, visibility: "PUBLISHED" }, headers),
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.changeVisibility).not.toHaveBeenCalled();
});
it("normalizes bounded public query without asking for auth", async () => {
  mocks.searchWorks.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  await listWorks({});
  expect(mocks.searchWorks).toHaveBeenCalledWith(
    { q: "", page: 1, pageSize: 20, locale: "en" },
    false,
  );
  expect(mocks.requireRole).not.toHaveBeenCalled();
});
