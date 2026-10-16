// @vitest-environment jsdom
// Bounded render units, not native navigation/auth/SQL acceptance.
import React from "react";
import { renderToString } from "react-dom/server";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThreadList } from "../../apps/web/src/components/community/ThreadList";
import { communityCopy } from "../../apps/web/src/lib/community-i18n";
import type { DiscussionPublic } from "../../apps/web/src/features/community/http-contracts";

// These public ingress links must not silently become intermediate Next RSC
// navigation/prefetch surfaces again. Ordinary anchors remain browser links.
vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} data-client-router="true" />
  ),
}));
const workId = "10000000-0000-4000-8000-000000000001",
  id = "10000000-0000-4000-8000-000000000002";
const thread: DiscussionPublic = {
  id,
  workId,
  kind: "THREAD",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  state: "ACTIVE",
  title: { state: "MASKED", text: null },
  body: { state: "MASKED", text: null },
  spoilerContext: null,
  ratingHalfStars: null,
  author: { displayName: "Synthetic reader" },
  createdAt: "2026-01-01T00:00:00.000Z",
  editedAt: null,
  lastActivityAt: "2026-01-01T00:00:00.000Z",
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
for (const locale of ["en", "vi"] as const) {
  it(`${locale} discussion ingress is a real no-prefetch document link with masked SSR and no hover/focus fetch`, () => {
    const props = {
      locale,
      workId,
      workSlug: "synthetic public work",
      initial: { items: [thread], pageSize: 25 as const },
      participation: "VERIFIED" as const,
    };
    const markup = renderToString(<ThreadList {...props} />);
    expect(markup).toContain(
      `href="/${locale}/works/synthetic%20public%20work/discussions/${id}"`,
    );
    render(<ThreadList {...props} />);
    const link = screen.getByRole("link", {
      name: communityCopy[locale].openDiscussion,
    });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("data-client-router")).toBeNull();
    expect(link.getAttribute("href")).toBe(
      `/${locale}/works/synthetic%20public%20work/discussions/${id}`,
    );
    expect(link.onclick).toBeNull();
    fireEvent.mouseOver(link);
    fireEvent.focus(link);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("form", {
        name: communityCopy[locale].replacement,
      }),
    ).toBeNull();
  });
}
