// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://catalog-cover.example.test/en/works/synthetic"}
// Real React SSR -> hydration and real Next/Image DOM/source-effect units only.
// jsdom's default resource loading is disabled: no browser/network acceptance,
// readiness/auth/SQL mocks, or native CPU/resource-causality claims.
import React from "react";
import Image from "../../apps/web/node_modules/next/image";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkCover } from "../../apps/web/src/components/catalog/WorkCover";
import type { AggregateWork } from "../../apps/web/src/features/catalog/contracts";

const fallback = "/images/work-placeholder.svg";
const origin = "https://catalog-cover.example.test";
// Bounded synthetic catalog fixture, following the public WorkInput shape in
// catalog-ui-hydration.test.tsx; no private library/V3 fixtures or server imports.
const work: AggregateWork = {
  id: "40000000-0000-4000-8000-000000000001",
  slug: "synthetic-catalog-cover",
  primaryTitle: "Invented catalog title",
  primaryTitleLanguage: "en",
  displayTitle: "Invented catalog title",
  displayTitleLanguage: "en",
  format: "NOVEL",
  releaseStatus: "UNKNOWN",
  originalLanguage: null,
  country: null,
  publicationYear: null,
  publicationLabel: null,
  source: {
    label: "Synthetic source",
    citation: "Invented synthetic citation for a catalog unit.",
  },
  titles: [],
  descriptions: [],
  creators: [],
  editions: [],
  genres: [],
  identifiers: [],
  relations: [],
  cover: null,
};
const approved: NonNullable<AggregateWork["cover"]> = {
  assetPath: "/covers/synthetic/first.webp",
  rights: "PUBLIC_DOMAIN",
  credit: "Synthetic public-domain cover credit",
  rightsStatement: "Invented rights citation for this local fixture only.",
};
const roots: Root[] = [];
const containers: HTMLElement[] = [];
const observers: MutationObserver[] = [];
let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  expect(document.location.href).toBe(`${origin}/en/works/synthetic`);
  // Observe actual diagnostics without suppressing them or replacing SDK code.
  consoleErrors = vi.spyOn(console, "error");
  consoleWarnings = vi.spyOn(console, "warn");
});
afterEach(async () => {
  try {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    expect(consoleErrors).not.toHaveBeenCalled();
    expect(consoleWarnings).not.toHaveBeenCalled();
  } finally {
    for (const observer of observers.splice(0)) observer.disconnect();
    for (const container of containers.splice(0)) container.remove();
    vi.restoreAllMocks();
  }
});
function server(node: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(node);
  document.body.append(container);
  containers.push(container);
  return { container, ui: within(container) };
}
async function hydrate(container: HTMLElement, node: React.ReactNode) {
  const errors = {
    onRecoverableError: vi.fn(),
    onCaughtError: vi.fn(),
    onUncaughtError: vi.fn(),
  };
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, node, errors);
    roots.push(root);
  });
  for (const callback of Object.values(errors))
    expect(callback).not.toHaveBeenCalled();
  return root;
}
function observeSource(image: HTMLImageElement) {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((changes) => records.push(...changes));
  observer.observe(image, {
    attributes: true,
    attributeFilter: ["src", "srcset"],
    attributeOldValue: true,
  });
  observers.push(observer);
  return records;
}
function assertImage(image: HTMLImageElement, alt: string) {
  expect(image).toHaveAttribute("width", "480");
  expect(image).toHaveAttribute("height", "640");
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("data-nimg", "1");
  expect(image).toHaveAttribute("alt", alt);
  // Real unoptimized SDK output, not an optimization proxy or responsive srcset.
  expect(image).not.toHaveAttribute("srcset");
  expect(image).not.toHaveAttribute("sizes");
}
function placeholderLabel(locale: "en" | "vi") {
  return locale === "vi"
    ? "Hình minh họa gốc của TaleAtlas — không phải bìa chính thức"
    : "Original TaleAtlas placeholder — not official cover artwork";
}

it("positive SDK baseline: noop onError rewrites relative SSR src to absolute during real hydration", async () => {
  const onError = vi.fn();
  const node = (
    <Image
      unoptimized
      src={fallback}
      alt="Synthetic SDK baseline"
      width={480}
      height={640}
      loading="lazy"
      onError={onError}
    />
  );
  const { container, ui } = server(node);
  const image = ui.getByRole("img") as HTMLImageElement;
  assertImage(image, "Synthetic SDK baseline");
  expect(image.getAttribute("src")).toBe(fallback);
  expect(image.src).toBe(`${origin}${fallback}`);
  const mutations = observeSource(image);
  await hydrate(container, node);
  expect(ui.getByRole("img")).toBe(image);
  expect(image.getAttribute("src")).toBe(`${origin}${fallback}`);
  expect(mutations.some((change) => change.attributeName === "src")).toBe(true);
  expect(
    mutations.find((change) => change.attributeName === "src")?.oldValue,
  ).toBe(fallback);
  expect(onError).not.toHaveBeenCalled();
  // The observed SDK retry *source effect* is not evidence of an HTTP request.
});

for (const locale of ["en", "vi"] as const) {
  describe(`${locale} real SDK catalog cover hydration`, () => {
    const rejected: Array<[string, AggregateWork["cover"]]> = [
      ["no cover", null],
      ["unknown rights", { ...approved, rights: "UNKNOWN" }],
      ["missing credit", { ...approved, credit: " " }],
      ["missing rights statement", { ...approved, rightsStatement: " " }],
      ["missing path", { ...approved, assetPath: undefined }],
      [
        "remote path",
        {
          ...approved,
          assetPath: "https://assets.example.test/synthetic.webp",
        },
      ],
      [
        "unvetted local path",
        { ...approved, assetPath: "/images/synthetic.webp" },
      ],
      [
        "traversal path",
        { ...approved, assetPath: "/covers/../synthetic.webp" },
      ],
    ];
    it.each(rejected)(
      "%s keeps the canonical relative placeholder with no hydration source mutation",
      async (_label, cover) => {
        const node = <WorkCover work={{ ...work, cover }} locale={locale} />;
        const { container, ui } = server(node);
        const image = ui.getByRole("img") as HTMLImageElement;
        const label = placeholderLabel(locale);
        assertImage(image, label);
        expect(image.getAttribute("src")).toBe(fallback);
        expect(container.querySelector("figcaption")).toHaveTextContent(label);
        const mutations = observeSource(image);
        await hydrate(container, node);
        expect(ui.getByRole("img")).toBe(image);
        assertImage(image, label);
        expect(image.getAttribute("src")).toBe(fallback);
        expect(mutations).toEqual([]);
        expect(container.querySelector("figcaption")).toHaveTextContent(label);
        await act(async () => {
          fireEvent.error(image);
        });
        expect(image.getAttribute("src")).toBe(fallback);
        expect(mutations).toEqual([]);
      },
    );
    it("preserves approved local cover output and deliberately falls back on an image error", async () => {
      const node = (
        <WorkCover work={{ ...work, cover: approved }} locale={locale} />
      );
      const { container, ui } = server(node);
      const image = ui.getByRole("img") as HTMLImageElement;
      const alt = `${locale === "vi" ? "Bìa của" : "Cover of"} ${work.displayTitle}`;
      assertImage(image, alt);
      expect(image.getAttribute("src")).toBe(approved.assetPath);
      expect(container.querySelector("figcaption")).toHaveTextContent(
        approved.credit!,
      );
      await hydrate(container, node);
      assertImage(image, alt);
      // Approved images retain their legitimate SDK onError preparation.
      expect(image.getAttribute("src")).toBe(`${origin}${approved.assetPath}`);
      expect(new URL(image.src).pathname).toBe(approved.assetPath);
      expect(container.querySelector("figcaption")).toHaveTextContent(
        approved.credit!,
      );
      await act(async () => {
        fireEvent.error(image);
      });
      expect(ui.getByRole("img")).toBe(image);
      expect(image.getAttribute("src")).toBe(fallback);
      assertImage(image, placeholderLabel(locale));
      expect(container.querySelector("figcaption")).toHaveTextContent(
        placeholderLabel(locale),
      );
      const mutations = observeSource(image);
      await act(async () => {
        fireEvent.error(image);
      });
      expect(image.getAttribute("src")).toBe(fallback);
      expect(mutations).toEqual([]);
    });
    it("does not let obsolete failed-path state lock a different approved cover or lose client prop values", async () => {
      const node = (
        <WorkCover work={{ ...work, cover: approved }} locale={locale} />
      );
      const { container, ui } = server(node);
      const root = await hydrate(container, node);
      const image = ui.getByRole("img") as HTMLImageElement;
      await act(async () => {
        fireEvent.error(image);
      });
      expect(image.getAttribute("src")).toBe(fallback);
      const nextWork: AggregateWork = {
        ...work,
        displayTitle: "Invented client-updated title",
        cover: {
          ...approved,
          assetPath: "/covers/synthetic/second.png",
          credit: "Synthetic client-updated credit",
          rights: "PERMISSION",
        },
      };
      await act(async () => {
        root.render(<WorkCover work={nextWork} locale={locale} />);
      });
      expect(ui.getByRole("img")).toBe(image);
      expect(image.getAttribute("src")).toBe(nextWork.cover!.assetPath);
      assertImage(
        image,
        `${locale === "vi" ? "Bìa của" : "Cover of"} ${nextWork.displayTitle}`,
      );
      expect(container.querySelector("figcaption")).toHaveTextContent(
        nextWork.cover!.credit!,
      );
      // Rerendering the same client values must not revive the old failure.
      await act(async () => {
        root.render(<WorkCover work={nextWork} locale={locale} />);
      });
      expect(image.getAttribute("src")).toBe(nextWork.cover!.assetPath);
      expect(container.querySelector("figcaption")).toHaveTextContent(
        nextWork.cover!.credit!,
      );
      await act(async () => {
        fireEvent.error(image);
      });
      expect(image.getAttribute("src")).toBe(fallback);
      assertImage(image, placeholderLabel(locale));
    });
  });
}
