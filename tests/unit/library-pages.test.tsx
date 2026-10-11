// @vitest-environment jsdom
// Mocked server-page authority/projection units, not browser or SQL acceptance.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  session: vi.fn(),
  redirect: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  controls: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/server/session", () => {
  class AuthorizationError extends Error {
    constructor(public status: number) {
      super("AUTH");
    }
  }
  return { AuthorizationError, requireSession: mocks.session };
});
vi.mock("@/server/library/service", () => ({
  listLibraryEntries: mocks.list,
  getLibraryEntry: mocks.detail,
}));
vi.mock("@/components/catalog/WorkCover", () => ({
  WorkCover: () => <span>cover</span>,
}));
vi.mock("@/components/library/EntryControls", () => ({
  EntryControls: (props: unknown) => {
    mocks.controls(props);
    return <span>controls</span>;
  },
}));
import { AuthorizationError } from "../../apps/web/src/server/session";
import List, {
  metadata as listMetadata,
  dynamic as listDynamic,
} from "../../apps/web/src/app/[locale]/library/page";
import Detail, {
  metadata as detailMetadata,
  dynamic as detailDynamic,
} from "../../apps/web/src/app/[locale]/library/[id]/page";
import { libraryCopy } from "../../apps/web/src/components/library/copy";
const id = "10000000-0000-4000-8000-000000000001",
  workId = "10000000-0000-4000-8000-000000000002";
const h = new Headers({ cookie: "test-not-production" });
const hidden = {
  id,
  workId,
  revision: 1,
  status: "READING",
  favorite: false,
  archived: false,
  work: {
    available: false,
    id: workId,
    displayTitle: "SECRET hidden title",
    slug: "secret-slug",
  },
  notes: "SECRET notes",
  ratingHalfStars: 8,
  hasCompletedRead: false,
  currentSession: {
    id,
    state: "ACTIVE",
    kind: "FIRST_READ",
    notes: "SECRET session notes",
    chapterNumber: 14,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(h);
  mocks.session.mockResolvedValue({ user: { id, emailVerified: true } });
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
  mocks.list.mockResolvedValue({
    page: 1,
    pageSize: 50,
    hasNext: false,
    total: 0,
    items: [],
  });
  mocks.detail.mockResolvedValue(hidden);
});
describe("private library pages", () => {
  it("have static private metadata and dynamic rendering without personal facts", () => {
    expect(listDynamic).toBe("force-dynamic");
    expect(detailDynamic).toBe("force-dynamic");
    expect(listMetadata.robots).toEqual({ index: false, follow: false });
    expect(detailMetadata.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify([listMetadata, detailMetadata])).not.toContain(
      "SECRET",
    );
    expect(mocks.session).not.toHaveBeenCalled();
  });
  for (const locale of ["en", "vi"] as const) {
    const t = libraryCopy[locale];
    it(`anonymous detail preserves same-locale original entry ${locale}`, async () => {
      mocks.session.mockRejectedValue(new AuthorizationError(401));
      await expect(
        Detail({ params: Promise.resolve({ locale, id }) }),
      ).rejects.toThrow("REDIRECT");
      expect(mocks.redirect).toHaveBeenCalledWith(
        `/${locale}/login?callbackURL=${encodeURIComponent(`/${locale}/library/${id}`)}`,
      );
      expect(mocks.detail).not.toHaveBeenCalled();
    });
    it(`unverified/auth unavailable deny before private reads ${locale}`, async () => {
      mocks.session.mockResolvedValue({ user: { id, emailVerified: false } });
      let html = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain(t.denied);
      expect(mocks.list).not.toHaveBeenCalled();
      mocks.session.mockRejectedValue(new Error("SECRET authentication error"));
      html = renderToStaticMarkup(
        await Detail({ params: Promise.resolve({ locale, id }) }),
      );
      expect(html).toContain(t.denied);
      expect(html).not.toContain("SECRET");
      expect(mocks.detail).not.toHaveBeenCalled();
    });
    it(`friendly empty and invalid query controls ${locale}`, async () => {
      const html = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ favorite: "false", page: "400" }),
        }),
      );
      expect(html).toContain(t.empty);
      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ favorite: false, page: 400, locale }),
        h,
      );
      mocks.list.mockClear();
      const invalid = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ page: ["1", "2"] }),
        }),
      );
      expect(invalid).toContain(t.invalid);
      expect(mocks.list).not.toHaveBeenCalled();
    });
    it(`never leaks hidden titles or future private props ${locale}`, async () => {
      mocks.list.mockResolvedValue({
        page: 1,
        pageSize: 50,
        hasNext: true,
        total: 51,
        items: [hidden],
      });
      const html = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ favorite: "false" }),
        }),
      );
      expect(html).toContain(t.unavailable);
      expect(html).not.toContain("SECRET");
      expect(html).not.toContain("secret-slug");
      expect(html).not.toContain("cover");
      expect(html).toContain("favorite=false");
      expect(html).toContain(t.next);
      const detail = renderToStaticMarkup(
        await Detail({ params: Promise.resolve({ locale, id }) }),
      );
      expect(detail).toContain(t.unavailable);
      expect(detail).not.toContain("SECRET");
      expect(mocks.controls).toHaveBeenCalledWith({
        locale,
        entry: {
          id,
          workId,
          revision: 1,
          status: "READING",
          favorite: false,
          hasCompletedRead: false,
          currentSession: { state: "ACTIVE" },
        },
      });
    });
    it(`service error is localized and never rendered raw ${locale}`, async () => {
      mocks.list.mockRejectedValue(new Error("SECRET database query"));
      const html = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain(t.error);
      expect(html).not.toContain("SECRET");
    });
  }
});
