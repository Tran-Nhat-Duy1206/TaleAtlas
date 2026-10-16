// @vitest-environment jsdom
// Actual React SSR -> hydrateRoot; synthetic unknown HTTP responses only.
// Not native-browser, signed-session authority, database, SQL or acceptance proof.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewForm } from "../../apps/web/src/components/community/ReviewForm";
import { ReviewList } from "../../apps/web/src/components/community/ReviewList";
import { ReviewOwnerActions } from "../../apps/web/src/components/community/ReviewOwnerActions";
import { ReviewBody } from "../../apps/web/src/components/community/ReviewBody";
import { ReviewOwnerManage } from "../../apps/web/src/components/community/ReviewOwnerManage";
import { useCommunityReady } from "../../apps/web/src/components/community/useCommunityReady";
import { reviewCopy } from "../../apps/web/src/lib/review-i18n";
import {
  reviewOwnedSchema,
  type ReviewOwnedDTO,
  type ReviewPublicDTO,
} from "../../apps/web/src/features/community/review-http-contracts";

const workId = "40000000-0000-4000-8000-000000000001";
const id = "40000000-0000-4000-8000-000000000002";
const otherId = "40000000-0000-4000-8000-000000000003";
const mutationKey = "40000000-0000-4000-8000-000000000004";
const timestamp = "2026-01-01T00:00:00.000Z";
const privateBody = "SYNTHETIC_PRIVATE_BODY never imported";
const privateContext = "SYNTHETIC_PRIVATE_CONTEXT";
const body = "A synthetic public review with enough plain text.";
const context = "Synthetic selected context";
const unavailable = { state: "UNAVAILABLE", text: null } as const;
const review: ReviewPublicDTO = {
  id,
  workId,
  kind: "REVIEW",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  state: "ACTIVE",
  title: unavailable,
  body: { state: "MASKED", text: null },
  spoilerContext: null,
  ratingHalfStars: null,
  author: { displayName: "Synthetic reader" },
  createdAt: timestamp,
  editedAt: null,
  lastActivityAt: timestamp,
};
// Complete metadata allowlist, checked against the actual current export.
const owned: ReviewOwnedDTO = reviewOwnedSchema.parse({
  id,
  workId,
  kind: "REVIEW",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canEdit: true,
  canWithdraw: true,
});
const deleted: ReviewPublicDTO = {
  ...review,
  revision: 2,
  state: "DELETED",
  body: unavailable,
  author: null,
  createdAt: null,
  lastActivityAt: null,
};
const list = {
  items: [review],
  pageSize: 25 as const,
  statistics: { reviewCount: 1, ratedReviewCount: 0, meanRating: null },
};
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: "SYNTHETIC_FAILURE" }),
});
const metadataPath = (locale: "en" | "vi") =>
  `/api/community/works/${workId}/reviews/${id}/owned?locale=${locale}&contentKind=REVIEW`;
let fetchMock: ReturnType<typeof vi.fn>;
let errors: ReturnType<typeof vi.spyOn>, warnings: ReturnType<typeof vi.spyOn>;
const roots: Root[] = [],
  containers: HTMLElement[] = [];
const diagnostics: ReturnType<typeof vi.fn>[] = [];
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => mutationKey) });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Observe, never mute, React diagnostics (including hydration mismatch warnings).
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
  } finally {
    for (const container of containers.splice(0)) container.remove();
    errors.mockRestore();
    warnings.mockRestore();
    vi.unstubAllGlobals();
  }
});
function ssr(node: React.ReactNode) {
  const snapshots: boolean[] = [];
  const firstCommits: boolean[] = [];
  let observedContainer: HTMLElement | undefined;
  let serverFields: unknown;
  const fields = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll("input,textarea,select"),
      (control) => ({
        value: (control as HTMLInputElement).value,
        checked:
          control instanceof HTMLInputElement ? control.checked : undefined,
      }),
    );
  function ReadyProbe() {
    const ready = useCommunityReady();
    snapshots.push(ready);
    React.useLayoutEffect(() => {
      firstCommits.push(ready);
      if (!ready) {
        // Observe the actual first hydration commit, not just the hook's return value.
        expect(observedContainer).toBeDefined();
        for (const control of observedContainer!.querySelectorAll(
          "button,input,textarea,select",
        ))
          expect(control).toBeDisabled();
        expect(fields(observedContainer!)).toEqual(serverFields);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(crypto.randomUUID).not.toHaveBeenCalled();
      }
    }, [ready]);
    return <>{node}</>;
  }
  const element = <ReadyProbe />;
  const html = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  containers.push(container);
  observedContainer = container;
  serverFields = fields(container);
  expect(snapshots).toEqual([false]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(crypto.randomUUID).not.toHaveBeenCalled();
  return {
    container,
    html,
    ui: within(container),
    element,
    snapshots,
    firstCommits,
  };
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
  expect(view.firstCommits[0]).toBe(false);
  expect(view.firstCommits.at(-1)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(crypto.randomUUID).not.toHaveBeenCalled();
  for (const diagnostic of [onRecoverableError, onCaughtError, onUncaughtError])
    expect(diagnostic).not.toHaveBeenCalled();
}
function inert(container: HTMLElement) {
  const controls = container.querySelectorAll("button,input,textarea,select");
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control).toBeDisabled();
}
function blank(
  ui: ReturnType<typeof within>,
  locale: "en" | "vi",
  replacement = false,
) {
  const t = reviewCopy[locale];
  expect(ui.getByLabelText(t.reviewBody)).toHaveValue("");
  expect(ui.getByLabelText(t.context)).toHaveValue("");
  expect(ui.getByLabelText(t.rating)).toHaveValue("");
  expect(ui.getByRole("option", { name: t.chooseRating })).toHaveProperty(
    "selected",
    true,
  );
  expect(ui.getByLabelText(t.intent)).not.toBeChecked();
  expect(ui.getByLabelText(t.bodySpoiler)).not.toBeChecked();
  if (replacement)
    expect(ui.getByLabelText(t.replacementIntent)).not.toBeChecked();
  expect(
    ui.getByRole("button", { name: replacement ? t.save : t.submit }),
  ).toBeDisabled();
}
function fill(
  ui: ReturnType<typeof within>,
  locale: "en" | "vi",
  replacement = false,
) {
  const t = reviewCopy[locale];
  fireEvent.change(ui.getByLabelText(t.reviewBody), {
    target: { value: body },
  });
  fireEvent.change(ui.getByLabelText(t.rating), {
    target: { value: "unrated" },
  });
  fireEvent.click(ui.getByLabelText(t.intent));
  if (replacement) fireEvent.click(ui.getByLabelText(t.replacementIntent));
}
function request(index: number) {
  const [url, options] = fetchMock.mock.calls[index];
  expect(options).toMatchObject({
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  return {
    url,
    options,
    payload: options.body ? JSON.parse(options.body) : undefined,
  };
}
function listNode(
  locale: "en" | "vi",
  participation: "VERIFIED" | "ANONYMOUS" | "UNVERIFIED" = "VERIFIED",
) {
  return (
    <ReviewList
      locale={locale}
      workId={workId}
      workSlug="synthetic-work"
      initial={list}
      participation={participation}
    />
  );
}
for (const locale of ["en", "vi"] as const) {
  const t = reviewCopy[locale];
  describe(`${locale} actual review SSR hydration`, () => {
    it.each([false, true])(
      "preserves blank fields, unset rating and unchecked acknowledgments through first hydration (replacement=%s)",
      async (replacement) => {
        const cancel = vi.fn();
        const view = ssr(
          <ReviewForm
            locale={locale}
            workId={workId}
            editing={replacement ? owned : undefined}
            onComplete={vi.fn()}
            onRestart={vi.fn()}
            onCancel={cancel}
          />,
        );
        inert(view.container);
        blank(view.ui, locale, replacement);
        view.ui.getByRole("button", { name: t.cancel }).click();
        expect(cancel).not.toHaveBeenCalled();
        await hydrate(view);
        blank(view.ui, locale, replacement);
        expect(view.ui.getByLabelText(t.reviewBody)).toBeEnabled();
        fireEvent.click(view.ui.getByRole("button", { name: t.cancel }));
        expect(cancel).toHaveBeenCalledTimes(1);
      },
    );
    it("requires an explicit unrated choice plus public intent, then sends one normalized create command", async () => {
      const complete = vi.fn();
      fetchMock.mockResolvedValue(ok({ content: review, replayed: false }));
      const view = ssr(
        <ReviewForm
          locale={locale}
          workId={workId}
          onComplete={complete}
          onRestart={vi.fn()}
        />,
      );
      inert(view.container);
      await hydrate(view);
      fireEvent.change(view.ui.getByLabelText(t.reviewBody), {
        target: { value: body },
      });
      fireEvent.click(view.ui.getByLabelText(t.intent));
      expect(view.ui.getByRole("button", { name: t.submit })).toBeDisabled();
      fireEvent.submit(view.ui.getByRole("form"));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
      fireEvent.change(view.ui.getByLabelText(t.rating), {
        target: { value: "unrated" },
      });
      fireEvent.click(view.ui.getByRole("button", { name: t.submit }));
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      expect(request(0)).toMatchObject({
        url: `/api/community/works/${workId}/reviews`,
        options: { method: "POST" },
        payload: {
          body,
          bodySpoiler: false,
          spoilerContext: null,
          rating: null,
          publicSubmissionAcknowledged: true,
          mutationKey,
        },
      });
      expect(Object.keys(request(0).payload).sort()).toEqual([
        "body",
        "bodySpoiler",
        "mutationKey",
        "publicSubmissionAcknowledged",
        "rating",
        "spoilerContext",
      ]);
      blank(view.ui, locale);
    });
    it("replacement requires both acknowledgments and a new independent rating, including authorized same-revision NOOP", async () => {
      const complete = vi.fn();
      fetchMock.mockResolvedValue(ok({ content: review, replayed: false }));
      const view = ssr(
        <ReviewForm
          locale={locale}
          workId={workId}
          editing={owned}
          onComplete={complete}
          onRestart={vi.fn()}
        />,
      );
      inert(view.container);
      await hydrate(view);
      blank(view.ui, locale, true);
      fill(view.ui, locale);
      expect(view.ui.getByRole("button", { name: t.save })).toBeDisabled();
      fireEvent.change(view.ui.getByLabelText(t.rating), {
        target: { value: "7" },
      });
      fireEvent.click(view.ui.getByLabelText(t.replacementIntent));
      fireEvent.click(view.ui.getByRole("button", { name: t.save }));
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0)).toMatchObject({
        url: `/api/community/works/${workId}/reviews/${id}`,
        options: { method: "PATCH" },
        payload: {
          body,
          rating: 7,
          contentKind: "REVIEW",
          expectedRevision: 1,
          mutationKey,
          publicSubmissionAcknowledged: true,
        },
      });
      blank(view.ui, locale, true);
    });
    it("shows unrated rather than zero and preserves SSR statistics without inferring library fields", async () => {
      const view = ssr(listNode(locale));
      inert(view.container);
      expect(view.html).not.toContain(privateBody);
      expect(view.html).not.toContain(privateContext);
      const dds = view.container.querySelectorAll("dd");
      expect(Array.from(dds, (dd) => dd.textContent)).toEqual([
        "1",
        "0",
        t.unrated,
      ]);
      expect(
        view.ui.getByText(`${t.rating}: ${t.unrated}`),
      ).toBeInTheDocument();
      expect(
        view.container.querySelector("title,[data-spoiler],textarea"),
      ).toBeNull();
      for (const link of view.container.querySelectorAll("a")) {
        expect(link).not.toHaveAttribute("data-client-router");
        expect(link.onclick).toBeNull();
      }
      view.ui.getByRole("button", { name: t.newReview }).click();
      expect(fetchMock).not.toHaveBeenCalled();
      await hydrate(view);
      expect(view.ui.getByRole("button", { name: t.newReview })).toBeEnabled();
      expect(
        view.ui.getByRole("button", { name: t.revealBody }),
      ).toBeDisabled();
    });
    it.each(["ANONYMOUS", "UNVERIFIED"] as const)(
      "keeps create blocked for %s after readiness without asserting server authority",
      async (participation) => {
        const view = ssr(listNode(locale, participation));
        inert(view.container);
        await hydrate(view);
        expect(
          view.ui.getByRole("button", { name: t.newReview }),
        ).toBeDisabled();
        fireEvent.click(view.ui.getByRole("button", { name: t.newReview }));
        expect(view.ui.queryByRole("form")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
          view.ui.getByRole("link", {
            name: participation === "ANONYMOUS" ? t.login : t.verify,
          }),
        ).toHaveAttribute(
          "href",
          `/${locale}/${participation === "ANONYMOUS" ? "login" : "verify-email"}`,
        );
      },
    );
    it("performs one deliberate slot read before opening one blank create form", async () => {
      fetchMock.mockResolvedValue(ok({ item: null }));
      const view = ssr(listNode(locale));
      inert(view.container);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.newReview }));
      await waitFor(() =>
        expect(
          view.ui.getByRole("form", { name: t.newReview }),
        ).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0).url).toBe(
        `/api/community/works/${workId}/reviews/owned?locale=${locale}`,
      );
      expect(request(0).options.method).toBeUndefined();
      blank(view.ui, locale);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it("renders a reserved slot as metadata actions, not a prefilled or resubmitted review", async () => {
      fetchMock.mockResolvedValue(ok({ item: owned }));
      const view = ssr(listNode(locale));
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.newReview }));
      await waitFor(() =>
        expect(view.ui.getByText(t.reserved)).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(view.ui.queryByRole("form")).toBeNull();
      expect(view.ui.getByRole("button", { name: t.edit })).toBeEnabled();
      expect(view.ui.getByLabelText(t.withdrawAck)).not.toBeChecked();
      expect(view.ui.getByRole("button", { name: t.withdraw })).toBeDisabled();
      expect(view.container.querySelector("textarea,select")).toBeNull();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it("reveals only body after explicit intent, using exact current revision and read-only escaped text", async () => {
      const revealedBody = "Synthetic escaped <strong>review</strong> text";
      fetchMock.mockResolvedValue(
        ok({
          id,
          workId,
          kind: "REVIEW",
          revision: 1,
          body: revealedBody,
          spoilerContext: context,
        }),
      );
      const view = ssr(<ReviewBody locale={locale} content={review} />);
      inert(view.container);
      expect(view.html).not.toContain(revealedBody);
      expect(view.html).not.toContain(context);
      expect(
        view.container.querySelector("title,textarea,select,[data-spoiler]"),
      ).toBeNull();
      await hydrate(view);
      expect(view.ui.getByLabelText(t.revealAck)).not.toBeChecked();
      expect(
        view.ui.getByRole("button", { name: t.revealBody }),
      ).toBeDisabled();
      fireEvent.click(view.ui.getByLabelText(t.revealAck));
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(view.ui.getByRole("button", { name: t.revealBody }));
      await waitFor(() =>
        expect(view.ui.getByText(revealedBody)).toBeInTheDocument(),
      );
      expect(view.ui.getByText(context)).toBeInTheDocument();
      expect(
        view.container.querySelector("strong,textarea,select,input"),
      ).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0)).toMatchObject({
        url: `/api/community/works/${workId}/reviews/${id}/reveal`,
        options: { method: "POST" },
        payload: {
          workId,
          targetId: id,
          contentKind: "REVIEW",
          expectedRevision: 1,
          title: false,
          body: true,
          spoilerRevealAcknowledged: true,
        },
      });
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it("owner edit checks current metadata before opening blank text, blank rating and two unchecked acknowledgments", async () => {
      fetchMock.mockResolvedValue(ok(owned));
      const view = ssr(
        <ReviewOwnerActions
          locale={locale}
          scope={owned}
          onComplete={vi.fn()}
        />,
      );
      inert(view.container);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.checkOwner }));
      await waitFor(() =>
        expect(view.ui.getByRole("button", { name: t.edit })).toBeEnabled(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fireEvent.click(view.ui.getByRole("button", { name: t.edit }));
      await waitFor(() =>
        expect(
          view.ui.getByRole("form", { name: t.replacement }),
        ).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.every(
          ([url, options]) =>
            url === metadataPath(locale) && options.method === undefined,
        ),
      ).toBe(true);
      blank(view.ui, locale, true);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
      expect(view.container.innerHTML).not.toContain(privateBody);
    });
    it("metadata-only owner management has inert SSR, no mount fetch and deliberate UUID refresh", async () => {
      const metadata: ReviewOwnedDTO = {
        ...owned,
        moderationState: "HIDDEN",
        workAvailable: false,
        canEdit: false,
      };
      const initial = { items: [metadata], pageSize: 25 as const };
      fetchMock.mockResolvedValue(ok(initial));
      const view = ssr(<ReviewOwnerManage locale={locale} initial={initial} />);
      inert(view.container);
      for (const forbidden of [
        privateBody,
        privateContext,
        timestamp,
        "Synthetic reader",
        "synthetic-work",
        "ratingHalfStars",
      ])
        expect(view.html).not.toContain(forbidden);
      expect(view.container.querySelector("textarea,select,a")).toBeNull();
      expect(view.ui.queryByRole("button", { name: t.edit })).toBeNull();
      expect(view.ui.getByText(t.unavailable)).toBeInTheDocument();
      await hydrate(view);
      expect(view.ui.getByLabelText(t.withdrawAck)).not.toBeChecked();
      expect(view.ui.getByRole("button", { name: t.withdraw })).toBeDisabled();
      fireEvent.click(view.ui.getByRole("button", { name: t.loadOwned }));
      await waitFor(() =>
        expect(view.ui.getByText(t.unavailable)).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0).url).toBe(
        `/api/community/reviews/owned?locale=${locale}`,
      );
      expect(request(0).options.method).toBeUndefined();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
  });
}

describe("bounded unknown response and frozen-attempt hydration pipeline", () => {
  const locale = "en",
    t = reviewCopy.en;
  it.each([
    { workId: otherId },
    { kind: "THREAD" },
    { id: otherId },
    { revision: 2 },
    { title: privateBody },
  ])(
    "rejects wrong reveal scope/revision or counterpart field %j without rendering body/context",
    async (change) => {
      fetchMock.mockResolvedValue(
        ok({
          id,
          workId,
          kind: "REVIEW",
          revision: 1,
          body,
          spoilerContext: context,
          ...change,
        }),
      );
      const view = ssr(<ReviewBody locale={locale} content={review} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByLabelText(t.revealAck));
      fireEvent.click(view.ui.getByRole("button", { name: t.revealBody }));
      await waitFor(() =>
        expect(view.ui.getByRole("alert")).toBeInTheDocument(),
      );
      expect(view.ui.getByText(t.maskedBody)).toBeInTheDocument();
      expect(view.ui.queryByText(body)).toBeNull();
      expect(view.ui.queryByText(context)).toBeNull();
      expect(view.container.querySelector("textarea,select")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["revision", "refreshToken"] as const)(
    "clears a revealed body and acknowledgment when %s changes",
    async (key) => {
      fetchMock.mockResolvedValue(
        ok({
          id,
          workId,
          kind: "REVIEW",
          revision: 1,
          body,
          spoilerContext: context,
        }),
      );
      const view = ssr(<ReviewBody locale={locale} content={review} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByLabelText(t.revealAck));
      fireEvent.click(view.ui.getByRole("button", { name: t.revealBody }));
      await waitFor(() => expect(view.ui.getByText(body)).toBeInTheDocument());
      await act(async () =>
        roots
          .at(-1)!
          .render(
            <ReviewBody
              locale={locale}
              content={key === "revision" ? { ...review, revision: 2 } : review}
              refreshToken={key === "refreshToken" ? 1 : 0}
            />,
          ),
      );
      expect(view.ui.queryByText(body)).toBeNull();
      expect(view.ui.queryByText(context)).toBeNull();
      expect(view.ui.getByLabelText(t.revealAck)).not.toBeChecked();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("uncertain create retries the identical frozen payload and UUID despite attempted input changes", async () => {
    const complete = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new Error("SYNTHETIC_NETWORK"))
      .mockResolvedValueOnce(ok({ content: review, replayed: true }));
    const view = ssr(
      <ReviewForm
        locale={locale}
        workId={workId}
        onComplete={complete}
        onRestart={vi.fn()}
      />,
    );
    await hydrate(view);
    fill(view.ui, locale);
    fireEvent.click(view.ui.getByRole("button", { name: t.submit }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
    );
    const first = request(0);
    expect(view.ui.getByLabelText(t.reviewBody)).toBeDisabled();
    fireEvent.change(view.ui.getByLabelText(t.reviewBody), {
      target: { value: privateBody },
    });
    fireEvent.change(view.ui.getByLabelText(t.rating), {
      target: { value: "10" },
    });
    fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request(1)).toEqual(first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    blank(view.ui, locale);
  });
  it("409 clears both acknowledgments and allows a new blank attempt only after deliberate successful metadata reload", async () => {
    fetchMock.mockResolvedValue(fail(409));
    const restart = vi
      .fn()
      .mockRejectedValueOnce(new Error("SYNTHETIC_READ_FAILURE"))
      .mockResolvedValueOnce(undefined);
    const view = ssr(
      <ReviewForm
        locale={locale}
        workId={workId}
        editing={owned}
        onComplete={vi.fn()}
        onRestart={restart}
      />,
    );
    await hydrate(view);
    fill(view.ui, locale, true);
    fireEvent.click(view.ui.getByRole("button", { name: t.save }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.loadOwned })).toBeEnabled(),
    );
    expect(view.ui.getByLabelText(t.intent)).not.toBeChecked();
    expect(view.ui.getByLabelText(t.replacementIntent)).not.toBeChecked();
    expect(view.ui.getByLabelText(t.reviewBody)).toBeDisabled();
    expect(restart).not.toHaveBeenCalled();
    fireEvent.submit(view.ui.getByRole("form"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(view.ui.getByRole("button", { name: t.loadOwned }));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.loadOwned })).toBeEnabled(),
    );
    expect(view.ui.getByLabelText(t.reviewBody)).toBeDisabled();
    fireEvent.click(view.ui.getByRole("button", { name: t.loadOwned }));
    await waitFor(() =>
      expect(view.ui.getByLabelText(t.reviewBody)).toBeEnabled(),
    );
    blank(view.ui, locale, true);
    expect(restart).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it.each([{ workId: otherId }, { kind: "THREAD" }, { revision: 3 }])(
    "rejects create mutation response scope/revision %j and retains the frozen retry",
    async (change) => {
      fetchMock.mockResolvedValue(
        ok({ content: { ...review, ...change }, replayed: false }),
      );
      const complete = vi.fn();
      const view = ssr(
        <ReviewForm
          locale={locale}
          workId={workId}
          onComplete={complete}
          onRestart={vi.fn()}
        />,
      );
      await hydrate(view);
      fill(view.ui, locale);
      fireEvent.click(view.ui.getByRole("button", { name: t.submit }));
      await waitFor(() =>
        expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
      );
      expect(complete).not.toHaveBeenCalled();
      expect(view.ui.getByLabelText(t.reviewBody)).toBeDisabled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("withdraws hidden/unavailable owned metadata with a deliberate reload, exact revision, and redacted DELETED response", async () => {
    const metadata: ReviewOwnedDTO = {
      ...owned,
      moderationState: "HIDDEN",
      workAvailable: false,
      canEdit: false,
    };
    fetchMock
      .mockResolvedValueOnce(ok(metadata))
      .mockResolvedValueOnce(ok({ content: deleted, replayed: false }));
    const complete = vi.fn();
    const view = ssr(
      <ReviewOwnerActions
        locale={locale}
        scope={metadata}
        seed={metadata}
        onComplete={complete}
      />,
    );
    inert(view.container);
    await hydrate(view);
    expect(view.ui.queryByRole("button", { name: t.edit })).toBeNull();
    fireEvent.click(view.ui.getByLabelText(t.withdrawAck));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(view.ui.getByRole("button", { name: t.withdraw }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request(0).url).toBe(metadataPath(locale));
    expect(request(0).options.method).toBeUndefined();
    expect(request(1)).toMatchObject({
      url: `/api/community/works/${workId}/reviews/${id}/withdraw`,
      options: { method: "POST" },
      payload: { contentKind: "REVIEW", expectedRevision: 1, mutationKey },
    });
    expect(Object.keys(request(1).payload).sort()).toEqual([
      "contentKind",
      "expectedRevision",
      "mutationKey",
    ]);
    expect(view.ui.getByText(t.withdrawn)).toBeInTheDocument();
    expect(view.container.querySelector("textarea,select")).toBeNull();
  });
  it("withdraw uncertainty retries only the frozen command, without another metadata read or UUID", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(owned))
      .mockRejectedValueOnce(new Error("SYNTHETIC_NETWORK"))
      .mockResolvedValueOnce(ok({ content: deleted, replayed: true }));
    const complete = vi.fn();
    const view = ssr(
      <ReviewOwnerActions
        locale={locale}
        scope={owned}
        seed={owned}
        onComplete={complete}
      />,
    );
    await hydrate(view);
    fireEvent.click(view.ui.getByLabelText(t.withdrawAck));
    fireEvent.click(view.ui.getByRole("button", { name: t.withdraw }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
    );
    expect(view.ui.getByLabelText(t.withdrawAck)).toBeDisabled();
    fireEvent.click(view.ui.getByLabelText(t.withdrawAck));
    fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(request(2)).toEqual(request(1));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it("withdraw reload seeing a changed revision clears acknowledgment and performs no write or UUID allocation", async () => {
    fetchMock.mockResolvedValue(ok({ ...owned, revision: 2 }));
    const view = ssr(
      <ReviewOwnerActions
        locale={locale}
        scope={owned}
        seed={owned}
        onComplete={vi.fn()}
      />,
    );
    await hydrate(view);
    fireEvent.click(view.ui.getByLabelText(t.withdrawAck));
    fireEvent.click(view.ui.getByRole("button", { name: t.withdraw }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.loadOwned })).toBeEnabled(),
    );
    expect(view.ui.getByLabelText(t.withdrawAck)).not.toBeChecked();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request(0).options.method).toBeUndefined();
    fireEvent.click(view.ui.getByRole("button", { name: t.loadOwned }));
    await waitFor(() =>
      expect(view.ui.getByLabelText(t.withdrawAck)).toBeEnabled(),
    );
    expect(view.ui.getByLabelText(t.withdrawAck)).not.toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    { workId: otherId },
    { id: otherId },
    { kind: "THREAD" },
    { body: privateBody },
    { ratingHalfStars: 8 },
  ])(
    "rejects malformed/counterpart owner metadata %j before edit or withdrawal",
    async (change) => {
      fetchMock.mockResolvedValue(ok({ ...owned, ...change }));
      const view = ssr(
        <ReviewOwnerActions
          locale={locale}
          scope={owned}
          onComplete={vi.fn()}
        />,
      );
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.checkOwner }));
      await waitFor(() =>
        expect(view.ui.getByRole("alert")).toBeInTheDocument(),
      );
      expect(view.ui.queryByRole("button", { name: t.edit })).toBeNull();
      expect(view.ui.queryByLabelText(t.withdrawAck)).toBeNull();
      expect(view.container.innerHTML).not.toContain(privateBody);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    },
  );
  it("editing revision changes discard draft text, rating and both acknowledgments without a write", async () => {
    const props: React.ComponentProps<typeof ReviewForm> = {
      locale,
      workId,
      editing: owned,
      onComplete: vi.fn(),
      onRestart: vi.fn(),
    };
    const view = ssr(<ReviewForm {...props} />);
    await hydrate(view);
    fill(view.ui, locale, true);
    expect(view.ui.getByRole("button", { name: t.save })).toBeEnabled();
    await act(async () =>
      roots
        .at(-1)!
        .render(<ReviewForm {...props} editing={{ ...owned, revision: 2 }} />),
    );
    blank(view.ui, locale, true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it("edit completion rejects a different target UUID even with a valid incremented review response", async () => {
    fetchMock.mockResolvedValue(
      ok({ content: { ...review, id: otherId, revision: 2 }, replayed: false }),
    );
    const complete = vi.fn();
    const view = ssr(
      <ReviewForm
        locale={locale}
        workId={workId}
        editing={owned}
        onComplete={complete}
        onRestart={vi.fn()}
      />,
    );
    await hydrate(view);
    fill(view.ui, locale, true);
    fireEvent.click(view.ui.getByRole("button", { name: t.save }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
    );
    expect(complete).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.ui.getByLabelText(t.reviewBody)).toBeDisabled();
  });
  it.each([
    { ...owned, workId: otherId },
    { ...owned, body: privateBody },
  ])(
    "slot read rejects wrong-work or text-bearing metadata case %# without opening a form",
    async (item) => {
      fetchMock.mockResolvedValue(ok({ item }));
      const view = ssr(listNode(locale));
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.newReview }));
      await waitFor(() =>
        expect(view.ui.getByRole("alert")).toBeInTheDocument(),
      );
      expect(view.ui.queryByRole("form")).toBeNull();
      expect(view.ui.queryByText(t.reserved)).toBeNull();
      expect(view.container.innerHTML).not.toContain(privateBody);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    },
  );
  it("rejects text-bearing masked initial data before SSR and first hydration can expose text or context", async () => {
    const invalid = {
      ...review,
      body: { state: "MASKED", text: privateBody },
      spoilerContext: privateContext,
    };
    const view = ssr(
      <ReviewBody
        locale={locale}
        content={invalid as unknown as ReviewPublicDTO}
      />,
    );
    expect(view.ui.getByRole("alert")).toHaveTextContent(t.scopeError);
    expect(view.html).not.toContain(privateBody);
    expect(view.html).not.toContain(privateContext);
    await hydrate(view);
    expect(
      view.container.querySelector("input,button,textarea,select"),
    ).toBeNull();
  });
  it("withdraw completion rejects another target UUID despite a redacted DELETED response", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(owned))
      .mockResolvedValueOnce(
        ok({ content: { ...deleted, id: otherId }, replayed: false }),
      );
    const complete = vi.fn();
    const view = ssr(
      <ReviewOwnerActions
        locale={locale}
        scope={owned}
        seed={owned}
        onComplete={complete}
      />,
    );
    await hydrate(view);
    fireEvent.click(view.ui.getByLabelText(t.withdrawAck));
    fireEvent.click(view.ui.getByRole("button", { name: t.withdraw }));
    await waitFor(() =>
      expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
    );
    expect(complete).not.toHaveBeenCalled();
    expect(view.ui.queryByText(t.withdrawn)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("public pagination uses the last activity UUID keyset, never auto-fetches", async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      ...review,
      id: `40000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    }));
    fetchMock.mockResolvedValue(
      ok({
        ...list,
        items: [],
        statistics: { reviewCount: 25, ratedReviewCount: 0, meanRating: null },
      }),
    );
    const view = ssr(
      <ReviewList
        locale={locale}
        workId={workId}
        workSlug="synthetic-work"
        participation="VERIFIED"
        initial={{
          ...list,
          items,
          statistics: {
            reviewCount: 25,
            ratedReviewCount: 0,
            meanRating: null,
          },
        }}
      />,
    );
    inert(view.container);
    await hydrate(view);
    fireEvent.click(view.ui.getByRole("button", { name: t.next }));
    await waitFor(() =>
      expect(view.ui.getByText(t.emptyReviews)).toBeInTheDocument(),
    );
    const url = new URL(request(0).url, "https://synthetic.invalid");
    expect(url.pathname).toBe(`/api/community/works/${workId}/reviews`);
    expect(Array.from(url.searchParams.entries())).toEqual([
      ["locale", locale],
      ["cursorId", items.at(-1)!.id],
      ["cursorTimestamp", timestamp],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it("owner pagination uses UUID/null cursor with metadata only, never public review endpoints", async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      ...owned,
      id: `40000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    }));
    fetchMock.mockResolvedValue(ok({ items: [], pageSize: 25 }));
    const view = ssr(
      <ReviewOwnerManage locale={locale} initial={{ items, pageSize: 25 }} />,
    );
    inert(view.container);
    await hydrate(view);
    fireEvent.click(view.ui.getByRole("button", { name: t.next }));
    await waitFor(() =>
      expect(view.ui.getByText(t.ownedEmpty)).toBeInTheDocument(),
    );
    const url = new URL(request(0).url, "https://synthetic.invalid");
    expect(url.pathname).toBe("/api/community/reviews/owned");
    expect(Array.from(url.searchParams.entries())).toEqual([
      ["locale", locale],
      ["cursorId", items.at(-1)!.id],
      ["cursorTimestamp", "null"],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it("uses source-provided review count/rated count/nullable mean, not the visible page's inferred mean", async () => {
    const view = ssr(
      <ReviewList
        locale="vi"
        workId={workId}
        workSlug="synthetic-work"
        participation="VERIFIED"
        initial={{
          ...list,
          statistics: { reviewCount: 7, ratedReviewCount: 3, meanRating: 3.5 },
        }}
      />,
    );
    expect(
      Array.from(view.container.querySelectorAll("dd"), (dd) => dd.textContent),
    ).toEqual([
      "7",
      "3",
      new Intl.NumberFormat("vi", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(3.5),
    ]);
    await hydrate(view);
  });
  it("rejects wrong-work refreshed list before display", async () => {
    fetchMock.mockResolvedValue(
      ok({
        ...list,
        items: [
          {
            ...review,
            workId: otherId,
            body: { state: "VISIBLE", text: privateBody },
          },
        ],
      }),
    );
    const view = ssr(listNode(locale));
    await hydrate(view);
    fireEvent.click(view.ui.getByRole("button", { name: t.refresh }));
    await waitFor(() => expect(view.ui.getByRole("alert")).toBeInTheDocument());
    expect(view.container.innerHTML).not.toContain(privateBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
