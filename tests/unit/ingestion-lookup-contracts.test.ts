import { describe, expect, it } from "vitest";
import {
  LOOKUP_LIMITS,
  LookupInputSchema,
  LookupReviewSchema,
  parseLookupInput,
} from "../../apps/web/src/features/ingestion/lookup-contracts";

const title = {
  providerId: "OPEN_LIBRARY",
  operation: "TITLE_SEARCH",
  title: "SYNTHETIC Đường về",
  resultLimit: 5,
};

describe("offline lookup input contracts", () => {
  it("preserves a bounded literal title and its actual language text", () => {
    expect(parseLookupInput(title)).toEqual({ ok: true, value: title });
    expect(
      LookupInputSchema.parse({ ...title, title: "A".repeat(200) }),
    ).toMatchObject({ title: "A".repeat(200) });
  });
  it("accepts only explicitly supported Work identifiers, not canonical UUIDs or edition IDs", () => {
    const value = {
      providerId: "OPEN_LIBRARY",
      operation: "WORK_LOOKUP",
      sourceRecordId: "OL123456W",
      resultLimit: 1,
    };
    expect(parseLookupInput(value)).toEqual({ ok: true, value });
    for (const id of [
      "OL123M",
      "OL0W",
      " OL1W",
      "OL1W\n",
      "00000000-0000-4000-8000-000000000000",
      "../OL1W",
      "OL1W?x=1",
    ])
      expect(parseLookupInput({ ...value, sourceRecordId: id })).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        retry: false,
      });
  });
  it.each([
    "",
    "A".repeat(201),
    "https://example.invalid/private",
    "www.example.invalid",
    "127.0.0.1",
    "localhost",
    "title:SYNTHETIC",
    "*:*",
    "SYNTHETIC OR hidden",
    "[A TO Z]",
    "SYNTHETIC~2",
    "SYNTHETIC^9",
    "Synthetic -hidden",
    "Synthetic !hidden",
    "Synthetic (hidden)",
    "Synthetic?",
    "Synthetic foo-bar",
    "SYNTHETIC\\escape",
    "SYNTHETIC\nsecret",
    "\tSYNTHETIC",
    "SYNTHETIC\u202eprivate",
    "SYNTHETIC\ud800",
  ])(
    "rejects nonliteral, oversized or unsafe title %# without echo",
    (value) => {
      expect(parseLookupInput({ ...title, title: value })).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        retry: false,
      });
    },
  );
  it.each([
    "url",
    "host",
    "port",
    "protocol",
    "path",
    "actorId",
    "role",
    "approved",
    "approval",
    "capability",
    "workId",
    "notes",
  ])("rejects smuggled field %s", (field) => {
    expect(
      parseLookupInput({ ...title, [field]: "PRIVATE_SYNTHETIC_CANARY" }),
    ).toEqual({ ok: false, code: "INVALID_INPUT", retry: false });
  });
  it("rejects unknown providers/operations and invalid result bounds", () => {
    for (const change of [
      { providerId: "UNREVIEWED" },
      { operation: "DISCOVER_NEW_WORKS" },
      { resultLimit: 0 },
      { resultLimit: 6 },
      { resultLimit: 1.5 },
    ])
      expect(parseLookupInput({ ...title, ...change }).ok).toBe(false);
    for (const input of [
      null,
      [],
      "PRIVATE_SYNTHETIC_CANARY",
      {
        get operation() {
          throw new Error("PRIVATE_SYNTHETIC_CANARY");
        },
      },
    ])
      expect(parseLookupInput(input)).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        retry: false,
      });
  });
  it("keeps field grants narrow, explicit and nonpersistent", () => {
    const grant = {
      providerId: "OPEN_LIBRARY",
      reviewId: "synthetic-review",
      approval: "APPROVED",
      purpose: "HUMAN_REQUESTED_LOOKUP",
      reviewedAt: "2026-11-01T00:00:00Z",
      expiresAt: "2026-11-03T00:00:00Z",
      evidenceUrls: ["https://policy.example.invalid/synthetic"],
      fields: ["IDENTIFIER", "TITLE"],
      retention: "VOLATILE_ONLY",
    };
    expect(LookupReviewSchema.safeParse(grant).success).toBe(true);
    for (const fields of [
      ["TITLE", "TITLE"],
      ["DESCRIPTION", "TITLE"],
      ["COVER", "IDENTIFIER"],
      [],
    ])
      expect(LookupReviewSchema.safeParse({ ...grant, fields }).success).toBe(
        false,
      );
    expect(
      LookupReviewSchema.safeParse({ ...grant, retention: "PERMANENT" })
        .success,
    ).toBe(false);
    expect(LOOKUP_LIMITS).toMatchObject({
      bodyBytes: 131072,
      candidateBytes: 32768,
      results: 5,
    });
  });
});
