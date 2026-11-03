import { describe, expect, it, vi } from "vitest";
import {
  SOURCE_RECORD_LIMITS,
  SourceRecordBatchSchema,
  SourceRecordIdentitySchema,
  SourceRecordSnapshotSchema,
  parseSourceRecordBatch,
  sourceRecordKey,
  sourceSnapshotReference,
  syntheticSourceRecordUrl,
  type SourceRecordIdentity,
  type SourceRecordSnapshot,
} from "../../apps/web/src/features/ingestion/source-record-contracts";
import { normalizeIngestionCandidate } from "../../apps/web/src/features/ingestion/pipeline";

const now = "2026-11-02T00:00:00Z";
const requestId = "11111111-1111-4111-8111-111111111111";
function identity(
  externalId = "synthetic-one",
  entityKind: SourceRecordIdentity["entityKind"] = "WORK",
  sourceInstance = "synthetic-library-a",
): SourceRecordIdentity {
  return { sourceInstance, entityKind, externalId };
}
function url(ref: SourceRecordIdentity) {
  const result = syntheticSourceRecordUrl(ref);
  if (!result.ok) throw new Error("Synthetic fixture identity invalid");
  return result.value;
}
function manual() {
  return {
    kind: "REQUEST_INPUT" as const,
    requestId,
    inputRevision: 1,
    observedAt: now,
    candidate: normalizeIngestionCandidate({
      origin: "REQUEST_INPUT",
      requestId,
      inputRevision: 1,
      details: {
        title: "SYNTHETIC Đường về",
        format: "UNKNOWN",
        alternativeTitles: [],
      },
    }),
  };
}
function synthetic(ref = identity()) {
  const provenance = {
    providerId: "OPEN_LIBRARY" as const,
    sourceRecordId: ref.externalId,
    sourceUrl: url(ref),
    retrievedAt: now,
  };
  return {
    kind: "SYNTHETIC_PROVIDER" as const,
    nonproduction: true as const,
    adapterFamily: "OPEN_LIBRARY" as const,
    identity: ref,
    recordRevision: 1,
    sourceVersion: "opaque-v1",
    observedAt: now,
    relatedRecords: [] as SourceRecordIdentity[],
    candidate: normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: {
        providerId: "OPEN_LIBRARY",
        sourceRecordId: ref.externalId,
        provenance: [provenance],
        title: { value: "SYNTHETIC tale", provenance: [provenance] },
        autoPublish: false,
        humanReviewRequired: true,
      },
    }),
  };
}
function batch(current: SourceRecordSnapshot = manual()) {
  return {
    kind: "OFFLINE_SOURCE_RECORD_BATCH" as const,
    now,
    records: [{ current }],
    canonicalWorks: [],
    catalogView: "PARTIAL" as const,
  };
}
function rejects(value: unknown) {
  expect(parseSourceRecordBatch(value)).toEqual({
    ok: false,
    code: "INVALID_INPUT",
  });
}

describe("offline source-record contracts", () => {
  it("keeps manual request input unverified and disconnected from providers", () => {
    const input = batch();
    const before = JSON.stringify(input);
    const parsed = parseSourceRecordBatch(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture");
    expect(parsed.value.records[0].current.candidate.provenance).toEqual([
      {
        sourceKind: "REQUEST_INPUT",
        requestId,
        inputRevision: 1,
        verified: false,
      },
    ]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      Object.isFrozen(parsed.value.records[0].current.candidate.provenance[0]),
    ).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(parsed.value).not.toBe(input);
  });
  it("keeps source-instance, entity, family and opaque identity distinct", () => {
    const refs = [
      identity("synthetic-same"),
      identity("synthetic-same", "EDITION"),
      identity("synthetic-same", "CREATOR"),
      identity("synthetic-same", "WORK", "synthetic-library-b"),
    ];
    const keys = refs.map((ref) => sourceRecordKey(ref));
    expect(keys.every((key) => key.ok)).toBe(true);
    expect(new Set(keys.map((key) => key.ok && key.value)).size).toBe(4);
    for (const ref of refs) {
      const key = sourceRecordKey(ref);
      expect(key.ok && JSON.parse(key.value)).toEqual([
        ref.sourceInstance,
        ref.entityKind,
        ref.externalId,
      ]);
    }
  });
  it("uses unambiguous tuple encoding and preserves opaque case, punctuation and Unicode", () => {
    const values = [
      "synthetic:a:b",
      'synthetic:["a","b"]',
      "synthetic-a/b",
      "synthetic-a\\b",
      "synthetic-Đường😀",
      "synthetic-CASE",
      "synthetic-case",
    ];
    const keys = values.map((id) => sourceRecordKey(identity(id)));
    expect(new Set(keys.map((k) => k.ok && k.value)).size).toBe(values.length);
    values.forEach((id, index) => {
      const key = keys[index];
      expect(key.ok && JSON.parse(key.value)[2]).toBe(id);
    });
  });
  it.each(["", " a", "a ", "a\n", "a\u202e", "a\ud800", "a".repeat(201)])(
    "rejects unsafe or oversized opaque identifier %#",
    (id) => {
      expect(sourceRecordKey(identity(id))).toEqual({
        ok: false,
        code: "INVALID_INPUT",
      });
    },
  );
  it.each(["WORK_UUID", "work", "ISBN", "", null])(
    "rejects unknown entity kind %#",
    (entityKind) => {
      expect(
        SourceRecordIdentitySchema.safeParse({ ...identity(), entityKind })
          .success,
      ).toBe(false);
    },
  );
  it("requires explicit synthetic nonproduction marking and fixture citations", () => {
    expect(SourceRecordSnapshotSchema.safeParse(synthetic()).success).toBe(
      true,
    );
    const noMarker = synthetic();
    Reflect.deleteProperty(noMarker, "nonproduction");
    expect(SourceRecordSnapshotSchema.safeParse(noMarker).success).toBe(false);
    const realUrl = synthetic();
    const p = realUrl.candidate.provenance[0];
    if (p.sourceKind === "PROVIDER")
      p.sourceUrl = "https://openlibrary.org/works/OL123W";
    expect(SourceRecordSnapshotSchema.safeParse(realUrl).success).toBe(false);
  });
  it("rejects adapter/principal disagreement and raw identifier trimming aliases", () => {
    const wrong = synthetic();
    wrong.candidate.providerRecord!.sourceRecordId = "synthetic-other";
    expect(SourceRecordSnapshotSchema.safeParse(wrong).success).toBe(false);
    const spaces = synthetic();
    const p = spaces.candidate.provenance[0];
    if (p.sourceKind === "PROVIDER") p.sourceRecordId = " synthetic-one ";
    expect(SourceRecordSnapshotSchema.safeParse(spaces).success).toBe(false);
    const family = synthetic();
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...family,
        adapterFamily: "MANGADEX",
      }).success,
    ).toBe(false);
  });
  it("accepts declared creator evidence without treating it as principal Work identity", () => {
    const s = synthetic();
    const creator = identity("synthetic-author", "CREATOR");
    s.relatedRecords.push(creator);
    s.candidate.creators = {
      value: [{ name: "SYNTHETIC author", role: "AUTHOR" }],
      provenance: [
        {
          sourceKind: "PROVIDER",
          providerId: "OPEN_LIBRARY",
          sourceRecordId: creator.externalId,
          sourceUrl: url(creator),
          retrievedAt: now,
        },
      ],
    };
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(true);
    expect(s.candidate.providerRecord!.sourceRecordId).toBe("synthetic-one");
    s.relatedRecords = [];
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it("cannot substitute a same-ID creator citation for the principal Work citation", () => {
    const s = synthetic();
    const creator = identity("synthetic-one", "CREATOR");
    s.relatedRecords.push(creator);
    for (const p of s.candidate.provenance)
      if (p.sourceKind === "PROVIDER") p.sourceUrl = url(creator);
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it("rejects cross-instance, duplicate and wrong entity related bindings", () => {
    const s = synthetic();
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...s,
        relatedRecords: [
          identity("synthetic-author", "CREATOR", "synthetic-other"),
        ],
      }).success,
    ).toBe(false);
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...s,
        relatedRecords: [s.identity],
      }).success,
    ).toBe(false);
    s.candidate.editions = {
      value: [{ sourceRecordId: "synthetic-edition" }],
      provenance: s.candidate.provenance,
    };
    s.relatedRecords = [identity("synthetic-edition", "CREATOR")];
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
    s.relatedRecords = [identity("synthetic-edition", "EDITION")];
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(true);
  });
  it.each([false, true])(
    "validates nested release-event provenance including conflicts (%s)",
    (conflict) => {
      const s = synthetic();
      const provenance = {
        providerId: "OPEN_LIBRARY" as const,
        sourceRecordId: s.identity.externalId,
        sourceUrl: url(s.identity),
        retrievedAt: now,
      };
      const events = [
        {
          sourceEventId: "synthetic-event",
          kind: "ANNOUNCEMENT" as const,
          provenance,
        },
      ];
      s.candidate.releaseEvents = {
        value: conflict ? [] : events,
        provenance: s.candidate.provenance,
        ...(conflict
          ? {
              conflictingEvidence: [
                { value: events, provenance: s.candidate.provenance[0] },
              ],
            }
          : {}),
      };
      expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(true);
      provenance.sourceRecordId = "synthetic-forged";
      expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
    },
  );
  it("validates conflicts even after an identifiers array", () => {
    const s = synthetic();
    s.candidate.identifiers = {
      value: [{ namespace: "custom", value: "synthetic-only" }],
      provenance: s.candidate.provenance,
    };
    s.candidate.title!.conflictingEvidence = [
      {
        value: "SYNTHETIC conflicting title",
        provenance: {
          sourceKind: "PROVIDER",
          providerId: "MANGADEX",
          sourceRecordId: s.identity.externalId,
          sourceUrl: url(s.identity),
          retrievedAt: now,
        },
      },
    ];
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it("rejects future evidence time and real or malformed cover URLs", () => {
    const s = synthetic();
    const p = s.candidate.provenance[0];
    if (p.sourceKind === "PROVIDER") p.retrievedAt = "2026-11-03T00:00:00Z";
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
    const cover = synthetic();
    cover.candidate.covers = {
      value: [
        {
          rights: "UNKNOWN",
          transferImages: false,
          sourceUrl: "https://art.example.org/image.jpg",
        },
      ],
      provenance: cover.candidate.provenance,
    };
    expect(SourceRecordSnapshotSchema.safeParse(cover).success).toBe(false);
  });
  it("binds every manual fact to the same request and revision", () => {
    const s = manual();
    expect(
      SourceRecordSnapshotSchema.safeParse({ ...s, inputRevision: 2 }).success,
    ).toBe(false);
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...s,
        requestId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...s,
        candidate: synthetic().candidate,
      }).success,
    ).toBe(false);
    expect(
      SourceRecordSnapshotSchema.safeParse({
        ...s,
        candidate: { ...s.candidate, notes: "SYNTHETIC_PRIVATE_CANARY" },
      }).success,
    ).toBe(false);
  });
  it.each([undefined, null, [], {}, "{}", 1, true, { kind: "LIVE" }])(
    "fails closed on missing or wrong batch shape %#",
    rejects,
  );
  it("rejects empty/over-limit collections and duplicate scoped keys", () => {
    rejects({ ...batch(), records: [] });
    const records = Array.from({ length: 10 }, (_, i) => ({
      current: synthetic(identity(`synthetic-${i}`)),
    }));
    expect(parseSourceRecordBatch({ ...batch(), records }).ok).toBe(true);
    rejects({
      ...batch(),
      records: [
        ...records,
        { current: synthetic(identity("synthetic-eleven")) },
      ],
    });
    expect(
      parseSourceRecordBatch({ ...batch(), records: [records[0], records[0]] }),
    ).toEqual({ ok: false, code: "DUPLICATE_RECORD_KEY" });
  });
  it("rejects duplicate canonical UUIDs without rewriting them", () => {
    const work = {
      id: requestId,
      format: "UNKNOWN",
      titles: [],
      creators: [],
      identifiers: [],
      providerSourceIds: [],
    };
    expect(
      parseSourceRecordBatch({
        ...batch(),
        canonicalWorks: [
          { work, revision: 1 },
          { work, revision: 2 },
        ],
      }),
    ).toEqual({ ok: false, code: "DUPLICATE_CANONICAL_WORK" });
  });
  it.each([
    "actorId",
    "role",
    "policy",
    "approved",
    "budget",
    "workId",
    "library",
    "ratings",
  ])('rejects smuggled field "%s"', (key) => {
    rejects({ ...batch(), [key]: "SYNTHETIC_PRIVATE_CANARY" });
  });
  it("rejects non-plain objects, invalid scalars, symbols, cycles and sparse arrays", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse: unknown[] = Array(2);
    const custom = Object.create({ inherited: true }) as object;
    const symbol = { [Symbol("synthetic")]: 1 };
    for (const value of [
      new Date(now),
      new Map(),
      new Set(),
      /x/,
      Object.create(null),
      custom,
      undefined,
      NaN,
      Infinity,
      BigInt(1),
      () => 1,
      symbol,
      cycle,
      sparse,
    ])
      rejects(value);
    const extras = [1];
    Object.defineProperty(extras, "extra", { value: 2, enumerable: true });
    rejects(extras);
    rejects(JSON.parse('{"__proto__":{"synthetic":true}}'));
  });
  it("rejects accessors and hidden properties without invoking getters", () => {
    const getter = vi.fn(() => "PRIVATE_SYNTHETIC");
    const input = batch();
    Object.defineProperty(input, "kind", { get: getter, enumerable: true });
    rejects(input);
    expect(getter).not.toHaveBeenCalled();
    const hidden = batch();
    Object.defineProperty(hidden, "extra", { value: true, enumerable: false });
    rejects(hidden);
  });
  it.each(["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"])(
    "fails closed on throwing reflection trap %s",
    (trap) => {
      const input = new Proxy(
        {},
        {
          [trap]: () => {
            throw new Error("SYNTHETIC_PRIVATE_CANARY");
          },
        },
      );
      rejects(input);
      expect(SourceRecordBatchSchema.safeParse(input).success).toBe(false);
      expect(sourceRecordKey(input).ok).toBe(false);
      expect(sourceSnapshotReference(input).ok).toBe(false);
    },
  );
  it("detaches descriptor-safe data before Zod can read proxy getters", () => {
    const getter = vi.fn(() => {
      throw new Error("SYNTHETIC_PRIVATE_CANARY");
    });
    const proxy = new Proxy(batch(), { get: getter });
    expect(parseSourceRecordBatch(proxy).ok).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });
  it("bounds depth and repeated shared data per occurrence", () => {
    let deep: unknown = 0;
    for (let i = 0; i < SOURCE_RECORD_LIMITS.depth + 1; i++) deep = [deep];
    rejects(deep);
    let shared: unknown = "SYNTHETIC";
    for (let i = 0; i < 15; i++) shared = [shared, shared];
    rejects(shared);
  });
  it("bounds UTF-8 aggregate input including keys and JSON structure", () => {
    const huge = { ["é".repeat(140000)]: true };
    rejects(huge);
    const s = synthetic();
    s.candidate.lookupTitles = Array.from({ length: 55 }, () =>
      "é".repeat(600),
    );
    rejects(batch(s));
    expect(SourceRecordSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it("returns detached, frozen reference data and strict timestamp failures", () => {
    const s = synthetic();
    const ref = sourceSnapshotReference(s);
    expect(ref.ok && Object.isFrozen(ref.value)).toBe(true);
    expect(ref.ok && ref.value.version).toBe("opaque-v1");
    rejects({ ...batch(), now: "tomorrow" });
    expect(
      SourceRecordSnapshotSchema.safeParse({ ...s, observedAt: "bad" }).success,
    ).toBe(false);
  });
});
