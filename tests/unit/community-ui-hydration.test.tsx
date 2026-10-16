// @vitest-environment jsdom
// Real renderToString -> hydrateRoot readiness units with bounded synthetic HTTP only.
// These are not native-browser, signed-auth, SQL, CI, or V4B acceptance evidence.
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadList } from "../../apps/web/src/components/community/ThreadList";
import { ThreadDetail } from "../../apps/web/src/components/community/ThreadDetail";
import { OwnerManage } from "../../apps/web/src/components/community/OwnerManage";
import { OwnerActions } from "../../apps/web/src/components/community/OwnerActions";
import { ContentForm } from "../../apps/web/src/components/community/ContentForm";
import { SpoilerSection } from "../../apps/web/src/components/community/SpoilerSection";
import { Pagination } from "../../apps/web/src/components/community/Pagination";
import { useCommunityReady } from "../../apps/web/src/components/community/useCommunityReady";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import type {
  DiscussionPublic,
  CommunityOwned,
} from "../../apps/web/src/features/community/http-contracts";

vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} data-client-router="true" />
  ),
}));
const workId = "30000000-0000-4000-8000-000000000001";
const id = "30000000-0000-4000-8000-000000000002";
const replyId = "30000000-0000-4000-8000-000000000003";
const mutationKey = "30000000-0000-4000-8000-000000000004";
const masked = { state: "MASKED", text: null } as const;
const unavailable = { state: "UNAVAILABLE", text: null } as const;
const thread: DiscussionPublic = {
  id,
  workId,
  kind: "THREAD",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  state: "ACTIVE",
  title: masked,
  body: masked,
  spoilerContext: null,
  ratingHalfStars: null,
  author: { displayName: "Synthetic reader" },
  createdAt: "2026-01-01T00:00:00.000Z",
  editedAt: null,
  lastActivityAt: "2026-01-01T00:00:00.000Z",
};
const reply: DiscussionPublic = {
  ...thread,
  id: replyId,
  kind: "REPLY",
  threadId: id,
  parentId: null,
  depth: 0,
  title: unavailable,
};
const owned: CommunityOwned = {
  id,
  workId,
  kind: "THREAD",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  authorState: "ACTIVE",
  moderationState: "VISIBLE",
  workAvailable: true,
  canEdit: true,
  canWithdraw: true,
};
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
let fetchMock: ReturnType<typeof vi.fn>;
const roots: Root[] = [],
  containers: HTMLElement[] = [];
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => mutationKey) });
});
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
});
function serverDOM(node: React.ReactNode) {
  const html = renderToString(node);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  containers.push(container);
  return { container, html, ui: within(container) };
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
function expectSSRInert(container: HTMLElement) {
  const controls = container.querySelectorAll("button,input,textarea,select");
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(crypto.randomUUID).not.toHaveBeenCalled();
}

it("uses false for SSR and first hydration render, true after the real hydration commit", async () => {
  const snapshots: boolean[] = [];
  function Probe() {
    const ready = useCommunityReady();
    snapshots.push(ready);
    return (
      <button type="button" disabled={!ready}>
        Probe
      </button>
    );
  }
  const node = <Probe />;
  const { container, ui } = serverDOM(node);
  expect(snapshots).toEqual([false]);
  expectSSRInert(container);
  await hydrate(container, node);
  expect(snapshots.slice(0, 2)).toEqual([false, false]);
  expect(snapshots.at(-1)).toBe(true);
  expect(ui.getByRole("button", { name: "Probe" })).toBeEnabled();
  expect(fetchMock).not.toHaveBeenCalled();
});

for (const locale of ["en", "vi"] as const) {
  const t = communityCopy[locale];
  describe(`${locale} actual SSR hydration readiness`, () => {
    it("disables thread-list SSR controls and installs one real new-thread handler before enabling", async () => {
      const node = (
        <ThreadList
          locale={locale}
          workId={workId}
          workSlug="synthetic-work"
          initial={{ items: [thread], pageSize: 25 }}
          participation="VERIFIED"
        />
      );
      const { container, html, ui } = serverDOM(node);
      expectSSRInert(container);
      expect(html).not.toMatch(/FLAGGED_SECRET|spoilerContext|data-spoiler/);
      expect(ui.getByText(t.maskedTitle)).toBeInTheDocument();
      expect(ui.getByText(t.maskedBody)).toBeInTheDocument();
      const ingress = ui.getByRole("link", { name: t.openDiscussion });
      expect(ingress).toHaveAttribute(
        "href",
        `/${locale}/works/synthetic-work/discussions/${id}`,
      );
      expect(ingress).not.toHaveAttribute("data-client-router");
      expect(ingress.onclick).toBeNull();
      ui.getByRole("button", { name: t.newThread }).click();
      expect(ui.queryByRole("form", { name: t.newThread })).toBeNull();
      await hydrate(container, node);
      expect(ui.getByRole("button", { name: t.newThread })).toBeEnabled();
      expect(ui.getByRole("button", { name: t.checkOwner })).toBeEnabled();
      expect(ui.getByRole("button", { name: t.revealTitle })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(ui.getByRole("button", { name: t.newThread }));
      expect(ui.getAllByRole("form", { name: t.newThread })).toHaveLength(1);
      expect(ui.getByLabelText(t.title)).toBeEnabled();
      expect(ui.getByLabelText(t.title)).toHaveValue("");
      expect(ui.getByLabelText(t.body)).toHaveValue("");
      expect(ui.getByRole("button", { name: t.submit })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it.each(["ANONYMOUS", "UNVERIFIED"] as const)(
      "does not grant posting or ownership controls on hydration to %s",
      async (participation) => {
        const node = (
          <ThreadList
            locale={locale}
            workId={workId}
            workSlug="synthetic-work"
            initial={{ items: [thread], pageSize: 25 }}
            participation={participation}
          />
        );
        const { container, ui } = serverDOM(node);
        expectSSRInert(container);
        await hydrate(container, node);
        expect(ui.queryByRole("button", { name: t.newThread })).toBeNull();
        expect(ui.queryByRole("button", { name: t.checkOwner })).toBeNull();
        expect(ui.getByRole("button", { name: t.refresh })).toBeEnabled();
        expect(ui.getByRole("button", { name: t.revealBody })).toBeDisabled();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
    it("checks ownership only after a hydrated click and opens a blank editor only after scoped private verification", async () => {
      fetchMock.mockResolvedValue(ok(owned));
      const node = (
        <OwnerActions
          locale={locale}
          scope={thread}
          publicContent={thread}
          seed={owned}
          onComplete={vi.fn()}
        />
      );
      const { container, ui } = serverDOM(node);
      expectSSRInert(container);
      expect(ui.queryByRole("button", { name: t.edit })).toBeNull();
      ui.getByRole("button", { name: t.checkOwner }).click();
      expect(fetchMock).not.toHaveBeenCalled();
      await hydrate(container, node);
      expect(ui.getByRole("button", { name: t.checkOwner })).toBeEnabled();
      expect(ui.getByRole("button", { name: t.withdraw })).toBeDisabled();
      expect(ui.queryByRole("button", { name: t.edit })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(ui.getByRole("button", { name: t.checkOwner }));
      await waitFor(() =>
        expect(ui.getByRole("button", { name: t.edit })).toBeEnabled(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/community/works/${workId}/contents/${id}/owned?contentKind=THREAD`,
      );
      fireEvent.click(ui.getByRole("button", { name: t.edit }));
      await waitFor(() =>
        expect(
          ui.getByRole("form", { name: t.replacement }),
        ).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(ui.getByLabelText(t.title)).toHaveValue("");
      expect(ui.getByLabelText(t.body)).toHaveValue("");
      expect(ui.getByLabelText(t.replacementIntent)).not.toBeChecked();
      expect(ui.getByRole("button", { name: t.save })).toBeDisabled();
      expect(
        fetchMock.mock.calls.every(
          ([, options]) => options.method === undefined,
        ),
      ).toBe(true);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it("keeps detail reply togglers inert on SSR, then installs legitimate root/nested handlers without HTTP", async () => {
      const node = (
        <ThreadDetail
          locale={locale}
          workId={workId}
          workSlug="synthetic-work"
          initialThread={thread}
          initialReplies={{ items: [reply], pageSize: 25 }}
          participation="VERIFIED"
        />
      );
      const { container, ui } = serverDOM(node);
      expectSSRInert(container);
      ui.getByRole("button", { name: t.reply }).click();
      expect(ui.queryByRole("form", { name: t.reply })).toBeNull();
      await hydrate(container, node);
      expect(ui.getByRole("button", { name: t.reply })).toBeEnabled();
      expect(ui.getByRole("button", { name: t.nestedReply })).toBeEnabled();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(ui.getByRole("button", { name: t.nestedReply }));
      expect(ui.getAllByRole("form", { name: t.reply })).toHaveLength(1);
      expect(ui.queryByLabelText(t.title)).toBeNull();
      expect(ui.getByLabelText(t.body)).toHaveValue("");
      expect(ui.getByRole("button", { name: t.submit })).toBeDisabled();
      fireEvent.click(ui.getByRole("button", { name: t.cancel }));
      expect(ui.queryByRole("form", { name: t.reply })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("does not enable reply creation for a withdrawn root when hydration enables other handlers", async () => {
      const withdrawn: DiscussionPublic = {
        ...thread,
        state: "DELETED",
        title: unavailable,
        body: unavailable,
        author: null,
        createdAt: null,
        lastActivityAt: null,
      };
      const node = (
        <ThreadDetail
          locale={locale}
          workId={workId}
          workSlug="synthetic-work"
          initialThread={withdrawn}
          initialReplies={{ items: [reply], pageSize: 25 }}
          participation="VERIFIED"
        />
      );
      const { container, ui } = serverDOM(node);
      expectSSRInert(container);
      await hydrate(container, node);
      expect(ui.queryByRole("button", { name: t.reply })).toBeNull();
      expect(ui.queryByRole("button", { name: t.nestedReply })).toBeNull();
      expect(ui.getByRole("button", { name: t.refresh })).toBeEnabled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each(["create", "replace", "reply"] as const)(
      "keeps %s fields blank and disabled in SSR; hydration does not bypass acknowledgment",
      async (mode) => {
        const cancel = vi.fn();
        const node = (
          <ContentForm
            locale={locale}
            workId={workId}
            kind={mode === "reply" ? "REPLY" : "THREAD"}
            editing={mode === "replace" ? thread : undefined}
            threadId={mode === "reply" ? id : undefined}
            onComplete={vi.fn()}
            onCancel={cancel}
          />
        );
        const { container, ui } = serverDOM(node);
        expectSSRInert(container);
        expect(ui.getByLabelText(t.body)).toHaveValue("");
        expect(ui.getByLabelText(t.context)).toHaveValue("");
        if (mode !== "reply")
          expect(ui.getByLabelText(t.title)).toHaveValue("");
        ui.getByRole("button", { name: t.cancel }).click();
        expect(cancel).not.toHaveBeenCalled();
        await hydrate(container, node);
        expect(ui.getByLabelText(t.body)).toBeEnabled();
        expect(ui.getByLabelText(t.body)).toHaveValue("");
        expect(ui.getByLabelText(t.intent)).not.toBeChecked();
        const submit = ui.getByRole("button", {
          name: mode === "replace" ? t.save : t.submit,
        });
        expect(submit).toBeDisabled();
        fireEvent.click(ui.getByLabelText(t.intent));
        if (mode === "replace") {
          expect(submit).toBeDisabled();
          fireEvent.click(ui.getByLabelText(t.replacementIntent));
        }
        expect(submit).toBeEnabled();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(crypto.randomUUID).not.toHaveBeenCalled();
        fireEvent.click(ui.getByRole("button", { name: t.cancel }));
        expect(cancel).toHaveBeenCalledTimes(1);
      },
    );
    it.each(["title", "body"] as const)(
      "keeps %s reveal masked/inert until hydration and explicit selected acknowledgment",
      async (section) => {
        const text = "Selected escaped <text>";
        fetchMock.mockResolvedValue(
          ok({ id, workId, kind: "THREAD", revision: 1, [section]: text }),
        );
        const node = (
          <SpoilerSection locale={locale} content={thread} section={section} />
        );
        const { container, html, ui } = serverDOM(node);
        expectSSRInert(container);
        expect(html).not.toContain(text);
        expect(
          ui.getByText(section === "title" ? t.maskedTitle : t.maskedBody),
        ).toBeInTheDocument();
        await hydrate(container, node);
        expect(ui.getByLabelText(t.revealAck)).toBeEnabled();
        expect(ui.getByLabelText(t.revealAck)).not.toBeChecked();
        const button = ui.getByRole("button", {
          name: section === "title" ? t.revealTitle : t.revealBody,
        });
        expect(button).toBeDisabled();
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.click(ui.getByLabelText(t.revealAck));
        expect(button).toBeEnabled();
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.click(button);
        await waitFor(() => expect(ui.getByText(text)).toBeInTheDocument());
        expect(container.querySelector("text")).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
          workId,
          targetId: id,
          contentKind: "THREAD",
          expectedRevision: 1,
          title: section === "title",
          body: section === "body",
          spoilerRevealAcknowledged: true,
        });
        expect(crypto.randomUUID).not.toHaveBeenCalled();
      },
    );
    it("disables private manage SSR controls and refreshes UUID metadata only on a hydrated click", async () => {
      const metadata: CommunityOwned = {
        ...owned,
        moderationState: "HIDDEN",
        workAvailable: false,
        canEdit: false,
      };
      const initial = { items: [metadata], pageSize: 25 as const };
      fetchMock.mockResolvedValue(ok(initial));
      const node = <OwnerManage locale={locale} initial={initial} />;
      const { container, ui } = serverDOM(node);
      expectSSRInert(container);
      expect(ui.getByText(t.unavailable)).toBeInTheDocument();
      expect(ui.queryByRole("button", { name: t.edit })).toBeNull();
      ui.getByRole("button", { name: t.refresh }).click();
      expect(fetchMock).not.toHaveBeenCalled();
      await hydrate(container, node);
      expect(ui.getByRole("button", { name: t.refresh })).toBeEnabled();
      expect(ui.getByLabelText(t.withdrawAck)).toBeEnabled();
      expect(ui.getByRole("button", { name: t.withdraw })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(ui.getByRole("button", { name: t.refresh }));
      await waitFor(() =>
        expect(ui.getByText(t.unavailable)).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/community/owned?locale=${locale}&page=1`,
      );
      expect(ui.queryByRole("button", { name: t.edit })).toBeNull();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
    it("does not invoke SSR pagination callbacks; hydration enables only bounded navigation", async () => {
      const onPage = vi.fn();
      const node = (
        <Pagination
          locale={locale}
          page={2}
          count={25}
          busy={false}
          onPage={onPage}
        />
      );
      const { container, ui } = serverDOM(node);
      expectSSRInert(container);
      ui.getByRole("button", { name: t.next }).click();
      expect(onPage).not.toHaveBeenCalled();
      await hydrate(container, node);
      expect(ui.getByRole("button", { name: t.previous })).toBeEnabled();
      expect(ui.getByRole("button", { name: t.next })).toBeEnabled();
      expect(onPage).not.toHaveBeenCalled();
      fireEvent.click(ui.getByRole("button", { name: t.next }));
      expect(onPage).toHaveBeenCalledExactlyOnceWith(3);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([
      { page: 1, count: 0 },
      { page: 200, count: 25 },
    ])(
      "hydration retains pagination bounds at page $page",
      async ({ page, count }) => {
        const onPage = vi.fn();
        const node = (
          <Pagination
            locale={locale}
            page={page}
            count={count}
            busy={false}
            onPage={onPage}
          />
        );
        const { container, ui } = serverDOM(node);
        expectSSRInert(container);
        await hydrate(container, node);
        expect(ui.getByRole("button", { name: t.next })).toBeDisabled();
        if (page === 1)
          expect(ui.getByRole("button", { name: t.previous })).toBeDisabled();
        expect(onPage).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });
}
