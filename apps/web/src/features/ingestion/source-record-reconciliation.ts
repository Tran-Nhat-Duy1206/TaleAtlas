import { normalizeRequestTitle } from "./contracts";
import {
  identityMatch,
  normalizeIdentityIdentifier,
  NormalizedCandidateSchema,
  IdentityWorkSchema,
  type NormalizedCandidate,
} from "./pipeline";
import {
  SOURCE_RECORD_LIMITS,
  parseSourceRecordBatch,
  sourceRecordFailure,
  sourceSnapshotReference,
  type DeepReadonly,
  type SourceRecordBatch,
  type SourceRecordSnapshot,
  type SourceRecordResult,
  type SourceRecordReference,
} from "./source-record-contracts";

type Snapshot = DeepReadonly<SourceRecordSnapshot>;
export type SourceRecordComparison =
  | "NO_PRIOR_SNAPSHOT"
  | "UNVERIFIABLE_PRIOR"
  | "IDENTICAL_REPLAY"
  | "SAME_VERSION_CONTENT_CONFLICT"
  | "UNORDERED_VERSION_TRANSITION";
export type SourceReviewStatus =
  | "MANUAL_UNVERIFIED"
  | "MISSING"
  | "MISMATCH"
  | "UNREVIEWED"
  | "REJECTED"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "SYNTHETIC_REVIEW_ONLY";
export type SourceRecordIssue =
  | "PRIOR_SNAPSHOT_MISSING"
  | "PRIOR_REFERENCE_MISSING"
  | "PRIOR_SOURCE_MISMATCH"
  | "PRIOR_ENTITY_MISMATCH"
  | "STALE_PRIOR_REFERENCE"
  | "LOCAL_REVISION_REUSED"
  | "OBSERVATION_IN_FUTURE"
  | "PRIOR_OBSERVATION_IN_FUTURE"
  | "PRIOR_OBSERVATION_AFTER_CURRENT"
  | "TITLE_INDEX_INCOMPLETE"
  | "SOURCE_INSTANCE_COLLISION"
  | "FAMILY_ONLY_ID_COLLISION"
  | "ENTITY_KIND_NOT_WORK"
  | "STALE_CANONICAL_VIEW"
  | "UNSCOPED_IDENTITIES_SUPPRESSED"
  | "MATCHES_TRUNCATED"
  | "EXPLANATIONS_TRUNCATED";
export type SourceAdvisoryMatch = {
  workId: string;
  workRevision: number;
  reasons: {
    kind: "ISBN_EDITION_EVIDENCE" | "TITLE_SIMILARITY";
    value?: string;
    detailOmitted: boolean;
  }[];
  conflicts: string[];
  ambiguous: true;
  sourceExactMatch: false;
  humanReviewRequired: true;
};
export type SourceRecordAdvisory = {
  reference: SourceRecordReference;
  comparison: SourceRecordComparison;
  rights: SourceReviewStatus;
  issues: SourceRecordIssue[];
  matches: SourceAdvisoryMatch[];
  conflictingFields: FactField[];
  comparisonIncomplete: boolean;
  publicationAllowed: false;
  persistenceAllowed: false;
  humanReviewRequired: true;
};
const factFields = [
  "title",
  "originalTitle",
  "format",
  "alternativeTitles",
  "creators",
  "identifiers",
  "editions",
  "covers",
  "releaseEvents",
  "originalLanguage",
  "publicationLanguage",
  "publicationYear",
  "description",
] as const;
type FactField = (typeof factFields)[number];
export type SourceFactComparison = {
  leftKey: string;
  rightKey: string;
  basis: "SHARED_ADVISORY_EVIDENCE";
  agreeingFields: FactField[];
  conflictingFields: FactField[];
  identityDecision: "NONE";
};
export type SourceRecordReconciliation = DeepReadonly<{
  kind: "OFFLINE_SOURCE_RECORD_ADVISORY";
  executable: false;
  globalCatalogExhaustive: false;
  deletionInference: false;
  publicationAllowed: false;
  persistenceAllowed: false;
  humanReviewRequired: true;
  records: SourceRecordAdvisory[];
  factComparisons: SourceFactComparison[];
}>;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
// Stable object-member order, significant array order. Remove observation times
// ONLY from schema-validated provenance objects, and root derived lookupTitles.
// A timestamp-looking title/identifier/value remains significant factual data.
function stable(value: unknown, candidateRoot = false): string {
  if (Array.isArray(value)) return `[${value.map((v) => stable(v)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const provenance =
      "retrievedAt" in row && "providerId" in row && "sourceRecordId" in row;
    return `{${Object.keys(row)
      .sort()
      .filter(
        (key) =>
          !(candidateRoot && key === "lookupTitles") &&
          !(provenance && (key === "retrievedAt" || key === "sourceUpdatedAt")),
      )
      .map((key) => `${JSON.stringify(key)}:${stable(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function referenceOf(snapshot: Snapshot): Readonly<SourceRecordReference> {
  const result = sourceSnapshotReference(snapshot);
  if (!result.ok) throw new Error("INVALID_SNAPSHOT");
  return result.value;
}
function sameReference(
  a: SourceRecordReference,
  b: DeepReadonly<SourceRecordReference>,
): boolean {
  return (
    a.key === b.key && a.revision === b.revision && a.version === b.version
  );
}
function rightsStatus(s: Snapshot, now: number): SourceReviewStatus {
  if (s.kind === "REQUEST_INPUT") return "MANUAL_UNVERIFIED";
  const r = s.rightsReview;
  const ref = s.rightsReviewReference;
  if (!r || !ref) return "MISSING";
  const record = referenceOf(s);
  if (
    r.reviewId !== ref.reviewId ||
    r.reviewRevision !== ref.reviewRevision ||
    r.identity.sourceInstance !== s.identity.sourceInstance ||
    r.identity.entityKind !== s.identity.entityKind ||
    r.identity.externalId !== s.identity.externalId ||
    r.recordRevision !== record.revision ||
    r.sourceVersion !== record.version ||
    Date.parse(r.validFrom) >= Date.parse(r.expiresAt)
  )
    return "MISMATCH";
  if (r.state !== "REVIEWED") return r.state;
  if (now < Date.parse(r.validFrom)) return "NOT_YET_VALID";
  if (now >= Date.parse(r.expiresAt)) return "EXPIRED";
  return "SYNTHETIC_REVIEW_ONLY";
}
function isWork(s: Snapshot): boolean {
  return s.kind === "REQUEST_INPUT" || s.identity.entityKind === "WORK";
}
function isbn(identifier: {
  readonly namespace: string;
  readonly value: string;
}) {
  // The existing helper passes OTHER namespaces through. It is not an allowlist.
  if (!/^isbn(?:[-_ ]?(?:10|13))?$/i.test(identifier.namespace)) return null;
  return normalizeIdentityIdentifier(identifier);
}
function lookupTitles(candidate: DeepReadonly<NormalizedCandidate>): string[] {
  const text = [
    candidate.title?.value,
    candidate.originalTitle?.value,
    ...(candidate.alternativeTitles?.value.map((t) => t.title) ?? []),
    ...(candidate.title?.conflictingEvidence?.map((t) => t.value) ?? []),
    ...(candidate.originalTitle?.conflictingEvidence?.map((t) => t.value) ??
      []),
    ...(candidate.alternativeTitles?.conflictingEvidence?.flatMap((f) =>
      f.value.map((t) => t.title),
    ) ?? []),
  ];
  return [
    ...new Set(
      text
        .filter((s): s is string => s !== undefined)
        .map(normalizeRequestTitle)
        .filter(Boolean),
    ),
  ];
}
function candidateProjection(s: Snapshot) {
  const candidate = NormalizedCandidateSchema.parse(s.candidate);
  // Filter, but preserve lexical ISBN data: the existing matcher normalizes it.
  // Expanding an accepted namespace here could itself exceed the byte ceiling.
  if (candidate.identifiers)
    candidate.identifiers.value = candidate.identifiers.value.filter(
      (i) => isbn(i) !== null,
    );
  if (candidate.editions)
    candidate.editions.value = candidate.editions.value.map((e) => ({
      ...e,
      ...(e.identifiers
        ? { identifiers: e.identifiers.filter((i) => isbn(i) !== null) }
        : {}),
    }));
  // Rebuild only from facts, never trust a caller-populated derived index.
  // NFKD and duplicating aliases into an index can exceed the original schema.
  // All-or-defer: do not truncate evidence or increase any accepted ceiling.
  // Full title evidence remains available for bounded pair comparisons below.
  const titleEvidence = lookupTitles(candidate);
  candidate.lookupTitles = titleEvidence;
  const titleIndexIncomplete =
    !NormalizedCandidateSchema.safeParse(candidate).success;
  if (titleIndexIncomplete) candidate.lookupTitles = [];
  return { candidate, titleEvidence, titleIndexIncomplete };
}
function recordComparison(
  entry: SourceRecordBatch["records"][number],
  issues: Set<SourceRecordIssue>,
  now: number,
): SourceRecordComparison {
  const { current, priorSnapshot: prior, expectedPrior: expected } = entry;
  if (!prior) {
    if (expected) {
      issues.add("PRIOR_SNAPSHOT_MISSING");
      return "UNVERIFIABLE_PRIOR";
    }
    return "NO_PRIOR_SNAPSHOT";
  }
  if (Date.parse(prior.observedAt) > now) {
    issues.add("PRIOR_OBSERVATION_IN_FUTURE");
    return "UNVERIFIABLE_PRIOR";
  }
  if (Date.parse(prior.observedAt) > Date.parse(current.observedAt)) {
    // Validate the declared prior relationship, not ordering of source versions.
    issues.add("PRIOR_OBSERVATION_AFTER_CURRENT");
    return "UNVERIFIABLE_PRIOR";
  }
  if (!expected) {
    issues.add("PRIOR_REFERENCE_MISSING");
    return "UNVERIFIABLE_PRIOR";
  }
  const previous = referenceOf(prior);
  const currentRef = referenceOf(current);
  if (previous.key !== currentRef.key || prior.kind !== current.kind) {
    issues.add("PRIOR_SOURCE_MISMATCH");
    if (
      prior.kind === "SYNTHETIC_PROVIDER" &&
      current.kind === "SYNTHETIC_PROVIDER" &&
      prior.identity.entityKind !== current.identity.entityKind
    )
      issues.add("PRIOR_ENTITY_MISMATCH");
    return "UNVERIFIABLE_PRIOR";
  }
  if (!sameReference(previous, expected)) {
    issues.add("STALE_PRIOR_REFERENCE");
    return "UNVERIFIABLE_PRIOR";
  }
  if (currentRef.version !== previous.version) {
    if (currentRef.revision === previous.revision)
      issues.add("LOCAL_REVISION_REUSED");
    return "UNORDERED_VERSION_TRANSITION";
  }
  return stable(current.candidate, true) === stable(prior.candidate, true)
    ? "IDENTICAL_REPLAY"
    : "SAME_VERSION_CONTENT_CONFLICT";
}
function sharedEvidence(
  a: NormalizedCandidate,
  b: NormalizedCandidate,
  am: readonly string[],
  bm: readonly string[],
  at: readonly string[],
  bt: readonly string[],
): boolean {
  if (am.some((id) => bm.includes(id)) || at.some((t) => bt.includes(t)))
    return true;
  const ids = (c: NormalizedCandidate) =>
    [
      ...(c.identifiers?.value ?? []),
      ...(c.editions?.value.flatMap((e) => e.identifiers ?? []) ?? []),
    ].flatMap((i) => {
      const n = isbn(i);
      return n ? [JSON.stringify([n.namespace, n.value])] : [];
    });
  const right = ids(b);
  return ids(a).some((id) => right.includes(id));
}

/** Deterministic offline explanations, NEVER execution, licensing or identity authority. */
export function reconcileSourceRecordBatch(
  input: unknown,
): SourceRecordResult<SourceRecordReconciliation> {
  try {
    const parsed = parseSourceRecordBatch(input);
    if (!parsed.ok) return parsed;
    const batch = parsed.value;
    const now = Date.parse(batch.now);
    const families = new Map<string, Set<string>>();
    for (const entry of batch.records) {
      for (const s of [entry.current, entry.priorSnapshot]) {
        if (s?.kind !== "SYNTHETIC_PROVIDER") continue;
        const set =
          families.get(s.identity.sourceInstance) ?? new Set<string>();
        set.add(s.adapterFamily);
        families.set(s.identity.sourceInstance, set);
      }
    }
    const staleViews = batch.canonicalWorks.some(
      (w) =>
        w.expectedRevision !== undefined && w.expectedRevision !== w.revision,
    );
    const views = batch.canonicalWorks
      .filter(
        (w) =>
          w.expectedRevision === undefined || w.expectedRevision === w.revision,
      )
      .map((v) => {
        const work = IdentityWorkSchema.parse(v.work);
        work.providerSourceIds = []; // Family+ID cannot establish source-instance identity.
        work.identifiers = work.identifiers.filter((i) => isbn(i) !== null);
        return work;
      });
    const projectionStates = batch.records.map((r) =>
      candidateProjection(r.current),
    );
    const projections = projectionStates.map((p) => p.candidate);
    const allMatchIds: string[][] = [];
    const records: SourceRecordAdvisory[] = batch.records.map(
      (entry, index) => {
        const s = entry.current;
        const issues = new Set<SourceRecordIssue>();
        const comparison = recordComparison(entry, issues, now);
        if (projectionStates[index].titleIndexIncomplete)
          issues.add("TITLE_INDEX_INCOMPLETE");
        if (Date.parse(s.observedAt) > now) issues.add("OBSERVATION_IN_FUTURE");
        if (
          entry.priorSnapshot &&
          Date.parse(entry.priorSnapshot.observedAt) > now
        )
          issues.add("PRIOR_OBSERVATION_IN_FUTURE");
        if (staleViews) issues.add("STALE_CANONICAL_VIEW");
        if (!isWork(s)) issues.add("ENTITY_KIND_NOT_WORK");
        if (s.kind === "SYNTHETIC_PROVIDER") {
          if ((families.get(s.identity.sourceInstance)?.size ?? 0) > 1)
            issues.add("SOURCE_INSTANCE_COLLISION");
          if (
            batch.records.some(
              ({ current: other }) =>
                other.kind === "SYNTHETIC_PROVIDER" &&
                other.adapterFamily === s.adapterFamily &&
                other.identity.externalId === s.identity.externalId &&
                other.identity.sourceInstance !== s.identity.sourceInstance,
            )
          )
            issues.add("FAMILY_ONLY_ID_COLLISION");
        }
        // Always disclose that exact provider/local namespace identity is deliberately
        // unavailable in this slice. Canonical Work UUIDs are returned verbatim.
        issues.add("UNSCOPED_IDENTITIES_SUPPRESSED");
        const raw =
          isWork(s) &&
          !issues.has("SOURCE_INSTANCE_COLLISION") &&
          !issues.has("OBSERVATION_IN_FUTURE")
            ? identityMatch(projections[index], views)
            : [];
        allMatchIds.push(raw.map((m) => m.workId));
        if (raw.length > SOURCE_RECORD_LIMITS.matches)
          issues.add("MATCHES_TRUNCATED");
        const matches: SourceAdvisoryMatch[] = raw
          .slice(0, SOURCE_RECORD_LIMITS.matches)
          .map((match) => {
            const safeReasons = match.reasons.flatMap((r) => {
              if (r.kind === "EXACT_PROVIDER_RECORD") return [];
              const kind =
                r.kind === "EXACT_IDENTIFIER"
                  ? ("ISBN_EDITION_EVIDENCE" as const)
                  : ("TITLE_SIMILARITY" as const);
              const detailOmitted =
                r.value.length > SOURCE_RECORD_LIMITS.reasonCharacters;
              if (detailOmitted) issues.add("EXPLANATIONS_TRUNCATED");
              return [
                {
                  kind,
                  ...(detailOmitted ? {} : { value: r.value }),
                  detailOmitted,
                },
              ];
            });
            if (
              safeReasons.length > SOURCE_RECORD_LIMITS.reasons ||
              match.conflicts.length > SOURCE_RECORD_LIMITS.conflicts
            )
              issues.add("EXPLANATIONS_TRUNCATED");
            return {
              workId: match.workId,
              workRevision: batch.canonicalWorks.find(
                (w) => w.work.id === match.workId,
              )!.revision,
              reasons: safeReasons.slice(0, SOURCE_RECORD_LIMITS.reasons),
              conflicts: match.conflicts.slice(
                0,
                SOURCE_RECORD_LIMITS.conflicts,
              ),
              ambiguous: true,
              sourceExactMatch: false,
              humanReviewRequired: true,
            };
          });
        return {
          reference: referenceOf(s),
          comparison,
          rights: rightsStatus(s, now),
          issues: [...issues],
          matches,
          conflictingFields: factFields.filter(
            (field) =>
              (s.candidate[field]?.conflictingEvidence?.length ?? 0) > 0,
          ),
          comparisonIncomplete:
            comparison === "NO_PRIOR_SNAPSHOT" ||
            comparison === "UNVERIFIABLE_PRIOR" ||
            batch.catalogView === "PARTIAL" ||
            staleViews ||
            !isWork(s) ||
            issues.has("SOURCE_INSTANCE_COLLISION") ||
            issues.has("OBSERVATION_IN_FUTURE") ||
            issues.has("PRIOR_OBSERVATION_IN_FUTURE") ||
            issues.has("PRIOR_OBSERVATION_AFTER_CURRENT") ||
            issues.has("TITLE_INDEX_INCOMPLETE") ||
            issues.has("MATCHES_TRUNCATED") ||
            issues.has("EXPLANATIONS_TRUNCATED"),
          publicationAllowed: false,
          persistenceAllowed: false,
          humanReviewRequired: true,
        };
      },
    );
    const factComparisons: SourceFactComparison[] = [];
    for (let left = 0; left < records.length; left++) {
      for (let right = left + 1; right < records.length; right++) {
        const a = batch.records[left].current;
        const b = batch.records[right].current;
        if (
          !isWork(a) ||
          !isWork(b) ||
          records[left].issues.includes("SOURCE_INSTANCE_COLLISION") ||
          records[right].issues.includes("SOURCE_INSTANCE_COLLISION") ||
          records[left].issues.includes("OBSERVATION_IN_FUTURE") ||
          records[right].issues.includes("OBSERVATION_IN_FUTURE") ||
          !sharedEvidence(
            projections[left],
            projections[right],
            allMatchIds[left],
            allMatchIds[right],
            projectionStates[left].titleEvidence,
            projectionStates[right].titleEvidence,
          )
        )
          continue;
        const agreeingFields: FactField[] = [];
        const conflictingFields: FactField[] = [];
        for (const field of factFields) {
          const av = a.candidate[field]?.value;
          const bv = b.candidate[field]?.value;
          if (av === undefined || bv === undefined) continue;
          if (
            !(field === "format" && (av === "UNKNOWN" || bv === "UNKNOWN")) &&
            stable(av) === stable(bv)
          )
            agreeingFields.push(field);
          const reported = [
            av,
            bv,
            ...(a.candidate[field]?.conflictingEvidence?.map((e) => e.value) ??
              []),
            ...(b.candidate[field]?.conflictingEvidence?.map((e) => e.value) ??
              []),
          ].filter((value) => !(field === "format" && value === "UNKNOWN"));
          if (new Set(reported.map((value) => stable(value))).size > 1)
            conflictingFields.push(field);
        }
        factComparisons.push({
          leftKey: records[left].reference.key,
          rightKey: records[right].reference.key,
          basis: "SHARED_ADVISORY_EVIDENCE",
          agreeingFields,
          conflictingFields,
          identityDecision: "NONE",
        });
      }
    }
    const result = {
      kind: "OFFLINE_SOURCE_RECORD_ADVISORY" as const,
      executable: false as const,
      globalCatalogExhaustive: false as const,
      deletionInference: false as const,
      publicationAllowed: false as const,
      persistenceAllowed: false as const,
      humanReviewRequired: true as const,
      records,
      factComparisons,
    };
    if (
      factComparisons.length > SOURCE_RECORD_LIMITS.pairComparisons ||
      new TextEncoder().encode(JSON.stringify(result)).byteLength >
        SOURCE_RECORD_LIMITS.outputBytes
    )
      return sourceRecordFailure("OUTPUT_LIMIT_EXCEEDED");
    return Object.freeze({ ok: true, value: freeze(result) });
  } catch {
    return sourceRecordFailure("INVALID_INPUT");
  }
}
