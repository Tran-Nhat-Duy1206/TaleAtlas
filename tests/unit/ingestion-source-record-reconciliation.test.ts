import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { reconcileSourceRecordBatch } from "../../apps/web/src/features/ingestion/source-record-reconciliation";
import {
  SOURCE_RECORD_LIMITS,
  parseSourceRecordBatch,
  sourceSnapshotReference,
  syntheticSourceRecordUrl,
  type SourceRecordSnapshot,
  type SourceRecordIdentity,
  type SourceRecordReference,
} from "../../apps/web/src/features/ingestion/source-record-contracts";
import {
  normalizeIngestionCandidate,
  NormalizedCandidateSchema,
  type IdentityWork,
  type NormalizedCandidate,
} from "../../apps/web/src/features/ingestion/pipeline";
import { normalizeRequestTitle } from "../../apps/web/src/features/ingestion/contracts";
import {
  PRODUCTION_PROVIDER_POLICIES,
  type ProviderId,
} from "../../apps/web/src/features/ingestion/providers";

const now = "2026-11-02T00:00:00Z";
const requestId = "11111111-1111-4111-8111-111111111111";
// Fabricated checksum-valid edition identifier, never a real bibliographic claim.
const syntheticIsbn = "9780000000002";
type ProviderSnapshot = Extract<
  SourceRecordSnapshot,
  { kind: "SYNTHETIC_PROVIDER" }
>;
type Entry = {
  current: SourceRecordSnapshot;
  priorSnapshot?: SourceRecordSnapshot;
  expectedPrior?: SourceRecordReference;
};
type View = { work: IdentityWork; revision: number; expectedRevision?: number };
function fixtureUrl(identity: SourceRecordIdentity) {
  const result = syntheticSourceRecordUrl(identity);
  if (!result.ok) throw new Error("Synthetic identity invalid");
  return result.value;
}
function provider(
  sourceInstance = "synthetic-supplier-a",
  externalId = "synthetic-one",
  adapterFamily: ProviderId = "OFFICIAL_FEED",
  entityKind: SourceRecordIdentity["entityKind"] = "WORK",
): ProviderSnapshot {
  const identity = { sourceInstance, entityKind, externalId };
  const provenance = {
    providerId: adapterFamily,
    sourceRecordId: externalId,
    sourceUrl: fixtureUrl(identity),
    retrievedAt: now,
  };
  return {
    kind: "SYNTHETIC_PROVIDER",
    nonproduction: true,
    adapterFamily,
    identity,
    recordRevision: 1,
    sourceVersion: "opaque-v1",
    observedAt: now,
    relatedRecords: [],
    rightsReviewReference: { reviewId: "synthetic-review", reviewRevision: 1 },
    rightsReview: {
      kind: "SYNTHETIC_REVIEW_REFERENCE",
      nonproduction: true,
      reviewId: "synthetic-review",
      reviewRevision: 1,
      state: "REVIEWED",
      identity: { ...identity },
      recordRevision: 1,
      sourceVersion: "opaque-v1",
      validFrom: now,
      expiresAt: "2026-11-02T01:00:00Z",
    },
    candidate: normalizeIngestionCandidate({
      origin: "PROVIDER",
      candidate: {
        providerId: adapterFamily,
        sourceRecordId: externalId,
        provenance: [provenance],
        title: { value: "SYNTHETIC tale", provenance: [provenance] },
        autoPublish: false,
        humanReviewRequired: true,
      },
    }),
  };
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
        title: "SYNTHETIC tale",
        format: "UNKNOWN",
        alternativeTitles: [],
      },
    }),
  };
}
function ref(snapshot: SourceRecordSnapshot): SourceRecordReference {
  const result = sourceSnapshotReference(snapshot);
  if (!result.ok) throw new Error("Synthetic snapshot invalid");
  return { ...result.value };
}
function view(index = 1, title = "SYNTHETIC tale"): View {
  return {
    revision: 4,
    work: {
      id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
      format: "UNKNOWN",
      titles: [{ title }],
      creators: [],
      identifiers: [],
      providerSourceIds: [],
    },
  };
}
function batch(
  current: SourceRecordSnapshot = manual(),
  canonicalWorks: View[] = [],
) {
  return {
    kind: "OFFLINE_SOURCE_RECORD_BATCH" as const,
    now,
    records: [{ current }] as Entry[],
    canonicalWorks,
    catalogView: "PARTIAL" as "PARTIAL" | "COMPLETE_SUPPLIED_VIEW",
  };
}
function run(input: unknown) {
  const result = reconcileSourceRecordBatch(input);
  if (!result.ok) throw new Error(`Synthetic case failed: ${result.code}`);
  return result.value;
}
function withPrior(current: SourceRecordSnapshot, prior: SourceRecordSnapshot) {
  const input = batch(current);
  input.records[0] = {
    current,
    priorSnapshot: prior,
    expectedPrior: ref(prior),
  };
  return input;
}
function observation(snapshot: SourceRecordSnapshot, timestamp: string) {
  snapshot.observedAt = timestamp;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const row = value as Record<string, unknown>;
    if ("retrievedAt" in row) row.retrievedAt = timestamp;
    Object.values(row).forEach(visit);
  };
  visit(snapshot.candidate);
}
function padCandidate(candidate: NormalizedCandidate, target: number) {
  const size = () =>
    new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
  candidate.lookupTitles = ["SYNTHETIC"];
  while (size() < target) {
    const remaining = target - size();
    const last = candidate.lookupTitles.length - 1;
    const room = 600 - candidate.lookupTitles[last].length;
    if (room > 0)
      candidate.lookupTitles[last] += "X".repeat(Math.min(room, remaining));
    else if (remaining >= 3) candidate.lookupTitles.push("");
    else {
      candidate.lookupTitles[last] = candidate.lookupTitles[last].slice(
        0,
        -(3 - remaining),
      );
      candidate.lookupTitles.push("");
    }
  }
  expect(size()).toBe(target);
}
function aliasHeavySnapshot(sourceInstance = "synthetic-supplier-a") {
  const s = provider(sourceInstance);
  s.candidate.lookupTitles = [];
  s.candidate.alternativeTitles = {
    value: Array.from({ length: 40 }, (_, i) => ({
      title: `SYNTHETIC-${String(i).padStart(3, "0")}-${"x".repeat(386)}`,
    })),
    provenance: s.candidate.provenance,
  };
  return s;
}
afterEach(() => vi.restoreAllMocks());

describe("deterministic offline source-record reconciliation", () => {
  it("is useful for manual requests while every production provider stays denied", () => {
    const before = JSON.stringify(PRODUCTION_PROVIDER_POLICIES);
    const result = run(batch(manual(), [view()]));
    expect(result.records[0].rights).toBe("MANUAL_UNVERIFIED");
    expect(result.records[0].matches[0].reasons[0].kind).toBe(
      "TITLE_SIMILARITY",
    );
    for (const policy of PRODUCTION_PROVIDER_POLICIES)
      expect(policy).toMatchObject({
        enabled: false,
        approvalStatus: "PENDING",
        metadataStorageAllowed: false,
        autoPublish: false,
      });
    expect(JSON.stringify(PRODUCTION_PROVIDER_POLICIES)).toBe(before);
  });
  it("never grants execution, persistence, publication, identity decisions or deletion", () => {
    const result = run(batch(provider()));
    expect(result).toMatchObject({
      kind: "OFFLINE_SOURCE_RECORD_ADVISORY",
      executable: false,
      globalCatalogExhaustive: false,
      deletionInference: false,
      publicationAllowed: false,
      persistenceAllowed: false,
      humanReviewRequired: true,
    });
    expect(result.records[0]).toMatchObject({
      rights: "SYNTHETIC_REVIEW_ONLY",
      publicationAllowed: false,
      persistenceAllowed: false,
      humanReviewRequired: true,
    });
  });
  it.each(["WORK", "EDITION", "CREATOR"] as const)(
    "separates entity kind %s from canonical Work identity",
    (kind) => {
      const s = provider(
        "synthetic-a",
        "synthetic-recycled",
        "OPEN_LIBRARY",
        kind,
      );
      const w = view();
      w.work.providerSourceIds = [
        { providerId: "OPEN_LIBRARY", sourceRecordId: "synthetic-recycled" },
      ];
      const result = run(batch(s, [w])).records[0];
      if (kind === "WORK")
        expect(
          result.matches[0].reasons.every((r) => r.kind === "TITLE_SIMILARITY"),
        ).toBe(true);
      else {
        expect(result.matches).toEqual([]);
        expect(result.issues).toContain("ENTITY_KIND_NOT_WORK");
      }
    },
  );
  it("isolates two supplier instances with the same family and external ID", () => {
    const input = batch();
    input.records = [
      { current: provider("synthetic-a") },
      { current: provider("synthetic-b") },
    ];
    const result = run(input);
    expect(result.records[0].reference.key).not.toBe(
      result.records[1].reference.key,
    );
    expect(
      result.records.every((r) =>
        r.issues.includes("FAMILY_ONLY_ID_COLLISION"),
      ),
    ).toBe(true);
    expect(result.factComparisons[0].identityDecision).toBe("NONE");
  });
  it("holds source-instance reuse across different adapter families", () => {
    const input = batch();
    input.records = [
      { current: provider("synthetic-same", "synthetic-one", "OPEN_LIBRARY") },
      { current: provider("synthetic-same", "synthetic-two", "MANGADEX") },
    ];
    input.canonicalWorks = [view()];
    const result = run(input);
    expect(
      result.records.every(
        (r) =>
          r.issues.includes("SOURCE_INSTANCE_COLLISION") &&
          r.matches.length === 0,
      ),
    ).toBe(true);
    expect(result.factComparisons).toEqual([]);
  });
  it.each(["openlibrary", "mangadex", "official_feed", "custom-supplier"])(
    "suppresses unsafe exact identifiers in namespace %s on both sides",
    (namespace) => {
      const s = provider();
      s.candidate.identifiers = {
        value: [{ namespace, value: "synthetic-recycled" }],
        provenance: s.candidate.provenance,
      };
      s.candidate.editions = {
        value: [{ identifiers: [{ namespace, value: "synthetic-edition" }] }],
        provenance: s.candidate.provenance,
      };
      const w = view(1, "SYNTHETIC unrelated");
      w.work.identifiers = [
        { namespace, value: "synthetic-recycled" },
        { namespace, value: "synthetic-edition" },
      ];
      w.work.providerSourceIds = [
        { providerId: "OFFICIAL_FEED", sourceRecordId: "synthetic-one" },
      ];
      expect(run(batch(s, [w])).records[0].matches).toEqual([]);
    },
  );
  it("retains checksum-valid ISBN only as ambiguous edition evidence", () => {
    const s = provider();
    s.candidate.identifiers = {
      value: [{ namespace: "ISBN-13", value: syntheticIsbn }],
      provenance: s.candidate.provenance,
    };
    const w = view(1, "SYNTHETIC unrelated");
    w.work.identifiers = [{ namespace: "isbn13", value: syntheticIsbn }];
    const match = run(batch(s, [w])).records[0].matches[0];
    expect(match).toMatchObject({
      workId: w.work.id,
      ambiguous: true,
      sourceExactMatch: false,
    });
    expect(match.reasons[0].kind).toBe("ISBN_EDITION_EVIDENCE");
    expect(match.conflicts).toContain(
      "ISBN identifies an edition, not a unique work",
    );
  });
  it("retains nested edition ISBN ambiguity but rejects invalid checksums", () => {
    const s = provider();
    s.candidate.editions = {
      value: [{ identifiers: [{ namespace: "ISBN13", value: syntheticIsbn }] }],
      provenance: s.candidate.provenance,
    };
    const w = view(1, "SYNTHETIC unrelated");
    w.work.identifiers = [{ namespace: "ISBN13", value: syntheticIsbn }];
    expect(run(batch(s, [w])).records[0].matches).toHaveLength(1);
    s.candidate.editions.value[0].identifiers![0].value = "9780000000003";
    w.work.identifiers[0].value = "9780000000003";
    expect(run(batch(s, [w])).records[0].matches).toEqual([]);
  });
  it("does not turn equal creator citations or names into exact Work identity", () => {
    const s = provider();
    const creator: SourceRecordIdentity = {
      ...s.identity,
      entityKind: "CREATOR",
      externalId: "synthetic-author",
    };
    s.relatedRecords.push(creator);
    s.candidate.creators = {
      value: [{ name: "SYNTHETIC author", role: "AUTHOR" }],
      provenance: [
        {
          sourceKind: "PROVIDER",
          providerId: s.adapterFamily,
          sourceRecordId: creator.externalId,
          sourceUrl: fixtureUrl(creator),
          retrievedAt: now,
        },
      ],
    };
    const w = view(1, "SYNTHETIC unrelated");
    w.work.creators = [{ name: "SYNTHETIC author", role: "AUTHOR" }];
    w.work.providerSourceIds = [
      { providerId: s.adapterFamily, sourceRecordId: creator.externalId },
    ];
    expect(run(batch(s, [w])).records[0].matches).toEqual([]);
  });
  it("rebuilds title assistance rather than trusting forged lookupTitles", () => {
    const s = provider();
    s.candidate.lookupTitles = ["synthetic unrelated"];
    expect(
      run(batch(s, [view(1, "SYNTHETIC unrelated")])).records[0].matches,
    ).toEqual([]);
    expect(run(batch(s, [view()])).records[0].matches).toHaveLength(1);
  });
  it("keeps original-title conflict and alternate-title assistance weak", () => {
    const s = provider();
    s.candidate.originalTitle = {
      value: "SYNTHETIC original",
      provenance: s.candidate.provenance,
      conflictingEvidence: [
        { value: "SYNTHETIC disputed", provenance: s.candidate.provenance[0] },
      ],
    };
    s.candidate.alternativeTitles = {
      value: [{ title: "SYNTHETIC alias" }],
      provenance: s.candidate.provenance,
    };
    for (const title of [
      "SYNTHETIC original",
      "SYNTHETIC disputed",
      "SYNTHETIC alias",
    ]) {
      const result = run(batch(s, [view(1, title)])).records[0].matches[0];
      expect(result.ambiguous).toBe(true);
      expect(result.reasons[0].kind).toBe("TITLE_SIMILARITY");
    }
  });
  it.each([200, 201, 300])(
    "handles NFKD title expansion at the 600-character index boundary (%i syllables)",
    (syllables) => {
      const s = provider();
      s.candidate.title!.value = "각".repeat(syllables);
      s.candidate.lookupTitles = [];
      const input = batch(s, [view(1, s.candidate.title!.value)]);
      input.catalogView = "COMPLETE_SUPPLIED_VIEW";
      expect(parseSourceRecordBatch(input).ok).toBe(true);
      const before = JSON.stringify(input);
      const result = run(input);
      const record = result.records[0];
      expect(normalizeRequestTitle(s.candidate.title!.value).length).toBe(
        syllables * 3,
      );
      if (syllables === 200) {
        expect(record.matches).toHaveLength(1);
        expect(record.issues).not.toContain("TITLE_INDEX_INCOMPLETE");
      } else {
        expect(record.matches).toEqual([]);
        expect(record.issues).toContain("TITLE_INDEX_INCOMPLETE");
        expect(record.comparisonIncomplete).toBe(true);
      }
      expect(result.globalCatalogExhaustive).toBe(false);
      expect(result.publicationAllowed).toBe(false);
      expect(JSON.stringify(input)).toBe(before);
      expect(run(input)).toEqual(result);
    },
  );
  it("defers an over-budget derived alias index without rejecting valid bounded facts", () => {
    const s = aliasHeavySnapshot();
    expect(NormalizedCandidateSchema.safeParse(s.candidate).success).toBe(true);
    const expanded = structuredClone(s.candidate);
    expanded.lookupTitles = [
      normalizeRequestTitle(s.candidate.title!.value),
      ...s.candidate.alternativeTitles!.value.map((t) =>
        normalizeRequestTitle(t.title),
      ),
    ];
    expect(
      new TextEncoder().encode(JSON.stringify(expanded)).byteLength,
    ).toBeGreaterThan(SOURCE_RECORD_LIMITS.candidateBytes);
    expect(NormalizedCandidateSchema.safeParse(expanded).success).toBe(false);
    const input = batch(s);
    input.catalogView = "COMPLETE_SUPPLIED_VIEW";
    const before = JSON.stringify(input);
    expect(parseSourceRecordBatch(input).ok).toBe(true);
    const result = run(input);
    expect(result.records[0]).toMatchObject({
      comparisonIncomplete: true,
      issues: expect.arrayContaining(["TITLE_INDEX_INCOMPLETE"]),
      publicationAllowed: false,
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(
      new TextEncoder().encode(JSON.stringify(result)).byteLength,
    ).toBeLessThanOrEqual(SOURCE_RECORD_LIMITS.outputBytes);
  });
  it("retains safe ISBN and full pair evidence when canonical title indexing is deferred", () => {
    const a = aliasHeavySnapshot("synthetic-a");
    const b = aliasHeavySnapshot("synthetic-b");
    a.candidate.identifiers = {
      value: [{ namespace: "ISBN", value: syntheticIsbn }],
      provenance: a.candidate.provenance,
    };
    a.candidate.format = { value: "NOVEL", provenance: a.candidate.provenance };
    b.candidate.format = { value: "MANGA", provenance: b.candidate.provenance };
    const w = view(1, "SYNTHETIC unrelated");
    w.work.identifiers = [{ namespace: "ISBN13", value: syntheticIsbn }];
    const input = batch(a, [w]);
    input.records.push({ current: b });
    const result = run(input);
    expect(result.records[0].issues).toContain("TITLE_INDEX_INCOMPLETE");
    expect(result.records[0].matches[0].reasons[0].kind).toBe(
      "ISBN_EDITION_EVIDENCE",
    );
    expect(result.records[0].matches[0].sourceExactMatch).toBe(false);
    expect(result.factComparisons).toHaveLength(1);
    expect(result.factComparisons[0].conflictingFields).toContain("format");
    expect(result.factComparisons[0].identityDecision).toBe("NONE");
  });
  it("preserves format and author conflict explanations without choosing truth", () => {
    const s = provider();
    s.candidate.format = { value: "NOVEL", provenance: s.candidate.provenance };
    s.candidate.creators = {
      value: [{ name: "SYNTHETIC A", role: "AUTHOR" }],
      provenance: s.candidate.provenance,
    };
    const w = view();
    w.work.format = "MANGA";
    w.work.creators = [{ name: "SYNTHETIC B", role: "AUTHOR" }];
    expect(run(batch(s, [w])).records[0].matches[0].conflicts).toEqual(
      expect.arrayContaining(["Format mismatch", "Author mismatch"]),
    );
  });
  it("preserves canonical UUID spelling and does not replace it with an external ID", () => {
    const w = view();
    w.work.id = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    expect(run(batch(provider(), [w])).records[0].matches[0].workId).toBe(
      w.work.id,
    );
  });
  it("returns no-match-in-bounded-view, never global absence or a create command", () => {
    const input = batch(manual(), []);
    input.catalogView = "COMPLETE_SUPPLIED_VIEW";
    const result = run(input);
    expect(result.globalCatalogExhaustive).toBe(false);
    expect(result.records[0].matches).toEqual([]);
    expect(result.publicationAllowed).toBe(false);
    expect("createWork" in result).toBe(false);
  });
  it("bounds multiple matching Works and explicitly marks display truncation", () => {
    const result = run(
      batch(
        provider(),
        Array.from({ length: 20 }, (_, i) => view(i + 1)),
      ),
    );
    expect(result.records[0].matches).toHaveLength(
      SOURCE_RECORD_LIMITS.matches,
    );
    expect(result.records[0].issues).toContain("MATCHES_TRUNCATED");
    expect(result.records[0].comparisonIncomplete).toBe(true);
    expect(result.records[0].matches.every((m) => m.ambiguous)).toBe(true);
  });
  it("bounds reasons and signals omitted long details", () => {
    const s = provider();
    const title = "SYNTHETIC " + "a".repeat(300);
    s.candidate.title!.value = title;
    const w = view(1, title);
    w.work.titles = Array.from({ length: 20 }, () => ({ title }));
    const record = run(batch(s, [w])).records[0];
    expect(record.matches[0].reasons).toHaveLength(
      SOURCE_RECORD_LIMITS.reasons,
    );
    expect(
      record.matches[0].reasons.every(
        (r) => r.detailOmitted && r.value === undefined,
      ),
    ).toBe(true);
    expect(record.issues).toContain("EXPLANATIONS_TRUNCATED");
  });
  it("does not use stale canonical revision views", () => {
    const w = view();
    w.expectedRevision = 3;
    const record = run(batch(manual(), [w])).records[0];
    expect(record.matches).toEqual([]);
    expect(record.issues).toContain("STALE_CANONICAL_VIEW");
    expect(record.comparisonIncomplete).toBe(true);
  });
  it.each([manual, provider])(
    "classifies identical replay for fixture origin %#",
    (fixture) => {
      const prior = fixture();
      const current = structuredClone(prior);
      expect(run(withPrior(current, prior)).records[0].comparison).toBe(
        "IDENTICAL_REPLAY",
      );
    },
  );
  it("ignores observation-only changes, derived lookupTitles and member order for replay", () => {
    const prior = provider();
    const current = structuredClone(prior);
    observation(prior, "2026-11-01T00:00:00Z");
    current.candidate.lookupTitles = ["synthetic forged derived field"];
    const p = current.candidate.provenance[0];
    if (p.sourceKind === "PROVIDER") p.sourceUpdatedAt = "2026-10-31T00:00:00Z";
    current.candidate = Object.fromEntries(
      Object.entries(current.candidate).reverse(),
    ) as NormalizedCandidate;
    expect(run(withPrior(current, prior)).records[0].comparison).toBe(
      "IDENTICAL_REPLAY",
    );
  });
  it("does not ignore date-looking factual values or significant array order", () => {
    const prior = provider();
    const current = structuredClone(prior);
    current.candidate.title!.value = "2026-11-01T00:00:00Z";
    expect(run(withPrior(current, prior)).records[0].comparison).toBe(
      "SAME_VERSION_CONTENT_CONFLICT",
    );
    prior.candidate.alternativeTitles = {
      value: [{ title: "SYNTHETIC A" }, { title: "SYNTHETIC B" }],
      provenance: prior.candidate.provenance,
    };
    current.candidate = structuredClone(prior.candidate);
    current.candidate.alternativeTitles!.value.reverse();
    expect(run(withPrior(current, prior)).records[0].comparison).toBe(
      "SAME_VERSION_CONTENT_CONFLICT",
    );
  });
  it.each(["v0", "v999", 'W/"etag"', "abcdef", "2020-01-01"])(
    "never orders opaque transition %s",
    (version) => {
      const prior = provider();
      const current = structuredClone(prior);
      current.sourceVersion = version;
      current.recordRevision = 2;
      expect(run(withPrior(current, prior)).records[0].comparison).toBe(
        "UNORDERED_VERSION_TRANSITION",
      );
    },
  );
  it("flags local revision reuse with changed version without choosing a winner", () => {
    const prior = provider();
    const current = structuredClone(prior);
    current.sourceVersion = "other-opaque";
    const result = run(withPrior(current, prior)).records[0];
    expect(result.comparison).toBe("UNORDERED_VERSION_TRANSITION");
    expect(result.issues).toContain("LOCAL_REVISION_REUSED");
  });
  it("requires explicit prior snapshot and reference", () => {
    const s = provider();
    const missingSnapshot = batch(s);
    missingSnapshot.records[0].expectedPrior = ref(s);
    expect(run(missingSnapshot).records[0].issues).toContain(
      "PRIOR_SNAPSHOT_MISSING",
    );
    const missingReference = batch(s);
    missingReference.records[0].priorSnapshot = structuredClone(s);
    expect(run(missingReference).records[0].issues).toContain(
      "PRIOR_REFERENCE_MISSING",
    );
    const stale = withPrior(s, structuredClone(s));
    stale.records[0].expectedPrior!.revision = 99;
    expect(run(stale).records[0]).toMatchObject({
      comparison: "UNVERIFIABLE_PRIOR",
      issues: expect.arrayContaining(["STALE_PRIOR_REFERENCE"]),
    });
  });
  it("does not compare unrelated prior sources or entity kinds", () => {
    const current = provider();
    const other = provider("synthetic-b");
    expect(run(withPrior(current, other)).records[0].issues).toContain(
      "PRIOR_SOURCE_MISMATCH",
    );
    const edition = provider(
      "synthetic-supplier-a",
      "synthetic-one",
      "OFFICIAL_FEED",
      "EDITION",
    );
    expect(run(withPrior(current, edition)).records[0].issues).toContain(
      "PRIOR_ENTITY_MISMATCH",
    );
  });
  it.each([
    "missing snapshot",
    "missing reference",
    "stale key",
    "stale revision",
    "stale version",
    "wrong source",
    "wrong entity",
    "future prior",
    "prior after current",
  ])("marks COMPLETE_SUPPLIED_VIEW incomplete for %s", (scenario) => {
    const current = provider();
    const prior = structuredClone(current);
    const input = withPrior(current, prior);
    input.catalogView = "COMPLETE_SUPPLIED_VIEW";
    input.canonicalWorks = [view()];
    const entry = input.records[0];
    if (scenario === "missing snapshot")
      Reflect.deleteProperty(entry, "priorSnapshot");
    if (scenario === "missing reference")
      Reflect.deleteProperty(entry, "expectedPrior");
    if (scenario === "stale key") entry.expectedPrior!.key += "!";
    if (scenario === "stale revision") entry.expectedPrior!.revision += 1;
    if (scenario === "stale version")
      entry.expectedPrior!.version = "different-opaque";
    if (scenario === "wrong source") {
      entry.priorSnapshot = provider("synthetic-other");
      entry.expectedPrior = ref(entry.priorSnapshot);
    }
    if (scenario === "wrong entity") {
      entry.priorSnapshot = provider(
        "synthetic-supplier-a",
        "synthetic-one",
        "OFFICIAL_FEED",
        "EDITION",
      );
      entry.expectedPrior = ref(entry.priorSnapshot);
    }
    if (scenario === "future prior") observation(prior, "2026-11-03T00:00:00Z");
    if (scenario === "prior after current")
      observation(current, "2026-11-01T00:00:00Z");
    const record = run(input).records[0];
    expect(record.comparison).toBe("UNVERIFIABLE_PRIOR");
    expect(record.comparisonIncomplete).toBe(true);
    if (scenario === "future prior")
      expect(record.issues).toContain("PRIOR_OBSERVATION_IN_FUTURE");
    if (scenario === "prior after current")
      expect(record.issues).toContain("PRIOR_OBSERVATION_AFTER_CURRENT");
    expect(record.persistenceAllowed).toBe(false);
    expect(record.publicationAllowed).toBe(false);
  });
  it("does not claim complete prior comparison when no history is supplied", () => {
    const input = batch(provider());
    input.catalogView = "COMPLETE_SUPPLIED_VIEW";
    expect(run(input).records[0]).toMatchObject({
      comparison: "NO_PRIOR_SNAPSHOT",
      comparisonIncomplete: true,
    });
  });
  it.each(["replay", "content conflict", "opaque transition"])(
    "distinguishes fully supplied %s from incomplete evidence",
    (scenario) => {
      const prior = provider();
      const current = structuredClone(prior);
      if (scenario === "content conflict")
        current.candidate.title!.value = "SYNTHETIC changed";
      if (scenario === "opaque transition")
        current.sourceVersion = "unordered-v0";
      const input = withPrior(current, prior);
      input.catalogView = "COMPLETE_SUPPLIED_VIEW";
      input.canonicalWorks = [view(1, "SYNTHETIC unrelated")];
      const result = run(input);
      expect(result.records[0].comparison).toBe(
        scenario === "replay"
          ? "IDENTICAL_REPLAY"
          : scenario === "content conflict"
            ? "SAME_VERSION_CONTENT_CONFLICT"
            : "UNORDERED_VERSION_TRANSITION",
      );
      expect(result.records[0].comparisonIncomplete).toBe(false);
      expect(result.records[0].matches).toEqual([]);
      expect(result.globalCatalogExhaustive).toBe(false);
      expect(result.publicationAllowed).toBe(false);
    },
  );
  it("does not infer deletions from omitted prior records or partial comparisons", () => {
    const result = run(batch(provider("synthetic-a", "synthetic-only-one")));
    expect(result.deletionInference).toBe(false);
    expect(result.records[0].comparison).toBe("NO_PRIOR_SNAPSHOT");
    expect(result.records[0].comparisonIncomplete).toBe(true);
  });
  it.each(["rightsReview", "rightsReviewReference"] as const)(
    "keeps missing %s review-only and nonauthoritative",
    (key) => {
      const s = provider();
      Reflect.deleteProperty(s, key);
      expect(run(batch(s)).records[0].rights).toBe("MISSING");
    },
  );
  it.each(["UNREVIEWED", "REJECTED"] as const)(
    "preserves review state %s without storage permission",
    (state) => {
      const s = provider();
      s.rightsReview!.state = state;
      expect(run(batch(s)).records[0]).toMatchObject({
        rights: state,
        persistenceAllowed: false,
        publicationAllowed: false,
      });
    },
  );
  it.each([
    "reviewId",
    "reviewRevision",
    "recordRevision",
    "sourceVersion",
    "identity",
  ] as const)("flags mismatched rights review %s", (field) => {
    const s = provider();
    if (field === "reviewId") s.rightsReview!.reviewId = "synthetic-wrong";
    if (field === "reviewRevision") s.rightsReview!.reviewRevision = 2;
    if (field === "recordRevision") s.rightsReview!.recordRevision = 2;
    if (field === "sourceVersion") s.rightsReview!.sourceVersion = "other";
    if (field === "identity") s.rightsReview!.identity.entityKind = "CREATOR";
    expect(run(batch(s)).records[0].rights).toBe("MISMATCH");
  });
  it.each([
    ["2026-11-02T01:00:00Z", "2026-11-02T02:00:00Z", "NOT_YET_VALID"],
    ["2026-11-01T00:00:00Z", now, "EXPIRED"],
    [now, now, "MISMATCH"],
    [now, "2026-11-01T00:00:00Z", "MISMATCH"],
    [now, "2026-11-02T00:00:01Z", "SYNTHETIC_REVIEW_ONLY"],
  ])(
    "evaluates explicit review interval %#",
    (validFrom, expiresAt, status) => {
      const s = provider();
      s.rightsReview!.validFrom = validFrom;
      s.rightsReview!.expiresAt = expiresAt;
      expect(run(batch(s)).records[0].rights).toBe(status);
    },
  );
  it("flags future observations and never consults the implicit clock", () => {
    const s = provider();
    observation(s, "2026-11-03T00:00:00Z");
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Unexpected implicit clock");
    });
    const result = run(batch(s, [view()])).records[0];
    expect(result.issues).toContain("OBSERVATION_IN_FUTURE");
    expect(result.matches).toEqual([]);
    expect(clock).not.toHaveBeenCalled();
  });
  it("preserves cross-source agreeing and conflicting fields without selecting a provider", () => {
    const a = provider("synthetic-a");
    const b = provider("synthetic-b");
    a.candidate.format = { value: "NOVEL", provenance: a.candidate.provenance };
    b.candidate.format = { value: "MANGA", provenance: b.candidate.provenance };
    const input = batch();
    input.records = [{ current: a }, { current: b }];
    const result = run(input).factComparisons[0];
    expect(result.agreeingFields).toContain("title");
    expect(result.conflictingFields).toContain("format");
    expect(result.identityDecision).toBe("NONE");
    expect(result.leftKey).not.toBe(result.rightKey);
  });
  it("keeps retained conflicting evidence even when primary values agree and no catalog is supplied", () => {
    const a = provider("synthetic-a");
    const b = provider("synthetic-b");
    a.candidate.title!.conflictingEvidence = [
      { value: "SYNTHETIC disputed", provenance: a.candidate.provenance[0] },
    ];
    const input = batch();
    input.records = [{ current: a }, { current: b }];
    const result = run(input);
    expect(result.records[0].conflictingFields).toContain("title");
    expect(result.factComparisons[0].agreeingFields).toContain("title");
    expect(result.factComparisons[0].conflictingFields).toContain("title");
    expect(result.factComparisons[0].identityDecision).toBe("NONE");
  });
  it("does not compare unrelated works or treat UNKNOWN as contradictory format", () => {
    const a = provider("synthetic-a");
    const b = provider("synthetic-b");
    b.candidate.title!.value = "SYNTHETIC unrelated";
    const input = batch();
    input.records = [{ current: a }, { current: b }];
    expect(run(input).factComparisons).toEqual([]);
    b.candidate.title!.value = a.candidate.title!.value;
    a.candidate.format = {
      value: "UNKNOWN",
      provenance: a.candidate.provenance,
    };
    b.candidate.format = { value: "MANGA", provenance: b.candidate.provenance };
    expect(run(input).factComparisons[0].conflictingFields).not.toContain(
      "format",
    );
  });
  it("enforces exact candidate bytes before reconciliation", () => {
    const s = provider();
    padCandidate(s.candidate, SOURCE_RECORD_LIMITS.candidateBytes);
    expect(parseSourceRecordBatch(batch(s)).ok).toBe(true);
    s.candidate.lookupTitles[s.candidate.lookupTitles.length - 1] += "X";
    expect(reconcileSourceRecordBatch(batch(s))).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
  it("accepts the exact aggregate UTF-8 ceiling and rejects one byte over", () => {
    const input = batch();
    input.records = Array.from({ length: 10 }, (_, i) => ({
      current: provider("synthetic-a", `synthetic-${i}`),
    }));
    for (const entry of input.records)
      padCandidate(entry.current.candidate, 24000);
    const size = () =>
      new TextEncoder().encode(JSON.stringify(input)).byteLength;
    for (const entry of input.records) {
      const remaining = SOURCE_RECORD_LIMITS.inputBytes - size();
      if (remaining <= 0) break;
      const csize = new TextEncoder().encode(
        JSON.stringify(entry.current.candidate),
      ).byteLength;
      padCandidate(
        entry.current.candidate,
        Math.min(SOURCE_RECORD_LIMITS.candidateBytes, csize + remaining),
      );
    }
    expect(size()).toBe(SOURCE_RECORD_LIMITS.inputBytes);
    const result = run(input);
    expect(result.factComparisons).toHaveLength(45);
    expect(
      new TextEncoder().encode(JSON.stringify(result)).byteLength,
    ).toBeLessThanOrEqual(SOURCE_RECORD_LIMITS.outputBytes);
    input.records[9].current.candidate.lookupTitles[0] += "X";
    expect(reconcileSourceRecordBatch(input)).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
  it("returns detached recursively frozen deterministic results and never mutates input", () => {
    const input = batch(provider(), [view()]);
    const before = JSON.stringify(input);
    const first = run(input);
    expect(run(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(first.records[0].matches[0].reasons[0])).toBe(true);
    expect(() =>
      Reflect.set(first.records[0], "publicationAllowed", true),
    ).not.toThrow();
    expect(first.records[0].publicationAllowed).toBe(false);
    input.canonicalWorks[0].work.titles[0].title = "SYNTHETIC changed later";
    expect(first.records[0].matches[0].reasons[0].value).toBe("synthetic tale");
  });
  it("does not call provider I/O, logging, timers or persistence hooks", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Forbidden network");
    });
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const timer = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    run(batch(provider(), [view()]));
    expect(fetch).not.toHaveBeenCalled();
    logs.forEach((log) => expect(log).not.toHaveBeenCalled());
    expect(timer).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });
  it("keeps the main-based runtime import closure pure and excludes unmerged C2 helpers", () => {
    const base = new URL("../../", import.meta.url);
    const runtime = [
      "source-record-contracts",
      "source-record-reconciliation",
      "pipeline",
      "providers",
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
      function visit(node: ts.Node) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const value = node.moduleSpecifier.text;
          expect(value).not.toMatch(
            /node:|server\/|library\/|reader-profile|lookup-|database\/(?:client|catalog|ingestion)$|catalog-schema/,
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
        if (ts.isCallExpression(node)) {
          expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
          if (ts.isIdentifier(node.expression))
            expect(node.expression.text).not.toMatch(
              /^(?:fetch|require|eval|setTimeout|setInterval)$/,
            );
        }
        if (ts.isPropertyAccessExpression(node))
          expect(node.getText(ast)).not.toMatch(
            /\bprocess\.env\b|\b(?:globalThis|window)\.fetch\b|\bDate\.now\b|\bconsole\.(?:log|info|warn|error)\b/,
          );
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  });
});
