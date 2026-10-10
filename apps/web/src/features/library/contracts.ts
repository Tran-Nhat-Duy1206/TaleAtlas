import { z } from "zod";
import {
  LIBRARY_STATUSES,
  type LibraryStatus,
  type ReadingSessionState,
} from "@taleatlas/database/library-types";

export type { LibraryStatus, ReadingSessionState };

const revision = z.number().int().min(1).max(10000);
// PostgreSQL UUID identity is case-insensitive and is returned in lowercase.
// Normalize before comparisons and canonical replay binding, never afterward.
const uuid = z.uuid().transform((value) => value.toLowerCase());
const mutationKey = uuid;
// Tabs and line breaks are plain text; C0/C1 and bidi override/isolate controls
// are unsafe. Check before trimming so whitespace controls cannot disappear.
const plainText = (max: number) =>
  z
    .string()
    .regex(
      /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]*$/u,
      "Unsafe text control character",
    )
    .trim()
    .max(max);
const commandFence = { revision, mutationKey };

export const libraryAddSchema = z
  .object({ workId: uuid, mutationKey, revision: revision.optional() })
  .strict();
export const libraryRemoveSchema = z
  .object({ ...commandFence, confirmRemoval: z.literal(true) })
  .strict();
export const libraryPatchSchema = z
  .object({
    ...commandFence,
    acknowledgeReread: z.literal(true).optional(),
    patch: z
      .object({
        status: z.enum(LIBRARY_STATUSES).optional(),
        favorite: z.boolean().optional(),
        ratingHalfStars: z.number().int().min(2).max(10).nullable().optional(),
        notes: plainText(4000).optional(),
      })
      .strict()
      .refine(
        (value) => Object.values(value).some((field) => field !== undefined),
        "Provide at least one entry change",
      ),
  })
  .strict();
export const readingProgressSchema = z
  .object({
    ...commandFence,
    sessionId: uuid,
    patch: z
      .object({
        chapterNumber: z
          .number()
          .int()
          .min(0)
          .max(1000000)
          .nullable()
          .optional(),
        chapterLabel: plainText(200).nullable().optional(),
        volumeNumber: z.number().int().min(0).max(100000).nullable().optional(),
        volumeLabel: plainText(200).nullable().optional(),
        editionId: uuid.nullable().optional(),
        personalChapterTotal: z
          .number()
          .int()
          .min(1)
          .max(1000000)
          .nullable()
          .optional(),
        progressNotes: plainText(2000).nullable().optional(),
      })
      .strict()
      .refine(
        (value) => Object.values(value).some((field) => field !== undefined),
        "Provide at least one progress change",
      ),
  })
  .strict();

// Calendar arithmetic avoids JS Date's year 0..99 remapping and rollover.
const personalDate = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1)
      return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
  }, "Use an exact Gregorian date in years 0001..9999")
  .nullable()
  .optional();
const sessionCommand = { ...commandFence, notes: plainText(2000).optional() };
export const readingSessionActionSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        ...sessionCommand,
        action: z.literal("START_READ"),
        startedOn: personalDate,
      })
      .strict(),
    z
      .object({
        ...sessionCommand,
        action: z.literal("START_REREAD"),
        acknowledgeReread: z.literal(true),
        startedOn: personalDate,
      })
      .strict(),
    z
      .object({
        ...sessionCommand,
        action: z.literal("RESUME"),
        sessionId: uuid,
      })
      .strict(),
    z
      .object({
        ...sessionCommand,
        action: z.literal("COMPLETE"),
        sessionId: uuid,
        startedOn: personalDate,
        finishedOn: personalDate,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.action === "COMPLETE" &&
      value.startedOn != null &&
      value.finishedOn != null &&
      value.startedOn > value.finishedOn
    )
      context.addIssue({
        code: "custom",
        path: ["finishedOn"],
        message: "Finished date must not precede started date",
      });
  });

// Query strings may contain decimal integers, but coercing booleans/null/empty
// strings to numbers (or the string "false" to true) is never permitted.
const queryInteger = (max: number) =>
  z
    .union([z.number(), z.string().regex(/^[1-9][0-9]*$/)])
    .pipe(z.coerce.number<string | number>().int().min(1).max(max));
const locale = z.enum(["en", "vi"]).default("en");
export const libraryQuerySchema = z
  .object({
    page: queryInteger(400).default(1),
    locale,
    status: z.enum(LIBRARY_STATUSES).optional(),
    favorite: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
    sort: z
      .enum(["ADDED_DESC", "UPDATED_DESC", "TITLE_ASC", "RATING_DESC"])
      .default("UPDATED_DESC"),
  })
  .strict()
  .transform((value) => ({ ...value, pageSize: 50 as const }));
export const historyQuerySchema = z
  .object({
    locale,
    beforeRevision: queryInteger(10001).optional(),
    beforeSequence: queryInteger(1001).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.beforeRevision === undefined || value.beforeSequence === undefined,
    "Use only one history cursor",
  )
  .transform((value) => ({ ...value, limit: 50 as const }));

export type LibraryAddInput = z.infer<typeof libraryAddSchema>;
export type LibraryRemoveInput = z.infer<typeof libraryRemoveSchema>;
export type LibraryPatchInput = z.infer<typeof libraryPatchSchema>;
export type ReadingProgressInput = z.infer<typeof readingProgressSchema>;
export type ReadingSessionActionInput = z.infer<
  typeof readingSessionActionSchema
>;
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

const transitions: Record<ReadingSessionState, readonly ReadingSessionState[]> =
  {
    ACTIVE: ["PAUSED", "COMPLETED", "ABANDONED"],
    PAUSED: ["ACTIVE", "COMPLETED", "ABANDONED"],
    COMPLETED: [],
    ABANDONED: [],
  };
/** Same-state commands are idempotent no-ops, including terminal states. */
export function canTransitionSession(
  from: ReadingSessionState,
  to: ReadingSessionState,
): boolean {
  return from === to || transitions[from].includes(to);
}

/**
 * Canonical JSON of already-parsed private commands, not a hash or validator.
 * Object keys sort recursively; arrays retain order; omitted/undefined object
 * fields are equivalent, while null clears remain distinct. Never calls getters
 * or toJSON, traverses inherited properties, or mutates an object's prototype.
 */
export function canonicalLibraryCommand(value: unknown): string {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  const visit = (input: unknown, depth: number): string => {
    if (depth > 16 || ++nodes > 10000)
      throw new TypeError("Canonical command exceeds traversal bounds");
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean")
      return JSON.stringify(input);
    if (typeof input === "number" && Number.isFinite(input))
      return JSON.stringify(input);
    if (typeof input !== "object")
      throw new TypeError("Canonical command must contain JSON values");
    if (ancestors.has(input))
      throw new TypeError("Canonical command must not contain cycles");
    const prototype = Object.getPrototypeOf(input);
    if (
      !Array.isArray(input) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      throw new TypeError("Canonical command requires plain objects");
    if (Object.getOwnPropertySymbols(input).length)
      throw new TypeError("Canonical command must not contain symbol keys");
    ancestors.add(input);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const readValue = (key: string): unknown => {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor))
          throw new TypeError("Canonical command must not contain accessors");
        return descriptor.value;
      };
      if (Array.isArray(input)) {
        const items: string[] = [];
        for (let index = 0; index < input.length; index++)
          items.push(visit(readValue(String(index)), depth + 1));
        if (Object.keys(descriptors).length !== input.length + 1)
          throw new TypeError("Canonical arrays must not contain extra keys");
        return `[${items.join(",")}]`;
      }
      const fields: string[] = [];
      for (const key of Object.keys(descriptors).sort()) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new TypeError("Unsafe canonical command key");
        const field = readValue(key);
        if (field !== undefined)
          fields.push(`${JSON.stringify(key)}:${visit(field, depth + 1)}`);
      }
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(input);
    }
  };
  return visit(value, 0);
}
