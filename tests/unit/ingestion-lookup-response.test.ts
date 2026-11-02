import { afterEach, describe, expect, it, vi } from "vitest";
import { processSyntheticLookupResponse as processResponse } from "../../apps/web/src/features/ingestion/lookup-response";
import { planOfflineLookup } from "../../apps/web/src/features/ingestion/lookup-plan";
import { PRODUCTION_PROVIDER_POLICIES } from "../../apps/web/src/features/ingestion/providers";
import {
  identityMatch,
  type IdentityWork,
} from "../../apps/web/src/features/ingestion/pipeline";

const now = "2026-11-02T00:00:00Z";
const receivedAt = "2026-11-02T00:00:01Z";
const evidence = "https://fixtures.example.invalid/review/synthetic";
// Local fixture-only snapshots, never production approval or authority.
function fixturePlan(limit = 5, work = false) {
  const base = PRODUCTION_PROVIDER_POLICIES.find(
    (p) => p.providerId === "OPEN_LIBRARY",
  )!;
  const result = planOfflineLookup(
    work
      ? {
          providerId: "OPEN_LIBRARY",
          operation: "WORK_LOOKUP",
          sourceRecordId: "OL123W",
        }
      : {
          providerId: "OPEN_LIBRARY",
          operation: "TITLE_SEARCH",
          title: "Synthetic tale",
          resultLimit: limit,
        },
    {
      ...base,
      enabled: true,
      approvalStatus: "APPROVED",
      metadataStorageAllowed: true,
      reviewedAt: "2026-11-01",
      intendedUseReview: "Synthetic fixture only",
      documentationUrls: [evidence],
    },
    {
      providerId: "OPEN_LIBRARY",
      reviewId: "Synthetic",
      approval: "APPROVED",
      purpose: "HUMAN_REQUESTED_LOOKUP",
      reviewedAt: "2026-11-01T00:00:00Z",
      expiresAt: "2026-11-03T00:00:00Z",
      evidenceUrls: [evidence],
      fields: ["IDENTIFIER", "TITLE"],
      retention: "VOLATILE_ONLY",
    },
    {
      approved: true,
      expiresAt: "2026-11-03T00:00:00Z",
      requestsPerAction: 1,
      remainingDailyRequests: 10,
      remainingUserActions: 5,
      concurrencyAvailable: true,
    },
    now,
  );
  if (!result.ok) throw new Error(result.code);
  return result.value;
}
const record = (id = "one") => ({
  key: `/works/synthetic-${id}`,
  title: "Synthetic tale",
});
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
function response(records: unknown[] = [record()]) {
  return {
    kind: "SYNTHETIC",
    providerId: "OPEN_LIBRARY",
    receivedAt,
    state: "COMPLETED",
    status: 200,
    headers: { "content-type": "application/json" },
    body: bytes({ records }),
  };
}
function failure(input: unknown, code: string, plan: unknown = fixturePlan()) {
  expect(processResponse(plan, input)).toEqual({
    ok: false,
    code,
    retry: false,
  });
}
function provenance(id = "synthetic-other") {
  return {
    providerId: "OPEN_LIBRARY",
    sourceRecordId: id,
    sourceUrl: `https://fixtures.example.invalid/open_library/${id}`,
    retrievedAt: receivedAt,
  };
}
afterEach(() => vi.restoreAllMocks());

describe("synthetic offline lookup response", () => {
  it("projects only identifier/title, keeps UNKNOWN and immutable fixture citations", () => {
    const raw = {
      ...record(),
      format: "NOVEL",
      title_language: "en",
      creators: [{ name: "PRIVATE_CANARY" }],
      isbn_13: ["9780306406157"],
      editions: [],
      description: "PRIVATE_CANARY",
      privateNotes: "PRIVATE_CANARY",
      covers: [{ url: "https://private.invalid" }],
      alternative_titles: [{ title: "PRIVATE_CANARY" }],
    };
    const result = processResponse(fixturePlan(), response([raw]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    const candidate = result.value[0];
    expect(candidate.providerRecord).toEqual({
      providerId: "OPEN_LIBRARY",
      sourceRecordId: "synthetic-one",
    });
    expect(candidate.identifiers?.value).toEqual([
      { namespace: "openlibrary", value: "synthetic-one" },
    ]);
    expect(candidate.format?.value).toBe("UNKNOWN");
    expect(candidate.title?.value).toBe("Synthetic tale");
    expect(candidate.provenance[0]).toMatchObject(provenance("synthetic-one"));
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CANARY");
    for (const key of [
      "creators",
      "editions",
      "description",
      "covers",
      "alternativeTitles",
      "originalLanguage",
    ])
      expect(candidate).not.toHaveProperty(key);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(candidate.providerRecord)).toBe(true);
    expect(Object.isFrozen(candidate.identifiers?.value[0])).toBe(true);
    expect(candidate.autoPublish).toBe(false);
    expect(candidate.humanReviewRequired).toBe(true);
  });
  it("retains approved synthetic title conflict evidence", () => {
    const result = processResponse(
      fixturePlan(),
      response([
        {
          ...record(),
          titleConflicts: [
            { value: "Alternate synthetic tale", provenance: provenance() },
          ],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value[0].title?.conflictingEvidence?.[0]).toMatchObject({
        value: "Alternate synthetic tale",
        provenance: provenance(),
      });
  });
  it.each([
    { ...provenance(), providerId: "MANGADEX" },
    { ...provenance(), sourceRecordId: "OL123W" },
    { ...provenance(), sourceUrl: "https://openlibrary.org/works/OL123W" },
    {
      ...provenance(),
      sourceUrl:
        "https://fixtures.example.invalid/open_library/synthetic-other?fake=1",
    },
    {
      ...provenance(),
      identifiers: [{ namespace: "ISBN13", value: "9780306406157" }],
    },
  ])("rejects unapproved conflict provenance %#", (p) => {
    failure(
      response([
        { ...record(), titleConflicts: [{ value: "Other", provenance: p }] },
      ]),
      "INVALID_RESPONSE",
    );
  });
  it.each([300, 301, 302, 307, 308, 399])(
    "denies redirect %i without following location",
    (status) => {
      failure(
        {
          ...response(),
          status,
          headers: { location: "https://private.invalid/secret" },
        },
        "REDIRECT_DENIED",
      );
    },
  );
  it.each([401, 403])("denies access status %i", (status) =>
    failure({ ...response(), status }, "ACCESS_DENIED"),
  );
  it.each([500, 502, 503, 599])("closes upstream status %i", (status) =>
    failure({ ...response(), status }, "UPSTREAM_UNAVAILABLE"),
  );
  it.each([201, 204, 400, 404])("rejects other status %i", (status) =>
    failure({ ...response(), status }, "INVALID_RESPONSE"),
  );
  it.each([
    [undefined, "2026-11-02T00:15:01.000Z"],
    ["120", "2026-11-02T00:02:01.000Z"],
    ["Mon, 02 Nov 2026 00:02:01 GMT", "2026-11-02T00:02:01.000Z"],
    ["86400", "2026-11-03T00:00:01.000Z"],
    ["0", "2026-11-02T00:00:01.000Z"],
  ])(
    "bounds rate limit without enabling retry (%s)",
    (retryAfter, cooldownUntil) => {
      expect(
        processResponse(fixturePlan(), {
          ...response(),
          status: 429,
          headers:
            retryAfter === undefined ? {} : { "retry-after": retryAfter },
        }),
      ).toEqual({
        ok: false,
        code: "RATE_LIMITED",
        retry: false,
        cooldownUntil,
      });
    },
  );
  it.each([
    "86401",
    "999999999",
    "-1",
    "1.5",
    "120, 240",
    "tomorrow",
    "2026-11-02",
    " 120",
    "01",
  ])("rejects ambiguous or excessive provider wait %s", (value) => {
    failure(
      { ...response(), status: 429, headers: { "retry-after": value } },
      "INVALID_HEADERS",
    );
  });
  it.each([
    { "set-cookie": "private" },
    { authorization: "private" },
    { "cache-control": "public" },
    { "Content-Type": "application/json" },
    { "content-type": ["application/json"] },
    { "retry-after": "1\r\nprivate" },
    { location: "x\r\nprivate" },
    { "content-type": "application/json; boundary=private" },
    { "content-type": "application/json;\ncharset=utf-8" },
    {},
    { "content-type": "text/json" },
    { "content-type": "application/json, application/json" },
  ])("rejects arbitrary or malformed headers %#", (headers) =>
    failure({ ...response(), headers }, "INVALID_HEADERS"),
  );
  it("accepts only JSON with optional UTF-8 charset", () => {
    expect(
      processResponse(fixturePlan(), {
        ...response(),
        headers: { "content-type": "application/json; charset=utf-8" },
      }).ok,
    ).toBe(true);
  });
  it.each(["TIMEOUT", "CANCELLED"])(
    "handles explicit synthetic %s",
    (state) => {
      failure(
        { kind: "SYNTHETIC", providerId: "OPEN_LIBRARY", receivedAt, state },
        state,
      );
    },
  );
  it.each([
    { kind: "LIVE" },
    { providerId: "MANGADEX" },
    { receivedAt: "bad" },
    { receivedAt: "2026-11-01T23:59:59Z" },
    { status: 200.5 },
    { extra: "PRIVATE_CANARY" },
    { body: "{}" },
    { body: [1, 2] },
  ])("rejects malformed response %#", (patch) =>
    failure({ ...response(), ...patch }, "INVALID_RESPONSE"),
  );
  it("enforces deadline and expiry using supplied time", () => {
    failure({ ...response(), receivedAt: "2026-11-02T00:00:05Z" }, "TIMEOUT");
    failure(
      { ...response(), receivedAt: "2026-11-03T00:00:00Z" },
      "PLAN_EXPIRED",
    );
  });
  it("validates the plan before response processing", () =>
    failure(response(), "INVALID_PLAN", {
      ...fixturePlan(),
      executable: true,
    }));
  it.each([
    new Uint8Array([0xc3, 0x28]),
    new TextEncoder().encode('{"records":['),
  ])("rejects invalid UTF-8/JSON %#", (body) => {
    failure({ ...response(), body }, "INVALID_RESPONSE");
  });
  it("checks the byte limit before decoding, allowing exactly 128 KiB", () => {
    failure(
      { ...response(), body: new Uint8Array(128 * 1024 + 1) },
      "PAYLOAD_TOO_LARGE",
    );
    const text = '{"records":[]}' + " ".repeat(128 * 1024 - 14);
    expect(
      processResponse(fixturePlan(), {
        ...response(),
        body: new TextEncoder().encode(text),
      }),
    ).toEqual({ ok: true, value: [] });
  });
  it("checks depth before JSON.parse and ignores quoted braces", () => {
    const parse = vi.spyOn(JSON, "parse");
    failure(
      {
        ...response(),
        body: new TextEncoder().encode("[".repeat(17) + "0" + "]".repeat(17)),
      },
      "INVALID_RESPONSE",
    );
    expect(parse).not.toHaveBeenCalled();
    const depth16 =
      '{"records":[{"key":"/works/synthetic-depth","ignored":' +
      "[".repeat(13) +
      "0" +
      "]".repeat(13) +
      "}]}";
    expect(
      processResponse(fixturePlan(), {
        ...response(),
        body: new TextEncoder().encode(depth16),
      }).ok,
    ).toBe(true);
    expect(
      processResponse(
        fixturePlan(),
        response([{ ...record(), title: 'Quoted { [ \\" title' }]),
      ).ok,
    ).toBe(true);
  });
  it.each([
    '{"records":[],"records":[]}',
    String.raw`{"records":[],"rec\u006frds":[]}`,
    '{"records":[{"key":"/works/synthetic-one","title":"First","title":"Last"}]}',
    String.raw`{"records":[{"key":"/works/synthetic-one","title":"First","ti\u0074le":"Last"}]}`,
    '{"records":[{"key":"/works/synthetic-one","key":"/works/synthetic-two"}]}',
    '{"records":[{"key":"/works/synthetic-one","ignored":{"nested":1,"nested":2}}]}',
  ])(
    "rejects duplicate decoded JSON members before full parsing %#",
    (text) => {
      const parse = vi.spyOn(JSON, "parse");
      failure(
        { ...response(), body: new TextEncoder().encode(text) },
        "INVALID_RESPONSE",
      );
      expect(parse.mock.calls.some(([input]) => input === text)).toBe(false);
    },
  );
  it.each([
    "\u0000",
    " \tTitle ",
    "\u001f",
    "\u007f",
    "\u0085",
    "\u202e",
    "\u2066",
    "\ud800",
    "\udfff",
  ])("rejects escaped unsafe metadata before trimming %#", (value) => {
    failure(response([{ ...record(), title: value }]), "INVALID_RESPONSE");
    failure(
      response([
        { ...record(), titleConflicts: [{ value, provenance: provenance() }] },
      ]),
      "INVALID_RESPONSE",
    );
  });
  it("preserves safe Unicode, escaped punctuation and independent member scopes", () => {
    const text = String.raw`{"records":[{"title":"  Caf\u00e9 \ud83d\udcd6 { \" }  ","key":"/works/synthetic-one","ignored":{"title":"Other"}},{"key":"/works/synthetic-two","title":"Second"}]}`;
    const result = processResponse(fixturePlan(), {
      ...response(),
      body: new TextEncoder().encode(text),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].title?.value).toBe('Café 📖 { " }');
  });
  it.each([{ records: [], next: "private" }, [], { records: {} }])(
    "rejects non-strict envelopes %#",
    (body) => {
      failure({ ...response(), body: bytes(body) }, "INVALID_RESPONSE");
    },
  );
  it("caps results at five and at the plan limit without truncation", () => {
    const records = Array.from({ length: 5 }, (_, i) => record(String(i)));
    expect(processResponse(fixturePlan(), response(records)).ok).toBe(true);
    failure(response([...records, record("six")]), "RESULT_LIMIT_EXCEEDED");
    failure(
      response(records.slice(0, 2)),
      "RESULT_LIMIT_EXCEEDED",
      fixturePlan(1),
    );
    expect(processResponse(fixturePlan(1), response()).ok).toBe(true);
  });
  it("rejects duplicate IDs rather than last-wins", () =>
    failure(
      response([record(), { ...record(), title: "Other" }]),
      "DUPLICATE_RECORD",
    ));
  it.each([{ key: "/works/OL123W" }, { ...record(), providerId: "MANGADEX" }])(
    "rejects official IDs/provider mismatches %#",
    (r) => failure(response([r]), "INVALID_RESPONSE"),
  );
  it("work lookup does not claim synthetic ID matches real requested ID", () => {
    const result = processResponse(fixturePlan(1, true), response());
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value[0].providerRecord?.sourceRecordId).toBe(
        "synthetic-one",
      );
  });
  it("does no I/O/logging and preserves ambiguous identity matches without merging", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Forbidden I/O");
    });
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const result = processResponse(fixturePlan(), response());
    if (!result.ok) throw new Error(result.code);
    const works: IdentityWork[] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ].map((id) => ({
      id,
      format: "UNKNOWN",
      titles: [{ title: "Synthetic tale" }],
      creators: [],
      identifiers: [],
      providerSourceIds: [],
    }));
    const before = JSON.stringify(works);
    const matches = identityMatch(result.value[0], works);
    expect(matches).toHaveLength(2);
    expect(
      matches.every(
        (m) => m.ambiguous && !m.autoPublish && m.humanReviewRequired,
      ),
    ).toBe(true);
    expect(JSON.stringify(works)).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
