import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  workInputSchema,
  updateWorkSchema,
  visibilityInputSchema,
} from "../../apps/web/src/features/catalog/contracts";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), log: vi.fn() }));
vi.mock("../../apps/web/src/server/env", () => ({
  getAuthEnv: () => ({ APP_ORIGIN: "http://127.0.0.1:3000" }),
}));
vi.mock("../../apps/web/src/server/database", () => ({
  getDatabaseConnection: () => ({ client: mocks.sql }),
  getDatabase: vi.fn(),
}));
vi.mock("../../apps/web/src/server/logger", () => ({
  logServerError: mocks.log,
}));
import {
  readJson,
  requireTrustedOrigin,
  limitCatalogMutation,
  safeJson,
  HttpError,
} from "../../apps/web/src/server/http";
beforeEach(() => vi.clearAllMocks());
describe("custom catalog HTTP boundaries", () => {
  it("allows only exact configured mutation origins", () => {
    expect(() =>
      requireTrustedOrigin(
        new Request("http://127.0.0.1:3000/api/admin/catalog/works", {
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).not.toThrow();
    for (const origin of [
      "",
      "https://attacker.example.invalid",
      "http://127.0.0.1:3000.attacker.invalid",
    ]) {
      expect(() =>
        requireTrustedOrigin(
          new Request("http://127.0.0.1:3000/api/admin/catalog/works", {
            headers: origin ? { origin } : {},
          }),
        ),
      ).toThrow("UNTRUSTED_ORIGIN");
    }
  });
  it("validates JSON without trusting client shape", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "real input" }),
    });
    expect(
      await readJson(request, z.object({ title: z.string() }).strict()),
    ).toEqual({ title: "real input" });
  });
  it("enforces publication review on JSON mutation contracts", async () => {
    for (const schema of [
      workInputSchema,
      updateWorkSchema,
      visibilityInputSchema,
    ] as z.ZodType[]) {
      const base =
        schema === visibilityInputSchema
          ? { revision: 1 }
          : {
              primaryTitle: "Synthetic",
              format: "NOVEL",
              releaseStatus: "UNKNOWN",
              source: { label: "Synthetic", citation: "Invented fixture" },
              ...(schema === updateWorkSchema ? { revision: 1 } : {}),
            };
      const request = (payload: unknown) =>
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      for (const publicationReviewAcknowledged of [
        undefined,
        false,
        "true",
        1,
        null,
      ]) {
        const response = await safeJson("catalog.review", () =>
          readJson(
            request({
              ...base,
              visibility: "PUBLISHED",
              publicationReviewAcknowledged,
            }),
            schema,
          ),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "VALIDATION_ERROR" });
      }
      await expect(
        readJson(
          request({
            ...base,
            visibility: "PUBLISHED",
            publicationReviewAcknowledged: true,
          }),
          schema,
        ),
      ).resolves.toMatchObject({ publicationReviewAcknowledged: true });
      for (const visibility of ["DRAFT", "HIDDEN"])
        for (const publicationReviewAcknowledged of [undefined, false])
          await expect(
            readJson(
              request({ ...base, visibility, publicationReviewAcknowledged }),
              schema,
            ),
          ).resolves.toMatchObject({ visibility });
    }
  });
  it("rejects oversized streaming bodies even without Content-Length", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "12345",
    });
    await expect(readJson(request, z.unknown(), 4)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects non-JSON and malformed JSON", async () => {
    await expect(
      readJson(
        new Request("http://localhost", { method: "POST", body: "{}" }),
        z.unknown(),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
        z.unknown(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("does not serialize private driver exception details", async () => {
    const response = await safeJson("catalog.test", async () => {
      throw new Error("private-driver-credential");
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-driver");
    expect(mocks.log).toHaveBeenCalledOnce();
  });
  it("preserves explicit protocol failure status", async () => {
    const response = await safeJson("catalog.test", async () => {
      throw new HttpError(409, "CONFLICT");
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "CONFLICT" });
  });
  it("enforces its independent admin mutation limit", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ count: 30 }])
      .mockResolvedValueOnce([{ count: 31 }]);
    await limitCatalogMutation("synthetic-admin");
    await expect(limitCatalogMutation("synthetic-admin")).rejects.toMatchObject(
      { status: 429 },
    );
  });
});
