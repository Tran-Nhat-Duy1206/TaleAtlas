import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revokeSessions: vi.fn(),
  changePassword: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../../apps/web/src/server/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
      revokeSessions: mocks.revokeSessions,
      changePassword: mocks.changePassword,
    },
  }),
}));
import {
  changePassword,
  getSession,
  requireRole,
  requireSession,
  revokeAllSessions,
} from "../../apps/web/src/server/session";
const requestHeaders = new Headers({ cookie: "test-session" });
const admin = {
  session: { id: "session-id", userId: "user-id" },
  user: { id: "user-id", role: "admin" },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.getSession.mockResolvedValue(null);
});
describe("session authorization", () => {
  it("passes explicit headers without reading framework context", async () => {
    await getSession(requestHeaders);
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(mocks.headers).not.toHaveBeenCalled();
  });
  it("reads framework request headers when omitted", async () => {
    await getSession();
    expect(mocks.headers).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
  });
  it("rejects unauthenticated requests with 401", async () => {
    await expect(requireSession(requestHeaders)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("requires an explicitly permitted role", async () => {
    mocks.getSession.mockResolvedValue(admin);
    await expect(
      requireRole(["moderator"], requestHeaders),
    ).rejects.toMatchObject({ status: 403 });
    await expect(requireRole(["admin"], requestHeaders)).resolves.toEqual(
      admin,
    );
    await expect(requireRole([], requestHeaders)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("checks role again each invocation rather than keeping stale grants", async () => {
    mocks.getSession.mockResolvedValueOnce(admin).mockResolvedValueOnce({
      ...admin,
      user: { ...admin.user, role: "user" },
    });
    await requireRole(["admin"], requestHeaders);
    await expect(requireRole(["admin"], requestHeaders)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("propagates unavailable auth instead of treating it as anonymous", async () => {
    mocks.getSession.mockRejectedValue(
      new Error("private-session-token-in-driver-error"),
    );
    await expect(requireSession(requestHeaders)).rejects.toMatchObject({
      status: 503,
      message: "Authentication service unavailable",
    });
  });
  it("does not revoke sessions without authentication", async () => {
    await expect(revokeAllSessions(requestHeaders)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
  });
  it("revokes all sessions using the authenticated request", async () => {
    mocks.getSession.mockResolvedValue(admin);
    await revokeAllSessions(requestHeaders);
    expect(mocks.revokeSessions).toHaveBeenCalledWith({
      headers: requestHeaders,
    });
  });
  it("always revokes other sessions after password change", async () => {
    mocks.getSession.mockResolvedValue(admin);
    await changePassword("old-password", "new-long-password", requestHeaders);
    expect(mocks.changePassword).toHaveBeenCalledWith({
      headers: requestHeaders,
      body: {
        currentPassword: "old-password",
        newPassword: "new-long-password",
        revokeOtherSessions: true,
      },
    });
  });
});
