import { z } from "zod";
import {
  LOOKUP_LIMITS,
  LookupMetadataTextSchema,
  LookupTimeSchema,
  lookupFailure,
  type LookupResult,
} from "./lookup-contracts";
import { validateOfflineLookupPlan } from "./lookup-plan";
import { ProvenanceSchema } from "./providers";
import {
  decodeOfflineOpenLibraryRecord,
  normalizeOfflineProviderRecord,
} from "./provider-records";
import type { NormalizedCandidate } from "./pipeline";

const common = {
  kind: z.literal("SYNTHETIC"),
  providerId: z.literal("OPEN_LIBRARY"),
  receivedAt: LookupTimeSchema,
};
const responseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...common,
    state: z.literal("COMPLETED"),
    status: z.number().int().min(100).max(599),
    headers: z.unknown(),
    body: z.instanceof(Uint8Array),
  }),
  z.strictObject({ ...common, state: z.literal("TIMEOUT") }),
  z.strictObject({ ...common, state: z.literal("CANCELLED") }),
]);
const headersSchema = z.strictObject({
  "content-type": z.string().min(1).max(100).optional(),
  "retry-after": z.string().min(1).max(100).optional(),
  location: z
    .string()
    .min(1)
    .max(2048)
    .regex(/^[^\u0000-\u0020\u007f]+$/)
    .optional(),
});
const syntheticId = /^synthetic-[A-Za-z0-9_-]{1,190}$/;
const fixtureUrl = (id: string) =>
  `https://fixtures.example.invalid/open_library/${id}`;
const conflictSchema = z.strictObject({
  value: LookupMetadataTextSchema,
  provenance: ProvenanceSchema.refine(
    (p) =>
      p.providerId === "OPEN_LIBRARY" &&
      syntheticId.test(p.sourceRecordId) &&
      p.sourceUrl === fixtureUrl(p.sourceRecordId) &&
      p.identifiers === undefined,
  ),
});
const recordSchema = z.object({
  key: z.string().regex(/^\/works\/synthetic-[A-Za-z0-9_-]{1,190}$/),
  title: LookupMetadataTextSchema.optional(),
  titleConflicts: z.array(conflictSchema).max(10).optional(),
  providerId: z.literal("OPEN_LIBRARY").optional(),
});

// Preflight containers and duplicate decoded member names BEFORE full JSON.parse.
// Only individual quoted keys are parsed here; the byte cap already bounds them.
function boundedDepth(text: string): boolean {
  const stack: { kind: string; keys: Set<string>; wantKey: boolean }[] = [];
  let quoted = false,
    escaped = false,
    start = 0,
    key = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i],
      parent = stack[stack.length - 1];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        quoted = false;
        if (key) {
          const name: string = JSON.parse(text.slice(start, i + 1));
          if (parent.keys.has(name)) return false;
          parent.keys.add(name);
          parent.wantKey = false;
        }
      }
    } else if (char === '"') {
      quoted = true;
      start = i;
      key = parent?.kind === "{" && parent.wantKey;
    } else if (char === "{" || char === "[") {
      stack.push({
        kind: char,
        keys: new Set<string>(),
        wantKey: char === "{",
      });
      if (stack.length > LOOKUP_LIMITS.jsonDepth) return false;
    } else if (char === "}" || char === "]") {
      if (!parent || parent.kind !== (char === "}" ? "{" : "[")) return false;
      stack.pop();
    } else if (char === "," && parent?.kind === "{") parent.wantKey = true;
  }
  return stack.length === 0 && !quoted;
}
function cooldown(
  value: string | undefined,
  received: number,
): string | undefined {
  if (value === undefined)
    return new Date(received + 15 * 60_000).toISOString();
  let wait: number;
  if (/^(0|[1-9][0-9]{0,8})$/.test(value)) wait = Number(value) * 1000;
  else {
    const parsed = Date.parse(value);
    // Only unambiguous IMF-fixdate, not Date.parse's permissive date grammar.
    if (!Number.isFinite(parsed) || new Date(parsed).toUTCString() !== value)
      return undefined;
    wait = Math.max(0, parsed - received);
  }
  // Never truncate a provider wait into an earlier retry time.
  return wait <= 86_400_000
    ? new Date(received + wait).toISOString()
    : undefined;
}
function freezeTree(value: unknown): void {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
}

/** Caller-supplied synthetic fixtures only; markers/plan consistency do NOT prove
 * provider identity, rights, delivery or authority. No transport or persistence. */
export function processSyntheticLookupResponse(
  planInput: unknown,
  responseInput: unknown,
): LookupResult<readonly NormalizedCandidate[]> {
  const validated = validateOfflineLookupPlan(planInput);
  if (!validated.ok) return validated;
  try {
    const parsed = responseSchema.safeParse(responseInput);
    if (!parsed.success) return lookupFailure("INVALID_RESPONSE");
    const response = parsed.data,
      plan = validated.value;
    if (response.providerId !== plan.providerId)
      return lookupFailure("INVALID_RESPONSE");
    const received = Date.parse(response.receivedAt),
      requested = Date.parse(plan.requestedAt);
    if (received < requested) return lookupFailure("INVALID_RESPONSE");
    if (received >= Date.parse(plan.validUntil))
      return lookupFailure("PLAN_EXPIRED");
    if (response.state === "CANCELLED") return lookupFailure("CANCELLED");
    if (response.state === "TIMEOUT" || received - requested >= plan.deadlineMs)
      return lookupFailure("TIMEOUT");
    if (response.body.byteLength > LOOKUP_LIMITS.bodyBytes)
      return lookupFailure("PAYLOAD_TOO_LARGE");
    const headers = headersSchema.safeParse(response.headers);
    if (!headers.success) return lookupFailure("INVALID_HEADERS");
    const h = headers.data;
    if (
      h["content-type"] !== undefined &&
      !/^application\/json(?:; ?charset=utf-8)?$/i.test(h["content-type"])
    )
      return lookupFailure("INVALID_HEADERS");
    if (
      h["retry-after"] !== undefined &&
      cooldown(h["retry-after"], received) === undefined
    )
      return lookupFailure("INVALID_HEADERS");
    if (response.status >= 300 && response.status < 400)
      return lookupFailure("REDIRECT_DENIED");
    if (h.location !== undefined) return lookupFailure("INVALID_HEADERS");
    if (response.status === 401 || response.status === 403)
      return lookupFailure("ACCESS_DENIED");
    if (response.status === 429)
      return lookupFailure(
        "RATE_LIMITED",
        cooldown(h["retry-after"], received),
      );
    if (response.status >= 500) return lookupFailure("UPSTREAM_UNAVAILABLE");
    if (response.status !== 200) return lookupFailure("INVALID_RESPONSE");
    if (
      !/^application\/json(?:; ?charset=utf-8)?$/i.test(h["content-type"] ?? "")
    )
      return lookupFailure("INVALID_HEADERS");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      response.body,
    );
    if (!boundedDepth(text)) return lookupFailure("INVALID_RESPONSE");
    const envelope = z
      .strictObject({ records: z.array(z.unknown()) })
      .safeParse(JSON.parse(text));
    if (!envelope.success) return lookupFailure("INVALID_RESPONSE");
    if (
      envelope.data.records.length >
      Math.min(plan.resultLimit, LOOKUP_LIMITS.results)
    )
      return lookupFailure("RESULT_LIMIT_EXCEEDED");
    const seen = new Set<string>();
    const candidates: NormalizedCandidate[] = [];
    for (const raw of envelope.data.records) {
      const record = recordSchema.parse(raw);
      if (seen.has(record.key)) return lookupFailure("DUPLICATE_RECORD");
      seen.add(record.key);
      // Explicit projection BEFORE decoding: no creative/private/ISBN/format data.
      const projected = {
        key: record.key,
        ...(record.title !== undefined ? { title: record.title } : {}),
        ...(record.titleConflicts !== undefined
          ? { titleConflicts: record.titleConflicts }
          : {}),
      };
      candidates.push(
        normalizeOfflineProviderRecord(
          decodeOfflineOpenLibraryRecord(projected, {
            retrievedAt: response.receivedAt,
          }),
        ),
      );
    }
    freezeTree(candidates);
    return Object.freeze({ ok: true, value: candidates });
  } catch {
    return lookupFailure("INVALID_RESPONSE");
  }
}
