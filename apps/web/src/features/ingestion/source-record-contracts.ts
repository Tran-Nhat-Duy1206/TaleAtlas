import { z } from "zod";
import { ProviderIdSchema } from "./providers";
import { IdentityWorkSchema, NormalizedCandidateSchema } from "./pipeline";

// Offline data only. Neither a snapshot nor a review reference is authority to
// fetch, retain, publish, or merge anything. No production provider is enabled.
export const SOURCE_RECORD_LIMITS = Object.freeze({
  records: 10,
  canonicalWorks: 20,
  candidateBytes: 32768,
  inputBytes: 262144,
  outputBytes: 262144,
  depth: 16,
  nodes: 20000,
  arrayItems: 2048,
  objectKeys: 128,
  relatedRecords: 20,
  matches: 5,
  reasons: 8,
  conflicts: 8,
  reasonCharacters: 256,
  pairComparisons: 45,
});
export type SourceRecordFailureCode =
  | "INVALID_INPUT"
  | "DUPLICATE_RECORD_KEY"
  | "DUPLICATE_CANONICAL_WORK"
  | "OUTPUT_LIMIT_EXCEEDED";
export type SourceRecordResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: SourceRecordFailureCode }>;
export function sourceRecordFailure(
  code: SourceRecordFailureCode,
): SourceRecordResult<never> {
  return Object.freeze({ ok: false, code });
}
export type DeepReadonly<T> = T extends readonly (infer V)[]
  ? readonly DeepReadonly<V>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// Copy data descriptors, not getters. Zod subsequently sees only our own copy.
// Bounds apply before schema parsing/stringification; repeated acyclic objects
// are allowed, cycles, sparse arrays, accessors and custom prototypes are not.
function copyPlainJson(input: unknown): { value: unknown } | undefined {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  const charge = (amount: number) => {
    bytes += amount;
    if (bytes > SOURCE_RECORD_LIMITS.inputBytes) throw new Error("BOUND");
  };
  const scalarString = (value: string) => {
    if (
      value.length > SOURCE_RECORD_LIMITS.inputBytes ||
      value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(value)
    )
      throw new Error("STRING");
    for (const char of value) {
      const point = char.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) throw new Error("UNICODE");
    }
    charge(encoder.encode(JSON.stringify(value)).byteLength);
    return value;
  };
  const visit = (value: unknown, depth: number): unknown => {
    if (
      ++nodes > SOURCE_RECORD_LIMITS.nodes ||
      depth > SOURCE_RECORD_LIMITS.depth
    )
      throw new Error("BOUND");
    if (value === null) {
      charge(4);
      return null;
    }
    if (typeof value === "string") return scalarString(value);
    if (typeof value === "boolean") {
      charge(value ? 4 : 5);
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      charge(String(value).length);
      return value;
    }
    if (typeof value !== "object" || ancestors.has(value))
      throw new Error("DATA");
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !==
      (array ? Array.prototype : Object.prototype)
    )
      throw new Error("PROTOTYPE");
    const keys = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    ancestors.add(value);
    let result: unknown;
    if (array) {
      const length: unknown = descriptors.length?.value;
      if (
        typeof length !== "number" ||
        length > SOURCE_RECORD_LIMITS.arrayItems ||
        keys.length !== length + 1
      )
        throw new Error("ARRAY");
      charge(2 + Math.max(0, length - 1));
      const copy: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
          throw new Error("DESCRIPTOR");
        copy.push(visit(descriptor.value, depth + 1));
      }
      result = copy;
    } else {
      if (keys.length > SOURCE_RECORD_LIMITS.objectKeys)
        throw new Error("OBJECT");
      charge(2 + Math.max(0, keys.length - 1));
      const copy: Record<string, unknown> = {};
      for (const key of keys) {
        if (
          typeof key !== "string" ||
          ["__proto__", "prototype", "constructor"].includes(key)
        )
          throw new Error("KEY");
        const descriptor = descriptors[key];
        if (!("value" in descriptor) || !descriptor.enumerable)
          throw new Error("DESCRIPTOR");
        scalarString(key);
        charge(1);
        copy[key] = visit(descriptor.value, depth + 1);
      }
      result = copy;
    }
    ancestors.delete(value);
    return result;
  };
  try {
    return { value: visit(input, 0) };
  } catch {
    return undefined;
  }
}
const plainJson = z.unknown().transform((input, ctx) => {
  const copy = copyPlainJson(input);
  if (!copy) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid bounded plain JSON data",
    });
    return z.NEVER;
  }
  return copy.value;
});
const opaque = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => s.trim() === s);
const revision = z.number().int().min(1).max(2147483647);
const time = z.iso.datetime({ offset: true });
const identity = z.strictObject({
  sourceInstance: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  entityKind: z.enum(["WORK", "EDITION", "CREATOR"]),
  externalId: opaque,
});
export type SourceRecordIdentity = z.infer<typeof identity>;
export const SourceRecordIdentitySchema = plainJson.pipe(identity);
function keyOf(ref: SourceRecordIdentity): string {
  return JSON.stringify([ref.sourceInstance, ref.entityKind, ref.externalId]);
}
export function sourceRecordKey(input: unknown): SourceRecordResult<string> {
  try {
    const parsed = SourceRecordIdentitySchema.safeParse(input);
    return parsed.success
      ? Object.freeze({ ok: true, value: keyOf(parsed.data) })
      : sourceRecordFailure("INVALID_INPUT");
  } catch {
    return sourceRecordFailure("INVALID_INPUT");
  }
}
// Fixture citation, never a provider URL or an instruction to fetch.
function fixtureUrl(ref: SourceRecordIdentity): string {
  return `https://fixtures.example.invalid/source-record/${encodeURIComponent(keyOf(ref))}`;
}
export function syntheticSourceRecordUrl(
  input: unknown,
): SourceRecordResult<string> {
  try {
    const parsed = SourceRecordIdentitySchema.safeParse(input);
    return parsed.success
      ? Object.freeze({ ok: true, value: fixtureUrl(parsed.data) })
      : sourceRecordFailure("INVALID_INPUT");
  } catch {
    return sourceRecordFailure("INVALID_INPUT");
  }
}
const review = z.strictObject({
  kind: z.literal("SYNTHETIC_REVIEW_REFERENCE"),
  nonproduction: z.literal(true),
  reviewId: opaque,
  reviewRevision: revision,
  state: z.enum(["UNREVIEWED", "REJECTED", "REVIEWED"]),
  identity,
  recordRevision: revision,
  sourceVersion: opaque,
  validFrom: time,
  expiresAt: time,
});
const manual = z.strictObject({
  kind: z.literal("REQUEST_INPUT"),
  requestId: z.uuid(),
  inputRevision: revision,
  observedAt: time,
  candidate: NormalizedCandidateSchema,
});
const provider = z.strictObject({
  kind: z.literal("SYNTHETIC_PROVIDER"),
  nonproduction: z.literal(true),
  adapterFamily: ProviderIdSchema,
  identity,
  recordRevision: revision,
  sourceVersion: opaque,
  observedAt: time,
  relatedRecords: z
    .array(identity)
    .max(SOURCE_RECORD_LIMITS.relatedRecords)
    .default([]),
  rightsReview: review.optional(),
  rightsReviewReference: z
    .strictObject({ reviewId: opaque, reviewRevision: revision })
    .optional(),
  candidate: NormalizedCandidateSchema,
});
const snapshot = z
  .discriminatedUnion("kind", [manual, provider])
  .superRefine((s, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Mismatched source evidence" });
    if (s.kind === "REQUEST_INPUT") {
      if (
        s.candidate.origin !== "REQUEST_INPUT" ||
        s.candidate.provenance.some(
          (p) =>
            p.sourceKind !== "REQUEST_INPUT" ||
            p.requestId !== s.requestId ||
            p.inputRevision !== s.inputRevision,
        )
      )
        invalid();
      return;
    }
    if (
      s.candidate.origin !== "PROVIDER" ||
      s.candidate.providerRecord?.providerId !== s.adapterFamily ||
      s.candidate.providerRecord.sourceRecordId !== s.identity.externalId ||
      !s.candidate.provenance.some(
        (p) =>
          p.sourceKind === "PROVIDER" &&
          p.providerId === s.adapterFamily &&
          p.sourceRecordId === s.identity.externalId &&
          p.sourceUrl === fixtureUrl(s.identity),
      )
    )
      invalid();
    const refs = [s.identity, ...s.relatedRecords];
    if (
      new Set(refs.map(keyOf)).size !== refs.length ||
      refs.some((r) => r.sourceInstance !== s.identity.sourceInstance)
    )
      invalid();
    const walk = (value: unknown) => {
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const row = value as Record<string, unknown>;
      // Both normalized fact evidence and nested release-event provenance.
      if ("retrievedAt" in row || "sourceKind" in row) {
        if (
          row.providerId !== s.adapterFamily ||
          (row.sourceKind !== undefined && row.sourceKind !== "PROVIDER") ||
          typeof row.retrievedAt !== "string" ||
          Date.parse(row.retrievedAt) > Date.parse(s.observedAt) ||
          !refs.some(
            (r) =>
              r.externalId === row.sourceRecordId &&
              fixtureUrl(r) === row.sourceUrl,
          )
        )
          invalid();
      }
      for (const child of Object.values(row)) walk(child);
    };
    walk(s.candidate);
    for (const edition of [
      ...(s.candidate.editions?.value ?? []),
      ...(s.candidate.editions?.conflictingEvidence?.flatMap((e) => e.value) ??
        []),
    ]) {
      if (
        edition.sourceRecordId !== undefined &&
        !refs.some(
          (r) =>
            r.entityKind === "EDITION" &&
            r.externalId === edition.sourceRecordId,
        )
      )
        invalid();
    }
    for (const event of [
      ...(s.candidate.releaseEvents?.value ?? []),
      ...(s.candidate.releaseEvents?.conflictingEvidence?.flatMap(
        (e) => e.value,
      ) ?? []),
    ]) {
      if (
        !refs.some(
          (r) =>
            r.entityKind !== "CREATOR" &&
            r.externalId === event.provenance.sourceRecordId &&
            fixtureUrl(r) === event.provenance.sourceUrl,
        )
      )
        invalid();
    }
    // Cover pointers are inert fixture-only data too, not image permission.
    for (const cover of [
      ...(s.candidate.covers?.value ?? []),
      ...(s.candidate.covers?.conflictingEvidence?.flatMap((e) => e.value) ??
        []),
    ]) {
      for (const url of [cover.sourceUrl, cover.rightsEvidenceUrl]) {
        if (
          url !== undefined &&
          !url.startsWith("https://fixtures.example.invalid/")
        )
          invalid();
      }
    }
  });
export type SourceRecordSnapshot = z.infer<typeof snapshot>;
export const SourceRecordSnapshotSchema = plainJson.pipe(snapshot);
const reference = z.strictObject({
  key: z.string().min(1).max(2000),
  revision,
  version: opaque,
});
export type SourceRecordReference = z.infer<typeof reference>;
function referenceOf(
  s: DeepReadonly<SourceRecordSnapshot>,
): SourceRecordReference {
  return s.kind === "REQUEST_INPUT"
    ? {
        key: JSON.stringify(["REQUEST_INPUT", s.requestId]),
        revision: s.inputRevision,
        version: String(s.inputRevision),
      }
    : {
        key: keyOf(s.identity),
        revision: s.recordRevision,
        version: s.sourceVersion,
      };
}
export function sourceSnapshotReference(
  input: unknown,
): SourceRecordResult<Readonly<SourceRecordReference>> {
  try {
    const parsed = SourceRecordSnapshotSchema.safeParse(input);
    return parsed.success
      ? Object.freeze({
          ok: true,
          value: Object.freeze(referenceOf(parsed.data)),
        })
      : sourceRecordFailure("INVALID_INPUT");
  } catch {
    return sourceRecordFailure("INVALID_INPUT");
  }
}
const batch = z.strictObject({
  kind: z.literal("OFFLINE_SOURCE_RECORD_BATCH"),
  now: time,
  records: z
    .array(
      z.strictObject({
        current: snapshot,
        priorSnapshot: snapshot.optional(),
        expectedPrior: reference.optional(),
      }),
    )
    .min(1)
    .max(SOURCE_RECORD_LIMITS.records),
  canonicalWorks: z
    .array(
      z.strictObject({
        work: IdentityWorkSchema,
        revision,
        expectedRevision: revision.optional(),
      }),
    )
    .max(SOURCE_RECORD_LIMITS.canonicalWorks)
    .default([]),
  catalogView: z.enum(["PARTIAL", "COMPLETE_SUPPLIED_VIEW"]).default("PARTIAL"),
});
export const SourceRecordBatchSchema = plainJson.pipe(batch);
export type SourceRecordBatch = DeepReadonly<z.infer<typeof batch>>;
export function parseSourceRecordBatch(
  input: unknown,
): SourceRecordResult<SourceRecordBatch> {
  try {
    const parsed = SourceRecordBatchSchema.safeParse(input);
    if (!parsed.success) return sourceRecordFailure("INVALID_INPUT");
    const b = parsed.data;
    const keys = b.records.map((r) => referenceOf(r.current).key);
    if (new Set(keys).size !== keys.length)
      return sourceRecordFailure("DUPLICATE_RECORD_KEY");
    const ids = b.canonicalWorks.map((w) => w.work.id.toLowerCase());
    if (new Set(ids).size !== ids.length)
      return sourceRecordFailure("DUPLICATE_CANONICAL_WORK");
    return Object.freeze({ ok: true, value: freeze(b) });
  } catch {
    return sourceRecordFailure("INVALID_INPUT");
  }
}
