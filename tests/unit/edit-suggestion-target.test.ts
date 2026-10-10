// Query-shape unit with a mocked DB; real SQL acceptance is owned by parent.
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../../apps/web/src/server/database", () => ({
  getDatabase: () => ({ select: mocks.select }),
}));
import { works } from "../../packages/database/src/catalog-schema";
import { getSuggestionTarget } from "../../apps/web/src/server/catalog/suggestion-target";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([
    { id, revision: 3, slug: "public-work", displayTitle: "Safe public title" },
  ]);
});
it("only projects qualified public metadata columns for slug lookup", async () => {
  expect(await getSuggestionTarget({ slug: "public-work" })).toEqual({
    id,
    revision: 3,
    slug: "public-work",
    displayTitle: "Safe public title",
  });
  expect(mocks.select).toHaveBeenCalledWith({
    id: works.id,
    revision: works.revision,
    slug: works.slug,
    displayTitle: works.primaryTitle,
  });
  expect(mocks.from).toHaveBeenCalledWith(works);
  expect(mocks.limit).toHaveBeenCalledWith(1);
  // The predicate binds PUBLISHED and the exact slug (no wildcard search).
  const chunks = mocks.where.mock.calls[0][0].queryChunks;
  const serialized = JSON.stringify(chunks, (key, value) =>
    key === "table" ? undefined : value,
  );
  expect(serialized).toContain("PUBLISHED");
  expect(serialized).toContain("public-work");
});
it("accepts real UUID and missing/hidden target is null", async () => {
  await getSuggestionTarget({ id });
  expect(mocks.select).toHaveBeenCalledTimes(1);
  mocks.limit.mockResolvedValueOnce([]);
  expect(await getSuggestionTarget({ slug: "hidden" })).toBeNull();
});
it.each([{ id: "not-uuid" }, { slug: "" }, { slug: "x".repeat(161) }])(
  "invalid lookup performs no SQL",
  async (lookup) => {
    expect(await getSuggestionTarget(lookup)).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  },
);
