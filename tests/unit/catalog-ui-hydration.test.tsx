// @vitest-environment jsdom
// Actual SSR -> hydrateRoot units, not native/auth/SQL acceptance evidence.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkEditor } from "../../apps/web/src/components/catalog/WorkEditor";
import { useClientReady } from "../../apps/web/src/components/useClientReady";
import { catalogDictionary } from "../../apps/web/src/lib/catalog-i18n";
import type { WorkInputPayload } from "../../apps/web/src/features/catalog/contracts";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const id = "40000000-0000-4000-8000-000000000001";
const initial: WorkInputPayload = {
  primaryTitle: "Invented catalog title",
  primaryTitleLanguage: "en",
  format: "NOVEL",
  visibility: "DRAFT",
  releaseStatus: "UNKNOWN",
  source: {
    label: "Synthetic source",
    citation: "Invented synthetic citation for a catalog unit.",
  },
  cover: { rights: "UNKNOWN" },
  titles: [],
  descriptions: [],
  creators: [],
  editions: [],
  genres: [],
  identifiers: [],
  relations: [],
};
const roots: Root[] = [],
  containers: HTMLElement[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  router.replace.mockReset();
  router.refresh.mockReset();
});
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
});
function server(node: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(node);
  document.body.append(container);
  containers.push(container);
  return { container, ui: within(container) };
}
async function hydrate(container: HTMLElement, node: React.ReactNode) {
  const recoverable = vi.fn();
  await act(async () => {
    roots.push(
      hydrateRoot(container, node, { onRecoverableError: recoverable }),
    );
  });
  expect(recoverable).not.toHaveBeenCalled();
}
const ok = () => ({ ok: true, status: 200, json: async () => ({ id }) });

it("uses false SSR/first hydration snapshot then true client without effects or requests", async () => {
  const seen: boolean[] = [];
  function Probe() {
    const ready = useClientReady();
    seen.push(ready);
    return <output>{String(ready)}</output>;
  }
  const node = <Probe />;
  const { container } = server(node);
  expect(container.textContent).toBe("false");
  seen.length = 0;
  await hydrate(container, node);
  expect(seen[0]).toBe(false);
  expect(seen.at(-1)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

for (const locale of ["en", "vi"] as const) {
  const d = catalogDictionary(locale);
  describe(`${locale} catalog handler readiness`, () => {
    for (const mode of ["create", "edit"] as const) {
      it(`${mode} SSR controls are inert; hydration retains values and unchecked acknowledgement without automatic work`, async () => {
        const node = (
          <WorkEditor
            locale={locale}
            initial={initial}
            {...(mode === "edit" ? { id, revision: 3 } : {})}
          />
        );
        const { container, ui } = server(node);
        for (const control of container.querySelectorAll(
          "input, select, textarea, button",
        ))
          expect(control).toBeDisabled();
        expect(ui.getByRole("checkbox")).not.toBeChecked();
        expect(fetchMock).not.toHaveBeenCalled();
        await hydrate(container, node);
        expect(ui.getByRole("button", { name: d.save })).toBeEnabled();
        expect(ui.getByLabelText(d.primaryTitle)).toHaveValue(
          initial.primaryTitle,
        );
        expect(ui.getByLabelText(d.citation)).toHaveValue(
          initial.source.citation,
        );
        expect(ui.getByRole("checkbox")).not.toBeChecked();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(router.refresh).not.toHaveBeenCalled();
        expect(router.replace).not.toHaveBeenCalled();
      });
    }
    it("explicit edit preserves revision, payload and credentials with no automatic mutation", async () => {
      const node = (
        <WorkEditor locale={locale} initial={initial} id={id} revision={3} />
      );
      const { container, ui } = server(node);
      await hydrate(container, node);
      fireEvent.change(ui.getByLabelText(d.primaryTitle), {
        target: { value: "Invented renamed title" },
      });
      fetchMock.mockResolvedValue(ok());
      await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/admin/catalog/works/${id}`);
      expect(request.method).toBe("PATCH");
      expect(request.credentials).toBe("same-origin");
      expect(JSON.parse(request.body)).toMatchObject({
        primaryTitle: "Invented renamed title",
        revision: 3,
        publicationReviewAcknowledged: false,
        source: initial.source,
      });
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    it("published mutation still requires deliberate acknowledgement", async () => {
      const node = (
        <WorkEditor locale={locale} initial={initial} id={id} revision={3} />
      );
      const { container, ui } = server(node);
      await hydrate(container, node);
      fireEvent.change(ui.getByLabelText(d.visibility), {
        target: { value: "PUBLISHED" },
      });
      await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(ui.getByRole("status")).toHaveTextContent(d.reviewRequired);
      fireEvent.click(ui.getByRole("checkbox"));
      fetchMock.mockResolvedValue(ok());
      await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(fetchMock.mock.calls[0][1].body)
          .publicationReviewAcknowledged,
      ).toBe(true);
    });
    it("explicit create and visibility-only actions preserve routes and no copied acknowledgement", async () => {
      const create = <WorkEditor locale={locale} initial={initial} />;
      const first = server(create);
      await hydrate(first.container, create);
      fetchMock.mockResolvedValue(ok());
      await act(async () => {
        fireEvent.submit(first.container.querySelector("form")!);
      });
      expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/catalog/works");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(router.replace).toHaveBeenCalledWith(
        `/${locale}/admin/works/${id}`,
      );
      fetchMock.mockClear();
      const edit = (
        <WorkEditor locale={locale} initial={initial} id={id} revision={3} />
      );
      const second = server(edit);
      await hydrate(second.container, edit);
      await act(async () => {
        fireEvent.click(
          second.ui.getByRole("button", { name: d.applyVisibility }),
        );
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/admin/catalog/works/${id}/visibility`,
      );
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        visibility: "DRAFT",
        revision: 3,
        publicationReviewAcknowledged: false,
      });
    });
    it("pending lock prevents duplicates and conflict leaves editing disabled until deliberate reload", async () => {
      const node = (
        <WorkEditor locale={locale} initial={initial} id={id} revision={3} />
      );
      const { container, ui } = server(node);
      await hydrate(container, node);
      let resolve!: (response: unknown) => void;
      fetchMock.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
        fireEvent.submit(container.querySelector("form")!);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(ui.getByLabelText(d.primaryTitle)).toBeDisabled();
      await act(async () => {
        resolve({ ok: false, status: 409 });
      });
      expect(ui.getByLabelText(d.primaryTitle)).toBeDisabled();
      expect(ui.getByRole("button", { name: d.reload })).toBeEnabled();
      expect(ui.getByRole("status")).toHaveTextContent(d.conflict);
      expect(router.refresh).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
}
