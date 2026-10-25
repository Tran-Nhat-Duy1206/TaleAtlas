// @vitest-environment jsdom
// Mocked server-page/DOM contracts only; not visual, real-auth or SQL proof.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AggregateWork,
  CatalogPage,
  PublicGenreOptions,
} from "../../apps/web/src/features/catalog/contracts";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  headers: vi.fn(),
  session: vi.fn(),
  summaries: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props} data-next-link="true">
      {children}
    </a>
  ),
}));
vi.mock("@/server/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/catalog/service", () => ({
  getPublicCatalogPage: mocks.catalog,
}));
vi.mock("@/server/ingestion/request-public", () => ({
  findRequestSummaries: mocks.summaries,
}));

import WorksPage from "../../apps/web/src/app/[locale]/works/page";
import {
  publicCatalogQueryState,
  publicCopy,
} from "../../apps/web/src/components/catalog/query";
import { catalogDiscoveryCopy } from "../../apps/web/src/lib/catalog-discovery-i18n";
import { requestDictionary } from "../../apps/web/src/lib/request-i18n";
import type { PublicSearchParams } from "../../apps/web/src/components/catalog/query";

const requestHeaders = new Headers({ cookie: "synthetic-unit-session" });
const genreOptions: PublicGenreOptions = { items: [], overflow: false };
const publishedWork: AggregateWork = {
  id: "10000000-0000-4000-8000-000000000003",
  slug: "synthetic-public-work",
  primaryTitle: "Synthetic public work",
  primaryTitleLanguage: "en",
  displayTitle: "Synthetic public work",
  displayTitleLanguage: "en",
  format: "NOVEL",
  releaseStatus: "UNKNOWN",
  originalLanguage: "ja",
  country: null,
  publicationYear: null,
  publicationLabel: null,
  source: { label: "Synthetic source", citation: "Synthetic citation" },
  titles: [],
  descriptions: [],
  editions: [],
  creators: [],
  genres: [],
  cover: null,
  identifiers: [],
  relations: [],
};
const catalogResponse = (
  items: AggregateWork[],
  total = items.length,
  page = 1,
  pageSize = 20,
): {
  result: CatalogPage<AggregateWork>;
  genreOptions: PublicGenreOptions;
} => ({ result: { items, total, page, pageSize }, genreOptions });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue(catalogResponse([]));
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.session.mockResolvedValue(null);
  mocks.summaries.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 5,
  });
  mocks.notFound.mockImplementation(() => {
    throw new Error("NOT_FOUND");
  });
});

async function page(locale: "en" | "vi", search: PublicSearchParams = {}) {
  const holder = document.createElement("div");
  holder.innerHTML = renderToStaticMarkup(
    await WorksPage({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(search),
    }),
  );
  return { holder, ui: within(holder) };
}

for (const locale of ["en", "vi"] as const) {
  describe(`${locale} server public catalog states`, () => {
    const t = publicCopy[locale];
    const discovery = catalogDiscoveryCopy[locale];
    const requests = requestDictionary(locale);
    const filtered: PublicSearchParams = {
      q: "  Invented & title  ",
      format: "NOVEL",
      genre: "science-fiction",
      originalLanguage: "ZH-hant",
      releaseStatus: "UNKNOWN",
      pageSize: "7",
      page: "20",
    };

    it("isolates primary service failure, sanitizes output and retries validated query with native GET", async () => {
      mocks.catalog.mockRejectedValue(
        new Error("PRIVATE_DRIVER privateData SECRET connection/password"),
      );
      const { holder, ui } = await page(locale, filtered);
      expect(ui.getByRole("alert")).toHaveTextContent(t.loadError);
      const retry = ui.getByRole("link", { name: t.retryLoad });
      expect(retry).not.toHaveAttribute("data-next-link");
      expect(retry).toHaveAttribute(
        "href",
        `/${locale}/works?q=Invented+%26+title&format=NOVEL&genre=science-fiction&originalLanguage=ZH-hant&releaseStatus=UNKNOWN&pageSize=7&page=20`,
      );
      expect(mocks.catalog).toHaveBeenCalledExactlyOnceWith({
        locale,
        q: "Invented & title",
        format: "NOVEL",
        genre: "science-fiction",
        originalLanguage: "ZH-hant",
        releaseStatus: "UNKNOWN",
        pageSize: 7,
        page: 20,
      });
      expect(ui.queryByRole("status")).toBeNull();
      expect(ui.queryByRole("heading", { name: t.empty })).toBeNull();
      expect(ui.queryByRole("heading", { name: t.catalogEmpty })).toBeNull();
      expect(
        ui.queryByRole("heading", { name: discovery.emptyPage }),
      ).toBeNull();
      expect(ui.queryByRole("heading", { name: requests.missing })).toBeNull();
      expect(ui.queryByRole("link", { name: requests.new })).toBeNull();
      for (const text of [
        t.emptyText,
        t.catalogEmptyText,
        "PRIVATE_DRIVER",
        "privateData",
        "SECRET",
      ]) {
        expect(holder.textContent).not.toContain(text);
      }
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.summaries).not.toHaveBeenCalled();
    });

    it.each([
      { page: ["1", "2"], q: "poison" },
      { favorite: "false", page: "0", q: "poison" },
      { releaseStatus: "PRIVATE_DRIVER", q: "poison" },
      { pageSize: "51", q: "poison" },
      { page: "10002", pageSize: "1", q: "poison" },
    ] satisfies PublicSearchParams[])(
      "retains invalid-query fallback notice on failure: %j",
      async (search) => {
        mocks.catalog.mockRejectedValue(new Error("SECRET privateData"));
        const { holder, ui } = await page(locale, search);
        expect(ui.getByRole("note")).toHaveTextContent(discovery.invalidQuery);
        expect(ui.getByRole("alert")).toHaveTextContent(t.loadError);
        const retry = ui.getByRole("link", { name: t.retryLoad });
        expect(retry).toHaveAttribute(
          "href",
          `/${locale}/works?pageSize=20&page=1`,
        );
        expect(retry).not.toHaveAttribute("data-next-link");
        expect(mocks.catalog).toHaveBeenCalledExactlyOnceWith({
          locale,
          q: "",
          page: 1,
          pageSize: 20,
        });
        expect(holder.innerHTML).not.toContain("poison");
        expect(holder.innerHTML).not.toContain("PRIVATE_DRIVER");
        expect(holder.innerHTML).not.toContain("privateData");
        expect(ui.queryByRole("status")).toBeNull();
        expect(mocks.session).not.toHaveBeenCalled();
        expect(mocks.summaries).not.toHaveBeenCalled();
      },
    );

    it("renders actual default catalog results alongside an invalid-query fallback notice", async () => {
      mocks.catalog.mockResolvedValue(catalogResponse([publishedWork]));
      const { ui } = await page(locale, {
        genre: ["adventure", "science-fiction"],
      });
      expect(ui.getByRole("note")).toHaveTextContent(discovery.invalidQuery);
      expect(
        ui.getByRole("link", { name: publishedWork.displayTitle }),
      ).toHaveAttribute("href", `/${locale}/works/${publishedWork.slug}`);
      expect(ui.getByRole("status")).toHaveTextContent(`1 ${t.results}`);
      expect(ui.queryByRole("alert")).toBeNull();
      expect(ui.queryByRole("heading", { name: t.catalogEmpty })).toBeNull();
      expect(mocks.catalog).toHaveBeenCalledWith({
        locale,
        q: "",
        page: 1,
        pageSize: 20,
      });
    });

    it.each(["headers", "session", "summaries"] as const)(
      "does not erase good catalog results after secondary %s failure",
      async (failure) => {
        mocks.catalog.mockResolvedValue(catalogResponse([publishedWork]));
        mocks.session.mockResolvedValue({ user: { id: "synthetic-reader" } });
        mocks[failure].mockRejectedValue(
          new Error("PRIVATE_DRIVER privateData SECRET secondary error"),
        );
        const { holder, ui } = await page(locale, {
          q: "Invented title",
          format: "NOVEL",
        });
        expect(
          ui.getByRole("link", { name: publishedWork.displayTitle }),
        ).toHaveAttribute("href", `/${locale}/works/${publishedWork.slug}`);
        expect(ui.getByRole("status")).toHaveTextContent(`1 ${t.results}`);
        expect(
          ui.getByRole("heading", { name: requests.missing }),
        ).toHaveTextContent(requests.missing);
        expect(ui.getByRole("alert")).toHaveTextContent(requests.error);
        expect(ui.queryByRole("link", { name: t.retryLoad })).toBeNull();
        expect(holder.textContent).not.toContain(t.loadError);
        expect(holder.textContent).not.toContain("PRIVATE_DRIVER");
        expect(holder.textContent).not.toContain("privateData");
        expect(holder.textContent).not.toContain("SECRET");
        if (failure !== "summaries")
          expect(mocks.summaries).not.toHaveBeenCalled();
      },
    );

    it("keeps a nonblank query request prompt unique with title/format prefill", async () => {
      mocks.session.mockResolvedValue({ user: { id: "synthetic-reader" } });
      const { ui } = await page(locale, {
        q: "Invented & title",
        format: "NOVEL",
      });
      expect(ui.getByRole("heading", { name: t.empty })).toHaveTextContent(
        t.empty,
      );
      expect(ui.getByText(t.emptyText)).toHaveTextContent(t.emptyText);
      expect(ui.getAllByRole("link", { name: requests.new })).toHaveLength(1);
      expect(ui.getByRole("link", { name: requests.new })).toHaveAttribute(
        "href",
        `/${locale}/requests/new?q=Invented+%26+title&format=NOVEL`,
      );
      expect(mocks.summaries).toHaveBeenCalledExactlyOnceWith(
        { q: "Invented & title", page: 1, pageSize: 5 },
        requestHeaders,
      );
      const browse = ui.getByRole("link", { name: t.browseAll });
      expect(browse).toHaveAttribute("href", `/${locale}/works`);
      expect(browse).not.toHaveAttribute("data-next-link");
      expect(ui.getAllByRole("link", { name: t.reset })).toHaveLength(1);
    });

    it.each([{}, { q: "   " }, { page: "20", pageSize: "7" }])(
      "offers exactly one direct request action when the empty query is blank: %j",
      async (search) => {
        const query = publicCatalogQueryState(search, locale).query;
        mocks.catalog.mockResolvedValue(
          catalogResponse([], 0, query.page, query.pageSize),
        );
        const { ui } = await page(locale, search);
        const title = query.format ? t.empty : t.catalogEmpty;
        expect(
          ui.getByRole("heading", { level: 2, name: title }),
        ).toHaveTextContent(title);
        expect(ui.getAllByRole("link", { name: requests.new })).toHaveLength(1);
        expect(ui.getByRole("link", { name: requests.new })).toHaveAttribute(
          "href",
          `/${locale}/requests/new`,
        );
        expect(
          ui.queryByRole("heading", { name: requests.missing }),
        ).toBeNull();
        expect(ui.queryByRole("alert")).toBeNull();
        expect(mocks.headers).not.toHaveBeenCalled();
        expect(mocks.session).not.toHaveBeenCalled();
        expect(mocks.summaries).not.toHaveBeenCalled();
      },
    );

    it("keeps blank-q filtered no-match recovery focused on browsing without a request CTA", async () => {
      const { ui } = await page(locale, { format: "NOVEL" });
      expect(
        ui.getByRole("heading", { level: 2, name: t.empty }),
      ).toHaveTextContent(t.empty);
      expect(ui.getByText(t.emptyText)).toHaveTextContent(t.emptyText);
      expect(ui.queryByRole("link", { name: requests.new })).toBeNull();
      expect(ui.queryByRole("heading", { name: requests.missing })).toBeNull();
      const browse = ui.getByRole("link", { name: t.browseAll });
      expect(browse).toHaveAttribute("href", `/${locale}/works`);
      expect(browse).not.toHaveAttribute("data-next-link");
      expect(ui.getAllByRole("link", { name: t.reset })).toHaveLength(1);
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.summaries).not.toHaveBeenCalled();
    });

    it("preserves validated filters on successful nonzero-total empty-page recovery", async () => {
      mocks.catalog.mockResolvedValue(catalogResponse([], 21, 20, 7));
      const { ui } = await page(locale, filtered);
      expect(
        ui.getByRole("heading", { level: 2, name: discovery.emptyPage }),
      ).toHaveTextContent(discovery.emptyPage);
      expect(ui.getByRole("status")).toHaveTextContent(`21 ${t.results}`);
      expect(
        ui.getByRole("link", { name: discovery.firstPage }),
      ).toHaveAttribute(
        "href",
        `/${locale}/works?q=Invented+%26+title&format=NOVEL&genre=science-fiction&originalLanguage=ZH-hant&releaseStatus=UNKNOWN&pageSize=7&page=1`,
      );
      expect(ui.queryByRole("heading", { name: t.empty })).toBeNull();
      expect(ui.queryByRole("heading", { name: t.catalogEmpty })).toBeNull();
      expect(ui.queryByRole("navigation", { name: t.page })).toBeNull();
    });

    it("leaves failures outside the primary service read for the generic boundary", async () => {
      const failure = new Error("Synthetic route input failure");
      await expect(
        WorksPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.reject(failure),
        }),
      ).rejects.toBe(failure);
      expect(mocks.catalog).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
    });

    it("does not convert an invalid locale into a catalog load error", async () => {
      await expect(
        WorksPage({
          params: Promise.resolve({ locale: "invalid" }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow("NOT_FOUND");
      expect(mocks.catalog).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
    });
  });
}
