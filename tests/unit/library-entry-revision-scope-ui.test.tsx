// @vitest-environment jsdom
// Actual SSR/hydrateRoot with mocked real-method HTTP, not native/auth/PG acceptance.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryRevisionScope } from "../../apps/web/src/components/library/EntryRevisionScope";
import { EntryControls } from "../../apps/web/src/components/library/EntryControls";
import { PersonalControls } from "../../apps/web/src/components/library/PersonalControls";
import { libraryCopy } from "../../apps/web/src/components/library/copy";
import { personalCopy } from "../../apps/web/src/components/library/personal-copy";
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const id = "70000000-0000-4000-8000-000000000001";
const workId = "70000000-0000-4000-8000-000000000002";
const mutationKey = "70000000-0000-4000-8000-000000000003";
const privateNotes = "INVENTED PRIVATE EDITOR NOTES";
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});
const personal = (revision: number, notes = "") => ({
  id,
  workId,
  revision,
  archived: false,
  notes,
  ratingHalfStars: null,
});
const entryResult = {
  id,
  workId,
  revision: 2,
  status: "READING",
  favorite: false,
  archived: false,
  createdAt: null,
  updatedAt: null,
  hasCompletedRead: false,
  currentSession: null,
  work: { available: false, id: workId },
};
let root: Root | undefined;
let container: HTMLDivElement | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => mutationKey) });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  cleanup();
  vi.unstubAllGlobals();
});
for (const locale of ["en", "vi"] as const)
  describe(locale, () => {
    it("fences siblings before dispatch and through deferred refresh; only the freshly loaded revision can submit the deliberate rating", async () => {
      const initialGet = vi
        .fn()
        .mockResolvedValue(response(personal(1, privateNotes)));
      let resolveSecondGet!: (value: unknown) => void;
      const secondGet = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSecondGet = resolve;
          }),
      );
      let resolveEntry!: (value: unknown) => void;
      const entryWrites = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveEntry = resolve;
          }),
      );
      const personalWrites = vi
        .fn()
        .mockResolvedValue(response({ ...personal(2), ratingHalfStars: 2 }));
      let readCount = 0;
      const fetch = vi.fn((url: string, options: RequestInit) => {
        if (url.includes("/personal")) {
          if (options.method === "GET")
            return ++readCount === 1 ? initialGet() : secondGet();
          return personalWrites(url, options);
        }
        return entryWrites(url, options);
      });
      vi.stubGlobal("fetch", fetch);
      function view(revision: number) {
        return (
          <EntryRevisionScope
            key={`scope:${id}:${workId}:${locale}`}
            revision={revision}
          >
            <EntryControls
              key={`entry:${id}:${revision}`}
              locale={locale}
              entry={{
                id,
                workId,
                revision,
                status: revision === 1 ? "WANT_TO_READ" : "READING",
                favorite: false,
                hasCompletedRead: false,
                currentSession: null,
              }}
            />
            <PersonalControls
              key={`personal:${id}:${revision}`}
              locale={locale}
              seed={{ id, workId, revision, archived: false }}
            />
          </EntryRevisionScope>
        );
      }
      container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = renderToString(view(1));
      expect(container.innerHTML).not.toContain(privateNotes);
      expect(fetch).not.toHaveBeenCalled();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
      await act(async () => {
        root = hydrateRoot(container!, view(1));
      });
      const save = () =>
        screen.getByRole("button", {
          name: personalCopy[locale].save,
          exact: true,
        });
      await waitFor(() => expect(save()).toBeEnabled());
      const rating = screen.getByRole("combobox", {
        name: personalCopy[locale].rating,
        exact: true,
      });
      const notes = screen.getByRole("textbox", {
        name: personalCopy[locale].notes,
        exact: true,
      });
      expect(notes).toHaveValue(privateNotes);
      fireEvent.change(
        screen.getByRole("combobox", {
          name: libraryCopy[locale].status,
          exact: true,
        }),
        { target: { value: "READING" } },
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: libraryCopy[locale].save,
          exact: true,
        }),
      );
      // The sibling fence starts before the initiating request resolves, not in an effect.
      expect(entryWrites).toHaveBeenCalledTimes(1);
      expect(save()).toBeDisabled();
      expect(rating).toBeDisabled();
      expect(rating).toHaveValue("");
      expect(notes).toHaveValue("");
      const blockedForm = save().closest("form")!;
      fireEvent.change(rating, { target: { value: "2" } });
      fireEvent.submit(blockedForm);
      expect(personalWrites).not.toHaveBeenCalled();
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveEntry(response(entryResult));
      });
      expect(navigation.refresh).toHaveBeenCalledTimes(1);
      // Original race window: response complete, RSC refresh has not committed yet.
      expect(save()).toBeDisabled();
      fireEvent.submit(blockedForm);
      expect(personalWrites).not.toHaveBeenCalled();
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      await act(async () => {
        root!.render(view(2));
      });
      expect(secondGet).toHaveBeenCalledTimes(1);
      expect(save()).toBeDisabled();
      expect(
        screen.getByRole("textbox", {
          name: personalCopy[locale].notes,
          exact: true,
        }),
      ).toHaveValue("");
      expect(personalWrites).not.toHaveBeenCalled();
      await act(async () => {
        resolveSecondGet(response(personal(2)));
      });
      await waitFor(() => expect(save()).toBeEnabled());
      const freshRating = screen.getByRole("combobox", {
        name: personalCopy[locale].rating,
        exact: true,
      });
      expect(freshRating).toHaveValue("");
      fireEvent.change(freshRating, { target: { value: "2" } });
      fireEvent.click(save());
      await waitFor(() => expect(personalWrites).toHaveBeenCalledTimes(1));
      const payload = JSON.parse(String(personalWrites.mock.calls[0]![1].body));
      expect(payload).toEqual({
        revision: 2,
        mutationKey,
        patch: { ratingHalfStars: 2, notes: "" },
      });
      expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(save()).toBeEnabled());
      expect(freshRating).toHaveValue("2");
    });
  });
