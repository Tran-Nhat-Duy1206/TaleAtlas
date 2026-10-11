// @vitest-environment jsdom
// Mocked real-method HTTP UI units only; not browser/authentication/PostgreSQL acceptance.
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
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  PersonalControls,
  type PersonalControlSeed,
} from "../../apps/web/src/components/library/PersonalControls";
import {
  personalCopy,
  personalRatings,
} from "../../apps/web/src/components/library/personal-copy";
import {
  personalHttpPatchSchema,
  personalHttpMutationResponseSchema,
  type PersonalHttpDetails,
} from "../../apps/web/src/features/library/personal-http-contracts";
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const id = "10000000-0000-4000-8000-000000000001",
  workId = "10000000-0000-4000-8000-000000000002",
  key = "10000000-0000-4000-8000-000000000003";
const entry: PersonalHttpDetails = {
  id,
  workId,
  revision: 1,
  ratingHalfStars: null,
  notes: "",
  archived: false,
};
const seedOf = ({
  id,
  workId,
  revision,
  archived,
}: PersonalHttpDetails): PersonalControlSeed => ({
  id,
  workId,
  revision,
  archived,
});
const ok = (data: unknown = entry) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
type HttpFixture = (url: string, options: RequestInit) => Promise<unknown>;
let transport: ReturnType<typeof vi.fn>,
  reads: Mock<HttpFixture>,
  writes: Mock<HttpFixture>;
beforeEach(() => {
  vi.clearAllMocks();
  reads = vi.fn<HttpFixture>().mockResolvedValue(ok());
  writes = vi.fn<HttpFixture>().mockResolvedValue(ok());
  transport = vi.fn((url, options) =>
    options.method === "GET" ? reads(url, options) : writes(url, options),
  );
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => key) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const body = (index = 0) =>
  JSON.parse(String(writes.mock.calls[index][1].body));
async function loaded(
  data: PersonalHttpDetails = entry,
  locale: "en" | "vi" = "en",
) {
  reads.mockResolvedValueOnce(ok(data));
  const view = render(
    <PersonalControls
      key={`${data.id}:${data.revision}`}
      seed={seedOf(data)}
      locale={locale}
    />,
  );
  if (!data.archived)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: personalCopy[locale].save }),
      ).toBeEnabled(),
    );
  return view;
}
for (const locale of ["en", "vi"] as const)
  describe(locale, () => {
    const t = personalCopy[locale];
    it("SSR contains only disabled loading POST form; actual hydration GET must validate before editable PATCH", async () => {
      let drain!: (data: unknown) => void;
      reads.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            drain = resolve;
          }),
      });
      const container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = renderToString(
        <PersonalControls
          seed={seedOf({ ...entry, notes: "SECRET", ratingHalfStars: 8 })}
          locale={locale}
        />,
      );
      expect(container.innerHTML).not.toContain("SECRET");
      expect(container.querySelector("fieldset")).toBeDisabled();
      expect(container.querySelector("form")).toHaveAttribute("method", "post");
      expect(container.querySelector("textarea")).not.toHaveAttribute("name");
      expect(
        screen.queryByRole("option", { name: t.none }),
      ).not.toBeInTheDocument();
      expect(transport).not.toHaveBeenCalled();
      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(
          container,
          <PersonalControls seed={seedOf(entry)} locale={locale} />,
        );
      });
      expect(reads).toHaveBeenCalledOnce();
      expect(reads.mock.calls[0][0]).toBe(
        `/api/library/${id}/personal?locale=${locale}`,
      );
      expect(reads.mock.calls[0][1]).toMatchObject({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      expect(reads.mock.calls[0][1]).not.toHaveProperty("body");
      expect(container.querySelector("fieldset")).toBeDisabled();
      const prevented = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        container.querySelector("form")!.dispatchEvent(prevented);
      });
      expect(prevented.defaultPrevented).toBe(true);
      expect(writes).not.toHaveBeenCalled();
      await act(async () => drain(entry));
      expect(container.querySelector("fieldset")).not.toBeDisabled();
      const event = new Event("submit", { bubbles: true, cancelable: true });
      await act(async () => {
        container.querySelector("form")!.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      await waitFor(() => expect(writes).toHaveBeenCalledOnce());
      expect(writes.mock.calls[0][0]).toBe(
        `/api/library/${id}/personal?locale=${locale}`,
      );
      expect(writes.mock.calls[0][1]).toMatchObject({
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      expect(body()).toEqual({
        revision: 1,
        mutationKey: key,
        patch: { ratingHalfStars: null, notes: "" },
      });
      await act(async () => root!.unmount());
      container.remove();
    });
    it("all nine localized half-step options map to exact integers and validated nullable default", async () => {
      await loaded(entry, locale);
      const select = screen.getByRole("combobox", {
        name: t.rating,
      });
      expect(select).toHaveValue("");
      expect(screen.getAllByRole("option")).toHaveLength(10);
      for (const value of personalRatings) {
        expect(
          screen.getByRole("option", { name: t.ratings[value] }),
        ).toHaveValue(String(value));
        fireEvent.change(select, { target: { value: String(value) } });
        fireEvent.click(screen.getByRole("button", { name: t.save }));
        await waitFor(() => expect(writes).toHaveBeenCalledTimes(value - 1));
        expect(body(value - 2).patch.ratingHalfStars).toBe(value);
        expect(personalHttpPatchSchema.safeParse(body(value - 2)).success).toBe(
          true,
        );
        await waitFor(() =>
          expect(screen.getByRole("button", { name: t.save })).toBeEnabled(),
        );
      }
      expect(reads).toHaveBeenCalledOnce();
    });
    it("explicit nullable rating and empty notes clear without confirmation or reading/status commands", async () => {
      await loaded(
        { ...entry, ratingHalfStars: 7, notes: "Prior note" },
        locale,
      );
      fireEvent.change(screen.getByRole("combobox", { name: t.rating }), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await waitFor(() => expect(writes).toHaveBeenCalledOnce());
      expect(body()).toEqual({
        revision: 1,
        mutationKey: key,
        patch: { ratingHalfStars: null, notes: "" },
      });
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
    it("owner notes render as plain escaped text with independent 4000 bound and counter", async () => {
      const literal = '<script>alert("owner text")</script> **not markdown**';
      await loaded({ ...entry, notes: literal }, locale);
      expect(screen.getByLabelText(t.notes)).toHaveValue(literal);
      expect(document.querySelector("script")).toBeNull();
      expect(screen.getByLabelText(t.notes)).toHaveAttribute(
        "maxlength",
        "4000",
      );
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "a".repeat(4000) },
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await waitFor(() => expect(writes).toHaveBeenCalledOnce());
      expect(body().patch.notes).toHaveLength(4000);
      expect(screen.getByText(`4000 / 4000 ${t.count}`)).toBeInTheDocument();
    });
    it("higher mutation revision fences until keyed remount; same-revision no-op remains editable", async () => {
      writes.mockResolvedValueOnce(
        ok({ ...entry, revision: 2, ratingHalfStars: 5, notes: "Persisted" }),
      );
      const view = await loaded(entry, locale);
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "Persisted" },
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
      expect(screen.getByLabelText(t.notes)).toBeDisabled();
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      expect(writes).toHaveBeenCalledOnce();
      const next = {
        ...entry,
        revision: 2,
        notes: "Persisted",
        ratingHalfStars: 5,
      };
      reads.mockResolvedValueOnce(ok(next));
      view.rerender(
        <PersonalControls
          key={`${id}:2`}
          seed={seedOf(next)}
          locale={locale}
        />,
      );
      await waitFor(() =>
        expect(screen.getByLabelText(t.notes)).not.toBeDisabled(),
      );
      expect(screen.getByLabelText(t.notes)).toHaveValue("Persisted");
      expect(screen.getByRole("combobox", { name: t.rating })).toHaveValue("5");
      writes.mockResolvedValueOnce(ok(next));
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByText(t.saved);
      expect(screen.getByLabelText(t.notes)).not.toBeDisabled();
      expect(body(1).revision).toBe(2);
    });
    it("ambiguous network freezes fields and retries exact URL/key/body with one UUID", async () => {
      writes.mockRejectedValueOnce(new Error("SECRET failure"));
      await loaded(entry, locale);
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "Bound private note" },
      });
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByRole("button", { name: t.retry });
      expect(screen.getByLabelText(t.notes)).toBeDisabled();
      expect(screen.getByRole("combobox", { name: t.rating })).toBeDisabled();
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      expect(writes).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: t.retry }));
      await waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
      expect(writes.mock.calls[1]).toEqual(writes.mock.calls[0]);
      expect(crypto.randomUUID).toHaveBeenCalledOnce();
      expect(document.body.textContent).not.toContain("SECRET");
    });
    it("409 allows only refresh, never stale repeat or false saved status", async () => {
      writes.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "SECRET stale" }),
      });
      await loaded(entry, locale);
      fireEvent.click(screen.getByRole("button", { name: t.save }));
      await screen.findByText(t.stale);
      expect(screen.getByLabelText(t.notes)).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: t.retry }),
      ).not.toBeInTheDocument();
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      expect(writes).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: t.refresh }));
      expect(nav.refresh).toHaveBeenCalledOnce();
      expect(screen.queryByText(t.saved)).not.toBeInTheDocument();
    });
    it("hidden Work metadata is not needed to edit owner facts; archived seed never loads or writes", async () => {
      const view = await loaded(
        { ...entry, notes: "Retained owner facts", ratingHalfStars: 8 },
        locale,
      );
      expect(screen.getByLabelText(t.notes)).not.toBeDisabled();
      expect(screen.getByRole("combobox", { name: t.rating })).toHaveValue("8");
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      view.rerender(
        <PersonalControls
          key="archived"
          seed={seedOf({ ...entry, archived: true })}
          locale={locale}
        />,
      );
      expect(screen.getByLabelText(t.notes)).toBeDisabled();
      expect(screen.getByText(t.archived)).toBeInTheDocument();
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      expect(writes).not.toHaveBeenCalled();
      expect(reads).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("option", { name: t.none }),
      ).not.toBeInTheDocument();
    });
  });
it.each([
  "bad-json",
  "5xx",
  "malformed",
  "regressed-revision",
  "wrong-id",
  "wrong-work",
  "archived-response",
])(
  "mutation %s is ambiguous and retries exact bound request",
  async (failure) => {
    const current =
      failure === "regressed-revision" ? { ...entry, revision: 2 } : entry;
    writes.mockResolvedValueOnce(
      failure === "bad-json"
        ? {
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("SECRET parse");
            },
          }
        : failure === "5xx"
          ? { ok: false, status: 503, json: async () => ({ error: "SECRET" }) }
          : ok(
              failure === "malformed"
                ? { ...current, readingSession: { notes: "SECRET" } }
                : failure === "regressed-revision"
                  ? entry
                  : failure === "wrong-id"
                    ? { ...entry, id: key }
                    : failure === "wrong-work"
                      ? { ...entry, workId: key }
                      : { ...entry, archived: true },
            ),
    );
    await loaded(current);
    fireEvent.click(screen.getByRole("button", { name: personalCopy.en.save }));
    await screen.findByRole("button", { name: personalCopy.en.retry });
    expect(screen.queryByText(personalCopy.en.saved)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: personalCopy.en.retry }),
    );
    await waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
    expect(writes.mock.calls[1]).toEqual(writes.mock.calls[0]);
    expect(document.body.textContent).not.toContain("SECRET");
  },
);
it.each([
  ["overlong", "a".repeat(4001)],
  ["NUL control", "unsafe\u0000"],
  ["bidi override", "unsafe\u202e"],
  ["bidi isolate", "unsafe\u2066"],
])(
  "invalid/unsafe notes rejected before mutation: %s",
  async (_label, notes) => {
    await loaded();
    fireEvent.change(screen.getByLabelText(personalCopy.en.notes), {
      target: { value: notes },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: personalCopy.en.save })
        .closest("form")!,
    );
    await screen.findByText(personalCopy.en.invalid);
    expect(writes).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 11, 3.5, -1, "3"])("rating input bounds reject %s", (rating) => {
  expect(
    personalHttpPatchSchema.safeParse({
      revision: 1,
      mutationKey: key,
      patch: { ratingHalfStars: rating },
    }).success,
  ).toBe(false);
});
it("strict schemas reject reading/status/owner/public/catalog and empty patches", () => {
  for (const field of [
    "userId",
    "work",
    "status",
    "favorite",
    "readingSession",
    "snapshot",
    "mutationKey",
  ])
    expect(
      personalHttpMutationResponseSchema.safeParse({
        ...entry,
        [field]: "SECRET",
      }).success,
    ).toBe(false);
  for (const patch of [
    {},
    { status: "READING" },
    { favorite: true },
    { progressNotes: "C" },
    { chapterNumber: 0 },
    { userId: id },
  ])
    expect(
      personalHttpPatchSchema.safeParse({
        revision: 1,
        mutationKey: key,
        patch,
      }).success,
    ).toBe(false);
});
it.each([401, 403, 404, 503])(
  "GET %s never enables fabricated empty facts and offers GET-only recovery",
  async (status) => {
    reads.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({ error: "SECRET owner failure" }),
    });
    render(<PersonalControls seed={seedOf(entry)} locale="en" />);
    await screen.findByRole("button", { name: personalCopy.en.load });
    expect(screen.getByLabelText(personalCopy.en.notes)).toBeDisabled();
    expect(
      screen.queryByRole("option", { name: personalCopy.en.none }),
    ).not.toBeInTheDocument();
    fireEvent.submit(
      screen
        .getByRole("button", { name: personalCopy.en.save })
        .closest("form")!,
    );
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: personalCopy.en.load }));
    await waitFor(() =>
      expect(screen.getByLabelText(personalCopy.en.notes)).not.toBeDisabled(),
    );
    expect(reads).toHaveBeenCalledTimes(2);
    expect(writes).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("SECRET");
  },
);
it.each([
  "bad-json",
  "wrong-id",
  "wrong-work",
  "regressed",
  "malformed",
  "archived",
])("GET %s cannot become editable or claim saved", async (failure) => {
  reads.mockResolvedValueOnce(
    failure === "bad-json"
      ? {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("SECRET");
          },
        }
      : ok(
          failure === "wrong-id"
            ? { ...entry, id: key }
            : failure === "wrong-work"
              ? { ...entry, workId: key }
              : failure === "regressed"
                ? entry
                : failure === "malformed"
                  ? { ...entry, snapshot: "SECRET" }
                  : { ...entry, archived: true },
        ),
  );
  render(
    <PersonalControls
      seed={seedOf(failure === "regressed" ? { ...entry, revision: 2 } : entry)}
      locale="en"
    />,
  );
  await screen.findByRole("button", { name: personalCopy.en.load });
  expect(screen.getByLabelText(personalCopy.en.notes)).toBeDisabled();
  expect(writes).not.toHaveBeenCalled();
  expect(nav.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText(personalCopy.en.saved)).not.toBeInTheDocument();
});
it("higher GET revision refresh-fences B/C synchronization without saved claim or stale mutation", async () => {
  reads.mockResolvedValueOnce(
    ok({ ...entry, revision: 2, notes: "New private fact" }),
  );
  render(<PersonalControls seed={seedOf(entry)} locale="en" />);
  await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
  expect(screen.getByLabelText(personalCopy.en.notes)).toBeDisabled();
  expect(
    screen.queryByRole("option", { name: personalCopy.en.none }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(personalCopy.en.saved)).not.toBeInTheDocument();
  fireEvent.submit(
    screen.getByRole("button", { name: personalCopy.en.save }).closest("form")!,
  );
  expect(writes).not.toHaveBeenCalled();
});
it("GET effect deduplicates stable rerenders, aborts old scope and ignores stale/unmounted responses", async () => {
  let resolveOld!: (value: unknown) => void;
  reads.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  const view = render(<PersonalControls seed={seedOf(entry)} locale="en" />);
  await waitFor(() => expect(reads).toHaveBeenCalledOnce());
  const signal = reads.mock.calls[0][1].signal as AbortSignal;
  view.rerender(<PersonalControls seed={{ ...seedOf(entry) }} locale="en" />);
  expect(reads).toHaveBeenCalledOnce();
  const other = { ...entry, workId: key, notes: "Current scope" };
  reads.mockResolvedValueOnce(ok(other));
  view.rerender(<PersonalControls seed={seedOf(other)} locale="en" />);
  await waitFor(() =>
    expect(screen.getByLabelText(personalCopy.en.notes)).toHaveValue(
      "Current scope",
    ),
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolveOld(ok({ ...entry, notes: "SECRET old scope" })),
  );
  expect(screen.getByLabelText(personalCopy.en.notes)).toHaveValue(
    "Current scope",
  );
  expect(nav.refresh).not.toHaveBeenCalled();
  view.unmount();
  expect((reads.mock.calls[1][1].signal as AbortSignal).aborted).toBe(true);
});
