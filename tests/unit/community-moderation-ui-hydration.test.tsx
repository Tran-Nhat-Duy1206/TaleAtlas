// @vitest-environment jsdom
// Actual React SSR -> hydrateRoot; synthetic unknown HTTP only, NOT auth/SQL/native acceptance.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ReviewList } from "../../apps/web/src/components/community/ReviewList";
import { ThreadList } from "../../apps/web/src/components/community/ThreadList";
import { ThreadDetail } from "../../apps/web/src/components/community/ThreadDetail";
import { reviewPublicSchema } from "../../apps/web/src/features/community/review-http-contracts";
import { discussionPublicSchema } from "../../apps/web/src/features/community/http-contracts";
import {
  ReportAction,
  ReportForm,
} from "../../apps/web/src/components/community/ReportAction";
import { ReportOwnerManage } from "../../apps/web/src/components/community/ReportOwnerManage";
import { ModerationQueue } from "../../apps/web/src/components/community/ModerationQueue";
import { ModerationEvidence } from "../../apps/web/src/components/community/ModerationEvidence";
import { ModerationHistory } from "../../apps/web/src/components/community/ModerationHistory";
import { ModerationActionForm } from "../../apps/web/src/components/community/ModerationActionForm";
import { useCommunityReady } from "../../apps/web/src/components/community/useCommunityReady";
import {
  moderationCopy,
  reportReasonCopy,
} from "../../apps/web/src/lib/moderation-i18n";
import {
  communityTargetScopeSchema,
  moderationTargetSchema,
  moderationQueueItemSchema,
  ownedReportSchema,
  moderationActionSchema,
} from "../../apps/web/src/features/community/moderation-http-contracts";

const workId = "70000000-0000-4000-8000-000000000001",
  id = "70000000-0000-4000-8000-000000000002";
const reportId = "70000000-0000-4000-8000-000000000003",
  actionId = "70000000-0000-4000-8000-000000000004";
const otherId = "70000000-0000-4000-8000-000000000005";
const scope = communityTargetScopeSchema.parse({
  id,
  workId,
  kind: "THREAD",
  revision: 2,
});
const target = moderationTargetSchema.parse({
  ...scope,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canHide: true,
  canRestore: true,
});
const item = moderationQueueItemSchema.parse({
  id: reportId,
  state: "OPEN",
  revision: 1,
  evidenceRedacted: false,
  canDismiss: true,
  target,
});
const queue = { items: [item], pageSize: 25 as const, nextCursor: null };
const owned = ownedReportSchema.parse({
  id: reportId,
  workId,
  contentId: id,
  contentKind: "THREAD",
  state: "OPEN",
  revision: 1,
  targetRevision: 2,
  targetAuthorState: "DELETED",
  targetModerationState: "HIDDEN",
  workAvailable: false,
});
const action = moderationActionSchema.parse({
  id: actionId,
  createdAt: "2026-01-01T00:00:00.000Z",
  action: "HIDE",
  sequence: 1,
  contentRevision: 2,
  reportId,
  reportRevision: 2,
  evidenceRedacted: false,
});
const marker = "<script>synthetic selected evidence only</script>";
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: "synthetic generic failure" }),
});
const reportPath = `/api/community/works/${workId}/contents/${id}/reports`;
const decisionPath = `/api/community/works/${workId}/contents/${id}/moderation`;
const contextPath = `${decisionPath}/context`;
let fetchMock: ReturnType<typeof vi.fn>,
  uuid: ReturnType<typeof vi.spyOn>,
  errors: ReturnType<typeof vi.spyOn>,
  warnings: ReturnType<typeof vi.spyOn>;
const roots: Root[] = [],
  containers: HTMLElement[] = [],
  diagnostics: ReturnType<typeof vi.fn>[] = [];
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  } finally {
    for (const container of containers.splice(0)) container.remove();
    uuid.mockRestore();
    errors.mockRestore();
    warnings.mockRestore();
    vi.unstubAllGlobals();
  }
});
function fieldState(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("input,select,textarea"),
    (control) => ({
      value: (control as HTMLInputElement).value,
      checked:
        control instanceof HTMLInputElement ? control.checked : undefined,
    }),
  );
}
function inert(container: HTMLElement) {
  const controls = container.querySelectorAll("button,input,select,textarea");
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
}
function ssr(node: React.ReactNode) {
  const snapshots: boolean[] = [],
    commits: boolean[] = [];
  let observed: HTMLElement | undefined, serverFields: unknown;
  function Probe() {
    const ready = useCommunityReady();
    snapshots.push(ready);
    React.useLayoutEffect(() => {
      commits.push(ready);
      if (!ready) {
        if (!observed) throw new Error("Missing SSR container");
        inert(observed);
        expect(fieldState(observed)).toEqual(serverFields);
      }
    }, [ready]);
    return <>{node}</>;
  }
  const element = <Probe />,
    html = renderToString(element),
    container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  containers.push(container);
  observed = container;
  serverFields = fieldState(container);
  expect(snapshots).toEqual([false]);
  inert(container);
  return {
    element,
    html,
    container,
    ui: within(container),
    snapshots,
    commits,
  };
}
async function hydrate(view: ReturnType<typeof ssr>) {
  const onRecoverableError = vi.fn(),
    onCaughtError = vi.fn(),
    onUncaughtError = vi.fn();
  diagnostics.push(onRecoverableError, onCaughtError, onUncaughtError);
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(view.container, view.element, {
      onRecoverableError,
      onCaughtError,
      onUncaughtError,
    });
    roots.push(root);
  });
  expect(view.snapshots.slice(0, 2)).toEqual([false, false]);
  expect(view.snapshots.at(-1)).toBe(true);
  expect(view.commits[0]).toBe(false);
  expect(view.commits.at(-1)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
  return root;
}
function exactSelect(container: HTMLElement, labelText: string) {
  const label = Array.from(container.querySelectorAll("label")).find(
    (candidate) => candidate.textContent === labelText,
  );
  expect(label).toBeDefined();
  expect(label!.querySelector("select")).toBeNull();
  const select = document.getElementById(label!.htmlFor);
  expect(select).toBeInstanceOf(HTMLSelectElement);
  expect((select as HTMLSelectElement).labels).toHaveLength(1);
  return select as HTMLSelectElement;
}
function fillDecision(
  ui: ReturnType<typeof within>,
  locale: "en" | "vi",
  decision = "HIDE",
) {
  const t = moderationCopy[locale];
  fireEvent.change(ui.getByRole("combobox", { name: t.action }), {
    target: { value: decision },
  });
  fireEvent.change(ui.getByLabelText(t.reason), {
    target: { value: "Fresh deliberately written moderation reason" },
  });
  fireEvent.click(ui.getByLabelText(t.actionIntent));
}
function acknowledgeEvidence(
  ui: ReturnType<typeof within>,
  locale: "en" | "vi",
  selection: string,
) {
  const t = moderationCopy[locale];
  fireEvent.change(ui.getByLabelText(t.evidenceSection), {
    target: { value: selection },
  });
  fireEvent.click(ui.getByLabelText(t.evidenceAck));
  fireEvent.click(ui.getByLabelText(t.revealAck));
}
for (const locale of ["en", "vi"] as const) {
  const t = moderationCopy[locale];
  describe(`${locale} real reporting/moderation SSR hydration`, () => {
    it.each(["reason", "explanation"] as const)(
      "%s textarea keeps exact associated label before and after legitimate typing",
      async (field) => {
        const node =
          field === "reason" ? (
            <ModerationActionForm
              locale={locale}
              item={item}
              onConfirmed={vi.fn()}
              onReload={async () => {}}
              onLocked={vi.fn()}
              onConflict={vi.fn()}
            />
          ) : (
            <ReportForm locale={locale} scope={scope} onComplete={vi.fn()} />
          );
        const view = ssr(node),
          labelText = field === "reason" ? t.reason : t.explanation;
        const textarea = view.ui.getByRole("textbox", {
          name: labelText,
        }) as HTMLTextAreaElement;
        expect(textarea.labels).toHaveLength(1);
        const label = textarea.labels!.item(0)!;
        expect(label.htmlFor).toBe(textarea.id);
        expect(label.control).toBe(textarea);
        expect(label.textContent).toBe(labelText);
        expect(textarea).toHaveValue("");
        await hydrate(view);
        const text = "A fresh deliberately typed synthetic explanation.";
        fireEvent.change(textarea, { target: { value: text } });
        expect(textarea).toHaveValue(text);
        // Positive DOM-text probe: control values must not contaminate the exact localized label.
        expect(label.textContent).toBe(labelText);
        expect(view.ui.getByLabelText(labelText, { exact: true })).toBe(
          textarea,
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(uuid).not.toHaveBeenCalled();
      },
    );
    it.each(["THREAD", "REPLY", "REVIEW"] as const)(
      "mounts blank %s report only after legitimate hydrated click, with seven exact category labels and no request",
      async (kind) => {
        const node = (
          <ReportAction
            locale={locale}
            scope={{ ...scope, kind }}
            participation="VERIFIED"
          />
        );
        const view = ssr(node);
        view.ui.getByRole("button", { name: t.report }).click();
        expect(view.ui.queryByRole("form")).toBeNull();
        await hydrate(view);
        fireEvent.click(view.ui.getByRole("button", { name: t.report }));
        const form = view.ui.getByRole("form", { name: t.reportForm });
        expect(exactSelect(view.container, t.reportReason)).toHaveValue("");
        expect(within(form).getByLabelText(t.explanation)).toHaveValue("");
        expect(
          within(form).getByRole("button", { name: t.submitReport }),
        ).toBeDisabled();
        expect(within(form).getAllByRole("option")).toHaveLength(8);
        for (const label of Object.values(reportReasonCopy[locale]))
          expect(
            within(form).getByRole("option", { name: label }),
          ).toBeInTheDocument();
        expect(view.ui.queryByLabelText(t.intent)).toBeNull();
        expect(view.ui.queryByLabelText(t.revealAck)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(uuid).not.toHaveBeenCalled();
      },
    );
    it.each(["ANONYMOUS", "UNVERIFIED"] as const)(
      "does not grant report submission on hydration to %s",
      async (participation) => {
        const view = ssr(
          <ReportAction
            locale={locale}
            scope={scope}
            participation={participation}
          />,
        );
        await hydrate(view);
        expect(view.ui.getByRole("button", { name: t.report })).toBeDisabled();
        expect(
          view.ui.getByRole("link", {
            name: participation === "ANONYMOUS" ? t.login : t.verify,
          }),
        ).toHaveAttribute(
          "href",
          `/${locale}/${participation === "ANONYMOUS" ? "login" : "verify-email"}`,
        );
        fireEvent.click(view.ui.getByRole("button", { name: t.report }));
        expect(view.ui.queryByRole("form")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
    it.each(["ANONYMOUS", "UNVERIFIED"] as const)(
      "public parent participation %s keeps one central CTA and disabled reporting in reviews, threads and detail",
      async (participation) => {
        const timestamp = "2026-01-01T00:00:00.000Z";
        const base = {
          ...scope,
          threadId: null,
          parentId: null,
          depth: null,
          state: "ACTIVE",
          body: {
            state: "VISIBLE",
            text: "Deliberately public synthetic body for participation clarity.",
          },
          spoilerContext: null,
          ratingHalfStars: null,
          author: null,
          createdAt: timestamp,
          editedAt: null,
          lastActivityAt: timestamp,
        };
        const review = reviewPublicSchema.parse({
          ...base,
          kind: "REVIEW",
          title: { state: "UNAVAILABLE", text: null },
        });
        const thread = discussionPublicSchema.parse({
          ...base,
          title: { state: "VISIBLE", text: "Synthetic public title" },
        });
        const nodes = [
          <ReviewList
            key="reviews"
            locale={locale}
            workId={workId}
            workSlug="synthetic"
            participation={participation}
            initial={{
              items: [review],
              pageSize: 25,
              statistics: {
                reviewCount: 1,
                ratedReviewCount: 0,
                meanRating: null,
              },
            }}
          />,
          <ThreadList
            key="threads"
            locale={locale}
            workId={workId}
            workSlug="synthetic"
            participation={participation}
            initial={{ items: [thread], pageSize: 25 }}
          />,
          <ThreadDetail
            key="detail"
            locale={locale}
            workId={workId}
            workSlug="synthetic"
            participation={participation}
            initialThread={thread}
            initialReplies={{ items: [], pageSize: 25 }}
          />,
        ];
        for (const node of nodes) {
          const view = ssr(node);
          const root = await hydrate(view);
          const name = participation === "ANONYMOUS" ? t.login : t.verify;
          expect(view.ui.getAllByRole("link", { name })).toHaveLength(1);
          expect(view.ui.getByRole("link", { name })).toHaveAttribute(
            "href",
            `/${locale}/${participation === "ANONYMOUS" ? "login" : "verify-email"}`,
          );
          expect(
            view.ui.getByRole("button", { name: t.report }),
          ).toBeDisabled();
          fireEvent.click(view.ui.getByRole("button", { name: t.report }));
          expect(
            view.ui.queryByRole("form", { name: t.reportForm }),
          ).toBeNull();
          expect(fetchMock).not.toHaveBeenCalled();
          expect(uuid).not.toHaveBeenCalled();
          await act(async () => {
            root.unmount();
          });
          roots.splice(roots.indexOf(root), 1);
          view.container.remove();
        }
      },
    );
    it("validates OTHER minimum and sends only normalized foundation report payload, then refreshes own minimal receipt deliberately", async () => {
      fetchMock
        .mockResolvedValueOnce(
          ok({
            content: scope,
            report: { id: reportId, state: "OPEN", revision: 1 },
            replayed: false,
          }),
        )
        .mockResolvedValueOnce(
          ok({ ...owned, state: "DISMISSED", revision: 2 }),
        );
      const view = ssr(
        <ReportAction locale={locale} scope={scope} participation="VERIFIED" />,
      );
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.report }));
      fireEvent.change(view.ui.getByLabelText(t.reportReason), {
        target: { value: "OTHER" },
      });
      fireEvent.change(view.ui.getByLabelText(t.explanation), {
        target: { value: "ab" },
      });
      expect(
        view.ui.getByRole("button", { name: t.submitReport }),
      ).toBeDisabled();
      fireEvent.change(view.ui.getByLabelText(t.explanation), {
        target: { value: "  meaningful e\u0301vidence  " },
      });
      fireEvent.submit(view.ui.getByRole("form", { name: t.reportForm }));
      await waitFor(() =>
        expect(view.ui.getByText(t.reportSuccess)).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(uuid).toHaveBeenCalledTimes(1);
      const [path, options] = fetchMock.mock.calls[0];
      expect(path).toBe(reportPath);
      expect(options).toMatchObject({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
      });
      expect(JSON.parse(options.body)).toEqual({
        contentKind: "THREAD",
        expectedRevision: 2,
        reason: "OTHER",
        explanation: "meaningful évidence",
        mutationKey: expect.any(String),
      });
      expect(view.ui.queryByRole("form")).toBeNull();
      fireEvent.click(view.ui.getByRole("button", { name: t.refreshReport }));
      await waitFor(() =>
        expect(view.ui.getByText(t.dismissed)).toBeInTheDocument(),
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        `/api/community/reports/${reportId}/owned?locale=${locale}`,
      );
      expect(view.container.innerHTML).not.toContain("meaningful évidence");
      expect(uuid).toHaveBeenCalledTimes(1);
    });
    it("freezes normalized report payload and UUID across uncertain transport despite DOM tampering; retry is manual and exact", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("synthetic transport"))
        .mockResolvedValueOnce(
          ok({
            content: scope,
            report: { id: reportId, state: "OPEN", revision: 1 },
            replayed: true,
          }),
        );
      const complete = vi.fn(),
        view = ssr(
          <ReportForm locale={locale} scope={scope} onComplete={complete} />,
        );
      await hydrate(view);
      fireEvent.change(view.ui.getByLabelText(t.reportReason), {
        target: { value: "SPAM" },
      });
      fireEvent.submit(view.ui.getByRole("form"));
      await waitFor(() =>
        expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
      );
      const original = fetchMock.mock.calls[0][1].body;
      expect(view.ui.getByLabelText(t.explanation)).toBeDisabled();
      fireEvent.change(view.ui.getByLabelText(t.reportReason), {
        target: { value: "OTHER" },
      });
      fireEvent.change(view.ui.getByLabelText(t.explanation), {
        target: { value: "tampered attempt" },
      });
      fireEvent.submit(view.ui.getByRole("form"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(uuid).toHaveBeenCalledTimes(1);
      fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[1][1].body).toBe(original);
      expect(uuid).toHaveBeenCalledTimes(1);
      expect(view.ui.getByLabelText(t.reportReason)).toHaveValue("");
      expect(view.ui.getByLabelText(t.explanation)).toHaveValue("");
    });
    it("confirmed report409 clears fields, remains locked and cannot synthesize another key from stale scope", async () => {
      fetchMock.mockResolvedValueOnce(fail(409));
      const view = ssr(
        <ReportForm locale={locale} scope={scope} onComplete={vi.fn()} />,
      );
      await hydrate(view);
      fireEvent.change(view.ui.getByLabelText(t.reportReason), {
        target: { value: "SPAM" },
      });
      fireEvent.submit(view.ui.getByRole("form"));
      await waitFor(() =>
        expect(view.ui.getByText(t.conflict)).toBeInTheDocument(),
      );
      expect(view.ui.getByLabelText(t.reportReason)).toHaveValue("");
      expect(view.ui.getByLabelText(t.explanation)).toHaveValue("");
      expect(view.ui.getByLabelText(t.reportReason)).toBeDisabled();
      expect(view.ui.queryByRole("button", { name: t.retry })).toBeNull();
      fireEvent.submit(view.ui.getByRole("form"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(uuid).toHaveBeenCalledTimes(1);
    });
    it.each(["revision", "state", "receiptRevision"] as const)(
      "fresh report %s mismatch stays frozen uncertain instead of acknowledging an invalid minimal response",
      async (mismatch) => {
        fetchMock.mockResolvedValueOnce(
          ok({
            content: { ...scope, revision: mismatch === "revision" ? 3 : 2 },
            report: {
              id: reportId,
              state: mismatch === "state" ? "DISMISSED" : "OPEN",
              revision: mismatch === "receiptRevision" ? 2 : 1,
            },
            replayed: false,
          }),
        );
        const complete = vi.fn(),
          view = ssr(
            <ReportForm locale={locale} scope={scope} onComplete={complete} />,
          );
        await hydrate(view);
        fireEvent.change(view.ui.getByLabelText(t.reportReason), {
          target: { value: "SPAM" },
        });
        fireEvent.submit(view.ui.getByRole("form"));
        await waitFor(() =>
          expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
        );
        expect(complete).not.toHaveBeenCalled();
        expect(view.ui.getByLabelText(t.reportReason)).toBeDisabled();
        expect(uuid).toHaveBeenCalledTimes(1);
      },
    );
    it("fresh OPEN moderation unchanged content revision cannot be acknowledged, while exact retry remains frozen", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          content: scope,
          report: { id: reportId, state: "UPHELD", revision: 2 },
          replayed: false,
        }),
      );
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      fillDecision(view.ui, locale);
      fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
      await waitFor(() =>
        expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
      );
      expect(view.ui.queryByText(t.decisionSuccess)).toBeNull();
      expect(view.ui.getByLabelText(t.reason)).toBeDisabled();
      expect(uuid).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("rejects cross-target report response before displaying a receipt or accepting authority", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          content: { ...scope, id: otherId },
          report: { id: reportId, state: "OPEN", revision: 1 },
          replayed: false,
        }),
      );
      const complete = vi.fn(),
        view = ssr(
          <ReportForm locale={locale} scope={scope} onComplete={complete} />,
        );
      await hydrate(view);
      fireEvent.change(view.ui.getByLabelText(t.reportReason), {
        target: { value: "SPAM" },
      });
      fireEvent.submit(view.ui.getByRole("form"));
      await waitFor(() =>
        expect(view.ui.getByText(t.transport)).toBeInTheDocument(),
      );
      expect(complete).not.toHaveBeenCalled();
    });
    it("renders unavailable owned report metadata only and refreshes list/status solely on deliberate controls", async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ ...owned, revision: 2, state: "UPHELD" }))
        .mockResolvedValueOnce(ok({ items: [owned], pageSize: 25 }));
      const view = ssr(
        <ReportOwnerManage
          locale={locale}
          initial={{ items: [owned], pageSize: 25 }}
        />,
      );
      await hydrate(view);
      expect(view.html).not.toContain(marker);
      expect(view.ui.getByText(t.unavailable)).toBeInTheDocument();
      const card = view.ui.getByRole("article", {
        name: `${t.reportId} ${reportId}`,
      });
      fireEvent.click(
        within(card).getByRole("button", { name: t.refreshReport }),
      );
      await waitFor(() =>
        expect(within(card).getByText(t.upheld)).toBeInTheDocument(),
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/community/reports/${reportId}/owned?locale=${locale}`,
      );
      fireEvent.click(
        view.ui.getAllByRole("button", { name: t.refreshReport })[0],
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[1][0]).toBe(
        `/api/community/reports/owned?locale=${locale}`,
      );
      expect(uuid).not.toHaveBeenCalled();
    });
    it("selects queue metadata without HTTP, starts blank scoped controls, and filters without auto-fetch", async () => {
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      expect(view.html).not.toContain(marker);
      await hydrate(view);
      expect(exactSelect(view.container, t.filter)).toHaveValue("OPEN");
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      expect(exactSelect(view.container, t.evidenceSection)).toHaveValue("");
      expect(exactSelect(view.container, t.action)).toHaveValue("");
      expect(view.ui.getByLabelText(t.reason)).toHaveValue("");
      expect(view.ui.getByLabelText(t.actionIntent)).not.toBeChecked();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(uuid).not.toHaveBeenCalled();
      fireEvent.change(view.ui.getByLabelText(t.filter), {
        target: { value: "UPHELD" },
      });
      expect(view.ui.queryByLabelText(t.reason)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockResolvedValueOnce(
        ok({ items: [], pageSize: 25, nextCursor: null }),
      );
      fireEvent.click(view.ui.getByRole("button", { name: t.refresh }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/community/moderation/reports?locale=${locale}&state=UPHELD`,
      );
    });
    it.each([
      "TITLE",
      "BODY",
      "SPOILER_CONTEXT",
      "REPORT",
      "ACTION_REASON",
    ] as const)(
      "reads only explicitly chosen %s evidence with both acknowledgments and strict scoped response",
      async (selection) => {
        fetchMock.mockResolvedValueOnce(
          ok(
            selection === "REPORT"
              ? {
                  ...scope,
                  selection,
                  state: "AVAILABLE",
                  report: { id: reportId, state: "OPEN", revision: 1 },
                  reason: "SPAM",
                  explanation: marker,
                }
              : {
                  ...scope,
                  selection,
                  state: "AVAILABLE",
                  text: marker,
                  ...(selection === "ACTION_REASON"
                    ? { action: { id: actionId, sequence: 1 } }
                    : {}),
                },
          ),
        );
        const view = ssr(
          <ModerationEvidence
            locale={locale}
            target={target}
            report={item}
            action={action}
            onFailure={vi.fn()}
          />,
        );
        await hydrate(view);
        fireEvent.change(view.ui.getByLabelText(t.evidenceSection), {
          target: { value: selection },
        });
        fireEvent.click(view.ui.getByLabelText(t.evidenceAck));
        expect(
          view.ui.getByRole("button", { name: t.revealEvidence }),
        ).toBeDisabled();
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.click(view.ui.getByLabelText(t.revealAck));
        fireEvent.click(
          view.ui.getByRole("button", { name: t.revealEvidence }),
        );
        await waitFor(() =>
          expect(
            view.ui.getByText(marker, { exact: true }),
          ).toBeInTheDocument(),
        );
        expect(view.container.querySelector("script")).toBeNull();
        expect(fetchMock.mock.calls[0][0]).toBe(contextPath);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
          workId,
          targetId: id,
          contentKind: "THREAD",
          expectedRevision: 2,
          selection,
          reportId: selection === "REPORT" ? reportId : null,
          expectedReportRevision: selection === "REPORT" ? 1 : null,
          actionId: selection === "ACTION_REASON" ? actionId : null,
          actionSequence: selection === "ACTION_REASON" ? 1 : null,
          evidenceSelectionAcknowledged: true,
          spoilerRevealAcknowledged: true,
        });
        expect(uuid).not.toHaveBeenCalled();
        fireEvent.change(view.ui.getByLabelText(t.evidenceSection), {
          target: { value: selection === "BODY" ? "TITLE" : "BODY" },
        });
        expect(view.ui.queryByText(marker)).toBeNull();
        expect(view.ui.getByLabelText(t.evidenceAck)).not.toBeChecked();
        expect(view.ui.getByLabelText(t.revealAck)).not.toBeChecked();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
    it.each(["REPLY", "REVIEW"] as const)(
      "does not expose title evidence for %s",
      async (kind) => {
        const nextTarget = { ...target, kind },
          nextItem = { ...item, target: nextTarget };
        const view = ssr(
          <ModerationEvidence
            locale={locale}
            target={nextTarget}
            report={nextItem}
            onFailure={vi.fn()}
          />,
        );
        await hydrate(view);
        expect(
          view.ui.queryByRole("option", { name: t.titleEvidence }),
        ).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
    it("clears revealed text on revision replacement, never prefills decision reason, and clears all stale state on current role loss", async () => {
      fetchMock
        .mockResolvedValueOnce(
          ok({ ...scope, selection: "BODY", state: "AVAILABLE", text: marker }),
        )
        .mockResolvedValueOnce(fail(403));
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      acknowledgeEvidence(view.ui, locale, "BODY");
      fireEvent.click(view.ui.getByRole("button", { name: t.revealEvidence }));
      await waitFor(() =>
        expect(view.ui.getByText(marker)).toBeInTheDocument(),
      );
      expect(view.ui.getByLabelText(t.reason)).toHaveValue("");
      fireEvent.change(view.ui.getByLabelText(t.reason), {
        target: { value: "draft reason" },
      });
      acknowledgeEvidence(view.ui, locale, "REPORT");
      expect(view.ui.queryByText(marker)).toBeNull();
      fireEvent.click(view.ui.getByRole("button", { name: t.revealEvidence }));
      await waitFor(() =>
        expect(view.ui.getByLabelText(t.reason)).toBeDisabled(),
      );
      expect(view.ui.getByLabelText(t.reason)).toHaveValue("");
      expect(view.ui.getByLabelText(t.evidenceAck)).not.toBeChecked();
      expect(view.ui.getByLabelText(t.actionIntent)).not.toBeChecked();
      expect(uuid).not.toHaveBeenCalled();
    });
    it("real revision replacement remasks selected evidence and resets both acknowledgments without auto reads", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({ ...scope, selection: "BODY", state: "AVAILABLE", text: marker }),
      );
      const view = ssr(
        <ModerationEvidence
          locale={locale}
          target={target}
          report={item}
          onFailure={vi.fn()}
        />,
      );
      const root = await hydrate(view);
      acknowledgeEvidence(view.ui, locale, "BODY");
      fireEvent.click(view.ui.getByRole("button", { name: t.revealEvidence }));
      await waitFor(() =>
        expect(view.ui.getByText(marker)).toBeInTheDocument(),
      );
      const freshTarget = { ...target, revision: 3 },
        freshItem = { ...item, target: freshTarget };
      await act(async () => {
        root.render(
          <ModerationEvidence
            locale={locale}
            target={freshTarget}
            report={freshItem}
            onFailure={vi.fn()}
          />,
        );
      });
      expect(view.ui.queryByText(marker)).toBeNull();
      expect(view.ui.getByLabelText(t.evidenceSection)).toHaveValue("");
      expect(view.ui.getByLabelText(t.evidenceAck)).not.toBeChecked();
      expect(view.ui.getByLabelText(t.revealAck)).not.toBeChecked();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(uuid).not.toHaveBeenCalled();
    });
    it.each(["scope", "revision", "extra"] as const)(
      "rejects evidence response %s mismatch before rendering selected text",
      async (mismatch) => {
        const data = {
          ...scope,
          selection: "BODY",
          state: "AVAILABLE",
          text: marker,
          ...(mismatch === "scope"
            ? { id: otherId }
            : mismatch === "revision"
              ? { revision: 3 }
              : { title: "unselected synthetic section" }),
        };
        fetchMock.mockResolvedValueOnce(ok(data));
        const failure = vi.fn(),
          view = ssr(
            <ModerationEvidence
              locale={locale}
              target={target}
              report={item}
              onFailure={failure}
            />,
          );
        await hydrate(view);
        acknowledgeEvidence(view.ui, locale, "BODY");
        fireEvent.click(
          view.ui.getByRole("button", { name: t.revealEvidence }),
        );
        await waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
        expect(view.ui.queryByText(marker)).toBeNull();
        expect(view.ui.getByLabelText(t.evidenceAck)).not.toBeChecked();
        expect(view.ui.getByLabelText(t.revealAck)).not.toBeChecked();
        expect(uuid).not.toHaveBeenCalled();
      },
    );
    it("preserves queue microsecond timestamp plus UUID keyset exactly without effect reads", async () => {
      const timestamp = "2026-01-01T00:00:00.123456Z";
      const initial = { ...queue, nextCursor: { id: reportId, timestamp } };
      fetchMock.mockResolvedValueOnce(
        ok({ items: [], pageSize: 25, nextCursor: null }),
      );
      const view = ssr(<ModerationQueue locale={locale} initial={initial} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.next }));
      await waitFor(() =>
        expect(view.ui.getByText(t.emptyReports)).toBeInTheDocument(),
      );
      const url = new URL(fetchMock.mock.calls[0][0], "http://synthetic.test");
      expect(url.searchParams.get("cursorId")).toBe(reportId);
      expect(url.searchParams.get("cursorTimestamp")).toBe(timestamp);
      expect(url.searchParams.get("state")).toBe("OPEN");
      expect(uuid).not.toHaveBeenCalled();
    });
    it("privileged history scope mismatch cannot display metadata or offer narrative selection", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          content: { ...target, id: otherId },
          stream: "ACTIONS",
          items: [action],
          pageSize: 25,
          nextCursor: null,
        }),
      );
      const failure = vi.fn(),
        view = ssr(
          <ModerationHistory
            locale={locale}
            target={target}
            onAction={vi.fn()}
            onFailure={failure}
          />,
        );
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.actions }));
      await waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
      expect(view.ui.queryByText(actionId)).toBeNull();
      expect(
        view.ui.queryByRole("button", { name: t.actionReasonEvidence }),
      ).toBeNull();
      expect(uuid).not.toHaveBeenCalled();
    });
    it("deliberately reads separate event/action history metadata and uses numeric exclusive keysets, never narrative prefetch", async () => {
      const history = {
        content: target,
        stream: "ACTIONS",
        items: [action],
        pageSize: 25,
        nextCursor: 1,
      };
      fetchMock
        .mockResolvedValueOnce(ok(history))
        .mockResolvedValueOnce(ok({ ...history, items: [], nextCursor: null }));
      const onAction = vi.fn(),
        view = ssr(
          <ModerationHistory
            locale={locale}
            target={target}
            onAction={onAction}
            onFailure={vi.fn()}
          />,
        );
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.actions }));
      await waitFor(() =>
        expect(view.ui.getByText(actionId)).toBeInTheDocument(),
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${decisionPath}/history?locale=${locale}&kind=THREAD&expectedRevision=2&stream=ACTIONS`,
      );
      fireEvent.click(
        view.ui.getByRole("button", { name: t.actionReasonEvidence }),
      );
      expect(onAction).toHaveBeenCalledWith(action);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fireEvent.click(view.ui.getByRole("button", { name: t.next }));
      await waitFor(() =>
        expect(view.ui.getByText(t.emptyHistory)).toBeInTheDocument(),
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        `${decisionPath}/history?locale=${locale}&kind=THREAD&expectedRevision=2&stream=ACTIONS&cursor=1`,
      );
      expect(uuid).not.toHaveBeenCalled();
    });
    it("moderation HIDE sends fresh reason/intent-fenced foundation command, clears evidence/outcome state and does not patch public statistics", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          content: { ...scope, revision: 3 },
          report: { id: reportId, revision: 2, state: "UPHELD" },
          replayed: false,
        }),
      );
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      fillDecision(view.ui, locale);
      fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
      await waitFor(() =>
        expect(view.ui.getByText(t.decisionSuccess)).toBeInTheDocument(),
      );
      expect(view.ui.queryByLabelText(t.reason)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(uuid).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(decisionPath);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        action: "HIDE",
        contentKind: "THREAD",
        reason: "Fresh deliberately written moderation reason",
        expectedRevision: 2,
        reportId,
        expectedReportRevision: 1,
        mutationKey: expect.any(String),
      });
    });
    it("uncertain moderation retry remains exact with locked controls and one UUID", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("synthetic network"))
        .mockResolvedValueOnce(
          ok({
            content: { ...scope, revision: 3 },
            report: { id: reportId, state: "UPHELD", revision: 2 },
            replayed: true,
          }),
        );
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      fillDecision(view.ui, locale);
      fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
      await waitFor(() =>
        expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
      );
      const original = fetchMock.mock.calls[0][1].body;
      expect(view.ui.getByLabelText(t.filter)).toBeDisabled();
      expect(view.ui.getByLabelText(t.reason)).toBeDisabled();
      fireEvent.change(view.ui.getByLabelText(t.reason), {
        target: { value: "tampered" },
      });
      fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
      await waitFor(() =>
        expect(view.ui.getByText(t.decisionSuccess)).toBeInTheDocument(),
      );
      expect(fetchMock.mock.calls[1][1].body).toBe(original);
      expect(uuid).toHaveBeenCalledTimes(1);
    });
    it("409 resets stale reason/acks and preserves frozen attempt through failed metadata reload, then allows fresh current selection only after successful reload", async () => {
      fetchMock
        .mockResolvedValueOnce(fail(409))
        .mockResolvedValueOnce(fail(503))
        .mockResolvedValueOnce(ok(queue));
      const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
      await hydrate(view);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      fillDecision(view.ui, locale);
      fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
      await waitFor(() =>
        expect(view.ui.getByLabelText(t.reason)).toHaveValue(""),
      );
      expect(view.ui.getByLabelText(t.actionIntent)).not.toBeChecked();
      fireEvent.click(
        view.ui
          .getAllByRole("button", { name: t.refreshTarget })
          .find((button) => !(button as HTMLButtonElement).disabled)!,
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(view.ui.getByLabelText(t.reason)).toBeDisabled(),
      );
      expect(view.ui.getByLabelText(t.filter)).toBeDisabled();
      expect(uuid).toHaveBeenCalledTimes(1);
      fireEvent.click(
        view.ui
          .getAllByRole("button", { name: t.refreshTarget })
          .find((button) => !(button as HTMLButtonElement).disabled)!,
      );
      await waitFor(() =>
        expect(view.ui.queryByLabelText(t.reason)).toBeNull(),
      );
      expect(fetchMock.mock.calls[2][0]).toBe(
        `/api/community/moderation/reports?locale=${locale}&state=OPEN`,
      );
      expect(uuid).toHaveBeenCalledTimes(1);
      fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
      expect(view.ui.getByLabelText(t.reason)).toHaveValue("");
      expect(view.ui.getByLabelText(t.actionIntent)).not.toBeChecked();
    });
    it.each([false, true])(
      "current moderation replay null attachment is accepted only as replay, wrong attached UUID stays uncertain (wrong=%s)",
      async (wrong) => {
        fetchMock
          .mockRejectedValueOnce(new Error("lost committed response"))
          .mockResolvedValueOnce(
            ok({
              content: { ...scope, revision: 3 },
              report: wrong
                ? { id: otherId, state: "UPHELD", revision: 2 }
                : null,
              replayed: true,
            }),
          );
        const view = ssr(<ModerationQueue locale={locale} initial={queue} />);
        await hydrate(view);
        fireEvent.click(view.ui.getByRole("button", { name: t.selectTarget }));
        fillDecision(view.ui, locale);
        fireEvent.submit(view.ui.getByRole("form", { name: t.action }));
        await waitFor(() =>
          expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
        );
        const original = fetchMock.mock.calls[0][1].body;
        fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
        if (wrong) {
          await waitFor(() =>
            expect(
              view.ui.getByRole("button", { name: t.retry }),
            ).toBeEnabled(),
          );
          expect(view.ui.queryByText(t.decisionSuccess)).toBeNull();
        } else
          await waitFor(() =>
            expect(view.ui.getByText(t.decisionSuccess)).toBeInTheDocument(),
          );
        expect(fetchMock.mock.calls[1][1].body).toBe(original);
        expect(uuid).toHaveBeenCalledTimes(1);
      },
    );
    it.each(["reviews", "threads", "detail"] as const)(
      "%s parent cannot unmount an uncertain report by refresh/pagination/create while exact retry stays mounted",
      async (mode) => {
        const unavailable = { state: "UNAVAILABLE", text: null },
          timestamp = "2026-01-01T00:00:00.000Z";
        const base = {
          ...scope,
          threadId: null,
          parentId: null,
          depth: null,
          state: "ACTIVE",
          body: {
            state: "VISIBLE",
            text: "A deliberately public synthetic body for a report.",
          },
          spoilerContext: null,
          ratingHalfStars: null,
          author: null,
          createdAt: timestamp,
          editedAt: null,
          lastActivityAt: timestamp,
        };
        const review = reviewPublicSchema.parse({
          ...base,
          kind: "REVIEW",
          title: unavailable,
        });
        const thread = discussionPublicSchema.parse({
          ...base,
          title: { state: "VISIBLE", text: "Synthetic public title" },
        });
        const node =
          mode === "reviews" ? (
            <ReviewList
              locale={locale}
              workId={workId}
              workSlug="synthetic"
              participation="VERIFIED"
              initial={{
                items: [review],
                pageSize: 25,
                statistics: {
                  reviewCount: 1,
                  ratedReviewCount: 0,
                  meanRating: null,
                },
              }}
            />
          ) : mode === "threads" ? (
            <ThreadList
              locale={locale}
              workId={workId}
              workSlug="synthetic"
              participation="VERIFIED"
              initial={{ items: [thread], pageSize: 25 }}
            />
          ) : (
            <ThreadDetail
              locale={locale}
              workId={workId}
              workSlug="synthetic"
              participation="VERIFIED"
              initialThread={thread}
              initialReplies={{ items: [], pageSize: 25 }}
            />
          );
        fetchMock
          .mockRejectedValueOnce(new Error("lost report response"))
          .mockResolvedValueOnce(
            ok({
              content: {
                ...scope,
                kind: mode === "reviews" ? "REVIEW" : "THREAD",
              },
              report: { id: reportId, state: "OPEN", revision: 1 },
              replayed: true,
            }),
          );
        const view = ssr(node);
        await hydrate(view);
        fireEvent.click(view.ui.getByRole("button", { name: t.report }));
        fireEvent.change(view.ui.getByLabelText(t.reportReason), {
          target: { value: "SPAM" },
        });
        fireEvent.submit(view.ui.getByRole("form", { name: t.reportForm }));
        await waitFor(() =>
          expect(view.ui.getByRole("button", { name: t.retry })).toBeEnabled(),
        );
        const original = fetchMock.mock.calls[0][1].body;
        expect(
          fireEvent.click(view.ui.getByRole("link", { name: t.reports })),
        ).toBe(false);
        expect(view.ui.getByRole("button", { name: t.refresh })).toBeDisabled();
        fireEvent.click(view.ui.getByRole("button", { name: t.refresh }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(
          view.ui.getByRole("form", { name: t.reportForm }),
        ).toBeInTheDocument();
        expect(view.ui.getByRole("button", { name: t.next })).toBeDisabled();
        fireEvent.click(view.ui.getByRole("button", { name: t.retry }));
        await waitFor(() =>
          expect(view.ui.getByText(t.reportSuccess)).toBeInTheDocument(),
        );
        expect(fetchMock.mock.calls[1][1].body).toBe(original);
        expect(uuid).toHaveBeenCalledTimes(1);
        expect(view.ui.getByRole("button", { name: t.refresh })).toBeEnabled();
      },
    );
    it("closed report restoration sends null report pair and allows deleted tombstone visibility restoration, never authored resurrection", async () => {
      const closedTarget = {
        ...target,
        authorState: "DELETED" as const,
        moderationState: "HIDDEN" as const,
      };
      const closed = {
        ...item,
        state: "UPHELD" as const,
        revision: 2,
        canDismiss: false,
        target: closedTarget,
      };
      fetchMock.mockResolvedValueOnce(
        ok({
          content: { ...scope, revision: 3 },
          report: null,
          replayed: false,
        }),
      );
      const confirmed = vi.fn(),
        view = ssr(
          <ModerationActionForm
            locale={locale}
            item={closed}
            onConfirmed={confirmed}
            onReload={async () => {}}
            onLocked={vi.fn()}
            onConflict={vi.fn()}
          />,
        );
      await hydrate(view);
      expect(view.ui.queryByRole("option", { name: t.dismiss })).toBeNull();
      fillDecision(view.ui, locale, "RESTORE");
      fireEvent.submit(view.ui.getByRole("form"));
      await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        action: "RESTORE",
        reportId: null,
        expectedReportRevision: null,
      });
    });
    it("erased/unavailable targets preserve bounded capability rules without inventing restore/hide authority", async () => {
      const erasedTarget = {
        ...target,
        authorState: "ERASED" as const,
        workAvailable: false,
        canHide: false,
        canRestore: false,
      };
      const view = ssr(
        <ModerationActionForm
          locale={locale}
          item={{ ...item, target: erasedTarget }}
          onConfirmed={vi.fn()}
          onReload={async () => {}}
          onLocked={vi.fn()}
          onConflict={vi.fn()}
        />,
      );
      await hydrate(view);
      expect(
        view.ui.getByRole("option", { name: t.dismiss }),
      ).toBeInTheDocument();
      expect(view.ui.queryByRole("option", { name: t.hide })).toBeNull();
      expect(view.ui.queryByRole("option", { name: t.restore })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(uuid).not.toHaveBeenCalled();
    });
  });
}
