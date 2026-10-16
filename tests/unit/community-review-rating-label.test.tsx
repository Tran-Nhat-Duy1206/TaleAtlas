// @vitest-environment jsdom
// Real SSR -> hydrateRoot accessibility evidence; not native, auth, SQL or acceptance proof.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewForm } from "../../apps/web/src/components/community/ReviewForm";
import { useCommunityReady } from "../../apps/web/src/components/community/useCommunityReady";
import { reviewOwnedSchema } from "../../apps/web/src/features/community/review-http-contracts";
import { reviewCopy } from "../../apps/web/src/lib/review-i18n";

const workId = "60000000-0000-4000-8000-000000000001";
const owned = reviewOwnedSchema.parse({
  id: "60000000-0000-4000-8000-000000000002",
  workId,
  kind: "REVIEW",
  revision: 3,
  threadId: null,
  parentId: null,
  depth: null,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canEdit: true,
  canWithdraw: true,
});
const roots: Root[] = [],
  containers: HTMLElement[] = [];
const diagnostics: ReturnType<typeof vi.fn>[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
let uuid: ReturnType<typeof vi.spyOn>,
  errors: ReturnType<typeof vi.spyOn>,
  warnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Observe the real allocator and React diagnostics without replacing or suppressing them.
  uuid = vi.spyOn(globalThis.crypto, "randomUUID");
  errors = vi.spyOn(console, "error");
  warnings = vi.spyOn(console, "warn");
});
afterEach(async () => {
  try {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    for (const diagnostic of diagnostics.splice(0))
      expect(diagnostic).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
  } finally {
    for (const container of containers.splice(0)) container.remove();
    uuid.mockRestore();
    errors.mockRestore();
    warnings.mockRestore();
    vi.unstubAllGlobals();
  }
});
function ratingAssociation(container: HTMLElement) {
  const fields = container.querySelectorAll("select");
  expect(fields).toHaveLength(1);
  const select = fields.item(0);
  expect(select.id).not.toBe("");
  expect(select.labels).toHaveLength(1);
  const label = select.labels?.item(0);
  if (!label) throw new Error("One associated rating label is required");
  expect(label.htmlFor).toBe(select.id);
  expect(label.control).toBe(select);
  expect(container.querySelectorAll(`[id="${select.id}"]`)).toHaveLength(1);
  return { select, label };
}
function inert(container: HTMLElement) {
  for (const control of container.querySelectorAll(
    "button,input,textarea,select",
  ))
    expect(control).toBeDisabled();
  expect(ratingAssociation(container).select).toHaveValue("");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
}
function ssr(node: React.ReactNode) {
  const snapshots: boolean[] = [],
    commits: boolean[] = [];
  let observed: HTMLElement | undefined;
  function ReadinessProbe() {
    const ready = useCommunityReady();
    snapshots.push(ready);
    React.useLayoutEffect(() => {
      commits.push(ready);
      if (!ready) {
        if (!observed)
          throw new Error("SSR container must exist before hydration");
        inert(observed);
      }
    }, [ready]);
    return <>{node}</>;
  }
  const element = <ReadinessProbe />;
  const html = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  containers.push(container);
  observed = container;
  expect(snapshots).toEqual([false]);
  inert(container);
  return { container, element, snapshots, commits, ui: within(container) };
}
async function hydrate(view: ReturnType<typeof ssr>) {
  const onRecoverableError = vi.fn(),
    onCaughtError = vi.fn(),
    onUncaughtError = vi.fn();
  diagnostics.push(onRecoverableError, onCaughtError, onUncaughtError);
  await act(async () => {
    roots.push(
      hydrateRoot(view.container, view.element, {
        onRecoverableError,
        onCaughtError,
        onUncaughtError,
      }),
    );
  });
  expect(view.snapshots.slice(0, 2)).toEqual([false, false]);
  expect(view.snapshots.at(-1)).toBe(true);
  expect(view.commits[0]).toBe(false);
  expect(view.commits.at(-1)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
}
for (const locale of ["en", "vi"] as const) {
  const t = reviewCopy[locale];
  for (const mode of ["create", "edit"] as const) {
    describe(`${locale} ${mode} exact public rating label`, () => {
      function form() {
        return (
          <ReviewForm
            locale={locale}
            workId={workId}
            editing={mode === "edit" ? owned : undefined}
            onComplete={vi.fn()}
            onRestart={async () => {}}
          />
        );
      }
      it("SSR associates one disabled empty select with only the localized rating label, not option text", () => {
        const view = ssr(form());
        const { select, label } = ratingAssociation(view.container);
        expect(select.options).toHaveLength(11);
        expect(select.options.item(0)?.textContent).toBe(t.chooseRating);
        expect(select.options.item(0)?.disabled).toBe(true);
        expect(select.options.item(1)?.textContent).toBe(t.unrated);
        // Positive pre-fix counterexample: the real DOM label contains all option text.
        expect(label.textContent).toBe(t.rating);
        expect(label.querySelector("select")).toBeNull();
        expect(view.ui.getByLabelText(t.rating, { exact: true })).toBe(select);
        expect(select).toHaveValue("");
      });
      it("preserves the exact association and unchosen value through real hydration, then permits only deliberate fresh choices", async () => {
        const view = ssr(form());
        await hydrate(view);
        const { select, label } = ratingAssociation(view.container);
        expect(select).toBeEnabled();
        expect(select).toHaveValue("");
        // Exact DOM-text evidence is independent of testing-library's select-option exclusion.
        expect(label.textContent).toBe(t.rating);
        expect(label.querySelector("select")).toBeNull();
        expect(view.ui.getByLabelText(t.rating, { exact: true })).toBe(select);
        expect(view.ui.getByLabelText(t.reviewBody)).toHaveValue("");
        expect(view.ui.getByLabelText(t.intent)).not.toBeChecked();
        const publish = view.ui.getByRole("button", {
          name: mode === "edit" ? t.save : t.submit,
        });
        expect(publish).toBeDisabled();
        if (mode === "edit")
          expect(view.ui.getByLabelText(t.replacementIntent)).not.toBeChecked();
        fireEvent.change(select, { target: { value: "unrated" } });
        expect(select).toHaveValue("unrated");
        expect(publish).toBeDisabled();
        fireEvent.change(select, { target: { value: "8" } });
        expect(select).toHaveValue("8");
        expect(publish).toBeDisabled();
        fireEvent.change(view.ui.getByLabelText(t.reviewBody), {
          target: { value: "A deliberately written fresh public review." },
        });
        fireEvent.click(view.ui.getByLabelText(t.intent));
        if (mode === "edit") {
          expect(publish).toBeDisabled();
          fireEvent.click(view.ui.getByLabelText(t.replacementIntent));
        }
        expect(publish).toBeEnabled();
        expect(label.textContent).toBe(t.rating);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(uuid).not.toHaveBeenCalled();
      });
    });
  }
}
