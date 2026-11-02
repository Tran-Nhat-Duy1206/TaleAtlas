import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PRODUCTION_PROVIDER_POLICIES } from "../../apps/web/src/features/ingestion/providers";
import { OFFLINE_DISABLED_PROVIDER_DESCRIPTORS } from "../../apps/web/src/features/ingestion/provider-records";
import {
  planOfflineLookup,
  validateOfflineLookupPlan,
} from "../../apps/web/src/features/ingestion/lookup-plan";

const now = "2026-11-02T00:00:00Z";
const input = {
  providerId: "OPEN_LIBRARY",
  operation: "TITLE_SEARCH",
  title: "SYNTHETIC Offline Story",
  resultLimit: 5,
};
function fixtures() {
  const policy = {
    ...PRODUCTION_PROVIDER_POLICIES.find(
      (p) => p.providerId === "OPEN_LIBRARY",
    )!,
    enabled: true,
    approvalStatus: "APPROVED",
    metadataStorageAllowed: true,
    reviewedAt: "2026-11-01",
    intendedUseReview: "SYNTHETIC TEST ONLY; not real permission",
    documentationUrls: ["https://policy.example.invalid/synthetic"],
  };
  const review = {
    providerId: "OPEN_LIBRARY",
    reviewId: "synthetic-review",
    approval: "APPROVED",
    purpose: "HUMAN_REQUESTED_LOOKUP",
    reviewedAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-11-04T00:00:00Z",
    evidenceUrls: ["https://policy.example.invalid/synthetic"],
    fields: ["IDENTIFIER", "TITLE"],
    retention: "VOLATILE_ONLY",
  };
  const budget = {
    approved: true,
    expiresAt: "2026-11-03T00:00:00Z",
    requestsPerAction: 1,
    remainingDailyRequests: 10,
    remainingUserActions: 5,
    concurrencyAvailable: true,
  };
  return { policy, review, budget };
}
function positive() {
  const { policy, review, budget } = fixtures();
  const result = planOfflineLookup(input, policy, review, budget, now);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Synthetic plan must succeed");
  return result.value;
}

describe("inert metadata lookup planning", () => {
  it("does not mutate or enable any production policy or descriptor", () => {
    const before = JSON.stringify(PRODUCTION_PROVIDER_POLICIES);
    for (const policy of PRODUCTION_PROVIDER_POLICIES) {
      expect(policy).toMatchObject({
        enabled: false,
        approvalStatus: "PENDING",
        metadataStorageAllowed: false,
        autoPublish: false,
      });
      expect(
        planOfflineLookup(
          { ...input, providerId: policy.providerId },
          policy,
          null,
          null,
          now,
        ),
      ).toEqual({ ok: false, code: "PROVIDER_DISABLED", retry: false });
    }
    for (const d of OFFLINE_DISABLED_PROVIDER_DESCRIPTORS) {
      expect(d.capabilities).toEqual([]);
      expect(Object.values(d).some((v) => typeof v === "function")).toBe(false);
    }
    positive();
    expect(JSON.stringify(PRODUCTION_PROVIDER_POLICIES)).toBe(before);
  });
  it("constructs frozen fixed-host data, not an executable adapter", () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Unexpected network");
    });
    try {
      const plan = positive();
      expect(plan).toMatchObject({
        executable: false,
        transport: "NOT_IMPLEMENTED",
        persistence: false,
        autoPublish: false,
        humanReviewRequired: true,
        capability: "SEARCH_WORKS",
        deadlineMs: 5000,
        resultLimit: 5,
      });
      expect(plan.endpoint).toEqual({
        origin: "https://openlibrary.org",
        method: "GET",
        path: "/search.json",
        parameters: {
          title: input.title,
          fields: "key,title",
          limit: "5",
          page: "1",
        },
      });
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.endpoint.parameters)).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it("plans supported external IDs without treating them as canonical Work UUIDs", () => {
    const { policy, review, budget } = fixtures();
    const result = planOfflineLookup(
      {
        providerId: "OPEN_LIBRARY",
        operation: "WORK_LOOKUP",
        sourceRecordId: "OL123456W",
        resultLimit: 1,
      },
      policy,
      review,
      budget,
      now,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        capability: "GET_WORK_DETAILS",
        resultLimit: 1,
        endpoint: { path: "/works/OL123456W.json", parameters: {} },
      },
    });
    expect(JSON.stringify(result)).not.toContain('"workId"');
  });
  it("requires explicit policy, field evidence, current permission and known budgets", () => {
    const { policy, review, budget } = fixtures();
    expect(
      planOfflineLookup(input, undefined, review, budget, now),
    ).toMatchObject({ ok: false, code: "INVALID_POLICY" });
    for (const p of [
      { ...policy, approvalStatus: "PENDING" },
      { ...policy, metadataStorageAllowed: false },
      { ...policy, auth: "UNRESOLVED" },
    ])
      expect(planOfflineLookup(input, p, review, budget, now).ok).toBe(false);
    for (const r of [
      null,
      { ...review, reviewedAt: "2026-10-30T00:00:00Z" },
      { ...review, fields: ["TITLE"] },
      { ...review, fields: ["IDENTIFIER", "DESCRIPTION"] },
      { ...review, evidenceUrls: ["https://unreviewed.example.invalid/"] },
      { ...review, providerId: "MANGADEX" },
      { ...review, purpose: "AUTOMATED_DISCOVERY" },
    ])
      expect(planOfflineLookup(input, policy, r, budget, now)).toMatchObject({
        ok: false,
        code: "RIGHTS_UNRESOLVED",
      });
    for (const b of [
      null,
      { ...budget, approved: false },
      { ...budget, remainingDailyRequests: null },
      { ...budget, requestsPerAction: 2 },
      { ...budget, expiresAt: now },
    ])
      expect(planOfflineLookup(input, policy, review, b, now)).toMatchObject({
        ok: false,
        code: "BUDGET_REQUIRED",
      });
  });
  it("rejects expired, future or inconsistent review evidence and exhausted budgets", () => {
    const { policy, review, budget } = fixtures();
    for (const r of [
      { ...review, expiresAt: now },
      { ...review, reviewedAt: "2026-11-03T00:00:00Z" },
      { ...review, expiresAt: "2026-10-01T00:00:00Z" },
    ])
      expect(planOfflineLookup(input, policy, r, budget, now)).toMatchObject({
        ok: false,
        code: "APPROVAL_EXPIRED",
      });
    for (const b of [
      { ...budget, remainingDailyRequests: 0 },
      { ...budget, remainingUserActions: 0 },
      { ...budget, concurrencyAvailable: false },
    ])
      expect(planOfflineLookup(input, policy, review, b, now)).toMatchObject({
        ok: false,
        code: "BUDGET_EXHAUSTED",
      });
    expect(
      planOfflineLookup(
        input,
        { ...policy, capabilities: [] },
        review,
        budget,
        now,
      ),
    ).toMatchObject({ ok: false, code: "CAPABILITY_DENIED" });
    expect(
      planOfflineLookup(
        input,
        { ...policy, capabilities: ["ARBITRARY"] },
        review,
        budget,
        now,
      ).ok,
    ).toBe(false);
  });
  it("has deterministic replay intent, not a reservation/delivery guarantee", () => {
    const { policy, review, budget } = fixtures();
    const one = positive();
    const two = planOfflineLookup(
      { ...input, title: ` ${input.title} ` },
      policy,
      review,
      { ...budget, remainingDailyRequests: 8 },
      "2026-11-02T00:00:01Z",
    );
    expect(two.ok && two.value.replayIntent).toBe(one.replayIntent);
    const changed = planOfflineLookup(
      { ...input, title: "SYNTHETIC Different Story" },
      policy,
      review,
      budget,
      now,
    );
    expect(changed.ok && changed.value.replayIntent).not.toBe(one.replayIntent);
    expect(JSON.parse(JSON.stringify(one))).toMatchObject({
      executable: false,
      persistence: false,
    });
  });
  it("validates all plan structure and does not accept forged destinations or functions", () => {
    const p = positive();
    for (const change of [
      {
        endpoint: { ...p.endpoint, origin: "https://attacker.example.invalid" },
      },
      { endpoint: { ...p.endpoint, path: "/private" } },
      {
        endpoint: {
          ...p.endpoint,
          parameters: { ...p.endpoint.parameters, url: "http://127.0.0.1" },
        },
      },
      { capability: "GET_WORK_DETAILS" },
      { resultLimit: 1 },
      { executable: true },
      { fields: ["IDENTIFIER", "COVER"] },
      { replayIntent: "PRIVATE_SYNTHETIC_CANARY" },
      { execute: () => undefined },
    ])
      expect(validateOfflineLookupPlan({ ...p, ...change })).toEqual({
        ok: false,
        code: "INVALID_PLAN",
        retry: false,
      });
  });
  it("has an explicitly pure import closure and no new runtime IO or private data imports", () => {
    const base = new URL("../../", import.meta.url);
    const runtime = [
      "lookup-contracts",
      "lookup-plan",
      "lookup-response",
      "providers",
      "provider-records",
      "pipeline",
      "contracts",
    ]
      .map((name) => `apps/web/src/features/ingestion/${name}.ts`)
      .concat([
        "packages/database/src/catalog-types.ts",
        "packages/database/src/ingestion-types.ts",
      ]);
    for (const path of runtime) {
      const source = readFileSync(new URL(path, base), "utf8");
      const ast = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(n: ts.Node) {
        if (
          ts.isImportDeclaration(n) &&
          ts.isStringLiteral(n.moduleSpecifier)
        ) {
          const value = n.moduleSpecifier.text;
          expect(value).not.toMatch(
            /^(?:node:|https?:)|server\/|reader-profile|library\/|session|database\/client/,
          );
          expect(
            value === "zod" ||
              value.startsWith(".") ||
              [
                "@taleatlas/database/catalog-types",
                "@taleatlas/database/ingestion-types",
              ].includes(value),
          ).toBe(true);
        }
        if (ts.isCallExpression(n)) {
          expect(n.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          if (ts.isIdentifier(n.expression))
            expect(n.expression.text).not.toMatch(/^(?:fetch|require|eval)$/);
        }
        if (ts.isPropertyAccessExpression(n))
          expect(n.getText(ast)).not.toMatch(
            /\bprocess\.env\b|\b(?:globalThis|window)\.fetch\b/,
          );
        ts.forEachChild(n, visit);
      }
      visit(ast);
    }
  });
});
