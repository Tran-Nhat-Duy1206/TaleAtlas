// Pure page ordering/DTO/SSR tests with mocked Next request APIs and service callbacks.
// No service execution, authentication/session authority, database, SQL or native acceptance proof.
import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("TEST_NEXT_NOT_FOUND");
  }),
  headers: vi.fn(),
  catalog: vi.fn(),
  list: vi.fn(),
  owned: vi.fn(),
  participation: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: spies.notFound }));
vi.mock("next/headers", () => ({ headers: spies.headers }));
vi.mock("../../apps/web/src/server/catalog/service", () => ({
  getWorkBySlug: spies.catalog,
}));
vi.mock("../../apps/web/src/server/community/service", () => ({
  listCommunityReviews: spies.list,
  listOwnedCommunityReviews: spies.owned,
}));
vi.mock("../../apps/web/src/server/community/pages", () => ({
  communityParticipation: spies.participation,
}));
import ReviewsPage, {
  dynamic as publicDynamic,
  generateMetadata as publicMetadata,
} from "../../apps/web/src/app/[locale]/works/[slug]/reviews/page";
import ManagePage, {
  dynamic as privateDynamic,
  generateMetadata as privateMetadata,
} from "../../apps/web/src/app/[locale]/community/reviews/manage/page";
import { CatalogError } from "../../apps/web/src/server/catalog/errors";
import { HttpError } from "../../apps/web/src/server/http";
import { AuthorizationError } from "../../apps/web/src/server/session";
import { ReviewList } from "../../apps/web/src/components/community/ReviewList";
import { ReviewOwnerManage } from "../../apps/web/src/components/community/ReviewOwnerManage";
import { Participation } from "../../apps/web/src/components/community/Participation";
import { reviewCopy } from "../../apps/web/src/lib/review-i18n";
import {
  reviewOwnedSchema,
  type ReviewPublicDTO,
} from "../../apps/web/src/features/community/review-http-contracts";
const workId = "50000000-0000-4000-8000-000000000001";
const id = "50000000-0000-4000-8000-000000000002";
const otherWorkId = "50000000-0000-4000-8000-000000000003";
const timestamp = "2026-01-01T00:00:00.000Z";
const syntheticPrivate = "SYNTHETIC_PRIVATE_REVIEW_NEVER_SERIALIZED";
const authoredTitle = "SYNTHETIC_AUTHORED_CATALOG_TITLE";
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
const initial = {
  items: [review],
  pageSize: 25 as const,
  statistics: { reviewCount: 1, ratedReviewCount: 0, meanRating: null },
};
const metadata = reviewOwnedSchema.parse({
  id,
  workId,
  kind: "REVIEW",
  revision: 1,
  threadId: null,
  parentId: null,
  depth: null,
  authorState: "ACTIVE",
  moderationState: "HIDDEN",
  workAvailable: false,
  canEdit: false,
  canWithdraw: true,
});
const ownerInitial = { items: [metadata], pageSize: 25 as const };
const params = (locale = "en") =>
  Promise.resolve({ locale, slug: "synthetic-work" });
beforeEach(() => {
  vi.resetAllMocks();
  spies.notFound.mockImplementation(() => {
    throw new Error("TEST_NEXT_NOT_FOUND");
  });
  spies.headers.mockResolvedValue(new Headers());
  spies.catalog.mockResolvedValue({
    id: workId,
    slug: "synthetic-work",
    title: authoredTitle,
  });
  spies.list.mockResolvedValue(initial);
  spies.owned.mockResolvedValue(ownerInitial);
  spies.participation.mockResolvedValue("VERIFIED");
  vi.stubEnv("V4_COMMUNITIES_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
function noReads() {
  for (const spy of [
    spies.headers,
    spies.catalog,
    spies.list,
    spies.owned,
    spies.participation,
  ])
    expect(spy).not.toHaveBeenCalled();
}
function child<T>(
  element: React.ReactElement<{ children: React.ReactNode }>,
  component: React.ElementType,
): React.ReactElement<T> {
  const found = React.Children.toArray(element.props.children).find(
    (node) => React.isValidElement(node) && node.type === component,
  );
  expect(found).toBeDefined();
  return found as React.ReactElement<T>;
}
it("both review pages force dynamic rendering", () => {
  expect(publicDynamic).toBe("force-dynamic");
  expect(privateDynamic).toBe("force-dynamic");
});
for (const [name, render] of [
  ["public page", ReviewsPage],
  ["private page", ManagePage],
  ["public metadata", publicMetadata],
  ["private metadata", privateMetadata],
] as const) {
  it(`disabled ${name} gates before params, headers, catalog, participation and query/service reads`, async () => {
    vi.stubEnv("V4_COMMUNITIES_ENABLED", "false");
    const observed = vi.fn();
    const unreadable = new Proxy(params(), {
      get(target, key, receiver) {
        if (key === "then") {
          observed();
          throw new Error("Disabled params must not be read");
        }
        return Reflect.get(target, key, receiver);
      },
    });
    await expect(render({ params: unreadable })).rejects.toThrow(
      "TEST_NEXT_NOT_FOUND",
    );
    expect(observed).not.toHaveBeenCalled();
    expect(spies.notFound).toHaveBeenCalledTimes(1);
    noReads();
  });
  it(`${name} rejects an invalid locale before request or service reads`, async () => {
    await expect(render({ params: params("invalid") })).rejects.toThrow(
      "TEST_NEXT_NOT_FOUND",
    );
    expect(spies.notFound).toHaveBeenCalledTimes(1);
    noReads();
  });
}
for (const locale of ["en", "vi"] as const) {
  const t = reviewCopy[locale];
  describe(`${locale} localized pure review page gates`, () => {
    it("public metadata is generic/localized noindex/nofollow and needs no catalog or authored data", async () => {
      const result = await publicMetadata({ params: params(locale) });
      expect(result).toEqual({
        title: t.reviews,
        robots: { index: false, follow: false },
      });
      expect(JSON.stringify(result)).not.toContain(authoredTitle);
      noReads();
    });
    it("private metadata is generic/localized noindex/nofollow and needs no owner/authored data", async () => {
      const result = await privateMetadata({ params: params(locale) });
      expect(result).toEqual({
        title: t.manage,
        robots: { index: false, follow: false },
      });
      expect(JSON.stringify(result)).not.toContain(syntheticPrivate);
      noReads();
    });
    it("public page passes one coherent scoped list/statistics DTO and participation after catalog/header reads", async () => {
      const result = await ReviewsPage({ params: params(locale) });
      const component = child<React.ComponentProps<typeof ReviewList>>(
        result,
        ReviewList,
      );
      expect(component.props).toEqual({
        locale,
        workId,
        workSlug: "synthetic-work",
        initial,
        participation: "VERIFIED",
      });
      expect(spies.catalog).toHaveBeenCalledExactlyOnceWith(
        "synthetic-work",
        locale,
      );
      expect(spies.headers).toHaveBeenCalledTimes(1);
      expect(spies.list).toHaveBeenCalledExactlyOnceWith(
        workId,
        { locale },
        expect.any(Headers),
      );
      expect(spies.participation).toHaveBeenCalledExactlyOnceWith(
        expect.any(Headers),
      );
      expect(spies.list.mock.calls[0][2]).toBe(
        spies.participation.mock.calls[0][0],
      );
      expect(spies.catalog.mock.invocationCallOrder[0]).toBeLessThan(
        spies.headers.mock.invocationCallOrder[0],
      );
      expect(spies.list.mock.invocationCallOrder[0]).toBeLessThan(
        spies.participation.mock.invocationCallOrder[0],
      );
      expect(spies.owned).not.toHaveBeenCalled();
      const html = renderToString(result);
      for (const forbidden of [
        authoredTitle,
        syntheticPrivate,
        "spoilerContext",
        "data-spoiler",
      ])
        expect(html).not.toContain(forbidden);
      expect(html).toContain(`href="/${locale}/works/synthetic-work"`);
      expect(html).toContain(t.maskedBody);
      expect(html).not.toContain("data-client-router");
    });
    it("private page serializes only complete owner metadata, without catalog/body/rating/identity/dates or extra reads", async () => {
      const result = await ManagePage({ params: params(locale) });
      const component = child<React.ComponentProps<typeof ReviewOwnerManage>>(
        result,
        ReviewOwnerManage,
      );
      expect(component.props).toEqual({ locale, initial: ownerInitial });
      expect(spies.owned).toHaveBeenCalledExactlyOnceWith(
        { locale },
        expect.any(Headers),
      );
      expect(spies.headers).toHaveBeenCalledTimes(1);
      for (const spy of [spies.catalog, spies.list, spies.participation])
        expect(spy).not.toHaveBeenCalled();
      const html = renderToString(result);
      for (const forbidden of [
        authoredTitle,
        syntheticPrivate,
        timestamp,
        "Synthetic reader",
        "ratingHalfStars",
        "spoilerContext",
        "synthetic-work",
      ])
        expect(html).not.toContain(forbidden);
      expect(html).toContain(workId);
      expect(html).toContain(id);
      expect(html).toContain(t.unavailable);
      expect(html).toContain(t.hidden);
      expect(html).not.toContain("<textarea");
      expect(html).not.toContain("<select");
    });
    it.each([401, 403] as const)(
      "private authorization error %s renders participation only, with no owner metadata",
      async (status) => {
        spies.owned.mockRejectedValue(new AuthorizationError(status));
        const result = await ManagePage({ params: params(locale) });
        const component = child<React.ComponentProps<typeof Participation>>(
          result,
          Participation,
        );
        expect(component.props).toEqual({
          locale,
          participation: status === 401 ? "ANONYMOUS" : "UNVERIFIED",
        });
        const html = renderToString(result);
        expect(html).toContain(
          `href="/${locale}/${status === 401 ? "login" : "verify-email"}"`,
        );
        expect(html).not.toContain(workId);
        expect(html).not.toContain(id);
        expect(html).not.toContain(syntheticPrivate);
        expect(spies.owned).toHaveBeenCalledTimes(1);
        expect(spies.headers).toHaveBeenCalledTimes(1);
        for (const spy of [spies.catalog, spies.list, spies.participation])
          expect(spy).not.toHaveBeenCalled();
      },
    );
  });
}
it("missing published catalog work becomes notFound before headers/community/participation", async () => {
  spies.catalog.mockResolvedValue(null);
  await expect(ReviewsPage({ params: params() })).rejects.toThrow(
    "TEST_NEXT_NOT_FOUND",
  );
  expect(spies.notFound).toHaveBeenCalledTimes(1);
  expect(spies.headers).not.toHaveBeenCalled();
  expect(spies.list).not.toHaveBeenCalled();
  expect(spies.participation).not.toHaveBeenCalled();
});
it.each([
  new CatalogError(404, "SYNTHETIC_NOT_FOUND"),
  new HttpError(404, "SYNTHETIC_NOT_FOUND"),
])(
  "catalog 404 becomes notFound without downstream reads (%s)",
  async (error) => {
    spies.catalog.mockRejectedValue(error);
    await expect(ReviewsPage({ params: params() })).rejects.toThrow(
      "TEST_NEXT_NOT_FOUND",
    );
    expect(spies.notFound).toHaveBeenCalledTimes(1);
    expect(spies.headers).not.toHaveBeenCalled();
    expect(spies.list).not.toHaveBeenCalled();
    expect(spies.participation).not.toHaveBeenCalled();
  },
);
it("community list 404 becomes notFound without participation", async () => {
  spies.list.mockRejectedValue(new HttpError(404, "SYNTHETIC_NOT_FOUND"));
  await expect(ReviewsPage({ params: params() })).rejects.toThrow(
    "TEST_NEXT_NOT_FOUND",
  );
  expect(spies.notFound).toHaveBeenCalledTimes(1);
  expect(spies.participation).not.toHaveBeenCalled();
});
it.each([
  { ...initial, items: [{ ...review, workId: otherWorkId }] },
  { ...initial, items: [{ ...review, kind: "THREAD" }] },
  {
    ...initial,
    items: [{ ...review, body: { state: "MASKED", text: syntheticPrivate } }],
  },
  {
    ...initial,
    statistics: { reviewCount: 0, ratedReviewCount: 0, meanRating: null },
  },
  {
    ...initial,
    statistics: { reviewCount: 1, ratedReviewCount: 0, meanRating: 0 },
  },
  {
    ...initial,
    statistics: {
      reviewCount: 1,
      ratedReviewCount: 0,
      meanRating: null,
      privateCount: 1,
    },
  },
])(
  "public page rejects malformed/wrong-scope/coherence DTO case %# before participation or rendering",
  async (data) => {
    spies.list.mockResolvedValue(data);
    await expect(ReviewsPage({ params: params() })).rejects.toThrow();
    expect(spies.participation).not.toHaveBeenCalled();
    expect(spies.notFound).not.toHaveBeenCalled();
  },
);
it.each([
  { ...ownerInitial, items: [{ ...metadata, body: syntheticPrivate }] },
  { ...ownerInitial, items: [{ ...metadata, ratingHalfStars: 8 }] },
  { ...ownerInitial, items: [{ ...metadata, createdAt: timestamp }] },
  { ...ownerInitial, items: [{ ...metadata, kind: "THREAD" }] },
])(
  "private page rejects non-allowlisted metadata case %# instead of serializing it",
  async (data) => {
    spies.owned.mockResolvedValue(data);
    await expect(ManagePage({ params: params() })).rejects.toThrow();
    expect(spies.notFound).not.toHaveBeenCalled();
    expect(spies.catalog).not.toHaveBeenCalled();
    expect(spies.list).not.toHaveBeenCalled();
  },
);
it.each([
  new Error("SYNTHETIC_UNAVAILABLE"),
  new HttpError(503, "SYNTHETIC_UNAVAILABLE"),
])(
  "private page propagates non-authorization errors instead of claiming anonymous access (%s)",
  async (error) => {
    spies.owned.mockRejectedValue(error);
    await expect(ManagePage({ params: params() })).rejects.toBe(error);
    expect(spies.notFound).not.toHaveBeenCalled();
  },
);
it("public page propagates non-404 failure without rendering or participation", async () => {
  const error = new HttpError(503, "SYNTHETIC_UNAVAILABLE");
  spies.list.mockRejectedValue(error);
  await expect(ReviewsPage({ params: params() })).rejects.toBe(error);
  expect(spies.notFound).not.toHaveBeenCalled();
  expect(spies.participation).not.toHaveBeenCalled();
});
