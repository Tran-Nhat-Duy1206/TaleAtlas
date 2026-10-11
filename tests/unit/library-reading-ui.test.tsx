// @vitest-environment jsdom
// Mocked HTTP units only: not browser, authentication, SQL or acceptance proof.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingControls } from "../../apps/web/src/components/library/ReadingControls";
import { ReadingHistory } from "../../apps/web/src/components/library/ReadingHistory";
import { readingCopy } from "../../apps/web/src/components/library/reading-copy";
import {
  readingMutationResponseSchema,
  readingHttpSessionActionSchema,
  type ReadingHttpDetails,
  type ReadingHttpSession,
} from "../../apps/web/src/features/library/reading-http-contracts";
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const id = "10000000-0000-4000-8000-000000000001",
  workId = "10000000-0000-4000-8000-000000000002",
  key = "10000000-0000-4000-8000-000000000003",
  sessionId = "10000000-0000-4000-8000-000000000004";
const session: ReadingHttpSession = {
  id: sessionId,
  sequence: 1,
  kind: "FIRST_READ",
  state: "ACTIVE",
  revision: 1,
  startedAt: "2026-01-02T03:04:05.000Z",
  completedAt: null,
  closedAt: null,
  startedOn: null,
  finishedOn: null,
  notes: "",
  chapterNumber: 5,
  chapterLabel: "Chapter V",
  volumeNumber: 1,
  volumeLabel: null,
  personalChapterTotal: null,
  progressNotes: "",
  editionId: null,
  lastActivityAt: "2026-01-02T03:04:05.000Z",
};
const empty: ReadingHttpDetails = {
  id,
  workId,
  status: "WANT_TO_READ",
  revision: 1,
  favorite: false,
  archived: false,
  createdAt: null,
  updatedAt: null,
  hasCompletedRead: false,
  currentSession: null,
  readingSession: null,
  work: { available: false, id: workId },
};
const active: ReadingHttpDetails = {
  ...empty,
  status: "READING",
  currentSession: { id: session.id, kind: session.kind, state: session.state },
  readingSession: session,
};
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
let transport: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  transport = vi.fn().mockResolvedValue(ok(empty));
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => key) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const body = (n = 0) => JSON.parse(transport.mock.calls[n][1].body);
for (const locale of ["en", "vi"] as const)
  describe(locale, () => {
    const t = readingCopy[locale];
    it("SSR disables real controls and actual hydration enables explicit POST", async () => {
      const container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = renderToString(
        <ReadingControls entry={empty} locale={locale} />,
      );
      expect(container.querySelector("fieldset")).toBeDisabled();
      expect(container.querySelector("form")).toHaveAttribute("method", "post");
      expect(transport).not.toHaveBeenCalled();
      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(
          container,
          <ReadingControls entry={empty} locale={locale} />,
        );
      });
      expect(container.querySelector("fieldset")).not.toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: t.start }));
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      expect(body()).toEqual({
        action: "START_READ",
        revision: 1,
        mutationKey: key,
      });
      expect(transport.mock.calls[0][1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      await act(async () => root!.unmount());
      container.remove();
    });
    it("reread and completion acknowledgments start unchecked and use exact wire contracts", async () => {
      const view = render(
        <ReadingControls
          entry={{ ...empty, hasCompletedRead: true }}
          locale={locale}
        />,
      );
      expect(screen.getByRole("button", { name: t.reread })).toBeDisabled();
      expect(screen.getByLabelText(t.rereadAck)).not.toBeChecked();
      fireEvent.click(screen.getByLabelText(t.rereadAck));
      fireEvent.click(screen.getByRole("button", { name: t.reread }));
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      expect(body()).toMatchObject({
        action: "START_REREAD",
        acknowledgeReread: true,
      });
      expect(readingHttpSessionActionSchema.safeParse(body()).success).toBe(
        true,
      );
      view.unmount();
      transport.mockClear();
      render(<ReadingControls entry={active} locale={locale} />);
      expect(screen.getByLabelText(t.completeAck)).not.toBeChecked();
      fireEvent.click(screen.getByLabelText(t.completeAck));
      fireEvent.click(screen.getByRole("button", { name: t.complete }));
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      expect(body()).toMatchObject({
        action: "COMPLETE",
        sessionId,
        confirmCompletion: true,
      });
      expect(body()).not.toHaveProperty("finishedOn");
      expect(readingHttpSessionActionSchema.safeParse(body()).success).toBe(
        true,
      );
    });
    it("zero and explicit clears survive; estimate is personal and numbers are bounded", async () => {
      render(<ReadingControls entry={active} locale={locale} />);
      fireEvent.change(screen.getByLabelText(t.chapterNumber), {
        target: { value: "0" },
      });
      fireEvent.change(screen.getByLabelText(t.volumeNumber), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(t.chapterLabel), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(t.personalChapterTotal), {
        target: { value: "99" },
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      expect(body().patch).toMatchObject({
        chapterNumber: 0,
        volumeNumber: null,
        chapterLabel: null,
        personalChapterTotal: 99,
      });
      expect(screen.getByLabelText(t.volumeNumber)).toHaveAttribute(
        "max",
        "100000",
      );
      expect(
        screen.getByLabelText(t.editionId).querySelectorAll("option"),
      ).toHaveLength(1);
    });
    it("ambiguous response freezes fields and retries identical UUID and serialized body", async () => {
      transport.mockRejectedValueOnce(new Error("SECRET network"));
      render(<ReadingControls entry={active} locale={locale} />);
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByRole("button", { name: t.retry });
      expect(screen.getByLabelText(t.chapterNumber)).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: t.retry }));
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
      expect(crypto.randomUUID).toHaveBeenCalledOnce();
      expect(document.body.textContent).not.toContain("SECRET");
    });
    it("higher revision fences while same revision no-op stays editable", async () => {
      transport.mockResolvedValueOnce(ok({ ...active, revision: 2 }));
      const view = render(<ReadingControls entry={active} locale={locale} />);
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
      expect(screen.getByLabelText(t.chapterNumber)).toBeDisabled();
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      expect(transport).toHaveBeenCalledOnce();
      view.unmount();
      transport.mockClear();
      transport.mockResolvedValue(ok(active));
      render(<ReadingControls entry={active} locale={locale} />);
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByText(t.saved);
      expect(screen.getByLabelText(t.chapterNumber)).not.toBeDisabled();
    });
    it("stale disables repeat and date chronology is validated before POST", async () => {
      render(<ReadingControls entry={active} locale={locale} />);
      fireEvent.change(screen.getByLabelText(t.startedOn), {
        target: { value: "2026-02-20" },
      });
      fireEvent.change(screen.getByLabelText(t.finishedOn), {
        target: { value: "2026-02-19" },
      });
      fireEvent.click(screen.getByLabelText(t.completeAck));
      fireEvent.click(screen.getByRole("button", { name: t.complete }));
      await screen.findByText(t.invalid);
      expect(transport).not.toHaveBeenCalled();
      transport.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "SECRET" }),
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByText(t.stale);
      expect(screen.getByLabelText(t.chapterNumber)).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: t.retry }),
      ).not.toBeInTheDocument();
    });
    it("history is explicit real GET, known-session progress only, bounded older cursors and deduplicated", async () => {
      transport.mockResolvedValueOnce(
        ok({
          items: [
            { ...session, state: "COMPLETED", completedAt: session.startedAt },
          ],
          nextBeforeSequence: 1,
        }),
      );
      render(<ReadingHistory id={id} locale={locale} />);
      expect(transport).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: t.open }));
      await screen.findByRole("heading", {
        level: 4,
        name: new RegExp(t.states.COMPLETED),
      });
      expect(transport.mock.calls[0][0]).toBe(
        `/api/library/${id}/sessions?locale=${locale}`,
      );
      transport.mockResolvedValueOnce(
        ok({ items: [session], nextBeforeSequence: null }),
      );
      fireEvent.click(screen.getByRole("button", { name: t.older }));
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      expect(transport.mock.calls[1][0]).toContain("beforeSequence=1");
      expect(
        screen.getAllByRole("button", { name: t.progressHistory }),
      ).toHaveLength(1);
      transport.mockResolvedValueOnce(
        ok({ items: [], nextBeforeRevision: null }),
      );
      fireEvent.click(screen.getByRole("button", { name: t.progressHistory }));
      await screen.findByText(t.empty);
      expect(transport.mock.calls[2][0]).toBe(
        `/api/library/${id}/sessions/${sessionId}/progress?locale=${locale}`,
      );
    });
    it("malformed and failed history does not render arbitrary private snapshots", async () => {
      transport.mockResolvedValueOnce(
        ok({
          items: [
            {
              id,
              revision: 1,
              kind: "PROGRESS",
              recordedAt: null,
              snapshot: { notes: "SECRET" },
            },
          ],
          nextBeforeRevision: null,
        }),
      );
      render(<ReadingHistory id={id} locale={locale} />);
      fireEvent.click(screen.getByRole("button", { name: t.events }));
      await screen.findByText(t.error);
      expect(document.body.textContent).not.toContain("SECRET");
    });
  });
it.each(["id", "workId", "revision"] as const)(
  "identity/regressed %s response is ambiguous, never claims saved",
  async (field) => {
    const value = field === "revision" ? 0 : key;
    transport.mockResolvedValue(ok({ ...active, [field]: value }));
    render(<ReadingControls entry={active} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: readingCopy.en.save }));
    await screen.findByRole("button", { name: readingCopy.en.retry });
    expect(screen.queryByText(readingCopy.en.saved)).not.toBeInTheDocument();
  },
);
it.each(["bad-json", "5xx", "malformed"])(
  "%s result freezes and retries the exact bound payload",
  async (failure) => {
    transport.mockResolvedValueOnce(
      failure === "bad-json"
        ? {
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("SECRET JSON");
            },
          }
        : failure === "5xx"
          ? { ok: false, status: 503, json: async () => ({ error: "SECRET" }) }
          : ok({ ...active, extraPrivate: "SECRET" }),
    );
    render(<ReadingControls entry={active} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: readingCopy.en.save }));
    await screen.findByRole("button", { name: readingCopy.en.retry });
    fireEvent.click(screen.getByRole("button", { name: readingCopy.en.retry }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    expect(document.body.textContent).not.toContain("SECRET");
  },
);
it("hidden work preserves unavailable edition UUID without hidden metadata and allows clearing", async () => {
  render(
    <ReadingControls
      entry={{ ...active, readingSession: { ...session, editionId: key } }}
      locale="en"
    />,
  );
  const select = screen.getByLabelText(readingCopy.en.editionId);
  expect(select).toHaveValue(key);
  expect(
    screen.getByRole("option", { name: readingCopy.en.unknownEdition }),
  ).toHaveValue(key);
  expect(screen.getAllByRole("option")).toHaveLength(2);
  fireEvent.change(select, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: readingCopy.en.save }));
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  expect(body().patch.editionId).toBeNull();
});
it("personal dates can explicitly clear and no historical date is invented", async () => {
  render(
    <ReadingControls
      entry={{
        ...active,
        readingSession: { ...session, startedOn: "2026-01-01" },
      }}
      locale="en"
    />,
  );
  fireEvent.change(screen.getByLabelText(readingCopy.en.startedOn), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByLabelText(readingCopy.en.completeAck));
  fireEvent.click(
    screen.getByRole("button", { name: readingCopy.en.complete }),
  );
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  expect(body().startedOn).toBeNull();
  expect(body()).not.toHaveProperty("finishedOn");
});
it("history renders all attempt states and plain owner notes; rejects non-advancing cursor without discarding prior rows", async () => {
  const t = readingCopy.en;
  const states = ["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"] as const;
  const items = states.map((state, index) => ({
    ...session,
    id: `20000000-0000-4000-8000-00000000000${index}`,
    sequence: 4 - index,
    state,
    kind: index ? "REREAD" : "FIRST_READ",
    notes: "<script>owner text</script>",
  }));
  transport.mockResolvedValueOnce(ok({ items, nextBeforeSequence: 1 }));
  render(<ReadingHistory id={id} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: t.open }));
  await screen.findByText(new RegExp(t.states.ABANDONED));
  for (const state of states)
    expect(screen.getByText(new RegExp(t.states[state]))).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
  transport.mockResolvedValueOnce(ok({ items: [], nextBeforeSequence: 1 }));
  fireEvent.click(screen.getByRole("button", { name: t.older }));
  await screen.findByText(t.error);
  expect(
    screen.getAllByRole("button", { name: t.progressHistory }),
  ).toHaveLength(4);
});
it("history rejects oversized pages and never exposes row contents", async () => {
  transport.mockResolvedValueOnce(
    ok({
      items: Array.from({ length: 51 }, () => ({
        ...session,
        notes: "SECRET oversized",
      })),
      nextBeforeSequence: null,
    }),
  );
  render(<ReadingHistory id={id} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: readingCopy.en.open }));
  await screen.findByText(readingCopy.en.error);
  expect(document.body.textContent).not.toContain("SECRET");
});
it("new reread never inherits terminal session personal dates, notes or progress", async () => {
  const closed = {
    ...session,
    state: "COMPLETED" as const,
    startedOn: "2004-01-01",
    finishedOn: "2004-01-02",
    notes: "Old completed owner note",
    chapterNumber: 99,
  };
  render(
    <ReadingControls
      entry={{
        ...active,
        hasCompletedRead: true,
        currentSession: {
          id: closed.id,
          kind: closed.kind,
          state: closed.state,
        },
        readingSession: closed,
      }}
      locale="en"
    />,
  );
  expect(screen.getByLabelText(readingCopy.en.startedOn)).toHaveValue("");
  expect(screen.getByLabelText(readingCopy.en.notes)).toHaveValue("");
  expect(
    screen.queryByLabelText(readingCopy.en.chapterNumber),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(readingCopy.en.rereadAck));
  fireEvent.click(screen.getByRole("button", { name: readingCopy.en.reread }));
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  expect(body()).toEqual({
    revision: 1,
    mutationKey: key,
    action: "START_REREAD",
    acknowledgeReread: true,
  });
});
it.each(["Updated paused attempt note", ""])(
  "RESUME preserves the user's exact edited notes including explicit clear %j",
  async (notes) => {
    const paused = {
      ...session,
      state: "PAUSED" as const,
      notes: "Prior owner note",
    };
    render(
      <ReadingControls
        entry={{
          ...active,
          currentSession: {
            id: paused.id,
            kind: paused.kind,
            state: paused.state,
          },
          readingSession: paused,
        }}
        locale="en"
      />,
    );
    fireEvent.change(screen.getByLabelText(readingCopy.en.notes), {
      target: { value: notes },
    });
    fireEvent.click(
      screen.getByRole("button", { name: readingCopy.en.resume }),
    );
    await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    expect(body()).toEqual({
      revision: 1,
      mutationKey: key,
      action: "RESUME",
      sessionId,
      notes,
    });
    expect(body()).not.toHaveProperty("startedOn");
    expect(readingHttpSessionActionSchema.safeParse(body()).success).toBe(true);
  },
);
it("strict DTO rejects D fields and malformed rich session", () => {
  expect(
    readingMutationResponseSchema.safeParse({ ...active, notes: "SECRET" })
      .success,
  ).toBe(false);
  expect(
    readingMutationResponseSchema.safeParse({
      ...active,
      readingSession: { ...session, chapterNumber: -1 },
    }).success,
  ).toBe(false);
});
