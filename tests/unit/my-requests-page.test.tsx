// @vitest-environment jsdom
// Direct mocked server data + real page/cards/actions: not browser or real-auth proof.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  session: vi.fn(),
  owned: vi.fn(),
  followed: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { ...props, href }, children),
}));
vi.mock("../../apps/web/src/server/session", () => ({
  getSession: mocks.session,
}));
vi.mock("../../apps/web/src/server/ingestion/service", () => ({
  myStoryRequests: mocks.owned,
}));
vi.mock("../../apps/web/src/server/ingestion/request-public", () => ({
  myFollowedStoryRequests: mocks.followed,
}));

import MyRequestsPage, {
  dynamic,
  generateMetadata,
} from "../../apps/web/src/app/[locale]/requests/page";
import type { RequestDetails } from "../../apps/web/src/features/ingestion/contracts";
import type { RequestSummary } from "../../apps/web/src/features/ingestion/support";
import type { Locale } from "../../apps/web/src/lib/i18n";
import {
  requestDictionary,
  requestStateLabel,
} from "../../apps/web/src/lib/request-i18n";

type Query = {
  page?: string | string[];
  followedPage?: string | string[];
};
type OwnedItem = {
  id: string;
  state: RequestSummary["state"];
  details: RequestDetails;
  ownerUserId: string;
  events: { payload: { reason: string } }[];
};
const ownedId = "11111111-1111-4111-8111-111111111111";
const followedId = "22222222-2222-4222-8222-222222222222";
const secret = {
  owner: "PRIVATE_OWNER_ID",
  notes: "PRIVATE_OWNER_NOTES",
  evidence: "PRIVATE_EVIDENCE",
  history: "PRIVATE_REVIEW_HISTORY",
  fallback: "PRIVATE_UNREVIEWED_TITLE",
  work: "private-unpublished-work-slug",
};
function ownedFixture(): OwnedItem {
  return {
    id: ownedId,
    state: "NEEDS_INFO",
    details: {
      title: "Synthetic owned request",
      format: "NOVEL",
      alternativeTitles: [],
      notes: secret.notes,
      additionalEvidence: secret.evidence,
      sourceUrl: "https://example.org/private-citation",
      description: "PRIVATE_DESCRIPTION",
    },
    ownerUserId: secret.owner,
    events: [{ payload: { reason: secret.history } }],
  };
}
function followedFixture(): RequestSummary {
  return {
    id: followedId,
    title: "Synthetic reviewed request",
    format: "NOVEL",
    state: "NEEDS_REVIEW",
    revision: 3,
    supporterCount: 7,
    following: true,
    work: null,
  };
}
function pageData<T>(items: T[], page = 1, total = items.length) {
  return { items, page, total, pageSize: 20 };
}
function props(locale: string, query: Query = {}) {
  return {
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(query),
  };
}
async function renderPage(locale: Locale, query: Query = {}) {
  return render(await MyRequestsPage(props(locale, query)));
}
function regions(locale: Locale) {
  const t = requestDictionary(locale);
  return {
    owned: screen.getByRole("region", { name: t.owned }),
    followed: screen.getByRole("region", { name: t.followed }),
  };
}
function pager(locale: Locale, kind: "owned" | "followed") {
  const t = requestDictionary(locale);
  return screen.getByRole("navigation", { name: `${t[kind]}: ${t.page}` });
}
let requestHeaders: Headers;
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  requestHeaders = new Headers({ "x-synthetic-unit": "my-requests" });
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.session.mockResolvedValue({ user: { id: "synthetic-session-owner" } });
  mocks.owned.mockImplementation(async ({ page }: { page: number }) =>
    pageData([ownedFixture()], page),
  );
  mocks.followed.mockImplementation(async ({ page }: { page: number }) =>
    pageData([followedFixture()], page),
  );
});
afterEach(cleanup);

for (const locale of ["en", "vi"] as const) {
  describe(`my requests async server page (${locale})`, () => {
    const t = requestDictionary(locale);

    it("renders one page heading, separately named sections, and ordered header actions", async () => {
      await renderPage(locale);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      const heading = screen.getByRole("heading", { level: 1, name: t.mine });
      const header = heading.closest("header");
      expect(header).not.toBeNull();
      if (!header)
        throw new Error("Expected the page heading inside its header");
      const links = within(header).getAllByRole("link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAccessibleName(
        locale === "vi" ? "Đề xuất chỉnh sửa của tôi" : "My edit suggestions",
      );
      expect(links[0]).toHaveAttribute("href", `/${locale}/edit-suggestions`);
      expect(links[1]).toHaveAccessibleName(t.new);
      expect(links[1]).toHaveAttribute("href", `/${locale}/requests/new`);
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
      const lists = regions(locale);
      expect(lists.owned).not.toBe(lists.followed);
      for (const [kind, id] of [
        ["owned", "owned-requests-heading"],
        ["followed", "followed-requests-heading"],
      ] as const) {
        expect(lists[kind]).toHaveAttribute("aria-labelledby", id);
        expect(
          within(lists[kind]).getByRole("heading", { level: 2, name: t[kind] }),
        ).toHaveAttribute("id", id);
      }
    });

    it("renders real owned rows and followed cards/actions from direct service DTOs", async () => {
      await renderPage(locale);
      const lists = regions(locale);
      expect(within(lists.owned).getAllByRole("listitem")).toHaveLength(1);
      expect(within(lists.followed).getAllByRole("listitem")).toHaveLength(1);
      expect(
        within(lists.owned).getByRole("link", {
          name: "Synthetic owned request",
        }),
      ).toHaveAttribute("href", `/${locale}/requests/${ownedId}`);
      expect(
        within(lists.owned).getByText(requestStateLabel("NEEDS_INFO", locale)),
      ).toBeVisible();
      expect(
        within(lists.followed).getByRole("link", {
          name: "Synthetic reviewed request",
        }),
      ).toHaveAttribute("href", `/${locale}/requests/${followedId}`);
      expect(within(lists.followed).getByRole("article")).toHaveTextContent(
        requestStateLabel("NEEDS_REVIEW", locale),
      );
      expect(
        within(lists.followed).getByText(`${t.supporters}: 7`),
      ).toBeVisible();
      expect(
        within(lists.followed).getByRole("button", { name: t.unfollow }),
      ).toBeEnabled();
      expect(
        within(lists.followed).queryByRole("checkbox"),
      ).not.toBeInTheDocument();
      for (const kind of ["owned", "followed"] as const) {
        const nav = pager(locale, kind);
        expect(nav).toHaveTextContent(`${t.page} 1 / 1`);
        expect(within(nav).queryByRole("link")).not.toBeInTheDocument();
      }
      expect(mocks.session).toHaveBeenCalledExactlyOnceWith(requestHeaders);
      expect(mocks.owned).toHaveBeenCalledExactlyOnceWith(
        { page: 1, pageSize: 20 },
        requestHeaders,
      );
      expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(
        { page: 1, pageSize: 20 },
        requestHeaders,
      );
    });

    it("keeps owned rows title/state-only and withdrawn followed titles unknown without private fallbacks", async () => {
      // Extra private fields deliberately accompany a safe summary: rendering must
      // not fall back to details, history, or unqualified publication candidates.
      const withdrawn = {
        ...followedFixture(),
        title: null,
        format: null,
        state: "CANCELLED" as const,
        ownerUserId: secret.owner,
        details: { ...ownedFixture().details, title: secret.fallback },
        events: ownedFixture().events,
        linkedWorkId: secret.work,
        candidateWork: { slug: secret.work },
      } satisfies RequestSummary & {
        ownerUserId: string;
        details: RequestDetails;
        events: OwnedItem["events"];
        linkedWorkId: string;
        candidateWork: { slug: string };
      };
      mocks.followed.mockResolvedValue(pageData([withdrawn]));
      const { container } = await renderPage(locale);
      const lists = regions(locale);
      const row = within(lists.owned).getByRole("listitem");
      expect(row.textContent).toBe(
        `Synthetic owned request${requestStateLabel("NEEDS_INFO", locale)}`,
      );
      expect(within(lists.owned).queryByRole("button")).not.toBeInTheDocument();
      expect(
        within(lists.followed).getByRole("link", { name: t.unknown }),
      ).toHaveAttribute("href", `/${locale}/requests/${followedId}`);
      expect(
        within(lists.followed).getByRole("button", { name: t.unfollow }),
      ).toBeEnabled();
      expect(
        within(lists.followed).queryByRole("checkbox"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: t.view }),
      ).not.toBeInTheDocument();
      expect(container.querySelector('a[href*="/works/"]')).toBeNull();
      for (const value of [
        ...Object.values(secret),
        "PRIVATE_DESCRIPTION",
        "private-citation",
      ]) {
        expect(container.innerHTML).not.toContain(value);
      }
    });

    it.each(["owned", "followed"] as const)(
      "shows %s empty independently of the populated other list",
      async (kind) => {
        mocks[kind].mockResolvedValue(pageData([]));
        await renderPage(locale);
        const lists = regions(locale);
        const other = kind === "owned" ? "followed" : "owned";
        expect(within(lists[kind]).getByText(t.empty)).toBeVisible();
        expect(within(lists[kind]).queryByRole("list")).not.toBeInTheDocument();
        expect(
          within(lists[kind]).queryByRole("alert"),
        ).not.toBeInTheDocument();
        expect(within(lists[other]).getByRole("list")).toBeVisible();
        expect(
          within(lists[other]).queryByText(t.empty),
        ).not.toBeInTheDocument();
        expect(pager(locale, kind)).toHaveTextContent(`${t.page} 1 / 1`);
      },
    );

    it.each(["owned", "followed"] as const)(
      "isolates a rejected %s service without leaking its error",
      async (kind) => {
        mocks[kind].mockRejectedValue(new Error("PRIVATE_SERVICE_FAILURE"));
        const { container } = await renderPage(locale);
        const lists = regions(locale);
        const other = kind === "owned" ? "followed" : "owned";
        expect(within(lists[kind]).getByRole("alert")).toHaveTextContent(
          t.error,
        );
        expect(
          within(lists[kind]).queryByText(t.empty),
        ).not.toBeInTheDocument();
        expect(
          within(lists[kind]).queryByRole("navigation"),
        ).not.toBeInTheDocument();
        expect(within(lists[other]).getByRole("list")).toBeVisible();
        expect(pager(locale, other)).toBeVisible();
        expect(mocks.owned).toHaveBeenCalledTimes(1);
        expect(mocks.followed).toHaveBeenCalledTimes(1);
        expect(container.innerHTML).not.toContain("PRIVATE_SERVICE_FAILURE");
      },
    );

    it("renders both independent alerts when both list services reject", async () => {
      mocks.owned.mockRejectedValue(new Error("PRIVATE_OWNED_FAILURE"));
      mocks.followed.mockRejectedValue(new Error("PRIVATE_FOLLOWED_FAILURE"));
      const { container } = await renderPage(locale);
      expect(screen.getAllByRole("alert")).toHaveLength(2);
      for (const list of Object.values(regions(locale))) {
        expect(within(list).getByRole("alert")).toHaveTextContent(t.error);
        expect(within(list).queryByRole("navigation")).not.toBeInTheDocument();
      }
      expect(container.innerHTML).not.toMatch(
        /PRIVATE_(OWNED|FOLLOWED)_FAILURE/,
      );
    });

    it("returns the sign-in notice with normalized paging and never calls list services for null session", async () => {
      mocks.session.mockResolvedValue(null);
      await renderPage(locale, { page: "2", followedPage: "invalid" });
      expect(
        screen.getByRole("heading", { level: 1, name: t.mine }),
      ).toBeVisible();
      expect(screen.getByText(t.signIn)).toBeVisible();
      const returnTo = `/${locale}/requests?page=2&followedPage=1`;
      expect(screen.getByRole("link", { name: t.login })).toHaveAttribute(
        "href",
        `/${locale}/login?callbackURL=${encodeURIComponent(returnTo)}`,
      );
      expect(
        screen.getByRole("link", {
          name:
            locale === "vi"
              ? "Quay lại yêu cầu (giữ thông tin đã tìm)"
              : "Return to requests (keep your search)",
        }),
      ).toHaveAttribute("href", returnTo);
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.followed).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
    });

    it("returns the existing error notice and never calls list services when session lookup rejects", async () => {
      mocks.session.mockRejectedValue(new Error("PRIVATE_SESSION_FAILURE"));
      const { container } = await renderPage(locale);
      expect(
        screen.getByRole("heading", { level: 1, name: t.mine }),
      ).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(t.error);
      expect(
        screen.queryByRole("link", { name: t.login }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.followed).not.toHaveBeenCalled();
      expect(container.innerHTML).not.toContain("PRIVATE_SESSION_FAILURE");
    });

    it("paginates lists independently while preserving the other current parameter", async () => {
      mocks.owned.mockResolvedValue(pageData([ownedFixture()], 2, 81));
      mocks.followed.mockResolvedValue(pageData([followedFixture()], 3, 101));
      await renderPage(locale, { page: "2", followedPage: "3" });
      expect(mocks.owned).toHaveBeenCalledExactlyOnceWith(
        { page: 2, pageSize: 20 },
        requestHeaders,
      );
      expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(
        { page: 3, pageSize: 20 },
        requestHeaders,
      );
      for (const [kind, previous, next, current, total] of [
        ["owned", "page=1&followedPage=3", "page=3&followedPage=3", 2, 5],
        ["followed", "page=2&followedPage=2", "page=2&followedPage=4", 3, 6],
      ] as const) {
        const nav = pager(locale, kind);
        expect(nav).toHaveTextContent(`${t.page} ${current} / ${total}`);
        expect(
          within(nav).getByRole("link", { name: t.previous }),
        ).toHaveAttribute("href", `/${locale}/requests?${previous}`);
        expect(within(nav).getByRole("link", { name: t.next })).toHaveAttribute(
          "href",
          `/${locale}/requests?${next}`,
        );
      }
    });

    it("caps next links at 1000 even when totals imply more pages", async () => {
      mocks.owned.mockResolvedValue(pageData([], 1000, 20001));
      mocks.followed.mockResolvedValue(pageData([], 1000, 20001));
      await renderPage(locale, { page: "1000", followedPage: "1000" });
      for (const kind of ["owned", "followed"] as const) {
        const nav = pager(locale, kind);
        expect(nav).toHaveTextContent(`${t.page} 1000 / 1001`);
        expect(
          within(nav).queryByRole("link", { name: t.next }),
        ).not.toBeInTheDocument();
        expect(
          within(nav).getByRole("link", { name: t.previous }),
        ).toHaveAttribute(
          "href",
          `/${locale}/requests?${kind === "owned" ? "page=999&followedPage=1000" : "page=1000&followedPage=999"}`,
        );
      }
    });

    it("retains valid out-of-range empty pages and their pagers instead of clamping or hiding them", async () => {
      mocks.owned.mockResolvedValue(pageData([], 8, 21));
      mocks.followed.mockResolvedValue(pageData([], 9, 0));
      await renderPage(locale, { page: "8", followedPage: "9" });
      expect(mocks.owned).toHaveBeenCalledExactlyOnceWith(
        { page: 8, pageSize: 20 },
        requestHeaders,
      );
      expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(
        { page: 9, pageSize: 20 },
        requestHeaders,
      );
      for (const [kind, current, total, previous] of [
        ["owned", 8, 2, "page=7&followedPage=9"],
        ["followed", 9, 1, "page=8&followedPage=8"],
      ] as const) {
        expect(within(regions(locale)[kind]).getByText(t.empty)).toBeVisible();
        const nav = pager(locale, kind);
        expect(nav).toHaveTextContent(`${t.page} ${current} / ${total}`);
        expect(
          within(nav).getByRole("link", { name: t.previous }),
        ).toHaveAttribute("href", `/${locale}/requests?${previous}`);
        expect(
          within(nav).queryByRole("link", { name: t.next }),
        ).not.toBeInTheDocument();
      }
    });

    it("provides localized noindex metadata", async () => {
      expect(await generateMetadata(props(locale))).toEqual({
        title: t.mine,
        robots: { index: false, follow: false },
      });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.followed).not.toHaveBeenCalled();
    });
  });
}

describe("current Number(value) paging contract", () => {
  const cases: { label: string; value: Query["page"]; expected: number }[] = [
    { label: "missing", value: undefined, expected: 1 },
    { label: "empty", value: "", expected: 1 },
    { label: "whitespace only", value: "  ", expected: 1 },
    { label: "zero", value: "0", expected: 1 },
    { label: "negative", value: "-2", expected: 1 },
    { label: "fractional", value: "2.5", expected: 1 },
    { label: "non-number", value: "invalid", expected: 1 },
    { label: "infinity", value: "Infinity", expected: 1 },
    { label: "above cap", value: "1001", expected: 1 },
    { label: "lower bound", value: "1", expected: 1 },
    { label: "upper bound", value: "1000", expected: 1000 },
    { label: "ordinary integer", value: "27", expected: 27 },
    { label: "trimmed integer", value: " 2 ", expected: 2 },
    { label: "integer decimal", value: "2.0", expected: 2 },
    { label: "exponent", value: "1e2", expected: 100 },
    { label: "hexadecimal", value: "0x10", expected: 16 },
    { label: "singleton array", value: ["3"], expected: 3 },
    { label: "empty array", value: [], expected: 1 },
    { label: "multiple values", value: ["2", "3"], expected: 1 },
  ];
  it.each(cases)(
    "normalizes $label identically for both independent services",
    async ({ value, expected }) => {
      await renderPage("en", { page: value, followedPage: value });
      expect(mocks.owned).toHaveBeenCalledExactlyOnceWith(
        { page: expected, pageSize: 20 },
        requestHeaders,
      );
      expect(mocks.followed).toHaveBeenCalledExactlyOnceWith(
        { page: expected, pageSize: 20 },
        requestHeaders,
      );
    },
  );
});

describe("route boundaries", () => {
  it("remains force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });
  it("rejects an invalid locale before accessing headers, session, or list services", async () => {
    await expect(MyRequestsPage(props("fr"))).rejects.toThrow("NOT_FOUND");
    await expect(generateMetadata(props("fr"))).rejects.toThrow("NOT_FOUND");
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.owned).not.toHaveBeenCalled();
    expect(mocks.followed).not.toHaveBeenCalled();
  });
});
