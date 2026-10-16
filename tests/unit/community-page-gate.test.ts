import { beforeEach, afterEach, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("TEST_NEXT_NOT_FOUND");
  }),
  headers: vi.fn(),
  catalog: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  owned: vi.fn(),
  participation: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: spies.notFound }));
vi.mock("next/headers", () => ({ headers: spies.headers }));
vi.mock("../../apps/web/src/server/catalog/service", () => ({
  getWorkBySlug: spies.catalog,
}));
vi.mock("../../apps/web/src/server/community/service", () => ({
  listCommunityContents: spies.list,
  getCommunityContent: spies.detail,
  listOwnedCommunityContents: spies.owned,
}));
vi.mock("../../apps/web/src/server/community/pages", () => ({
  communityParticipation: spies.participation,
}));
import ListPage, {
  generateMetadata as listMetadata,
} from "../../apps/web/src/app/[locale]/works/[slug]/discussions/page";
import DetailPage, {
  generateMetadata as detailMetadata,
} from "../../apps/web/src/app/[locale]/works/[slug]/discussions/[threadId]/page";
import ManagePage, {
  generateMetadata as manageMetadata,
} from "../../apps/web/src/app/[locale]/community/manage/page";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("V4_COMMUNITIES_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());
for (const [name, render] of [
  ["list", ListPage],
  ["detail", DetailPage],
  ["manage", ManagePage],
  ["list metadata", listMetadata],
  ["detail metadata", detailMetadata],
  ["manage metadata", manageMetadata],
] as const) {
  it(`disabled ${name} rejects before params, request headers, catalog, auth or community reads`, async () => {
    const observed = vi.fn();
    const params = new Proxy(
      Promise.resolve({
        locale: "en",
        slug: "synthetic",
        threadId: "not-consumed",
      }),
      {
        get(target, key, receiver) {
          if (key === "then") {
            observed();
            throw new Error("Disabled params must not be read");
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    await expect(render({ params })).rejects.toThrow("TEST_NEXT_NOT_FOUND");
    expect(observed).not.toHaveBeenCalled();
    for (const spy of [
      spies.headers,
      spies.catalog,
      spies.list,
      spies.detail,
      spies.owned,
      spies.participation,
    ])
      expect(spy).not.toHaveBeenCalled();
  });
}
