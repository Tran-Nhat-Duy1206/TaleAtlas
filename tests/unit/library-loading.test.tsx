// @vitest-environment jsdom
// Actual React SSR/hydration + real Next hook with injected router context.
// This unit does not claim a full Next server, authenticated page, or database.
import type { ContextType } from "react";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PathParamsContext } from "../../apps/web/node_modules/next/dist/shared/lib/hooks-client-context.shared-runtime";
import LibraryLoading from "../../apps/web/src/app/[locale]/library/loading";
import { dictionary, type Locale } from "../../apps/web/src/lib/i18n";

type Params = ContextType<typeof PathParamsContext>;
const expected = { en: "Loading…", vi: "Đang tải…" } as const;
let root: Root | undefined;
function loading(params: Params) {
  return (
    <PathParamsContext.Provider value={params}>
      <LibraryLoading />
    </PathParamsContext.Provider>
  );
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("lang");
});

describe.each(["en", "vi"] as const)("%s Library loading", (locale) => {
  it("server-renders only the selected route language and accessible status", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToString(loading({ locale }));
    const statuses = holder.querySelectorAll('[role="status"]');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].textContent).toBe(expected[locale]);
    expect(statuses[0].getAttribute("lang")).toBe(locale);
    expect(holder.textContent).not.toContain(
      expected[locale === "en" ? "vi" : "en"],
    );
    expect(holder.textContent).not.toContain(dictionary(locale).loading);
    expect(holder.textContent).not.toContain(" / ");
  });

  it("hydrates the same server copy without recoverable errors or language replacement", async () => {
    const holder = document.createElement("div");
    document.body.append(holder);
    const element = loading({ locale });
    holder.innerHTML = renderToString(element);
    const before = holder.innerHTML;
    const recoveries: unknown[] = [];
    const observed = [holder.textContent];
    const observer = new MutationObserver(() =>
      observed.push(holder.textContent),
    );
    observer.observe(holder, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    try {
      await act(async () => {
        root = hydrateRoot(holder, element, {
          onRecoverableError: (error) => recoveries.push(error),
        });
      });
      expect(recoveries).toEqual([]);
      expect(holder.innerHTML).toBe(before);
      expect(holder.querySelector('[role="status"]')?.textContent).toBe(
        expected[locale],
      );
      expect(observed.every((text) => text === expected[locale])).toBe(true);
    } finally {
      observer.disconnect();
    }
  });

  it("uses router context rather than document language", () => {
    const other = locale === "en" ? "vi" : "en";
    document.documentElement.lang = other;
    const holder = document.createElement("div");
    holder.innerHTML = renderToString(loading({ locale }));
    expect(holder.querySelector('[role="status"]')?.textContent).toBe(
      expected[locale],
    );
    document.documentElement.removeAttribute("lang");
  });
});

it("updates the selected locale directly through the real Next context after hydration", async () => {
  const holder = document.createElement("div");
  document.body.append(holder);
  holder.innerHTML = renderToString(loading({ locale: "en" }));
  const recoveries: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(holder, loading({ locale: "en" }), {
      onRecoverableError: (error) => recoveries.push(error),
    });
  });
  for (const locale of ["vi", "en"] as Locale[]) {
    await act(async () => root!.render(loading({ locale })));
    expect(holder.querySelector('[role="status"]')?.textContent).toBe(
      expected[locale],
    );
    expect(holder.querySelector('[role="status"]')?.getAttribute("lang")).toBe(
      locale,
    );
  }
  expect(recoveries).toEqual([]);
});

it.each<Params>([
  null,
  {},
  { locale: "" },
  { locale: "fr" },
  { locale: "EN" },
  { locale: "en-US" },
  { locale: "../vi" },
  { locale: ["vi"] },
  { locale: [] },
])(
  "does not invent an English fallback for invalid router context %j",
  (params) => {
    expect(renderToString(loading(params))).toBe("");
  },
);
