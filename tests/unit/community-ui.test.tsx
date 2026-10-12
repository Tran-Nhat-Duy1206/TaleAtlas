// @vitest-environment jsdom
// Bounded mocked HTTP UI units; not native-browser/auth/SQL or V4B acceptance.
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
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpoilerSection } from "../../apps/web/src/components/community/SpoilerSection";
import { ContentForm } from "../../apps/web/src/components/community/ContentForm";
import {
  OwnerActions,
  canReplaceOwnedContent,
} from "../../apps/web/src/components/community/OwnerActions";
import { ThreadList } from "../../apps/web/src/components/community/ThreadList";
import { ThreadDetail } from "../../apps/web/src/components/community/ThreadDetail";
import { OwnerManage } from "../../apps/web/src/components/community/OwnerManage";
import { Pagination } from "../../apps/web/src/components/community/Pagination";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import {
  discussionPublicSchema,
  type DiscussionPublic,
  type CommunityOwned,
} from "../../apps/web/src/features/community/http-contracts";
import { communityThreadCreateSchema } from "../../apps/web/src/features/community/contracts";
import { freezeCommunityMutation } from "../../apps/web/src/components/community/client";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const workId = "10000000-0000-4000-8000-000000000001",
  id = "10000000-0000-4000-8000-000000000002",
  other = "10000000-0000-4000-8000-000000000003",
  key = "10000000-0000-4000-8000-000000000004";
const now = "2026-01-01T00:00:00.000Z";
const unavailable = { state: "UNAVAILABLE", text: null } as const;
const masked = { state: "MASKED", text: null } as const;
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
  author: { displayName: "Reader" },
  createdAt: now,
  editedAt: null,
  lastActivityAt: now,
};
const visible: DiscussionPublic = {
  ...thread,
  title: { state: "VISIBLE", text: "Visible title" },
  body: { state: "VISIBLE", text: "Visible body" },
};
const reply: DiscussionPublic = {
  ...thread,
  id: other,
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
const tombstone: DiscussionPublic = {
  ...thread,
  revision: 2,
  state: "DELETED",
  title: unavailable,
  body: unavailable,
  author: null,
  createdAt: null,
  editedAt: null,
  lastActivityAt: null,
};
const list = (items: DiscussionPublic[]) => ({ items, pageSize: 25 as const });
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => key) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const click = (text: string) =>
  fireEvent.click(screen.getByRole("button", { name: text }));
function fill(
  locale: "en" | "vi" = "en",
  edit = false,
  kind: "THREAD" | "REPLY" = "THREAD",
) {
  const t = communityCopy[locale];
  if (kind === "THREAD")
    fireEvent.change(screen.getByLabelText(t.title), {
      target: { value: "  New title  " },
    });
  fireEvent.change(screen.getByLabelText(t.body), {
    target: { value: " New body " },
  });
  fireEvent.click(screen.getByLabelText(t.intent));
  if (edit) fireEvent.click(screen.getByLabelText(t.replacementIntent));
}
async function revealSection(
  section: "title" | "body",
  locale: "en" | "vi" = "en",
) {
  fireEvent.click(screen.getByLabelText(communityCopy[locale].revealAck));
  click(
    section === "title"
      ? communityCopy[locale].revealTitle
      : communityCopy[locale].revealBody,
  );
}

describe("spoiler delivery", () => {
  it.each(["en", "vi"] as const)(
    "SSR/hydration masks all independent text/context in %s without a request",
    async (locale) => {
      const initialReplies = list([reply]);
      const node = (
        <ThreadDetail
          locale={locale}
          workId={workId}
          workSlug="synthetic-slug"
          initialThread={thread}
          initialReplies={initialReplies}
          participation="ANONYMOUS"
        />
      );
      const html = renderToString(node);
      expect(html).not.toMatch(/SECRET|spoilerContext|data-spoiler|title="/);
      expect(html).toContain(communityCopy[locale].maskedTitle);
      expect(html).toContain(communityCopy[locale].maskedBody);
      const container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = html;
      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, node);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain("SECRET");
      await act(async () => root!.unmount());
      container.remove();
    },
  );
  it.each(["en", "vi"] as const)(
    "requires selected-section acknowledgment and escapes plain text in %s",
    async (locale) => {
      const text = '<img src=x onerror="evil()">';
      fetchMock.mockResolvedValue(
        ok({ id, workId, kind: "THREAD", revision: 1, title: text }),
      );
      render(
        <SpoilerSection locale={locale} content={thread} section="title" />,
      );
      expect(screen.getByRole("button")).toBeDisabled();
      await revealSection("title", locale);
      await screen.findByText(text);
      expect(document.querySelector("img")).toBeNull();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        workId,
        targetId: id,
        contentKind: "THREAD",
        expectedRevision: 1,
        title: true,
        body: false,
        spoilerRevealAcknowledged: true,
      });
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      });
    },
  );
  it("revealing parent never reveals its body or independently masked child", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id,
        workId,
        kind: "THREAD",
        revision: 1,
        title: "Selected parent title",
      }),
    );
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={thread}
        initialReplies={list([reply])}
        participation="ANONYMOUS"
      />,
    );
    fireEvent.click(screen.getAllByLabelText(communityCopy.en.revealAck)[0]);
    click(communityCopy.en.revealTitle);
    await screen.findByText("Selected parent title");
    expect(screen.getAllByText(communityCopy.en.maskedBody)).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { id: other },
    { workId: other },
    { kind: "REPLY" },
    { revision: 2 },
    { body: "UNSELECTED SECRET" },
    { spoilerContext: "OTHER SECTION SECRET" },
    { extra: "SECRET" },
    { title: null },
  ])(
    "rejects selected reveal scope/shape mismatch %j before displaying text",
    async (patch) => {
      fetchMock.mockResolvedValue(
        ok({
          id,
          workId,
          kind: "THREAD",
          revision: 1,
          title: "SECRET",
          ...patch,
        }),
      );
      render(<SpoilerSection locale="en" content={thread} section="title" />);
      await revealSection("title");
      await screen.findByRole("alert");
      expect(screen.queryByText("SECRET")).toBeNull();
    },
  );
  it("allows context only when no independently masked other section exists", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id,
        workId,
        kind: "THREAD",
        revision: 1,
        title: "Title reveal",
        spoilerContext: "Selected context",
      }),
    );
    render(
      <SpoilerSection
        locale="en"
        content={{ ...thread, body: visible.body }}
        section="title"
      />,
    );
    await revealSection("title");
    await screen.findByText("Selected context");
  });
  it.each(["revision", "refresh"] as const)(
    "remasks on %s without automatically revealing again",
    async (change) => {
      fetchMock.mockResolvedValue(
        ok({ id, workId, kind: "THREAD", revision: 1, body: "SECRET" }),
      );
      const view = render(
        <SpoilerSection locale="en" content={thread} section="body" />,
      );
      await revealSection("body");
      await screen.findByText("SECRET");
      view.rerender(
        <SpoilerSection
          locale="en"
          content={change === "revision" ? { ...thread, revision: 2 } : thread}
          section="body"
          refreshToken={change === "refresh" ? 1 : 0}
        />,
      );
      expect(screen.queryByText("SECRET")).toBeNull();
      expect(
        screen.getByLabelText(communityCopy.en.revealAck),
      ).not.toBeChecked();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("drops late reveal after identity/revision replacement", async () => {
    let resolve!: (data: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(
      <SpoilerSection locale="en" content={thread} section="body" />,
    );
    await revealSection("body");
    view.rerender(
      <SpoilerSection
        locale="en"
        content={{ ...thread, revision: 2 }}
        section="body"
      />,
    );
    await act(async () =>
      resolve(
        ok({ id, workId, kind: "THREAD", revision: 1, body: "STALE SECRET" }),
      ),
    );
    expect(screen.queryByText("STALE SECRET")).toBeNull();
  });
});

describe("public mutation intent and exact attempts", () => {
  it("requires public intent and validates before networking", async () => {
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="THREAD"
        onComplete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: communityCopy.en.submit }),
    ).toBeDisabled();
    fill();
    fireEvent.change(screen.getByLabelText(communityCopy.en.body), {
      target: { value: "bad\u202etext" },
    });
    click(communityCopy.en.submit);
    await screen.findByRole("alert");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["en", "vi"] as const)(
    "deliberately posts normalized independent public content in %s",
    async (locale) => {
      const complete = vi.fn();
      fetchMock.mockResolvedValue(
        ok({
          content: {
            ...visible,
            title: { state: "VISIBLE", text: "New title" },
            body: { state: "VISIBLE", text: "New body" },
          },
          replayed: false,
        }),
      );
      render(
        <ContentForm
          locale={locale}
          workId={workId}
          kind="THREAD"
          onComplete={complete}
        />,
      );
      fill(locale);
      click(communityCopy[locale].submit);
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/api/community/works/${workId}/threads`,
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        title: "New title",
        body: "New body",
        titleSpoiler: false,
        bodySpoiler: false,
        spoilerContext: null,
        publicSubmissionAcknowledged: true,
        mutationKey: key,
      });
    },
  );
  it.each(["network", "500", "malformed"] as const)(
    "retries %s uncertainty with the exact serialized string and UUID",
    async (failure) => {
      const complete = vi.fn();
      if (failure === "network")
        fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      else if (failure === "500")
        fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      else
        fetchMock.mockResolvedValueOnce(
          ok({ unexpected: "not a valid acknowledgment" }),
        );
      fetchMock.mockResolvedValueOnce(ok({ content: visible, replayed: true }));
      render(
        <ContentForm
          locale="en"
          workId={workId}
          kind="THREAD"
          onComplete={complete}
        />,
      );
      fill();
      click(communityCopy.en.submit);
      await screen.findByRole("button", { name: communityCopy.en.retry });
      expect(screen.getByLabelText(communityCopy.en.body)).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: communityCopy.en.newAttempt }),
      ).toBeNull();
      click(communityCopy.en.retry);
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[1][1].body).toBe(
        fetchMock.mock.calls[0][1].body,
      );
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { workId: other },
    { kind: "REPLY", title: unavailable, threadId: other, depth: 0 },
    { revision: 3 },
  ])(
    "rejects mutation mismatched scope %j before claiming success",
    async (patch) => {
      const complete = vi.fn();
      fetchMock.mockResolvedValue(
        ok({ content: { ...visible, ...patch }, replayed: false }),
      );
      render(
        <ContentForm
          locale="en"
          workId={workId}
          kind="THREAD"
          onComplete={complete}
        />,
      );
      fill();
      click(communityCopy.en.submit);
      await screen.findByRole("alert");
      expect(complete).not.toHaveBeenCalled();
      expect(screen.queryByText(communityCopy.en.success)).toBeNull();
    },
  );
  it("409 has deliberate reload, no automatic retry or fresh mutation key", async () => {
    const reload = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="THREAD"
        onComplete={reload}
      />,
    );
    fill();
    click(communityCopy.en.submit);
    await screen.findByText(communityCopy.en.conflict);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: communityCopy.en.retry }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: communityCopy.en.newAttempt }),
    ).toBeNull();
    click(communityCopy.en.refresh);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("replacement editor is blank and requires deliberate complete replacement plus public intent", async () => {
    const complete = vi.fn();
    fetchMock.mockResolvedValue(
      ok({ content: { ...visible, revision: 2 }, replayed: false }),
    );
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="THREAD"
        editing={thread}
        onComplete={complete}
      />,
    );
    expect(screen.getByLabelText(communityCopy.en.title)).toHaveValue("");
    expect(screen.getByLabelText(communityCopy.en.body)).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
    fill();
    expect(
      screen.getByRole("button", { name: communityCopy.en.save }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText(communityCopy.en.replacementIntent));
    click(communityCopy.en.save);
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contentKind: "THREAD",
      expectedRevision: 1,
    });
  });
  it.each([false, true])(
    "accepts scoped edit NOOP at unchanged revision (replayed=%s)",
    async (replayed) => {
      const complete = vi.fn();
      const unchanged = {
        ...visible,
        title: { state: "VISIBLE" as const, text: "New title" },
        body: { state: "VISIBLE" as const, text: "New body" },
      };
      if (replayed)
        fetchMock.mockRejectedValueOnce(new TypeError("uncertain result"));
      fetchMock.mockResolvedValueOnce(ok({ content: unchanged, replayed }));
      render(
        <ContentForm
          locale="en"
          workId={workId}
          kind="THREAD"
          editing={unchanged}
          onComplete={complete}
        />,
      );
      fill("en", true);
      click(communityCopy.en.save);
      if (replayed) {
        await screen.findByRole("button", { name: communityCopy.en.retry });
        click(communityCopy.en.retry);
      }
      await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("status")).toHaveTextContent(
        communityCopy.en.success,
      );
      expect(
        screen.queryByRole("button", { name: communityCopy.en.retry }),
      ).toBeNull();
      expect(screen.getByLabelText(communityCopy.en.body)).toBeEnabled();
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      if (replayed)
        expect(fetchMock.mock.calls[1][1].body).toBe(
          fetchMock.mock.calls[0][1].body,
        );
    },
  );
  it.each([2, 5])(
    "does not confirm regressed or newer edit revision %s",
    async (revision) => {
      const complete = vi.fn();
      fetchMock.mockResolvedValue(
        ok({ content: { ...visible, revision }, replayed: true }),
      );
      render(
        <ContentForm
          locale="en"
          workId={workId}
          kind="THREAD"
          editing={{ ...visible, revision: 3 }}
          onComplete={complete}
        />,
      );
      fill("en", true);
      click(communityCopy.en.save);
      await screen.findByText(communityCopy.en.conflict);
      expect(complete).not.toHaveBeenCalled();
      expect(screen.queryByText(communityCopy.en.success)).toBeNull();
    },
  );
  it("does not confirm a same-revision edit NOOP with changed reply topology", async () => {
    const complete = vi.fn();
    fetchMock.mockResolvedValue(
      ok({ content: { ...reply, threadId: key }, replayed: true }),
    );
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="REPLY"
        editing={reply}
        onComplete={complete}
      />,
    );
    fill("en", true, "REPLY");
    click(communityCopy.en.save);
    await screen.findByText(communityCopy.en.conflict);
    expect(complete).not.toHaveBeenCalled();
  });
  it("reply command binds immutable parent/thread/depth", async () => {
    const complete = vi.fn();
    fetchMock.mockResolvedValue(ok({ content: reply, replayed: false }));
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="REPLY"
        threadId={id}
        parentId={null}
        depth={0}
        onComplete={complete}
      />,
    );
    fill("en", false, "REPLY");
    click(communityCopy.en.submit);
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      threadId: id,
      parentId: null,
      depth: 0,
    });
  });
  it("rejects reply acknowledgment bound to another parent/depth", async () => {
    const complete = vi.fn();
    fetchMock.mockResolvedValue(
      ok({ content: { ...reply, parentId: key, depth: 1 }, replayed: false }),
    );
    render(
      <ContentForm
        locale="en"
        workId={workId}
        kind="REPLY"
        threadId={id}
        parentId={null}
        depth={0}
        onComplete={complete}
      />,
    );
    fill("en", false, "REPLY");
    click(communityCopy.en.submit);
    await screen.findByText(communityCopy.en.conflict);
    expect(complete).not.toHaveBeenCalled();
  });
  it("freezes normalized payload once, rejecting unknown/private fields", () => {
    const payload = {
      title: "  Cafe\u0301  ",
      body: " Text ",
      titleSpoiler: false,
      bodySpoiler: false,
      spoilerContext: null,
      publicSubmissionAcknowledged: true,
      mutationKey: key.toUpperCase(),
    };
    const attempt = freezeCommunityMutation(
      communityThreadCreateSchema,
      payload,
      "/api/community/works/uuid/threads",
      "POST",
    );
    payload.body = "changed";
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(JSON.parse(attempt.body)).toMatchObject({
      title: "Café",
      body: "Text",
      mutationKey: key,
    });
    expect(() =>
      freezeCommunityMutation(
        communityThreadCreateSchema,
        { ...payload, privateNotes: "private" },
        "url",
        "POST",
      ),
    ).toThrow();
  });
});

describe("private owner eligibility and withdrawal", () => {
  it("display-name equality or a seed does not authorize editing without private GET", async () => {
    fetchMock.mockResolvedValue(ok(owned));
    render(
      <OwnerActions
        locale="en"
        scope={thread}
        publicContent={thread}
        seed={owned}
        onComplete={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: communityCopy.en.edit }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    click(communityCopy.en.checkOwner);
    await screen.findByRole("button", { name: communityCopy.en.edit });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/community/works/${workId}/contents/${id}/owned?contentKind=THREAD`,
    );
    click(communityCopy.en.edit);
    await screen.findByRole("form", { name: communityCopy.en.replacement });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(communityCopy.en.body)).toHaveValue("");
  });
  it.each([
    { id: other },
    { workId: other },
    { revision: 2 },
    { canEdit: false },
    { moderationState: "HIDDEN", canEdit: false },
    { workAvailable: false, canEdit: false },
  ])(
    "owner metadata cannot enable editor for mismatch/unavailable %j",
    async (patch) => {
      fetchMock.mockResolvedValue(ok({ ...owned, ...patch }));
      render(
        <OwnerActions
          locale="en"
          scope={thread}
          publicContent={thread}
          onComplete={vi.fn()}
        />,
      );
      click(communityCopy.en.checkOwner);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByText(communityCopy.en.loading)).toBeNull(),
      );
      expect(
        screen.queryByRole("button", { name: communityCopy.en.edit }),
      ).toBeNull();
    },
  );
  it("checks metadata/public revision and all topology, never an author label", () => {
    expect(canReplaceOwnedContent(owned, thread)).toBe(true);
    expect(canReplaceOwnedContent({ ...owned, revision: 2 }, thread)).toBe(
      false,
    );
    expect(canReplaceOwnedContent(owned, { ...thread, state: "HIDDEN" })).toBe(
      false,
    );
    expect(canReplaceOwnedContent({ ...owned, threadId: other }, thread)).toBe(
      false,
    );
  });
  it.each(["en", "vi"] as const)(
    "privately withdraws hidden/unpublished content by UUID in %s, without title/text",
    async (locale) => {
      const metadata = {
        ...owned,
        workAvailable: false,
        moderationState: "HIDDEN" as const,
        canEdit: false,
      };
      const complete = vi.fn();
      fetchMock
        .mockResolvedValueOnce(ok(metadata))
        .mockResolvedValueOnce(ok({ content: tombstone, replayed: false }));
      render(
        <OwnerManage
          locale={locale}
          initial={{ items: [metadata], pageSize: 25 }}
        />,
      );
      expect(
        screen.getByText(communityCopy[locale].unavailable),
      ).toBeInTheDocument();
      expect(screen.queryByText("Visible title")).toBeNull();
      fireEvent.click(screen.getByLabelText(communityCopy[locale].withdrawAck));
      click(communityCopy[locale].withdraw);
      // Third call is the explicit post-withdraw metadata-list refresh, not a public catalog read.
      await waitFor(() =>
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2),
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        `/api/community/works/${workId}/contents/${id}/withdraw`,
      );
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        contentKind: "THREAD",
        expectedRevision: 1,
        mutationKey: key,
      });
      expect(complete).not.toHaveBeenCalled();
    },
  );
  it("rechecks before withdrawal and requires explicit reload on changed revision", async () => {
    const complete = vi.fn();
    fetchMock.mockResolvedValue(ok({ ...owned, revision: 2 }));
    render(
      <OwnerActions
        locale="en"
        scope={thread}
        seed={owned}
        onComplete={complete}
      />,
    );
    fireEvent.click(screen.getByLabelText(communityCopy.en.withdrawAck));
    click(communityCopy.en.withdraw);
    await screen.findByText(communityCopy.en.conflict);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it("withdrawal retries exact frozen payload and key, without rerunning metadata", async () => {
    const complete = vi.fn();
    fetchMock
      .mockResolvedValueOnce(ok(owned))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(ok({ content: tombstone, replayed: true }));
    render(
      <OwnerActions
        locale="en"
        scope={thread}
        seed={owned}
        onComplete={complete}
      />,
    );
    fireEvent.click(screen.getByLabelText(communityCopy.en.withdrawAck));
    click(communityCopy.en.withdraw);
    await screen.findByRole("button", { name: communityCopy.en.retry });
    click(communityCopy.en.retry);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[2][1].body).toBe(
      fetchMock.mock.calls[1][1].body,
    );
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it.each([
    { id: other },
    { workId: other },
    { revision: 4 },
    {
      state: "ACTIVE",
      title: visible.title,
      body: visible.body,
      author: visible.author,
      createdAt: now,
      lastActivityAt: now,
    },
  ])(
    "rejects withdrawal acknowledgment mismatch/nonblank %j",
    async (patch) => {
      const complete = vi.fn();
      fetchMock
        .mockResolvedValueOnce(ok(owned))
        .mockResolvedValueOnce(
          ok({ content: { ...tombstone, ...patch }, replayed: false }),
        );
      render(
        <OwnerActions
          locale="en"
          scope={thread}
          seed={owned}
          onComplete={complete}
        />,
      );
      fireEvent.click(screen.getByLabelText(communityCopy.en.withdrawAck));
      click(communityCopy.en.withdraw);
      await screen.findByRole("alert");
      expect(complete).not.toHaveBeenCalled();
      expect(screen.queryByText(communityCopy.en.withdrawn)).toBeNull();
    },
  );
  it("scope replacement drops private eligibility synchronously", async () => {
    fetchMock.mockResolvedValue(ok(owned));
    const view = render(
      <OwnerActions
        locale="en"
        scope={thread}
        publicContent={thread}
        onComplete={vi.fn()}
      />,
    );
    click(communityCopy.en.checkOwner);
    await screen.findByRole("button", { name: communityCopy.en.edit });
    view.rerender(
      <OwnerActions
        locale="en"
        scope={{ ...thread, revision: 2 }}
        publicContent={{ ...thread, revision: 2 }}
        onComplete={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: communityCopy.en.edit }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: communityCopy.en.checkOwner }),
    ).toBeInTheDocument();
  });
});

describe("bounded lists and reply participation", () => {
  it.each(["ANONYMOUS", "UNVERIFIED"] as const)(
    "does not mount owner checks or posting for %s",
    (participation) => {
      render(
        <ThreadList
          locale="en"
          workId={workId}
          workSlug="synthetic-slug"
          initial={list([thread])}
          participation={participation}
        />,
      );
      expect(
        screen.queryByRole("button", { name: communityCopy.en.checkOwner }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: communityCopy.en.newThread }),
      ).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("renders plain escaped text and UUID-only discussion links", () => {
    render(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([
          {
            ...visible,
            title: { state: "VISIBLE", text: "<script>SECRET</script>" },
          },
        ])}
        participation="VERIFIED"
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(
      screen.getByRole("link", { name: communityCopy.en.openDiscussion }),
    ).toHaveAttribute("href", `/en/works/synthetic-slug/discussions/${id}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects cross-work and duplicate initial rows before SSR output", () => {
    expect(
      renderToString(
        <ThreadList
          locale="en"
          workId={workId}
          workSlug="synthetic-slug"
          initial={list([{ ...visible, workId: other }])}
          participation="VERIFIED"
        />,
      ),
    ).not.toContain("Visible body");
    expect(
      renderToString(
        <ThreadList
          locale="en"
          workId={workId}
          workSlug="synthetic-slug"
          initial={list([visible, visible])}
          participation="VERIFIED"
        />,
      ),
    ).not.toContain("Visible body");
  });
  it("empty initial list still requires canonical UUID scope before enabling any request", () => {
    render(
      <ThreadList
        locale="en"
        workId="../private"
        workSlug="synthetic-slug"
        initial={list([])}
        participation="VERIFIED"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      communityCopy.en.scopeError,
    );
    expect(
      screen.queryByRole("button", { name: communityCopy.en.newThread }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("same-revision RSC replacement remasks previous reveal", async () => {
    fetchMock.mockResolvedValue(
      ok({ id, workId, kind: "THREAD", revision: 1, title: "SECRET" }),
    );
    const view = render(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([thread])}
        participation="ANONYMOUS"
      />,
    );
    fireEvent.click(screen.getAllByLabelText(communityCopy.en.revealAck)[0]);
    click(communityCopy.en.revealTitle);
    await screen.findByText("SECRET");
    view.rerender(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([{ ...thread }])}
        participation="ANONYMOUS"
      />,
    );
    expect(screen.queryByText("SECRET")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("same-revision detail SSR replacement remasks and clears selected reply editor", async () => {
    fetchMock.mockResolvedValue(
      ok({ id, workId, kind: "THREAD", revision: 1, title: "REVEALED DETAIL" }),
    );
    const initialReplies = list([reply]);
    const props = {
      locale: "en" as const,
      workId,
      workSlug: "synthetic-slug",
      initialThread: thread,
      initialReplies,
      participation: "VERIFIED" as const,
    };
    const view = render(<ThreadDetail {...props} />);
    fireEvent.click(screen.getAllByLabelText(communityCopy.en.revealAck)[0]);
    click(communityCopy.en.revealTitle);
    await screen.findByText("REVEALED DETAIL");
    click(communityCopy.en.reply);
    expect(
      screen.getByRole("form", { name: communityCopy.en.reply }),
    ).toBeInTheDocument();
    view.rerender(
      <ThreadDetail {...props} initialReplies={list([{ ...reply }])} />,
    );
    expect(screen.queryByText("REVEALED DETAIL")).toBeNull();
    expect(
      screen.queryByRole("form", { name: communityCopy.en.reply }),
    ).toBeNull();
    expect(
      screen.getAllByLabelText(communityCopy.en.revealAck)[0],
    ).not.toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("late list read cannot replace a newer same-revision SSR response", async () => {
    let resolve!: (data: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([])}
        participation="ANONYMOUS"
      />,
    );
    click(communityCopy.en.refresh);
    view.rerender(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([thread])}
        participation="ANONYMOUS"
      />,
    );
    await act(async () =>
      resolve(
        ok(
          list([
            { ...visible, body: { state: "VISIBLE", text: "STALE READ BODY" } },
          ]),
        ),
      ),
    );
    expect(screen.queryByText("STALE READ BODY")).toBeNull();
    expect(screen.getByText(communityCopy.en.maskedTitle)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("same-revision owner SSR replacement clears withdrawal acknowledgment without auto-reading", () => {
    const view = render(
      <OwnerManage locale="en" initial={{ items: [owned], pageSize: 25 }} />,
    );
    fireEvent.click(screen.getByLabelText(communityCopy.en.withdrawAck));
    expect(screen.getByLabelText(communityCopy.en.withdrawAck)).toBeChecked();
    view.rerender(
      <OwnerManage
        locale="en"
        initial={{ items: [{ ...owned }], pageSize: 25 }}
      />,
    );
    expect(
      screen.getByLabelText(communityCopy.en.withdrawAck),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: communityCopy.en.withdraw }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("explicit refresh clears old text even if new work visibility/read fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    render(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([visible])}
        participation="ANONYMOUS"
      />,
    );
    click(communityCopy.en.refresh);
    expect(screen.queryByText("Visible body")).toBeNull();
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/community/works/${workId}/threads?locale=en&page=1`,
    );
  });
  it("rejects cross-work network list before displaying it", async () => {
    fetchMock.mockResolvedValue(ok(list([{ ...visible, workId: other }])));
    render(
      <ThreadList
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list([])}
        participation="ANONYMOUS"
      />,
    );
    click(communityCopy.en.refresh);
    await screen.findByRole("alert");
    expect(screen.queryByText("Visible body")).toBeNull();
  });
  it("fixed page25 permits next and previous with max200 navigation", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      ...visible,
      id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    }));
    fetchMock.mockResolvedValue(ok(list([])));
    const view = render(
      <ThreadList
        locale="vi"
        workId={workId}
        workSlug="synthetic-slug"
        initial={list(rows)}
        participation="ANONYMOUS"
      />,
    );
    click(communityCopy.vi.next);
    await waitFor(() =>
      expect(
        screen.getByText(`${communityCopy.vi.page} 2`),
      ).toBeInTheDocument(),
    );
    expect(fetchMock.mock.calls[0][0]).toContain("locale=vi&page=2");
    expect(
      screen.getByRole("button", { name: communityCopy.vi.previous }),
    ).toBeEnabled();
    view.unmount();
    render(
      <Pagination
        locale="en"
        page={200}
        count={25}
        busy={false}
        onPage={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: communityCopy.en.next }),
    ).toBeDisabled();
  });
  it("root/nested reply controls require active thread and parent with depth<2", () => {
    const parent = { ...reply, id: key, depth: 1, parentId: other };
    const leaf = {
      ...reply,
      id: "10000000-0000-4000-8000-000000000005",
      depth: 2,
      parentId: key,
    };
    const deletedReply = {
      ...reply,
      id: "10000000-0000-4000-8000-000000000006",
      state: "DELETED" as const,
      body: unavailable,
      author: null,
      createdAt: null,
      lastActivityAt: null,
    };
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={thread}
        initialReplies={list([reply, parent, leaf, deletedReply])}
        participation="VERIFIED"
      />,
    );
    expect(
      screen.getAllByRole("button", { name: communityCopy.en.nestedReply }),
    ).toHaveLength(2);
    expect(screen.getByText(communityCopy.en.depthLimit)).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: communityCopy.en.nestedReply })[1],
    );
    const form = screen.getByRole("form", { name: communityCopy.en.reply });
    expect(within(form).queryByLabelText(communityCopy.en.title)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never offers replies to unavailable thread", () => {
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={tombstone}
        initialReplies={list([])}
        participation="VERIFIED"
      />,
    );
    expect(
      screen.queryByRole("button", { name: communityCopy.en.reply }),
    ).toBeNull();
  });
  it.each(["DELETED", "ERASED"] as const)(
    "preserves eligible unrelated replies below %s thread without posting controls",
    (state) => {
      const survivor = {
        ...reply,
        body: { state: "VISIBLE" as const, text: "Unrelated surviving reply" },
        author: { displayName: "Another reader" },
      };
      const props = {
        locale: "en" as const,
        workId,
        workSlug: "synthetic-slug",
        initialThread: { ...tombstone, state },
        initialReplies: list([survivor]),
        participation: "VERIFIED" as const,
      };
      const html = renderToString(<ThreadDetail {...props} />);
      expect(html).toContain("Unrelated surviving reply");
      expect(html).not.toContain("Visible title");
      render(<ThreadDetail {...props} />);
      expect(screen.getByText("Unrelated surviving reply")).toBeInTheDocument();
      expect(
        screen.getByText("Another reader", { exact: false }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          state === "ERASED"
            ? communityCopy.en.erased
            : communityCopy.en.deleted,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: communityCopy.en.reply }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: communityCopy.en.nestedReply }),
      ).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("moderator-hidden root rejects surviving-reply payload before rendering authored text", () => {
    const survivor = {
      ...reply,
      body: { state: "VISIBLE" as const, text: "Hidden conversation reply" },
    };
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={{ ...tombstone, state: "HIDDEN" }}
        initialReplies={list([survivor])}
        participation="VERIFIED"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      communityCopy.en.scopeError,
    );
    expect(screen.queryByText("Hidden conversation reply")).toBeNull();
    expect(
      screen.queryByRole("button", { name: communityCopy.en.reply }),
    ).toBeNull();
  });
  it("explicit refresh accepts newly withdrawn root and unrelated public replies, without offering posting", async () => {
    const survivor = {
      ...reply,
      body: { state: "VISIBLE" as const, text: "Still-public unrelated reply" },
    };
    fetchMock
      .mockResolvedValueOnce(ok(tombstone))
      .mockResolvedValueOnce(ok(list([survivor])));
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={visible}
        initialReplies={list([])}
        participation="VERIFIED"
      />,
    );
    click(communityCopy.en.refresh);
    await screen.findByText("Still-public unrelated reply");
    expect(screen.getByText(communityCopy.en.deleted)).toBeInTheDocument();
    expect(screen.queryByText("Visible title")).toBeNull();
    expect(
      screen.queryByRole("button", { name: communityCopy.en.reply }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: communityCopy.en.nestedReply }),
    ).toBeNull();
  });
  it("detail refresh rejects wrong thread/reply scope without keeping stale text", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(visible))
      .mockResolvedValueOnce(ok(list([{ ...reply, threadId: other }])));
    render(
      <ThreadDetail
        locale="en"
        workId={workId}
        workSlug="synthetic-slug"
        initialThread={visible}
        initialReplies={list([])}
        participation="ANONYMOUS"
      />,
    );
    click(communityCopy.en.refresh);
    await screen.findByRole("alert");
    expect(screen.queryByText("Visible body")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects owned metadata containing text/catalog facts before rendering", () => {
    const html = renderToString(
      <OwnerManage
        locale="en"
        initial={{
          items: [{ ...owned, title: "PRIVATE TITLE" } as CommunityOwned],
          pageSize: 25,
        }}
      />,
    );
    expect(html).not.toContain("PRIVATE TITLE");
    expect(html).toContain(communityCopy.en.scopeError);
  });
  it("all EN keys have localized VI strings", () => {
    expect(Object.keys(communityCopy.vi).sort()).toEqual(
      Object.keys(communityCopy.en).sort(),
    );
    for (const value of Object.values(communityCopy.vi))
      expect(value.trim().length).toBeGreaterThan(0);
    expect(discussionPublicSchema.safeParse(thread).success).toBe(true);
  });
});
