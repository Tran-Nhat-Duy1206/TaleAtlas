import { z } from "zod";
import {
  ProviderIdSchema,
  ProviderLookupSchema,
  ProviderSearchSchema,
} from "./providers";

// Offline data only. None of these records is authority, a licence or a reservation.
export const LOOKUP_LIMITS = Object.freeze({
  queryCharacters: 200,
  results: 5,
  bodyBytes: 128 * 1024,
  jsonDepth: 16,
  candidateBytes: 32 * 1024,
  dailyRequests: 10,
  userDailyActions: 5,
  deadlineMs: 5000,
});
export const LOOKUP_FAILURE_CODES = [
  "INVALID_INPUT",
  "INVALID_POLICY",
  "PROVIDER_DISABLED",
  "UNSUPPORTED_PROVIDER",
  "APPROVAL_REQUIRED",
  "APPROVAL_EXPIRED",
  "CAPABILITY_DENIED",
  "RIGHTS_UNRESOLVED",
  "BUDGET_REQUIRED",
  "BUDGET_EXHAUSTED",
  "INVALID_PLAN",
  "PLAN_EXPIRED",
  "INVALID_RESPONSE",
  "INVALID_HEADERS",
  "PAYLOAD_TOO_LARGE",
  "RESULT_LIMIT_EXCEEDED",
  "REDIRECT_DENIED",
  "ACCESS_DENIED",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "CANCELLED",
  "DUPLICATE_RECORD",
] as const;
export type LookupFailureCode = (typeof LOOKUP_FAILURE_CODES)[number];
export type LookupFailure = Readonly<{
  ok: false;
  code: LookupFailureCode;
  retry: false;
  cooldownUntil?: string;
}>;
export type LookupResult<T> = Readonly<{ ok: true; value: T }> | LookupFailure;
export function lookupFailure(
  code: LookupFailureCode,
  cooldownUntil?: string,
): LookupFailure {
  return Object.freeze({
    ok: false,
    code,
    retry: false,
    ...(cooldownUntil ? { cooldownUntil } : {}),
  });
}

// Deliberately conservative literal subset: unsupported punctuation is rejected,
// never rewritten into a provider DSL. URL encoding alone is not DSL escaping.
const literalTitle = ProviderSearchSchema.shape.query.refine(
  (s) =>
    s.length <= LOOKUP_LIMITS.queryCharacters &&
    /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’.,]*$/u.test(s) &&
    !/\b(?:AND|OR|NOT|TO)\b/.test(s) &&
    !/(?:\bwww\.|\b[\p{L}\p{N}-]+\.[a-z]{2,}\b|(?:\d{1,3}\.){3}\d{1,3}|\blocalhost\b)/iu.test(
      s,
    ),
  "Unsupported literal title",
);
// Validate before the existing schema trims input: controls must not disappear.
const rawTitle = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (s) => !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(s),
  )
  .pipe(literalTitle);
const workIdentifier = z
  .string()
  .regex(/^OL[1-9][0-9]{0,11}W$/)
  .pipe(ProviderLookupSchema.shape.sourceRecordId);
export const LookupInputSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    providerId: ProviderIdSchema,
    operation: z.literal("TITLE_SEARCH"),
    title: rawTitle,
    resultLimit: z.number().int().min(1).max(5).default(5),
  }),
  z.strictObject({
    providerId: z.literal("OPEN_LIBRARY"),
    operation: z.literal("WORK_LOOKUP"),
    sourceRecordId: workIdentifier,
    resultLimit: z.literal(1).default(1),
  }),
]);
export type LookupInput = z.infer<typeof LookupInputSchema>;
export function parseLookupInput(input: unknown): LookupResult<LookupInput> {
  try {
    const parsed = LookupInputSchema.safeParse(input);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : lookupFailure("INVALID_INPUT");
  } catch {
    return lookupFailure("INVALID_INPUT");
  }
}

// Validate before trim, including Unicode scalars represented by JSON escapes.
export const LookupMetadataTextSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((s) => {
    if (/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(s))
      return false;
    for (const c of s) {
      const point = c.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) return false;
    }
    return true;
  })
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(500));

export const LookupTimeSchema = z.iso.datetime({ offset: true });
const evidence = z
  .string()
  .max(2048)
  .url()
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password && !u.port;
    } catch {
      return false;
    }
  });
export const LookupReviewSchema = z.strictObject({
  providerId: ProviderIdSchema,
  reviewId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  approval: z.literal("APPROVED"),
  purpose: z.literal("HUMAN_REQUESTED_LOOKUP"),
  reviewedAt: LookupTimeSchema,
  expiresAt: LookupTimeSchema,
  evidenceUrls: z.array(evidence).min(1).max(5),
  fields: z
    .array(z.enum(["IDENTIFIER", "TITLE"]))
    .length(2)
    .refine((a) => new Set(a).size === 2),
  retention: z.literal("VOLATILE_ONLY"),
});
export const LookupBudgetSchema = z.strictObject({
  approved: z.literal(true),
  expiresAt: LookupTimeSchema,
  requestsPerAction: z.literal(1),
  remainingDailyRequests: z.number().int().min(0).max(10),
  remainingUserActions: z.number().int().min(0).max(5),
  concurrencyAvailable: z.boolean(),
});

// A descriptor cannot be sent or invoked. Future execution requires its own
// current server authority, policy, quota reservation and transport validation.
export const OfflineLookupPlanSchema = z.strictObject({
  kind: z.literal("OFFLINE_LOOKUP_PLAN"),
  executable: z.literal(false),
  transport: z.literal("NOT_IMPLEMENTED"),
  providerId: z.literal("OPEN_LIBRARY"),
  intent: LookupInputSchema,
  capability: z.enum(["SEARCH_WORKS", "GET_WORK_DETAILS"]),
  endpoint: z.strictObject({
    origin: z.literal("https://openlibrary.org"),
    method: z.literal("GET"),
    path: z.string().max(100),
    parameters: z
      .record(z.string().max(20), z.string().max(200))
      .refine((v) => Object.keys(v).length <= 4),
  }),
  requestedAt: LookupTimeSchema,
  validUntil: LookupTimeSchema,
  reviewId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  policyReviewedAt: z.iso.date(),
  fields: z.tuple([z.literal("IDENTIFIER"), z.literal("TITLE")]),
  resultLimit: z.number().int().min(1).max(5),
  deadlineMs: z.number().int().min(100).max(5000),
  replayIntent: z.string().max(2048),
  persistence: z.literal(false),
  autoPublish: z.literal(false),
  humanReviewRequired: z.literal(true),
});
export type OfflineLookupPlan = z.infer<typeof OfflineLookupPlanSchema>;
