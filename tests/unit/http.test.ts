import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  handler: vi.fn(),
  health: vi.fn(),
  log: vi.fn(),
}));
vi.mock("../../apps/web/src/server/auth", () => ({
  getAuth: () => ({ handler: mocks.handler }),
}));
vi.mock("../../apps/web/src/server/database", () => ({
  checkDatabaseHealth: mocks.health,
}));
vi.mock("../../apps/web/src/server/logger", () => ({
  logServerError: mocks.log,
}));
import { GET as health } from "../../apps/web/src/app/api/health/route";
import { GET as ready } from "../../apps/web/src/app/api/ready/route";
import { POST as auth } from "../../apps/web/src/app/api/auth/[...all]/route";
beforeEach(() => vi.resetAllMocks());
describe("HTTP health and safe auth boundaries", () => {
  it("liveness does not need configured database or authentication", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.health).not.toHaveBeenCalled();
  });
  it("readiness reports successful database/schema verification", async () => {
    mocks.health.mockResolvedValue({ status: "ok" });
    expect((await ready()).status).toBe(200);
  });
  it("readiness fails closed without exposing credentials", async () => {
    mocks.health.mockResolvedValue({ status: "unavailable" });
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      database: "unavailable",
    });
  });
  it("auth configuration/driver exceptions do not reach clients", async () => {
    mocks.handler.mockRejectedValue(
      new Error("postgres://private-credential-token"),
    );
    const response = await auth(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-credential");
    expect(mocks.log).toHaveBeenCalledOnce();
  });
  it("auth returned server errors are also sanitized", async () => {
    mocks.handler.mockResolvedValue(
      Response.json({ error: "private-query-params" }, { status: 500 }),
    );
    const response = await auth(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-query");
  });
  it("preserves expected denial responses without changing cookies/contracts", async () => {
    const expected = Response.json(
      { code: "EMAIL_NOT_VERIFIED" },
      { status: 403 },
    );
    mocks.handler.mockResolvedValue(expected);
    expect(
      await auth(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
        }),
      ),
    ).toBe(expected);
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
