import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  READER_PROFILE_BODY_MAX_BYTES,
  ReaderProfileFoundationError,
  readerProfileErrorCodeSchema,
  readerProfileErrorResponseSchema,
  readerProfileErrorStatus,
  readerProfileFoundationBodySchema,
  readerProfileFoundationResponseSchema,
  requireEmptyReaderProfileQuery,
  type ReaderProfileErrorCode,
} from "../../apps/web/src/features/reader-profile/http-contracts";
import {
  readReaderProfileFoundationJson,
  readerProfileFoundationJson,
} from "../../apps/web/src/server/reader-profile/authority";
// Resolve the real HTTP module graph during collection, not a timed test case.
import "../../apps/web/src/server/http";
import { HttpError } from "../../apps/web/src/server/http";
import { CatalogError } from "../../apps/web/src/server/catalog/errors";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  log: vi.fn(),
  admission: vi.fn(),
}));
// Transport units isolate storage only; actual quota/clock/erasure needs real SQL.
vi.mock("../../apps/web/src/server/reader-profile/rate-limits", () => ({
  chargeReaderProfileAttempt: mocks.admission,
}));
// UNIT transport fixtures only: not actual signed-session, SQL or auth acceptance.
// Keep the actual HTTP helpers and session error classes; mock only auth inputs.
vi.mock("../../apps/web/src/server/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/web/src/server/env")>()),
  getAuthEnv: () => ({ APP_ORIGIN: "https://reader.example" }),
}));
vi.mock("../../apps/web/src/server/session", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../apps/web/src/server/session")
  >()),
  requireSession: mocks.session,
}));

const origin = "https://reader.example";
const statuses = [
  ["PROFILE_UNAVAILABLE", 404],
  ["AUTHENTICATION_REQUIRED", 401],
  ["ACCESS_DENIED", 403],
  ["UNTRUSTED_ORIGIN", 403],
  ["JSON_REQUIRED", 415],
  ["BODY_TOO_LARGE", 413],
  ["INVALID_JSON", 400],
  ["VALIDATION_ERROR", 400],
  ["AUTHENTICATION_UNAVAILABLE", 503],
  ["SERVICE_UNAVAILABLE", 503],
  ["RATE_LIMITED", 429],
] as const;
const privateMarker = "private-session-biography-token";

function request(body: BodyInit = "{}", headers: HeadersInit = {}): Request {
  const merged = new Headers({ origin, "content-type": "application/json" });
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  return new Request(`${origin}/foundation`, {
    method: "POST",
    headers: merged,
    body,
    // Node's Web Request requires duplex for streaming request bodies.
    ...(body instanceof ReadableStream ? { duplex: "half" as const } : {}),
  });
}
function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
async function transport(req: Request): Promise<Response> {
  return readerProfileFoundationJson(async () => {
    const result = await readReaderProfileFoundationJson(req);
    expect(result.body).toEqual({});
    expect(result.principal).toBeDefined();
    return { ok: true };
  });
}
async function expectEnvelope(
  response: Response,
  status: number,
  envelope: { ok: true } | { error: string },
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(envelope);
}

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.admission.mockResolvedValue(undefined);
  const { logger } = await import("../../apps/web/src/server/logger");
  vi.spyOn(logger, "error").mockImplementation(mocks.log);
  vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", "true");
  vi.stubEnv("V6B_PROFILE_PUBLIC_ENABLED", "false");
  mocks.session.mockResolvedValue({
    user: { id: "Case:Opaque-account", role: "user", emailVerified: true },
    session: { id: "synthetic-unit-session", userId: "Case:Opaque-account" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("reader profile foundation pure closed contracts", () => {
  it("accepts only an empty handshake, not a lifecycle command", () => {
    expect(READER_PROFILE_BODY_MAX_BYTES).toBe(8192);
    expect(readerProfileFoundationBodySchema.parse({})).toEqual({});
    expect(readerProfileFoundationResponseSchema.parse({ ok: true })).toEqual({
      ok: true,
    });
  });
  it.each([
    null,
    [],
    "{}",
    true,
    0,
    { handle: "reader_one" },
    { displayName: "Reader" },
    { biography: privateMarker },
    { interests: ["fantasy"] },
    { visibility: "PUBLIC" },
    { intent: "PUBLISH", acknowledgePublicProfile: true, expectedRevision: 1 },
    { actor: { accountId: "forged" } },
    { role: "admin" },
    { session: { userId: "forged" } },
    { ownerAccountId: "forged" },
  ])("rejects nonempty/nonobject handshake %j", (value) => {
    expect(readerProfileFoundationBodySchema.safeParse(value).success).toBe(
      false,
    );
  });
  it("guards accessors, symbols and class instances before parsing", () => {
    const getter = vi.fn(() => privateMarker);
    const accessor = Object.defineProperty({}, "actor", {
      enumerable: true,
      get: getter,
    });
    for (const value of [accessor, { [Symbol("secret")]: true }, new Date()])
      expect(readerProfileFoundationBodySchema.safeParse(value).success).toBe(
        false,
      );
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([{ ok: false }, {}, { ok: true, biography: privateMarker }])(
    "rejects an open or invalid success envelope %j",
    (value) => {
      expect(
        readerProfileFoundationResponseSchema.safeParse(value).success,
      ).toBe(false);
    },
  );
  it.each(statuses)("maps %s to only its fixed status %i", (code, status) => {
    const error = new ReaderProfileFoundationError(
      code,
      code === "RATE_LIMITED" ? 1 : undefined,
    );
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message).toBe(code);
    expect(readerProfileErrorStatus[code]).toBe(status);
    expect(readerProfileErrorResponseSchema.parse({ error: code })).toEqual({
      error: code,
    });
    expect(
      readerProfileErrorResponseSchema.safeParse({
        error: code,
        details: privateMarker,
      }).success,
    ).toBe(false);
  });
  it.each([privateMarker, "__proto__", undefined, null, 400])(
    "normalizes unapproved runtime constructor code %j",
    (code) => {
      const error = new ReaderProfileFoundationError(
        code as ReaderProfileErrorCode,
      );
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.status).toBe(503);
      expect(error.message).toBe("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(error)).not.toContain(privateMarker);
    },
  );
  it("freezes the fixed status mapping", () => {
    expect(Object.isFrozen(readerProfileErrorStatus)).toBe(true);
  });
  it("rejects unapproved error codes", () => {
    expect(
      readerProfileErrorCodeSchema.safeParse("RAW_DATABASE_ERROR").success,
    ).toBe(false);
  });
  it.each([
    "?actor=forged",
    "?a=1&a=2",
    "?empty=",
    "?=",
    "?role=admin",
    "?session=secret",
  ])("rejects every query parameter without echoing %s", (query) => {
    expect(() =>
      requireEmptyReaderProfileQuery(new URL(`${origin}/${query}`)),
    ).toThrow(new ReaderProfileFoundationError("VALIDATION_ERROR"));
  });
  it("bounds the full URL at 8192 and uses a fixed error", () => {
    const prefix = `${origin}/`;
    const boundary = new URL(prefix + "x".repeat(8192 - prefix.length));
    expect(() => requireEmptyReaderProfileQuery(boundary)).not.toThrow();
    expect(() =>
      requireEmptyReaderProfileQuery(new URL(`${boundary.href}x`)),
    ).toThrow(new ReaderProfileFoundationError("VALIDATION_ERROR"));
  });
});

describe("reader profile foundation actual HTTP helpers (unit auth fixture)", () => {
  it("returns a no-store closed success after the empty handshake", async () => {
    await expectEnvelope(await transport(request()), 200, { ok: true });
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("gates before callback, request parsing and authentication", async () => {
    vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", "false");
    const run = vi.fn(() => {
      throw new Error(privateMarker);
    });
    await expectEnvelope(await readerProfileFoundationJson(run), 404, {
      error: "PROFILE_UNAVAILABLE",
    });
    const req = request("not JSON", { origin: "https://forged.example" });
    await expect(readReaderProfileFoundationJson(req)).rejects.toMatchObject({
      code: "PROFILE_UNAVAILABLE",
    });
    expect(req.bodyUsed).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.admission).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it.each([
    null,
    "null",
    "https://forged.example",
    `${origin}/`,
    `${origin}.forged.example`,
  ])(
    "requires exact Origin before authentication/body parsing: %s",
    async (value) => {
      const req = request("not JSON");
      if (value === null) req.headers.delete("origin");
      else req.headers.set("origin", value);
      await expectEnvelope(await transport(req), 403, {
        error: "UNTRUSTED_ORIGIN",
      });
      expect(req.bodyUsed).toBe(false);
      expect(mocks.session).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403] as const)(
    "checks session before parsing malformed body: %i",
    async (status) => {
      const { AuthorizationError } =
        await import("../../apps/web/src/server/session");
      mocks.session.mockRejectedValue(new AuthorizationError(status));
      const req = request("not JSON");
      await expectEnvelope(await transport(req), status, {
        error: status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
      });
      expect(req.bodyUsed).toBe(false);
    },
  );
  it.each(["text/plain", "application/problem+json", ""])(
    "rejects unsupported content type %s",
    async (type) => {
      await expectEnvelope(
        await transport(request("{}", { "content-type": type })),
        415,
        { error: "JSON_REQUIRED" },
      );
    },
  );
  it("accepts application/json with a charset", async () => {
    await expectEnvelope(
      await transport(
        request("{}", { "content-type": "application/json; charset=utf-8" }),
      ),
      200,
      { ok: true },
    );
  });
  it.each(["8193", "-1", "garbage"])(
    "rejects oversized/invalid Content-Length %s",
    async (length) => {
      await expectEnvelope(
        await transport(request("{}", { "content-length": length })),
        413,
        { error: "BODY_TOO_LARGE" },
      );
    },
  );
  it("accepts 8192 streamed bytes without Content-Length", async () => {
    const bytes = new TextEncoder().encode("{}" + " ".repeat(8190));
    await expectEnvelope(
      await transport(request(stream(bytes.slice(0, 4096), bytes.slice(4096)))),
      200,
      { ok: true },
    );
  });
  it.each([undefined, "2"])(
    "enforces actual streamed bytes with missing/forged length %s",
    async (length) => {
      const headers: Record<string, string> =
        length === undefined ? {} : { "content-length": length };
      const bytes = new TextEncoder().encode("{}" + " ".repeat(8191));
      await expectEnvelope(
        await transport(
          request(stream(bytes.slice(0, 8192), bytes.slice(8192)), headers),
        ),
        413,
        { error: "BODY_TOO_LARGE" },
      );
    },
  );
  it("rejects malformed UTF-8 instead of accepting replacement characters", async () => {
    // Invalid UTF-8 in JSON whitespace would also fail JSON.parse; put it in a
    // key so nonfatal decoding would instead produce a VALIDATION_ERROR.
    const bytes = Uint8Array.from([123, 34, 0xc3, 0x28, 34, 58, 49, 125]);
    await expectEnvelope(await transport(request(stream(bytes))), 400, {
      error: "INVALID_JSON",
    });
  });
  it.each(["", "{", "{}{}"])("rejects malformed JSON %j", async (body) => {
    await expectEnvelope(await transport(request(body)), 400, {
      error: "INVALID_JSON",
    });
  });
  it.each([
    "actor",
    "role",
    "session",
    "ownerAccountId",
    "handle",
    "biography",
  ])(
    "rejects client %s authority/business fields without logging them",
    async (field) => {
      await expectEnvelope(
        await transport(request(JSON.stringify({ [field]: privateMarker }))),
        400,
        { error: "VALIDATION_ERROR" },
      );
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );
  it.each(statuses)(
    "wraps own %s as a no-store safe HTTP error",
    async (code, status) => {
      await expectEnvelope(
        await readerProfileFoundationJson(() => {
          throw new ReaderProfileFoundationError(
            code,
            code === "RATE_LIMITED" ? 1 : undefined,
          );
        }),
        status,
        { error: code },
      );
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );
  it("rejects extra response fields without leaking or logging private schema values", async () => {
    await expectEnvelope(
      await readerProfileFoundationJson(() => ({
        ok: true,
        biography: privateMarker,
      })),
      503,
      { error: "SERVICE_UNAVAILABLE" },
    );
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected errors and uses only the constant operation label", async () => {
    await expectEnvelope(
      await readerProfileFoundationJson(() => {
        throw new Error(privateMarker);
      }),
      503,
      { error: "SERVICE_UNAVAILABLE" },
    );
    expect(mocks.log).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalledWith(
      { operation: "reader-profile.foundation" },
      "Server operation failed",
    );
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(privateMarker);
  });
  it.each([
    ["HTTP", () => new HttpError(400, privateMarker)],
    ["catalog", () => new CatalogError(400, privateMarker)],
  ] as const)(
    "closes foreign %s error envelopes",
    async (_kind, createError) => {
      await expectEnvelope(
        await readerProfileFoundationJson(() => {
          throw createError();
        }),
        503,
        { error: "SERVICE_UNAVAILABLE" },
      );
      expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(privateMarker);
    },
  );
  it("preserves safe authentication-unavailable errors", async () => {
    const { AuthenticationUnavailableError } =
      await import("../../apps/web/src/server/session");
    mocks.session.mockRejectedValue(new AuthenticationUnavailableError());
    await expectEnvelope(await transport(request()), 503, {
      error: "AUTHENTICATION_UNAVAILABLE",
    });
    expect(mocks.admission).not.toHaveBeenCalled();
  });
});

describe("profile admission transport ordering and closed retry headers", () => {
  it("keeps early query rejection before authentication or admission", async () => {
    const req = new Request(`${origin}/foundation?unknown=1`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "not JSON",
    });
    await expectEnvelope(await transport(req), 400, {
      error: "VALIDATION_ERROR",
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.admission).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });
  it.each(["ordinary", "content", "withdrawal"] as const)(
    "awaits committed admission before body parsing for internal %s dispatch",
    async (kind) => {
      const req = request();
      mocks.admission.mockImplementationOnce(async () => {
        expect(req.bodyUsed).toBe(false);
        expect(mocks.session).toHaveBeenCalledOnce();
        await Promise.resolve();
        expect(req.bodyUsed).toBe(false);
      });
      const result = await readReaderProfileFoundationJson(req, kind);
      expect(mocks.admission).toHaveBeenCalledExactlyOnceWith(
        result.principal,
        kind,
      );
      expect(result.body).toEqual({});
      expect(req.bodyUsed).toBe(true);
    },
  );
  it("does not let client inputs choose the protected class", async () => {
    await expectEnvelope(
      await transport(
        request('{"attemptClass":"withdrawal"}', {
          "x-reader-profile-class": "withdrawal",
        }),
      ),
      400,
      { error: "VALIDATION_ERROR" },
    );
    expect(mocks.admission).toHaveBeenCalledOnce();
    expect(mocks.admission.mock.calls[0]?.[1]).toBe("ordinary");
  });
  it.each([
    ["{", "application/json", 400, "INVALID_JSON"],
    ['{"unknown":true}', "application/json", 400, "VALIDATION_ERROR"],
    ["{}", "text/plain", 415, "JSON_REQUIRED"],
    ["{}" + " ".repeat(8191), "application/json", 413, "BODY_TOO_LARGE"],
  ] as const)(
    "retains admission before a later invalid body/media result (%i)",
    async (body, media, status, code) => {
      await expectEnvelope(
        await transport(request(body, { "content-type": media })),
        status,
        { error: code },
      );
      expect(mocks.admission).toHaveBeenCalledOnce();
    },
  );
  it("retains admission on malformed UTF-8 after the committed boundary", async () => {
    await expectEnvelope(
      await transport(
        request(
          stream(Uint8Array.from([123, 34, 0xc3, 0x28, 34, 58, 49, 125])),
        ),
      ),
      400,
      { error: "INVALID_JSON" },
    );
    expect(mocks.admission).toHaveBeenCalledOnce();
  });
  it.each([1, 17, 60])(
    "emits only a bounded Retry-After=%i on quota denial",
    async (seconds) => {
      const req = request("not JSON");
      mocks.admission.mockRejectedValueOnce(
        new ReaderProfileFoundationError("RATE_LIMITED", seconds),
      );
      const response = await transport(req);
      expect(response.headers.get("retry-after")).toBe(String(seconds));
      await expectEnvelope(response, 429, { error: "RATE_LIMITED" });
      expect(req.bodyUsed).toBe(false);
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 0, -1, 1.5, 61, NaN, Infinity, "3", privateMarker])(
    "fails closed for an invalid quota retry value %j",
    async (value) => {
      const error = new ReaderProfileFoundationError(
        "RATE_LIMITED",
        value as number,
      );
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.retryAfterSeconds).toBeUndefined();
      const response = await readerProfileFoundationJson(() => {
        throw error;
      });
      expect(response.headers.get("retry-after")).toBeNull();
      await expectEnvelope(response, 503, { error: "SERVICE_UNAVAILABLE" });
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );
  it("revalidates runtime-mutated retry metadata before setting headers", async () => {
    const error = new ReaderProfileFoundationError("RATE_LIMITED", 10);
    Object.defineProperty(error, "retryAfterSeconds", { value: privateMarker });
    const response = await readerProfileFoundationJson(() => {
      throw error;
    });
    expect(response.headers.get("retry-after")).toBeNull();
    await expectEnvelope(response, 503, { error: "SERVICE_UNAVAILABLE" });
  });
  it("does not accept a foreign HTTP 429 as DB-derived quota metadata", async () => {
    const response = await readerProfileFoundationJson(() => {
      throw new HttpError(429, "RATE_LIMITED");
    });
    expect(response.headers.get("retry-after")).toBeNull();
    await expectEnvelope(response, 503, { error: "SERVICE_UNAVAILABLE" });
  });
  it("fails closed before parsing when admission storage is unavailable", async () => {
    const req = request("not JSON");
    mocks.admission.mockRejectedValueOnce(
      new ReaderProfileFoundationError("SERVICE_UNAVAILABLE"),
    );
    const response = await transport(req);
    expect(response.headers.get("retry-after")).toBeNull();
    await expectEnvelope(response, 503, { error: "SERVICE_UNAVAILABLE" });
    expect(req.bodyUsed).toBe(false);
  });
  it("never attaches retry metadata to a different approved error", async () => {
    const error = new ReaderProfileFoundationError("ACCESS_DENIED", 10);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});
