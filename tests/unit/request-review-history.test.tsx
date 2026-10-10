// @vitest-environment jsdom
// Mocked server/component proof, not real-session or browser acceptance.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), visible: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../../apps/web/src/server/session", () => ({
  getSession: mocks.session,
}));
vi.mock("../../apps/web/src/server/ingestion/request-public", () => ({
  visibleStoryRequest: mocks.visible,
}));
import Detail from "../../apps/web/src/app/[locale]/requests/[id]/page";
const id = "22222222-2222-4222-8222-222222222222",
  reason = "Private human review explanation";
beforeEach(() => {
  mocks.session.mockReset();
  mocks.visible.mockReset();
});
afterEach(cleanup);
for (const locale of ["en", "vi"] as const)
  describe(`private reviewed reason ${locale}`, () => {
    it("renders the existing private reviewed reason and only the qualified published Work link", async () => {
      mocks.session.mockResolvedValue({ user: { id: "synthetic-owner" } });
      mocks.visible.mockResolvedValue({
        kind: "OWNED",
        supporterCount: 0,
        work: { slug: "curated-work-stable-slug" },
        request: {
          id,
          state: "APPROVED",
          revision: 4,
          inputRevision: 1,
          details: { title: "Owner private title", format: "NOVEL" },
          events: [
            {
              eventKind: "REVIEWED",
              revision: 4,
              fromState: "NEEDS_REVIEW",
              toState: "APPROVED",
              payload: { reason },
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      });
      render(await Detail({ params: Promise.resolve({ locale, id }) }));
      expect(screen.getByText(reason, { exact: true })).toBeVisible();
      expect(
        screen.getByRole("link", {
          name:
            locale === "vi" ? "Xem tác phẩm công khai" : "View published work",
        }),
      ).toHaveAttribute("href", `/${locale}/works/curated-work-stable-slug`);
    });
    it("does not read or display private history for an anonymous visitor", async () => {
      mocks.session.mockResolvedValue(null);
      render(await Detail({ params: Promise.resolve({ locale, id }) }));
      expect(mocks.visible).not.toHaveBeenCalled();
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: locale === "vi" ? "Đăng nhập" : "Sign in",
        }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining(`/${locale}/login?callbackURL=`),
      );
    });
    it("does not emit a stale publication link when the qualified public target is unavailable", async () => {
      mocks.session.mockResolvedValue({ user: { id: "synthetic-owner" } });
      mocks.visible.mockResolvedValue({
        kind: "OWNED",
        supporterCount: 0,
        work: null,
        request: {
          id,
          state: "LINKED_EXISTING",
          revision: 4,
          inputRevision: 1,
          details: { title: "Owner private title", format: "NOVEL" },
          events: [],
        },
      });
      render(await Detail({ params: Promise.resolve({ locale, id }) }));
      expect(
        screen.queryByRole("link", {
          name:
            locale === "vi" ? "Xem tác phẩm công khai" : "View published work",
        }),
      ).not.toBeInTheDocument();
    });
  });
