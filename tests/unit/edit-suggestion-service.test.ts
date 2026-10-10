import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  limit: vi.fn(),
  db: vi.fn(),
}));
vi.mock("../../apps/web/src/server/session", () => ({
  requireSession: m.requireSession,
  requireRole: m.requireRole,
  AuthorizationError: class extends Error {
    constructor(readonly status: number) {
      super("denied");
    }
  },
}));
vi.mock("../../apps/web/src/server/http", () => ({
  limitCatalogMutation: m.limit,
  HttpError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code);
    }
  },
}));
vi.mock("../../apps/web/src/server/database", () => ({ getDatabase: m.db }));
vi.mock("../../apps/web/src/server/catalog/repository", () => ({
  loadWork: vi.fn(),
  saveWorkInTransaction: vi.fn(),
}));
import {
  submitEditSuggestion,
  reviewEditSuggestion,
  listEditSuggestions,
  getOwnedEditSuggestion,
} from "../../apps/web/src/server/catalog/edit-suggestions";
const headers = new Headers({ "x-role": "admin", "x-user-id": "fake" });
beforeEach(() => {
  vi.resetAllMocks();
  m.requireSession.mockResolvedValue({
    user: { id: "owner", emailVerified: true },
  });
  m.requireRole.mockResolvedValue({
    user: { id: "admin", emailVerified: true },
  });
});
it("authenticates before consuming input and ignores role headers", async () => {
  const parse = vi.fn();
  m.requireRole.mockRejectedValue({ status: 403 });
  await expect(
    reviewEditSuggestion("bad", parse, headers),
  ).rejects.toMatchObject({ status: 403 });
  expect(parse).not.toHaveBeenCalled();
  expect(m.limit).not.toHaveBeenCalled();
  expect(m.db).not.toHaveBeenCalled();
  expect(m.requireRole).toHaveBeenCalledWith(["admin"], headers);
});
it("rejects unverified sessions before parsing, rate limiting and SQL", async () => {
  m.requireSession.mockResolvedValue({
    user: { id: "owner", emailVerified: false },
  });
  const parse = vi.fn();
  for (const call of [
    () => submitEditSuggestion("bad", parse, headers),
    () => listEditSuggestions({}, headers),
    () => getOwnedEditSuggestion("bad", headers),
  ])
    await expect(call()).rejects.toMatchObject({ status: 403 });
  expect(parse).not.toHaveBeenCalled();
  expect(m.limit).not.toHaveBeenCalled();
  expect(m.db).not.toHaveBeenCalled();
});
it("rate limits once before mutation parsing and never touches SQL for bad IDs", async () => {
  await expect(submitEditSuggestion("bad", {}, headers)).rejects.toThrow();
  expect(m.limit).toHaveBeenCalledExactlyOnceWith("owner");
  expect(m.db).not.toHaveBeenCalled();
});
it("requires trusted authenticated admin even for malformed page input", async () => {
  m.requireRole.mockRejectedValue({ status: 403 });
  await expect(
    listEditSuggestions({ pageSize: "bad" }, headers, true),
  ).rejects.toMatchObject({ status: 403 });
  expect(m.db).not.toHaveBeenCalled();
});
