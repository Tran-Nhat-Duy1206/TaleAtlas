// @vitest-environment jsdom
// Mocked client transport units only; not browser/SQL acceptance.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  EntryControls,
  type EntryControlData,
} from "../../apps/web/src/components/library/EntryControls";
import { OwnWorkLibrary } from "../../apps/web/src/components/library/OwnWorkLibrary";
import {
  libraryCopy,
  statuses,
} from "../../apps/web/src/components/library/copy";
import {
  libraryPageQuery,
  libraryPageHref,
} from "../../apps/web/src/components/library/query";
import { requestSignInReturn } from "../../apps/web/src/lib/request-return";
import type { Locale } from "../../apps/web/src/lib/i18n";
import { libraryHttpPatchSchema } from "../../apps/web/src/features/library/http-contracts";
const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const id = "10000000-0000-4000-8000-000000000001",
  workId = "10000000-0000-4000-8000-000000000002",
  key = "10000000-0000-4000-8000-000000000003";
const entry: EntryControlData = {
  id,
  workId,
  revision: 1,
  status: "WANT_TO_READ",
  favorite: false,
  hasCompletedRead: false,
  currentSession: null,
};
const result = {
  ...entry,
  archived: false,
  createdAt: null,
  updatedAt: null,
  work: { available: false, id: workId },
};
const ok = (data: unknown = result) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ message: "SECRET backend text" }),
});
let transport: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  transport = vi.fn().mockResolvedValue(ok());
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => key) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function submit(locale: Locale) {
  fireEvent.submit(
    screen
      .getByRole("button", { name: libraryCopy[locale].save })
      .closest("form")!,
  );
}
function body(index = 0) {
  return JSON.parse(transport.mock.calls[index][1].body);
}
for (const locale of ["en", "vi"] as const)
  describe(locale, () => {
    const t = libraryCopy[locale];
    it("renders all truthful status controls and real boolean favorite", async () => {
      render(<EntryControls locale={locale} entry={entry} />);
      for (const status of statuses)
        expect(
          screen.getByRole("option", { name: t.labels[status] }),
        ).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText(t.favorite));
      submit(locale);
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
      expect(body()).toEqual({
        revision: 1,
        mutationKey: key,
        patch: { status: "WANT_TO_READ", favorite: true },
      });
      expect(libraryHttpPatchSchema.safeParse(body()).success).toBe(true);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
    it("plan to read truthfully pauses and resumes the same unfinished attempt", () => {
      render(
        <EntryControls
          locale={locale}
          entry={{
            ...entry,
            status: "READING",
            currentSession: { state: "ACTIVE" },
          }}
        />,
      );
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "WANT_TO_READ" },
      });
      const expected =
        locale === "en"
          ? "Plan to read pauses an unfinished attempt and preserves progress. Reading resumes the same attempt."
          : "Dự định đọc sẽ tạm ngưng lượt đọc dang dở và giữ tiến độ. Đang đọc sẽ tiếp tục cùng lượt đọc đó.";
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
    it("fences second commands during delayed refresh and rebinds persisted values", async () => {
      transport.mockResolvedValueOnce(
        ok({ ...result, revision: 2, status: "ON_HOLD", favorite: true }),
      );
      const view = render(
        <EntryControls key="1" locale={locale} entry={entry} />,
      );
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "ON_HOLD" },
      });
      fireEvent.click(screen.getByLabelText(t.favorite));
      const form = screen
        .getByRole("button", { name: t.save })
        .closest("form")!;
      fireEvent.submit(form);
      await waitFor(() =>
        expect(screen.getByText(t.refreshing)).toBeInTheDocument(),
      );
      expect(screen.getByLabelText(t.status)).toBeDisabled();
      expect(screen.getByLabelText(t.favorite)).toBeDisabled();
      expect(screen.getByLabelText(t.confirm)).toBeDisabled();
      fireEvent.submit(form);
      expect(transport).toHaveBeenCalledOnce();
      // No RSC arrives: manual refresh remains outside the disabled command fields.
      const recovery = screen.getByRole("button", { name: t.refresh });
      expect(recovery).toBeEnabled();
      fireEvent.click(recovery);
      fireEvent.click(recovery);
      expect(nav.refresh).toHaveBeenCalledTimes(3);
      expect(transport).toHaveBeenCalledOnce();
      expect(screen.getByLabelText(t.status)).toBeDisabled();
      view.rerender(
        <EntryControls
          key="2"
          locale={locale}
          entry={{ ...entry, revision: 2, status: "ON_HOLD", favorite: true }}
        />,
      );
      expect(screen.getByLabelText(t.status)).toBeEnabled();
      expect(screen.getByLabelText(t.status)).toHaveValue("ON_HOLD");
      expect(screen.getByLabelText(t.favorite)).toBeChecked();
      expect(screen.queryByText(t.refreshing)).not.toBeInTheDocument();
      submit(locale);
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      expect(body(1).revision).toBe(2);
    });
    it("leaves identical-revision no-op success unlocked", async () => {
      render(<EntryControls locale={locale} entry={entry} />);
      submit(locale);
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
      expect(screen.getByLabelText(t.status)).toBeEnabled();
      expect(screen.queryByText(t.refreshing)).not.toBeInTheDocument();
      submit(locale);
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    });
    it("rejects a regressed response revision before success or refresh", async () => {
      transport.mockResolvedValueOnce(ok({ ...result, revision: 1 }));
      render(
        <EntryControls locale={locale} entry={{ ...entry, revision: 2 }} />,
      );
      submit(locale);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t.error),
      );
      expect(nav.refresh).not.toHaveBeenCalled();
      expect(screen.queryByText(t.saved)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: t.retry })).toBeEnabled();
      expect(screen.getByLabelText(t.status)).toBeDisabled();
    });
    it("requires explicitly unchecked removal confirmation and preserves visible entry until response", async () => {
      let resolve!: (value: unknown) => void;
      transport.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      render(<EntryControls locale={locale} entry={entry} />);
      expect(screen.getByLabelText(t.confirm)).not.toBeChecked();
      expect(screen.getByRole("button", { name: t.archive })).toBeDisabled();
      fireEvent.click(screen.getByLabelText(t.confirm));
      fireEvent.click(screen.getByRole("button", { name: t.archive }));
      expect(body()).toEqual({
        revision: 1,
        mutationKey: key,
        confirmRemoval: true,
      });
      expect(screen.getByRole("button", { name: t.archive })).toBeDisabled();
      expect(screen.queryByText(t.archived)).not.toBeInTheDocument();
      resolve(ok({ ...result, archived: true }));
      await waitFor(() =>
        expect(screen.getByText(t.archived)).toBeInTheDocument(),
      );
      expect(nav.refresh).not.toHaveBeenCalled();
    });
    it("requires acknowledged new attempt after completion", async () => {
      render(
        <EntryControls
          locale={locale}
          entry={{ ...entry, status: "COMPLETED", hasCompletedRead: true }}
        />,
      );
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "READING" },
      });
      expect(screen.getByLabelText(t.reread)).not.toBeChecked();
      submit(locale);
      expect(transport).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText(t.reread));
      submit(locale);
      await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
      expect(body().acknowledgeReread).toBe(true);
    });
    it("does not infer reread for paused unfinished attempt and explains completed without dates", () => {
      const view = render(
        <EntryControls
          locale={locale}
          entry={{
            ...entry,
            status: "ON_HOLD",
            hasCompletedRead: true,
            currentSession: { state: "PAUSED" },
          }}
        />,
      );
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "READING" },
      });
      expect(screen.queryByText(t.reread)).not.toBeInTheDocument();
      view.unmount();
      render(<EntryControls locale={locale} entry={entry} />);
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "COMPLETED" },
      });
      expect(screen.getByText(t.completedHint)).toBeInTheDocument();
    });
    it("explains hold and dropped progress preservation", () => {
      render(<EntryControls locale={locale} entry={entry} />);
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "ON_HOLD" },
      });
      expect(screen.getByText(t.holdHint)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(t.status), {
        target: { value: "DROPPED" },
      });
      expect(screen.getByText(t.dropHint)).toBeInTheDocument();
    });
    it("reuses exact command after ambiguous error and freezes payload", async () => {
      transport.mockRejectedValueOnce(new Error("SECRET"));
      render(<EntryControls locale={locale} entry={entry} />);
      submit(locale);
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: t.retry }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByLabelText(t.favorite)).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: t.retry }));
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
      expect(transport.mock.calls[0][1].body).toBe(
        transport.mock.calls[1][1].body,
      );
      expect(crypto.randomUUID).toHaveBeenCalledOnce();
      expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
    });
    it.each([{}, { ...result, favorite: "false" }])(
      "rejects malformed successful JSON before refresh",
      async (data) => {
        transport.mockResolvedValue(ok(data));
        render(<EntryControls locale={locale} entry={entry} />);
        submit(locale);
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(t.error),
        );
        expect(nav.refresh).not.toHaveBeenCalled();
        expect(
          screen.getByRole("button", { name: t.retry }),
        ).toBeInTheDocument();
      },
    );
    it("retains entry and exact deletion command after unreadable successful JSON", async () => {
      transport.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("SECRET invalid JSON");
        },
      });
      transport.mockResolvedValueOnce(ok({ ...result, archived: true }));
      render(<EntryControls locale={locale} entry={entry} />);
      fireEvent.click(screen.getByLabelText(t.confirm));
      fireEvent.click(screen.getByRole("button", { name: t.archive }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t.error),
      );
      expect(screen.queryByText(t.archived)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: t.retry }));
      await waitFor(() =>
        expect(screen.getByText(t.archived)).toBeInTheDocument(),
      );
      expect(transport.mock.calls[0][1].body).toBe(
        transport.mock.calls[1][1].body,
      );
    });
    it("widget freezes and reuses add payload after ambiguous response", async () => {
      transport
        .mockResolvedValueOnce(ok(null))
        .mockRejectedValueOnce(new Error("SECRET network"));
      render(
        <OwnWorkLibrary workId={workId} locale={locale} slug="published" />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: t.add })).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: t.add }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: t.retry }),
        ).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: t.retry }));
      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: t.detail }),
        ).toBeInTheDocument(),
      );
      expect(transport.mock.calls[1][1].body).toBe(
        transport.mock.calls[2][1].body,
      );
      expect(crypto.randomUUID).toHaveBeenCalledOnce();
    });
    it("drains body and prevents concurrent commands", async () => {
      let resolve!: (value: unknown) => void;
      transport.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          new Promise((r) => {
            resolve = r;
          }),
      });
      render(<EntryControls locale={locale} entry={entry} />);
      const form = screen
        .getByRole("button", { name: t.save })
        .closest("form")!;
      fireEvent.submit(form);
      fireEvent.submit(form);
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      expect(nav.refresh).not.toHaveBeenCalled();
      resolve(result);
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
    });
    it("shows stale recovery and rebinds to refreshed revision", async () => {
      transport.mockResolvedValueOnce(fail(409));
      const view = render(
        <EntryControls key="1" locale={locale} entry={entry} />,
      );
      submit(locale);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t.stale),
      );
      expect(screen.getByRole("button", { name: t.save })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: t.refresh }));
      view.rerender(
        <EntryControls
          key="2"
          locale={locale}
          entry={{ ...entry, revision: 2 }}
        />,
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      submit(locale);
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      expect(body(1).revision).toBe(2);
    });
    it("shows private auth error without raw backend text", async () => {
      transport.mockResolvedValue(fail(401));
      render(<EntryControls locale={locale} entry={entry} />);
      submit(locale);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t.denied),
      );
      expect(screen.getByRole("link", { name: t.login })).toHaveAttribute(
        "href",
        `/${locale}/login?callbackURL=${encodeURIComponent(`/${locale}/library/${id}`)}`,
      );
    });
    it("anonymous widget keeps public catalog accessible and shows sign in", async () => {
      transport.mockResolvedValue(fail(401));
      render(
        <OwnWorkLibrary workId={workId} locale={locale} slug="published" />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(t.loading);
      await waitFor(() =>
        expect(screen.getByRole("link", { name: t.login })).toBeInTheDocument(),
      );
      expect(transport.mock.calls[0][1].cache).toBe("no-store");
      expect(screen.queryByText(t.labels.READING)).not.toBeInTheDocument();
    });
    it("restores archived state with revision and no owner id", async () => {
      transport.mockResolvedValueOnce(
        ok({
          id,
          revision: 7,
          archived: true,
          status: "READING",
          favorite: false,
        }),
      );
      render(
        <OwnWorkLibrary workId={workId} locale={locale} slug="published" />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: t.restore }),
        ).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: t.restore }));
      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: t.detail }),
        ).toBeInTheDocument(),
      );
      expect(body(1)).toEqual({ workId, revision: 7, mutationKey: key });
    });
  });
describe("query and sign-in return controls", () => {
  it("keeps favorite false distinct and exact fixed 50 page limit", () => {
    expect(
      libraryPageQuery({ favorite: "false", page: "400" }, "vi"),
    ).toMatchObject({ favorite: false, page: 400, pageSize: 50 });
    expect(libraryPageQuery({ status: "", favorite: "" }, "en")).toMatchObject({
      page: 1,
    });
    expect(
      libraryPageHref("vi", { favorite: false, sort: "TITLE_ASC" }, 2),
    ).toBe("/vi/library?page=2&sort=TITLE_ASC&favorite=false");
  });
  it.each([
    { page: "401" },
    { page: "01" },
    { page: ["1", "2"] },
    { favorite: "0" },
    { search: "hidden title" },
    { userId: id },
    { sort: "bad" },
  ])("rejects unknown/duplicate/malformed queries", (query) => {
    expect(libraryPageQuery(query, "en")).toBeNull();
  });
  it.each(["en", "vi"] as const)(
    "preserves same locale library root/detail and original requests for %s",
    (locale) => {
      for (const path of [
        `/${locale}/library`,
        `/${locale}/library/${id}`,
        `/${locale}/library?page=2&favorite=false`,
        `/${locale}/requests/new`,
        `/${locale}/requests/${id}`,
      ])
        expect(requestSignInReturn(path, locale)).toBe(path);
    },
  );
  it.each([
    "https://evil.example/en/library",
    "//evil.example/en/library",
    "/vi/library",
    "/en/library/new",
    "/en/library/../requests",
    "/en/library?token=SECRET",
    "/en/library?page=1&page=2",
    "/en/library/%2e%2e/requests",
    "/en/library\\evil",
  ])("rejects unsafe/unknown/cross-locale returns %s", (value) => {
    expect(requestSignInReturn(value, "en")).toBe("/en/settings");
  });
});
