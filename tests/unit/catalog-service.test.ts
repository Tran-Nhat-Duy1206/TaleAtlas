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
