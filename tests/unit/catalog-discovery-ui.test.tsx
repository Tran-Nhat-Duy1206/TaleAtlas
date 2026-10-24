// @vitest-environment jsdom
// Native DOM/SSR contract units; not browser layout or PostgreSQL acceptance.
import React from "react";
import { renderToString } from "react-dom/server";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RELEASE_STATUSES,
  WORK_FORMATS,
} from "../../packages/database/src/catalog-types";
import { PublicCatalog } from "../../apps/web/src/components/catalog/PublicCatalog";
import styles from "../../apps/web/src/components/catalog/catalog.module.css";
import { publicCatalogQueryState } from "../../apps/web/src/components/catalog/query";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { catalogDiscoveryCopy } from "../../apps/web/src/lib/catalog-discovery-i18n";
import {
  formatLabels,
  releaseLabels,
} from "../../apps/web/src/lib/catalog-i18n";
import type {
  AggregateWork,
  ParsedCatalogQuery,
  PublicGenreOptions,
} from "../../apps/web/src/features/catalog/contracts";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const serverContainers: HTMLElement[] = [];
afterEach(() => {
  cleanup();
  for (const container of serverContainers.splice(0)) container.remove();
});

const genreOptions: PublicGenreOptions = {
  items: [
    {
      slug: "science-fiction",
      nameEn: "Science fiction",
      nameVi: "Khoa học viễn tưởng",
    },
    { slug: "adventure", nameEn: "Adventure", nameVi: "Phiêu lưu" },
  ],
  overflow: false,
};
const work = (title: string, slug: string): AggregateWork => ({
  id: slug,
  slug,
  primaryTitle: title,
  primaryTitleLanguage: "en",
  displayTitle: title,
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
});

const submittedFilters = (query: ParsedCatalogQuery) => ({
  q: query.q,
  format: query.format ?? "",
  genre: query.genre ?? "",
  originalLanguage: query.originalLanguage ?? "",
  releaseStatus: query.releaseStatus ?? "",
  pageSize: String(query.pageSize),
});
const editUnsentFilters = (form: HTMLFormElement) => {
  for (const [name, value] of Object.entries({
    q: "Unsent",
    format: "MANGA",
    originalLanguage: "ja",
    releaseStatus: "COMPLETED",
  })) {
    fireEvent.change(form.querySelector(`[name="${name}"]`)!, {
      target: { value },
    });
  }
  const genre = form.querySelector<HTMLSelectElement>("#catalog-genre")!;
  if (!genre.disabled)
    fireEvent.change(genre, { target: { value: "adventure" } });
};

for (const locale of ["en", "vi"] as const) {
  describe(`${locale} native catalog discovery`, () => {
    const t = catalogDiscoveryCopy[locale];
    const existing = publicCopy[locale];
    const query: ParsedCatalogQuery = {
      locale,
      q: "Invented title",
      page: 2,
      pageSize: 10,
      format: "NOVEL",
      genre: "science-fiction",
      originalLanguage: "zh-Hant",
      releaseStatus: "UNKNOWN",
    };
    const props = {
      locale,
      query,
      genreOptions,
      result: { items: [], total: 0, page: 1, pageSize: 10 },
    };

    it.each([false, true])(
      "keeps full-width descriptions outside the control wrappers (overflow=%s)",
      (overflow) => {
        for (const populated of [false, true]) {
          const container = document.createElement("div");
          container.innerHTML = renderToString(
            <PublicCatalog
              {...props}
              genreOptions={{ ...genreOptions, overflow }}
              result={{
                items: populated
                  ? [work("Synthetic result", "synthetic-result")]
                  : [],
                total: populated ? 1 : 0,
                page: 1,
                pageSize: 10,
              }}
            />,
          );
          document.body.append(container);
          serverContainers.push(container);
          const form = container.querySelector("form")!;
          const language = within(form).getByRole("textbox", {
            name: t.originalLanguage,
          });
          const help = form.querySelector<HTMLParagraphElement>(
            "#catalog-original-language-help",
          )!;
          expect(
            form.querySelectorAll("#catalog-original-language-help"),
          ).toHaveLength(1);
          expect(language).toHaveAttribute("aria-describedby", help.id);
          expect(language).toHaveAccessibleDescription(t.originalLanguageHelp);
          expect(language.parentElement).not.toContainElement(help);
          const area = help.parentElement!;
          expect(area).toHaveClass(styles.filterHelp);
          expect(area.parentElement).toBe(form);
          expect(form.lastElementChild).toBe(area);
          const genre = within(form).getByRole("combobox", { name: t.genre });
          const capacity = form.querySelector<HTMLParagraphElement>(
            "#catalog-genre-capacity",
          );
          if (overflow) {
            expect(
              form.querySelectorAll("#catalog-genre-capacity"),
            ).toHaveLength(1);
            expect(capacity?.parentElement).toBe(area);
            expect(genre.parentElement).not.toContainElement(capacity);
            expect(genre).toBeDisabled();
            expect(genre).not.toHaveAttribute("name");
            expect(genre).toHaveAttribute("aria-describedby", capacity!.id);
            expect(genre).toHaveAccessibleDescription(t.genreCapacity);
            expect(area.children).toHaveLength(2);
          } else {
            expect(capacity).toBeNull();
            expect(genre).not.toHaveAttribute("aria-describedby");
            expect(area.children).toHaveLength(1);
          }
          container.remove();
        }
      },
    );

    it.each([false, true])(
      "preserves exact successful filter values and native parser roundtrip (overflow=%s)",
      (overflow) => {
        const selected = {
          ...query,
          genre: "unlisted-genre",
          originalLanguage: "ZH-hant",
        };
        const { container } = render(
          <PublicCatalog
            {...props}
            query={selected}
            genreOptions={{ ...genreOptions, overflow }}
          />,
        );
        const form = container.querySelector("form")!;
        const values = Object.fromEntries(new FormData(form)) as Record<
          string,
          string
        >;
        expect(values).toEqual({
          q: selected.q,
          format: selected.format,
          genre: selected.genre,
          originalLanguage: selected.originalLanguage,
          releaseStatus: selected.releaseStatus,
          pageSize: "10",
        });
        expect(new FormData(form).getAll("genre")).toEqual([selected.genre]);
        expect(new FormData(form).has("page")).toBe(false);
        const parsed = publicCatalogQueryState(values, locale);
        expect(parsed.invalid).toBe(false);
        expect(parsed.query).toEqual({ ...selected, page: 1 });
        expect(
          within(form).getByRole("link", { name: existing.reset }),
        ).toHaveAttribute("href", `/${locale}/works`);
      },
    );

    for (const overflow of [false, true]) {
      describe(`committed filter identity (overflow=${overflow})`, () => {
        const changes: [string, Partial<ParsedCatalogQuery>][] = [
          [
            "search with delimiters",
            { q: 'Changed | [query] "quoted" \\ tag' },
          ],
          ["format", { format: "MANGA" }],
          ["genre", { genre: "adventure" }],
          ["missing genre", { genre: undefined }],
          ["exact language case", { originalLanguage: "ZH-hant" }],
          ["missing language", { originalLanguage: undefined }],
          ["missing status versus UNKNOWN", { releaseStatus: undefined }],
          ["locale", { locale: locale === "en" ? "vi" : "en" }],
        ];
        it.each(changes)(
          "rebinds all fields when committed %s changes",
          (_name, change) => {
            const options = { ...genreOptions, overflow };
            const { container, rerender } = render(
              <PublicCatalog {...props} genreOptions={options} />,
            );
            const before = container.querySelector("form")!;
            editUnsentFilters(before);
            const next = { ...query, ...change };
            rerender(
              <PublicCatalog
                {...props}
                locale={next.locale}
                query={next}
                genreOptions={options}
              />,
            );
            const after = container.querySelector("form")!;
            expect(after).not.toBe(before);
            expect(after).toHaveAttribute("action", `/${next.locale}/works`);
            expect(Object.fromEntries(new FormData(after))).toEqual(
              submittedFilters(next),
            );
            expect(new FormData(after).getAll("genre")).toEqual([
              next.genre ?? "",
            ]);
            expect(new FormData(after).has("page")).toBe(false);
            const displayedGenre =
              after.querySelector<HTMLSelectElement>("#catalog-genre")!;
            expect(displayedGenre.disabled).toBe(overflow);
            expect(displayedGenre).toHaveValue(next.genre ?? "");
            if (overflow)
              expect(
                within(displayedGenre).getByRole("option"),
              ).toHaveTextContent(
                next.genre
                  ? catalogDiscoveryCopy[next.locale].selectedGenre(next.genre)
                  : catalogDiscoveryCopy[next.locale].genresUnavailable,
              );
          },
        );

        it.each([
          ["page", { page: 3 }],
          ["pageSize", { pageSize: 7 }],
        ] as const)(
          "preserves form and drafts when only pagination %s changes",
          (_name, change) => {
            const options = { ...genreOptions, overflow };
            const { container, rerender } = render(
              <PublicCatalog {...props} genreOptions={options} />,
            );
            const before = container.querySelector("form")!;
            const search = before.querySelector('[name="q"]');
            editUnsentFilters(before);
            const draft = Object.fromEntries(new FormData(before));
            const next = { ...query, ...change };
            rerender(
              <PublicCatalog {...props} query={next} genreOptions={options} />,
            );
            const after = container.querySelector("form")!;
            expect(after).toBe(before);
            expect(after.querySelector('[name="q"]')).toBe(search);
            expect(Object.fromEntries(new FormData(after))).toEqual({
              ...draft,
              pageSize: String(next.pageSize),
            });
            expect(new FormData(after).getAll("genre")).toEqual([draft.genre]);
            expect(new FormData(after).has("page")).toBe(false);
          },
        );

        it("distinguishes committed explicit UNKNOWN from an absent release filter in both directions", () => {
          const options = { ...genreOptions, overflow };
          const absent = { ...query, releaseStatus: undefined };
          const { container, rerender } = render(
            <PublicCatalog {...props} query={absent} genreOptions={options} />,
          );
          const first = container.querySelector("form")!;
          editUnsentFilters(first);
          rerender(<PublicCatalog {...props} genreOptions={options} />);
          const explicit = container.querySelector("form")!;
          expect(explicit).not.toBe(first);
          expect(Object.fromEntries(new FormData(explicit))).toEqual(
            submittedFilters(query),
          );
          editUnsentFilters(explicit);
          rerender(
            <PublicCatalog {...props} query={absent} genreOptions={options} />,
          );
          const last = container.querySelector("form")!;
          expect(last).not.toBe(explicit);
          expect(Object.fromEntries(new FormData(last))).toEqual(
            submittedFilters(absent),
          );
        });
      });
    }

    it("uses a native Reset anchor rather than a same-URL client router transition", () => {
      const output = PublicCatalog(props);
      const form = React.Children.toArray(output.props.children).find(
        (child) => React.isValidElement(child) && child.type === "form",
      );
      expect(React.isValidElement(form)).toBe(true);
      if (!React.isValidElement<{ children: React.ReactNode }>(form))
        throw new Error("Expected Catalog form element");
      const reset = React.Children.toArray(form.props.children).find(
        (child) =>
          React.isValidElement<{ href?: string }>(child) &&
          child.props.href === `/${locale}/works`,
      );
      expect(React.isValidElement(reset)).toBe(true);
      if (!React.isValidElement(reset)) throw new Error("Expected Reset link");
      expect(reset.type).toBe("a");
    });

    it("SSR renders labeled native controls with localized names and exact machine values", () => {
      const container = document.createElement("div");
      container.innerHTML = renderToString(<PublicCatalog {...props} />);
      document.body.append(container);
      serverContainers.push(container);
      const ui = within(container);
      const genre = ui.getByRole("combobox", { name: t.genre });
      expect(genre.tagName).toBe("SELECT");
      expect(genre).toHaveValue("science-fiction");
      expect(
        within(genre).getByRole("option", { name: t.allGenres }),
      ).toHaveValue("");
      for (const item of genreOptions.items) {
        expect(
          within(genre).getByRole("option", {
            name: locale === "vi" ? item.nameVi : item.nameEn,
          }),
        ).toHaveValue(item.slug);
      }
      expect(container.querySelector('input[name="genre"]')).toBeNull();
      const language = ui.getByRole("textbox", { name: t.originalLanguage });
      expect(language).toHaveValue("zh-Hant");
      expect(language).toHaveAttribute("maxlength", "63");
      expect(language).toHaveAttribute(
        "pattern",
        "[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*",
      );
      expect(language).toHaveAccessibleDescription(t.originalLanguageHelp);
      const release = ui.getByRole("combobox", { name: t.releaseStatus });
      expect(release).toHaveValue("UNKNOWN");
      expect(
        within(release).getByRole("option", { name: t.allStatuses }),
      ).toHaveValue("");
      for (const status of RELEASE_STATUSES) {
        expect(
          within(release).getByRole("option", {
            name: releaseLabels[locale][status],
          }),
        ).toHaveValue(status);
      }
      expect(within(release).getAllByRole("option")).toHaveLength(
        RELEASE_STATUSES.length + 1,
      );
      const format = ui.getByRole("combobox", { name: existing.format });
      expect(format).toHaveValue("NOVEL");
      for (const value of WORK_FORMATS) {
        expect(
          within(format).getByRole("option", {
            name: formatLabels[locale][value],
          }),
        ).toHaveValue(value);
      }
      expect(ui.getByRole("searchbox", { name: existing.search })).toHaveValue(
        query.q,
      );
    });

    it("accepts the recorded DB tag grammar and blank without normalizing language case", () => {
      const { container } = render(<PublicCatalog {...props} />);
      const input = screen.getByRole<HTMLInputElement>("textbox", {
        name: t.originalLanguage,
      });
      for (const value of [
        "",
        "ja",
        "ZH-hant",
        "abcdefgh-a",
        "en-1",
        `abcdefg${"-12345678".repeat(6)}-a`,
      ]) {
        fireEvent.change(input, { target: { value } });
        expect(input.checkValidity()).toBe(true);
        expect(
          new FormData(container.querySelector("form")!).get(
            "originalLanguage",
          ),
        ).toBe(value);
      }
      for (const value of [
        "j",
        "en_US",
        " en",
        "en ",
        "en-",
        "englishhh",
        "en-123456789",
      ]) {
        fireEvent.change(input, { target: { value } });
        expect(input.checkValidity()).toBe(false);
      }
    });

    it("keeps absent valid selected slugs as explicit fallback options without guessing names", () => {
      const slug = "unlisted-genre";
      render(<PublicCatalog {...props} query={{ ...query, genre: slug }} />);
      const genre = screen.getByRole("combobox", { name: t.genre });
      expect(genre).toHaveValue(slug);
      expect(
        within(genre).getByRole("option", { name: t.selectedGenre(slug) }),
      ).toHaveValue(slug);
      expect(within(genre).getAllByRole("option")).toHaveLength(4);
    });

    it("escapes fallback content rather than rendering it as markup", () => {
      const slug = '<img src=x onerror="alert(1)">';
      const { container } = render(
        <PublicCatalog {...props} query={{ ...query, genre: slug }} />,
      );
      expect(
        screen.getByRole("option", { name: t.selectedGenre(slug) }),
      ).toHaveValue(slug);
      expect(container.querySelector("img")).toBeNull();
    });

    it.each(["science-fiction", "unlisted-genre", undefined])(
      "overflow hides ALL partial choices and retains selected filter %s in a hidden input",
      (genre) => {
        const { container } = render(
          <PublicCatalog
            {...props}
            query={{ ...query, genre }}
            genreOptions={{ ...genreOptions, overflow: true }}
          />,
        );
        const selector = screen.getByRole("combobox", { name: t.genre });
        expect(selector).toBeDisabled();
        expect(selector).toHaveAccessibleDescription(t.genreCapacity);
        expect(within(selector).getAllByRole("option")).toHaveLength(1);
        expect(within(selector).getByRole("option")).toHaveTextContent(
          genre ? t.selectedGenre(genre) : t.genresUnavailable,
        );
        for (const item of genreOptions.items) {
          expect(
            within(selector).queryByRole("option", { name: item.nameEn }),
          ).toBeNull();
          expect(
            within(selector).queryByRole("option", { name: item.nameVi }),
          ).toBeNull();
        }
        expect(screen.getByText(t.genreCapacity)).toBeVisible();
        expect(
          container.querySelector('input[type="hidden"][name="genre"]'),
        ).toHaveValue(genre ?? "");
        expect(
          new FormData(container.querySelector("form")!).getAll("genre"),
        ).toEqual([genre ?? ""]);
      },
    );

    it("shows explicit invalid-query defaults notice without inventing a zero-result state", () => {
      render(
        <PublicCatalog
          {...props}
          invalidQuery
          result={{
            items: [work("Default result", "default-result")],
            total: 21,
            page: 1,
            pageSize: 10,
          }}
        />,
      );
      expect(screen.getByRole("note")).toHaveTextContent(t.invalidQuery);
      expect(screen.getByRole("status")).toHaveTextContent(
        `21 ${existing.results}`,
      );
      expect(
        screen.queryByRole("heading", { name: existing.empty }),
      ).toBeNull();
      expect(
        screen.getByRole("link", { name: "Default result" }),
      ).toBeVisible();
    });

    it("keeps actual zero-result copy distinct from an out-of-range empty page", () => {
      render(<PublicCatalog {...props} />);
      expect(
        screen.getByRole("heading", { name: existing.empty }),
      ).toBeVisible();
      expect(screen.getByText(existing.emptyText)).toBeVisible();
      expect(screen.queryByRole("heading", { name: t.emptyPage })).toBeNull();
      expect(screen.queryByRole("note")).toBeNull();
    });

    it("offers first-page recovery with filters for page 20 of 3 instead of misleading pagination", () => {
      render(
        <PublicCatalog
          {...props}
          query={{ ...query, page: 20 }}
          result={{ items: [], total: 21, page: 20, pageSize: 10 }}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        `21 ${existing.results}`,
      );
      expect(screen.getByRole("heading", { name: t.emptyPage })).toBeVisible();
      expect(screen.getByText(t.emptyPageText)).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: existing.empty }),
      ).toBeNull();
      expect(
        screen.queryByRole("navigation", { name: existing.page }),
      ).toBeNull();
      expect(screen.queryByText(`${existing.page} 20 / 3`)).toBeNull();
      const first = screen.getByRole("link", { name: t.firstPage });
      const url = new URL(first.getAttribute("href")!, "https://example.test");
      expect(url.pathname).toBe(`/${locale}/works`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        q: query.q,
        format: "NOVEL",
        genre: "science-fiction",
        originalLanguage: "zh-Hant",
        releaseStatus: "UNKNOWN",
        pageSize: "10",
        page: "1",
      });
    });

    it("apply is a native GET without page, retains pageSize and exact values; clear is the bare URL", () => {
      const { container } = render(<PublicCatalog {...props} />);
      const form = container.querySelector("form")!;
      expect(form).toHaveAttribute("method", "get");
      expect(form).toHaveAttribute("action", `/${locale}/works`);
      expect(
        screen.getByRole("button", { name: existing.apply }),
      ).toHaveAttribute("type", "submit");
      fireEvent.change(
        screen.getByRole("textbox", { name: t.originalLanguage }),
        { target: { value: "ZH-hant" } },
      );
      fireEvent.change(
        screen.getByRole("combobox", { name: t.releaseStatus }),
        { target: { value: "COMPLETED" } },
      );
      fireEvent.change(screen.getByRole("combobox", { name: t.genre }), {
        target: { value: "adventure" },
      });
      const data = new FormData(form);
      expect(data.has("page")).toBe(false);
      expect(Object.fromEntries(data)).toEqual({
        q: query.q,
        format: "NOVEL",
        genre: "adventure",
        originalLanguage: "ZH-hant",
        releaseStatus: "COMPLETED",
        pageSize: "10",
      });
      expect(
        screen.getByRole("link", { name: existing.reset }),
      ).toHaveAttribute("href", `/${locale}/works`);
    });

    it("blank language/status mean all; UNKNOWN remains a distinct selectable machine value", () => {
      const { container } = render(
        <PublicCatalog
          {...props}
          query={{
            ...query,
            originalLanguage: undefined,
            releaseStatus: undefined,
          }}
        />,
      );
      const language = screen.getByRole("textbox", {
        name: t.originalLanguage,
      });
      const release = screen.getByRole("combobox", { name: t.releaseStatus });
      expect(language).toHaveValue("");
      expect(release).toHaveValue("");
      fireEvent.change(release, { target: { value: "UNKNOWN" } });
      expect(
        new FormData(container.querySelector("form")!).get("releaseStatus"),
      ).toBe("UNKNOWN");
      fireEvent.change(release, { target: { value: "" } });
      expect(
        new FormData(container.querySelector("form")!).get("releaseStatus"),
      ).toBe("");
    });

    it("preserves result ordering, cards, request prompt and filtered pagination", () => {
      render(
        <PublicCatalog
          {...props}
          requestPrompt={<aside>Request prompt</aside>}
          result={{
            items: [
              work("Ranked first", "ranked-first"),
              work("Ranked second", "ranked-second"),
            ],
            total: 25,
            page: 2,
            pageSize: 10,
          }}
        />,
      );
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((node) => node.textContent),
      ).toEqual(["Ranked first", "Ranked second"]);
      expect(
        screen.getByRole("link", { name: "Ranked first" }),
      ).toHaveAttribute("href", `/${locale}/works/ranked-first`);
      expect(screen.getByText("Request prompt")).toBeVisible();
      const nav = screen.getByRole("navigation", { name: existing.page });
      expect(nav).toHaveTextContent(`${existing.page} 2 / 3`);
      for (const [name, page] of [
        [existing.previous, "1"],
        [existing.next, "3"],
      ]) {
        const link = within(nav).getByRole("link", { name });
        const params = new URL(
          link.getAttribute("href")!,
          "https://example.test",
        ).searchParams;
        expect(params.get("page")).toBe(page);
        expect(params.get("originalLanguage")).toBe("zh-Hant");
        expect(params.get("releaseStatus")).toBe("UNKNOWN");
        expect(params.get("genre")).toBe("science-fiction");
      }
    });
  });
}
