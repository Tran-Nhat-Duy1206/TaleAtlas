// Server-page/authorization units with mocked services, not runtime acceptance.
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  adminGuard: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  list: vi.fn(),
  owned: vi.fn(),
  work: vi.fn(),
  target: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: mocks.redirect,
}));
vi.mock("@/components/catalog/AdminGuard", () => ({
  adminGuard: mocks.adminGuard,
}));
vi.mock("@/server/session", () => {
  class AuthorizationError extends Error {
    constructor(public status: 401 | 403) {
      super("DENIED");
    }
  }
  return { AuthorizationError, requireSession: mocks.session };
});
vi.mock("@/server/catalog/edit-suggestions", () => ({
  listEditSuggestions: mocks.list,
  getOwnedEditSuggestion: mocks.owned,
}));
vi.mock("@/server/catalog/service", () => ({ adminGetWork: mocks.work }));
vi.mock("@/server/catalog/suggestion-target", () => ({
  getSuggestionTarget: mocks.target,
}));
import { AuthorizationError } from "../../apps/web/src/server/session";
import { suggestionGuard } from "../../apps/web/src/server/catalog/suggestion-guard";
import Mine, {
  dynamic as mineDynamic,
  metadata as mineMetadata,
} from "../../apps/web/src/app/[locale]/edit-suggestions/page";
import History, {
  dynamic as historyDynamic,
  metadata as historyMetadata,
} from "../../apps/web/src/app/[locale]/edit-suggestions/[id]/page";
import Admin, {
  dynamic as adminDynamic,
  metadata as adminMetadata,
} from "../../apps/web/src/app/[locale]/admin/edit-suggestions/page";
import Form, {
  dynamic as formDynamic,
  metadata as formMetadata,
} from "../../apps/web/src/app/[locale]/works/[slug]/suggest-edit/page";
const id = "10000000-0000-4000-8000-000000000001";
const h = new Headers({ cookie: "test-session-not-production" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(h);
  mocks.adminGuard.mockResolvedValue(h);
  mocks.session.mockResolvedValue({ user: { id, emailVerified: true } });
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
  mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  mocks.owned.mockResolvedValue(null);
  mocks.target.mockResolvedValue(null);
});
describe("verified authority precedes private suggestion reads", () => {
  it("anonymous is redirected only to same-locale login", async () => {
    mocks.session.mockRejectedValue(new AuthorizationError(401));
    await expect(suggestionGuard("vi")).rejects.toThrow("REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/vi/login");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.owned).not.toHaveBeenCalled();
  });
  it.each(["en", "vi"] as const)(
    "unverified pages deny before any public target or private data read in %s",
    async (locale) => {
      mocks.session.mockResolvedValue({ user: { id, emailVerified: false } });
      await Mine({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({}),
      });
      await History({ params: Promise.resolve({ locale, id }) });
      await Admin({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({}),
      });
      await Form({ params: Promise.resolve({ locale, slug: "public-work" }) });
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.work).not.toHaveBeenCalled();
      expect(mocks.target).not.toHaveBeenCalled();
    },
  );
  it("non-admin denial never reads private proposals", async () => {
    mocks.adminGuard.mockResolvedValue(null);
    await Admin({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("verified owner calls owner-only service with real request Headers", async () => {
    await Mine({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ page: "2" }),
    });
    await History({ params: Promise.resolve({ locale: "en", id }) });
    expect(mocks.list).toHaveBeenCalledWith({ page: 2, pageSize: 20 }, h);
    expect(mocks.owned).toHaveBeenCalledWith(id, h);
    expect(mocks.work).not.toHaveBeenCalled();
  });
  it("admin uses admin list flag and same headers for current aggregate", async () => {
    mocks.list.mockResolvedValue({
      items: [{ id, workId: id, revision: 1 }],
      total: 1,
    });
    mocks.work.mockResolvedValue(null);
    await Admin({
      params: Promise.resolve({ locale: "vi" }),
      searchParams: Promise.resolve({}),
    });
    expect(mocks.adminGuard).toHaveBeenCalledWith("vi");
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, h, true);
    expect(mocks.work).toHaveBeenCalledWith(id, h);
  });
  it("rejects malformed owned IDs before backend proposal query", async () => {
    await expect(
      History({ params: Promise.resolve({ locale: "en", id: "bad" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.owned).not.toHaveBeenCalled();
  });
  it("all scoped pages stay dynamic and non-indexable", () => {
    expect([mineDynamic, historyDynamic, adminDynamic, formDynamic]).toEqual(
      Array(4).fill("force-dynamic"),
    );
    for (const metadata of [
      mineMetadata,
      historyMetadata,
      adminMetadata,
      formMetadata,
    ])
      expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
