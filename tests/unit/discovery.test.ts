import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  exactReleaseDateSchema,
  releaseInputSchema,
  releaseQuerySchema,
  discoveryQuerySchema,
} from "../../apps/web/src/features/catalog/discovery";

describe("human-reviewed discovery contracts", () => {
  it("accepts exact Gregorian calendar days only", () => {
    for (const value of [
      "0001-01-01",
      "2024-02-29",
      "2000-02-29",
      "9999-12-31",
    ])
      expect(exactReleaseDateSchema.parse(value)).toBe(value);
    for (const value of [
      "0000-01-01",
      "1900-02-29",
      "2023-02-29",
      "2024-02-30",
      "2024-04-31",
      "2024-00-01",
      "2024-13-01",
      "2024-01-00",
      "2024",
      "2024-02",
      "2024-01-01T00:00:00Z",
      " 2024-01-01",
      "unknown",
    ])
      expect(exactReleaseDateSchema.safeParse(value).success).toBe(false);
  });
  it("requires explicit release review, source and optimistic Work revision", () => {
    const input = {
      workId: randomUUID(),
      workRevision: 1,
      releaseDate: "2024-02-29",
      language: "vi",
      label: "Verified print edition",
      source: {
        label: "Synthetic fixture",
        citation:
          "Manually inspected synthetic publisher release announcement.",
      },
      releaseReviewAcknowledged: true,
    };
    expect(releaseInputSchema.parse(input)).toEqual(input);
    for (const patch of [
      { releaseReviewAcknowledged: false },
      { workRevision: 0 },
      { source: undefined },
      { releaseDate: "2024" },
      { language: "unknown_language" },
      { label: " " },
      { actorUserId: "forged" },
      { providerVerified: true },
      { cover: "https://example.invalid/cover.jpg" },
    ])
      expect(releaseInputSchema.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
  });
  it("bounds and validates literal discovery pagination/date ranges", () => {
    expect(discoveryQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      locale: "en",
    });
    expect(
      releaseQuerySchema.parse({
        from: "2024-02-29",
        to: "2024-03-01",
        locale: "vi",
      }).locale,
    ).toBe("vi");
    for (const input of [
      { page: 0 },
      { page: 1001 },
      { pageSize: 31 },
      { locale: "fr" },
      { ownerUserId: "forged" },
    ])
      expect(discoveryQuerySchema.safeParse(input).success).toBe(false);
    expect(
      releaseQuerySchema.safeParse({ from: "2024-03-01", to: "2024-02-29" })
        .success,
    ).toBe(false);
  });
});
