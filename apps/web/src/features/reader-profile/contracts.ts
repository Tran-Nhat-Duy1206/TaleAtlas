import { z } from "zod";

export type ReservedHandlePolicy = {
  readonly reservedHandles: readonly string[];
  readonly reservedPrefixes: readonly string[];
};

/** Descriptor inspection for ordinary JSON-like data, not a security boundary for proxies. */
function isPlainData(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): boolean {
  if (depth > 12) return false;
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value !== "object" || ancestors.has(value)) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    array
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) return false;
  for (const key of keys) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return false;
    if (array && key === "length") continue;
    if (!descriptor.enumerable) return false;
    if (
      array &&
      (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    )
      return false;
    if (!isPlainData(descriptor.value, ancestors, depth + 1)) return false;
  }
  ancestors.delete(value);
  return true;
}

export const readerProfilePlainDataSchema: z.ZodType<unknown> = z
  .unknown()
  .superRefine((value, context) => {
    if (!isPlainData(value))
      context.addIssue({
        code: "custom",
        message: "Plain data required",
        fatal: true,
      });
  });
const guarded = <T extends z.ZodType>(schema: T) =>
  readerProfilePlainDataSchema.pipe(schema);

/** Auth account identifiers are opaque SQL TEXT, not profile UUIDs. */
export const readerProfileAccountIdSchema = z.string().min(1);

export function boundedReaderProfileText(config: {
  minUnits: number;
  maxUnits: number;
  maxBytes: number;
  multiline: boolean;
}) {
  const limits = guarded(
    z
      .object({
        minUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        maxUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        maxBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        multiline: z.boolean(),
      })
      .strict()
      .refine((v) => v.minUnits <= v.maxUnits, "Invalid text bounds"),
  ).parse(config);
  const unsafe = limits.multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
    : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
  const bounded = z
    .string()
    // Zod string length checks count Unicode code points in this version;
    // this contract deliberately requires JavaScript UTF-16 unit bounds.
    .refine(
      (value) =>
        value.length >= limits.minUnits && value.length <= limits.maxUnits,
      "UTF-16 unit bound",
    )
    .refine(
      (value) => new TextEncoder().encode(value).length <= limits.maxBytes,
      "UTF-8 byte bound",
    );
  return z
    .string()
    .refine((value) => !unsafe.test(value), "Unsafe control")
    .refine(
      (value) =>
        !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
          value,
        ),
      "Invalid Unicode",
    )
    .pipe(bounded)
    .transform((value) => value.normalize("NFC").trim())
    .pipe(bounded);
}

const canonicalHandle = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z][a-z0-9_]*$(?![\s\S])/);
const policySchema = guarded(
  z
    .object({
      reservedHandles: z.array(canonicalHandle),
      reservedPrefixes: z.array(
        z
          .string()
          .min(1)
          .max(24)
          .regex(/^[a-z][a-z0-9_]*$(?![\s\S])/),
      ),
    })
    .strict(),
);

/** Pure command models only: no enrollment, state transitions, taxonomy lookup, or persistence. */
export function createReaderProfileContracts(policy: ReservedHandlePolicy) {
  const parsedPolicy = policySchema.parse(policy);
  // Snapshot caller-owned configuration; subsequent mutations cannot change validation.
  const reservedHandles: readonly string[] = Object.freeze([
    ...parsedPolicy.reservedHandles,
  ]);
  const reservedPrefixes: readonly string[] = Object.freeze([
    ...parsedPolicy.reservedPrefixes,
  ]);
  const handle = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$(?![\s\S])/)
    .transform((value) => value.toLowerCase())
    .refine(
      (value) =>
        !reservedHandles.includes(value) &&
        !reservedPrefixes.some((prefix) => value.startsWith(prefix)),
      "Reserved handle",
    );
  const displayName = boundedReaderProfileText({
    minUnits: 1,
    maxUnits: 80,
    maxBytes: 320,
    multiline: false,
  });
  // These byte caps are redundant for valid Unicode within the UTF-16 caps.
  // The helper permits independently testing tighter UTF-8 budgets.
  const biography = boundedReaderProfileText({
    minUnits: 0,
    maxUnits: 500,
    maxBytes: 2000,
    multiline: true,
  });
  // Format only: taxonomy existence is deliberately outside B1.
  const interests = guarded(
    z
      .array(
        z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])/),
      )
      .max(5)
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate interests",
      ),
  );
  const revision = z.number().int().min(1).max(2_147_483_647);
  const publicId = z.uuid().transform((value) => value.toLowerCase());
  const accountId = readerProfileAccountIdSchema;
  const create = guarded(
    z
      .object({
        handle,
        displayName,
        biography: biography.optional(),
        interests: interests.default([]),
        visibility: z.literal("PRIVATE").default("PRIVATE"),
      })
      .strict(),
  );
  const edit = guarded(
    z
      .object({
        expectedRevision: revision,
        patch: z
          .object({
            displayName: displayName.optional(),
            biography: biography.nullable().optional(),
            interests: interests.optional(),
          })
          .strict()
          .refine(
            (patch) =>
              Object.values(patch).some((value) => value !== undefined),
            "Patch requires a defined field",
          ),
      })
      .strict(),
  );
  const publish = guarded(
    z
      .object({
        intent: z.literal("PUBLISH"),
        expectedRevision: revision,
        acknowledgePublicProfile: z.literal(true),
      })
      .strict(),
  );
  const hide = guarded(
    z
      .object({
        intent: z.literal("HIDE"),
        expectedRevision: revision,
      })
      .strict(),
  );
  const snapshot = guarded(
    z
      .object({
        publicId,
        ownerAccountId: accountId,
        handle,
        displayName,
        biography: biography.optional(),
        interests,
        visibility: z.enum(["PRIVATE", "PUBLIC"]),
        revision,
        state: z.enum(["ACTIVE", "REMOVED"]),
      })
      .strict(),
  ).transform((value) => {
    const output = { ...value };
    if (output.biography === undefined || output.biography === "")
      delete output.biography;
    return output;
  });
  return {
    handle,
    displayName,
    biography,
    interests,
    revision,
    publicId,
    accountId,
    create,
    edit,
    publish,
    hide,
    snapshot,
  };
}

export type ReaderProfileSnapshot = z.infer<
  ReturnType<typeof createReaderProfileContracts>["snapshot"]
>;
export type ReaderProfileVisibility = ReaderProfileSnapshot["visibility"];
export type ReaderProfileState = ReaderProfileSnapshot["state"];
