import { ProviderPolicySchema } from "./providers";
import {
  LookupBudgetSchema,
  LookupReviewSchema,
  LookupTimeSchema,
  OfflineLookupPlanSchema,
  parseLookupInput,
  lookupFailure,
  type LookupInput,
  type LookupResult,
  type OfflineLookupPlan,
} from "./lookup-contracts";

function descriptor(intent: LookupInput) {
  return intent.operation === "TITLE_SEARCH"
    ? {
        origin: "https://openlibrary.org" as const,
        method: "GET" as const,
        path: "/search.json",
        parameters: {
          title: intent.title,
          fields: "key,title",
          limit: String(intent.resultLimit),
          page: "1",
        },
      }
    : {
        origin: "https://openlibrary.org" as const,
        method: "GET" as const,
        path: `/works/${intent.sourceRecordId}.json`,
        parameters: {},
      };
}
function capability(intent: LookupInput) {
  return intent.operation === "TITLE_SEARCH"
    ? ("SEARCH_WORKS" as const)
    : ("GET_WORK_DETAILS" as const);
}
function replay(
  plan: Pick<
    OfflineLookupPlan,
    "intent" | "reviewId" | "policyReviewedAt" | "validUntil"
  >,
) {
  const i = plan.intent;
  return JSON.stringify({
    domain: "TALEATLAS_OFFLINE_LOOKUP_V1",
    providerId: i.providerId,
    operation: i.operation,
    ...(i.operation === "TITLE_SEARCH"
      ? { title: i.title }
      : { sourceRecordId: i.sourceRecordId }),
    resultLimit: i.resultLimit,
    reviewId: plan.reviewId,
    policyReviewedAt: plan.policyReviewedAt,
    validUntil: plan.validUntil,
    fields: ["IDENTIFIER", "TITLE"],
  });
}

/** Strict structural consistency only, NOT approval/authentication for execution. */
export function validateOfflineLookupPlan(
  input: unknown,
): LookupResult<OfflineLookupPlan> {
  try {
    const p = OfflineLookupPlanSchema.safeParse(input);
    if (!p.success) return lookupFailure("INVALID_PLAN");
    const plan = p.data;
    const expected = descriptor(plan.intent);
    if (
      plan.intent.providerId !== plan.providerId ||
      plan.capability !== capability(plan.intent) ||
      plan.resultLimit !== plan.intent.resultLimit ||
      Date.parse(plan.requestedAt) >= Date.parse(plan.validUntil) ||
      plan.policyReviewedAt >
        new Date(plan.requestedAt).toISOString().slice(0, 10) ||
      plan.endpoint.origin !== expected.origin ||
      plan.endpoint.method !== expected.method ||
      plan.endpoint.path !== expected.path ||
      JSON.stringify(Object.entries(plan.endpoint.parameters).sort()) !==
        JSON.stringify(Object.entries(expected.parameters).sort()) ||
      plan.replayIntent !== replay(plan)
    )
      return lookupFailure("INVALID_PLAN");
    Object.freeze(plan.intent);
    Object.freeze(plan.endpoint.parameters);
    Object.freeze(plan.endpoint);
    Object.freeze(plan.fields);
    return { ok: true, value: Object.freeze(plan) };
  } catch {
    return lookupFailure("INVALID_PLAN");
  }
}

/**
 * Pure planning over explicit, caller-supplied snapshots. Even a positive result
 * is INERT. Snapshots are not verified authority, a licence, quota reservation,
 * request delivery, or execution-side idempotency. No adapters are exposed.
 */
export function planOfflineLookup(
  input: unknown,
  policyInput: unknown,
  reviewInput: unknown,
  budgetInput: unknown,
  nowInput: unknown,
): LookupResult<OfflineLookupPlan> {
  try {
    const intent = parseLookupInput(input);
    if (!intent.ok) return intent;
    const policy = ProviderPolicySchema.safeParse(policyInput);
    if (!policy.success) return lookupFailure("INVALID_POLICY");
    const p = policy.data;
    if (!p.enabled) return lookupFailure("PROVIDER_DISABLED");
    if (
      p.providerId !== intent.value.providerId ||
      p.providerId !== "OPEN_LIBRARY"
    )
      return lookupFailure("UNSUPPORTED_PROVIDER");
    if (
      p.reviewState !== "REVIEWED" ||
      p.approvalStatus !== "APPROVED" ||
      !p.reviewedAt ||
      !p.intendedUseReview
    )
      return lookupFailure("APPROVAL_REQUIRED");
    const now = LookupTimeSchema.safeParse(nowInput);
    if (!now.success) return lookupFailure("INVALID_INPUT");
    const review = LookupReviewSchema.safeParse(reviewInput);
    if (!review.success) return lookupFailure("RIGHTS_UNRESOLVED");
    const r = review.data;
    if (
      r.providerId !== p.providerId ||
      !r.evidenceUrls.every((u) => p.documentationUrls.includes(u))
    )
      return lookupFailure("RIGHTS_UNRESOLVED");
    const time = Date.parse(now.data);
    if (
      Date.parse(r.reviewedAt) > time ||
      Date.parse(r.reviewedAt) >= Date.parse(r.expiresAt) ||
      Date.parse(r.expiresAt) <= time ||
      p.reviewedAt > new Date(now.data).toISOString().slice(0, 10)
    )
      return lookupFailure("APPROVAL_EXPIRED");
    if (r.reviewedAt.slice(0, 10) !== p.reviewedAt)
      return lookupFailure("RIGHTS_UNRESOLVED");
    const cap = capability(intent.value);
    if (!p.capabilities.includes(cap))
      return lookupFailure("CAPABILITY_DENIED");
    if (!p.metadataStorageAllowed) return lookupFailure("RIGHTS_UNRESOLVED");
    const budget = LookupBudgetSchema.safeParse(budgetInput);
    if (
      !budget.success ||
      !p.rateLimit ||
      p.rateIntervalMs === null ||
      p.rateMaxRequests === null
    )
      return lookupFailure("BUDGET_REQUIRED");
    const b = budget.data;
    if (Date.parse(b.expiresAt) <= time)
      return lookupFailure("BUDGET_REQUIRED");
    if (
      !b.remainingDailyRequests ||
      !b.remainingUserActions ||
      !b.concurrencyAvailable
    )
      return lookupFailure("BUDGET_EXHAUSTED");
    const core = {
      kind: "OFFLINE_LOOKUP_PLAN" as const,
      executable: false as const,
      transport: "NOT_IMPLEMENTED" as const,
      providerId: "OPEN_LIBRARY" as const,
      intent: intent.value,
      capability: cap,
      endpoint: descriptor(intent.value),
      requestedAt: now.data,
      validUntil: new Date(
        Math.min(Date.parse(r.expiresAt), Date.parse(b.expiresAt)),
      ).toISOString(),
      reviewId: r.reviewId,
      policyReviewedAt: p.reviewedAt,
      fields: ["IDENTIFIER", "TITLE"] as ["IDENTIFIER", "TITLE"],
      resultLimit: intent.value.resultLimit,
      deadlineMs: Math.min(p.timeoutMs, 5000),
      persistence: false as const,
      autoPublish: false as const,
      humanReviewRequired: true as const,
    };
    return validateOfflineLookupPlan({ ...core, replayIntent: replay(core) });
  } catch {
    return lookupFailure("INVALID_INPUT");
  }
}
