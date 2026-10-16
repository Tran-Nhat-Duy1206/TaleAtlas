// Pure Next page-order/metadata SSR units: service callbacks mocked, NOT runtime authorization or SQL proof.
import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const spies = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("TEST_NOT_FOUND");
  }),
  headers: vi.fn(),
  reports: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: spies.notFound }));
vi.mock("next/headers", () => ({ headers: spies.headers }));
vi.mock("../../apps/web/src/server/community/service", () => ({
  listOwnedCommunityReports: spies.reports,
  listCommunityModerationReports: spies.queue,
}));
import ReportsPage, {
  dynamic as reportsDynamic,
  generateMetadata as reportsMetadata,
} from "../../apps/web/src/app/[locale]/community/reports/manage/page";
import ModerationPage, {
  dynamic as moderationDynamic,
  generateMetadata as moderationMetadata,
} from "../../apps/web/src/app/[locale]/community/moderation/page";
import { AuthorizationError } from "../../apps/web/src/server/session";
import { ModerationNavigation } from "../../apps/web/src/components/community/ModerationNavigation";
import { moderationCopy } from "../../apps/web/src/lib/moderation-i18n";
import {
  moderationQueueItemSchema,
  ownedReportSchema,
} from "../../apps/web/src/features/community/moderation-http-contracts";
const workId = "71000000-0000-4000-8000-000000000001",
  id = "71000000-0000-4000-8000-000000000002",
  reportId = "71000000-0000-4000-8000-000000000003";
const target = {
  id,
  workId,
  kind: "REVIEW",
  revision: 3,
  authorState: "DELETED",
  moderationState: "HIDDEN",
  workAvailable: false,
  canHide: true,
  canRestore: false,
};
const item = moderationQueueItemSchema.parse({
  id: reportId,
  state: "OPEN",
  revision: 2,
  evidenceRedacted: true,
  canDismiss: true,
  target,
});
const queue = { items: [item], pageSize: 25, nextCursor: null };
const owned = ownedReportSchema.parse({
  id: reportId,
  workId,
  contentId: id,
  contentKind: "REVIEW",
  state: "UPHELD",
  revision: 2,
  targetRevision: 3,
  targetAuthorState: "DELETED",
  targetModerationState: "HIDDEN",
  workAvailable: false,
});
const reports = { items: [owned], pageSize: 25 };
const params = (locale = "en") => Promise.resolve({ locale });
beforeEach(() => {
  vi.resetAllMocks();
  spies.notFound.mockImplementation(() => {
    throw new Error("TEST_NOT_FOUND");
  });
  spies.headers.mockResolvedValue(new Headers());
  spies.queue.mockResolvedValue(queue);
  spies.reports.mockResolvedValue(reports);
  vi.stubEnv("V4_COMMUNITIES_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
function noReads() {
  expect(spies.headers).not.toHaveBeenCalled();
  expect(spies.queue).not.toHaveBeenCalled();
  expect(spies.reports).not.toHaveBeenCalled();
}
it("both private pages force dynamic rendering", () => {
  expect(reportsDynamic).toBe("force-dynamic");
  expect(moderationDynamic).toBe("force-dynamic");
});
for (const [name, render] of [
  ["reports page", ReportsPage],
  ["moderator page", ModerationPage],
  ["reports metadata", reportsMetadata],
  ["moderator metadata", moderationMetadata],
] as const) {
  it.each([undefined, "false", "invalid"])(
    `disabled ${name} gates before params/request/service for flag %s`,
    async (flag) => {
      vi.stubEnv("V4_COMMUNITIES_ENABLED", flag);
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
        "TEST_NOT_FOUND",
      );
      expect(observed).not.toHaveBeenCalled();
      noReads();
    },
  );
  it(`${name} rejects unsupported locale before headers/service`, async () => {
    await expect(render({ params: params("invalid") })).rejects.toThrow(
      "TEST_NOT_FOUND",
    );
    noReads();
  });
}
for (const locale of ["en", "vi"] as const) {
  const t = moderationCopy[locale];
  it(`${locale} private metadata is generic noindex/nofollow without privileged reads`, async () => {
    expect(await reportsMetadata({ params: params(locale) })).toEqual({
      title: t.reports,
      robots: { index: false, follow: false },
    });
    expect(await moderationMetadata({ params: params(locale) })).toEqual({
      title: t.moderation,
      robots: { index: false, follow: false },
    });
    noReads();
  });
  it(`${locale} reports page selects only current signed owner metadata with locale and no prefill`, async () => {
    const node = await ReportsPage({ params: params(locale) }),
      html = renderToString(node);
    expect(spies.reports).toHaveBeenCalledExactlyOnceWith(
      { locale },
      expect.any(Headers),
    );
    expect(spies.queue).not.toHaveBeenCalled();
    expect(html).toContain(reportId);
    expect(html).toContain(t.unavailable);
    expect(html).not.toMatch(
      /textarea|<select|ratingHalfStars|explanation|reporterId|catalogTitle/,
    );
    expect(html).toContain("disabled");
  });
  it(`${locale} moderator page uses independently privileged queue service only and metadata-only SSR`, async () => {
    const html = renderToString(
      await ModerationPage({ params: params(locale) }),
    );
    expect(spies.queue).toHaveBeenCalledExactlyOnceWith(
      { locale },
      expect.any(Headers),
    );
    expect(spies.reports).not.toHaveBeenCalled();
    expect(html).toContain(reportId);
    expect(html).toContain(t.unavailable);
    expect(html).toContain(t.redacted);
    expect(html).not.toMatch(
      /textarea|evidenceSelectionAcknowledged|ratingHalfStars|reporterId|catalogTitle|"explanation"/,
    );
    expect(html).toContain("disabled");
  });
  it.each([401, 403] as const)(
    `${locale} owner status authorization%s exposes no stale metadata and links genuine participation`,
    async (status) => {
      spies.reports.mockRejectedValueOnce(new AuthorizationError(status));
      const html = renderToString(
        await ReportsPage({ params: params(locale) }),
      );
      expect(html).not.toContain(reportId);
      expect(html).toContain(status === 401 ? t.login : t.verify);
      expect(html).not.toContain("<button");
    },
  );
  it.each([401, 403] as const)(
    `${locale} moderator authorization%s shows only generic denial, never admin-only guard authority`,
    async (status) => {
      spies.queue.mockRejectedValueOnce(new AuthorizationError(status));
      const html = renderToString(
        await ModerationPage({ params: params(locale) }),
      );
      expect(html).toContain(t.deniedModeration);
      expect(html).not.toContain(reportId);
      expect(html).not.toContain("<button");
    },
  );
  it.each(["reports", "queue"] as const)(
    `${locale} invalid %s DTO rejects authored/actor/catalog fields before SSR`,
    async (kind) => {
      if (kind === "reports")
        spies.reports.mockResolvedValueOnce({
          ...reports,
          items: [
            { ...owned, explanation: "SYNTHETIC_PRIVATE", ratingHalfStars: 10 },
          ],
        });
      else
        spies.queue.mockResolvedValueOnce({
          ...queue,
          items: [
            {
              ...item,
              reporterId: "SYNTHETIC_ACTOR",
              catalogTitle: "SYNTHETIC_HIDDEN_TITLE",
            },
          ],
        });
      await expect(
        (kind === "reports" ? ReportsPage : ModerationPage)({
          params: params(locale),
        }),
      ).rejects.toThrow();
    },
  );
  it(`${locale} advisory navigation is verified-gated and moderator entry is separate from owner reports`, () => {
    expect(
      renderToString(
        <ModerationNavigation
          locale={locale}
          verified={false}
          moderator={true}
        />,
      ),
    ).toBe("");
    const reader = renderToString(
      <ModerationNavigation
        locale={locale}
        verified={true}
        moderator={false}
      />,
    );
    expect(reader).toContain(`/${locale}/community/reports/manage`);
    expect(reader).not.toContain(`/${locale}/community/moderation`);
    const moderator = renderToString(
      <ModerationNavigation locale={locale} verified={true} moderator={true} />,
    );
    expect(moderator).toContain(`/${locale}/community/moderation`);
    expect(moderator).not.toContain("/admin");
  });
}
