// @vitest-environment jsdom
// Mocked server-page authority/projection units, not browser or SQL acceptance.
import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  libraryCopy,
  statuses,
} from "../../apps/web/src/components/library/copy";
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
let hydratedRoot: Root | undefined;
let hydratedHolder: HTMLDivElement | undefined;
afterEach(async () => {
  if (hydratedRoot) await act(async () => hydratedRoot!.unmount());
  hydratedRoot = undefined;
  hydratedHolder?.remove();
  hydratedHolder = undefined;
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
    it(`renders accessible native GET filters and empty defaults ${locale}`, async () => {
      const holder = document.createElement("div");
      holder.innerHTML = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({}),
        }),
      );
      const form = holder.querySelector("form")!;
      expect(form.getAttribute("method")).toBe("get");
      expect(form.getAttribute("action")).toBe(`/${locale}/library`);
      expect([...new FormData(form).entries()]).toEqual([
        ["status", ""],
        ["favorite", ""],
        ["sort", "UPDATED_DESC"],
      ]);
      for (const [name, label] of [
        ["status", t.status],
        ["favorite", t.favorite],
        ["sort", t.sort],
      ]) {
        const control = form.querySelector<HTMLSelectElement>(
          `select[name="${name}"]`,
        )!;
        expect(control.labels?.[0].textContent).toContain(label);
        expect(control.disabled).toBe(false);
      }
      expect(form.querySelector("button")?.type).toBe("submit");
      expect(form.querySelector("button")?.textContent).toBe(t.apply);
      expect(form.querySelector("a")?.getAttribute("href")).toBe(
        `/${locale}/library`,
      );
      expect(form.querySelector("a")?.textContent).toBe(t.reset);
      expect(holder.textContent).toContain(t.empty);
      expect(holder.querySelectorAll("ul > li")).toHaveLength(0);
    });

    it(`keeps every status/sort and explicit false in native form serialization ${locale}`, async () => {
      for (const status of statuses) {
        for (const sort of [
          "UPDATED_DESC",
          "ADDED_DESC",
          "TITLE_ASC",
          "RATING_DESC",
        ]) {
          const holder = document.createElement("div");
          holder.innerHTML = renderToStaticMarkup(
            await List({
              params: Promise.resolve({ locale }),
              searchParams: Promise.resolve({
                status,
                favorite: "false",
                sort,
                page: "3",
              }),
            }),
          );
          const form = holder.querySelector("form")!;
          expect(Object.fromEntries(new FormData(form))).toEqual({
            status,
            favorite: "false",
            sort,
          });
          expect(form.querySelector('[name="page"]')).toBeNull();
          expect(mocks.list).toHaveBeenLastCalledWith(
            { page: 3, locale, status, favorite: false, sort },
            h,
          );
          const favorite =
            form.querySelector<HTMLSelectElement>('[name="favorite"]')!;
          favorite.value = "true";
          expect(new FormData(form).get("favorite")).toBe("true");
          expect(form.querySelector("a")?.getAttribute("href")).toBe(
            `/${locale}/library`,
          );
        }
      }
    });

    it(`keeps populated unavailable entries private while filters remain usable ${locale}`, async () => {
      mocks.list.mockResolvedValue({
        page: 1,
        pageSize: 50,
        hasNext: false,
        total: 1,
        items: [hidden],
      });
      const holder = document.createElement("div");
      holder.innerHTML = renderToStaticMarkup(
        await List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(holder.querySelectorAll("ul > li")).toHaveLength(1);
      expect(holder.querySelector("li h2")?.textContent).toBe(t.unavailable);
      expect(holder.textContent).not.toContain(t.empty);
      expect(holder.innerHTML).not.toContain("SECRET");
      expect(holder.innerHTML).not.toContain("secret-slug");
      expect(holder.querySelector('a[href*="/works/"]')).toBeNull();
      expect(holder.querySelector("form select")).not.toBeNull();
    });

    it(`denies an anonymous list before service reads and preserves its filter return ${locale}`, async () => {
      mocks.session.mockRejectedValue(new AuthorizationError(401));
      await expect(
        List({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({
            favorite: "false",
            sort: "TITLE_ASC",
            page: "2",
          }),
        }),
      ).rejects.toThrow("REDIRECT");
      expect(mocks.redirect).toHaveBeenCalledWith(
        `/${locale}/login?callbackURL=${encodeURIComponent(`/${locale}/library?favorite=false&sort=TITLE_ASC&page=2`)}`,
      );
      expect(mocks.list).not.toHaveBeenCalled();
    });

    it(`resets hydrated select values when a new server query commits ${locale}`, async () => {
      const selected = {
        status: "WANT_TO_READ",
        favorite: "false",
        sort: "ADDED_DESC",
      };
      const selectedPage = await List({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve(selected),
      });
      hydratedHolder = document.createElement("div");
      document.body.append(hydratedHolder);
      // Hydration requires React's text-boundary markers; static markup omits them.
      hydratedHolder.innerHTML = renderToString(selectedPage);
      const recoveries: unknown[] = [];
      await act(async () => {
        hydratedRoot = hydrateRoot(hydratedHolder!, selectedPage, {
          onRecoverableError: (error) => recoveries.push(error),
        });
      });
      expect(
        Object.fromEntries(new FormData(hydratedHolder.querySelector("form")!)),
      ).toEqual(selected);
      const resetPage = await List({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({}),
      });
      // Model a new RSC element committing after server filter state changes. This is
      // React re-render evidence, not proof of a real Next navigation/backend.
      await act(async () => hydratedRoot!.render(resetPage));
      expect(
        Object.fromEntries(new FormData(hydratedHolder.querySelector("form")!)),
      ).toEqual({
        status: "",
        favorite: "",
        sort: "UPDATED_DESC",
      });
      expect(recoveries).toEqual([]);
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
