import { describe, expect, it, vi } from "vitest";

// Dependency tripwire only, NOT a mock authentication/storage acceptance claim.
// Importing foundation database/readiness must not initialize the HTTP/auth graph.
vi.mock("../../apps/web/src/server/http", () => {
  throw new Error("Database availability must not import HTTP/authentication");
});

describe("pure server community availability dependency boundary", () => {
  it("loads foundation database without entering HTTP/auth while retaining lazy connection access", async () => {
    const database = await import("../../apps/web/src/server/database");
    expect(typeof database.getDatabaseConnection).toBe("function");
    expect(typeof database.checkDatabaseHealth).toBe("function");
  });
});
