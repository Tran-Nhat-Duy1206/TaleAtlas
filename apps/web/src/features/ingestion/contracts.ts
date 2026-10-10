import { z } from "zod";
import {
  REQUEST_FORMATS,
  WORK_REQUEST_STATES,
  type WorkRequestState,
} from "@taleatlas/database/ingestion-types";

export function normalizeRequestTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const text = (max: number) => z.string().trim().min(1).max(max);
const language = text(35)
  .transform((v) => v.toLowerCase())
  .pipe(z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/));
// Citation only: these URLs are NEVER passed to a server fetch or image proxy.
export const evidenceUrlSchema = text(2000).refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !host.includes(":") &&
      !host.startsWith("[") &&
      !/^\d/.test(host) &&
      host.includes(".") &&
      !/(?:^|\.)(?:localhost|local|internal|lan)$/.test(host)
    );
  } catch {
    return false;
  }
}, "Invalid citation URL");
export const requestDetailsSchema = z
  .object({
    title: text(600).refine((v) => {
      const length = normalizeRequestTitle(v).length;
      return length > 0 && length <= 600;
    }),
    format: z.enum(REQUEST_FORMATS),
    alternativeTitles: z.array(text(600)).max(12).default([]),
    originalTitle: text(600).optional(),
    author: text(300).optional(),
    sourceUrl: evidenceUrlSchema.optional(),
    originalLanguage: language.optional(),
    publicationLanguage: language.optional(),
    publicationYear: z.number().int().min(1).max(9999).optional(),
    description: text(4000).optional(),
    additionalEvidence: text(3000).optional(),
    notes: text(2000).optional(),
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 12000,
    "Request details too large",
  );
export type RequestDetails = z.infer<typeof requestDetailsSchema>;
export const submitRequestSchema = z
  .object({ submitKey: z.uuid(), details: requestDetailsSchema })
  .strict();
export const updateRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    details: requestDetailsSchema,
  })
  .strict();
export const cancelRequestSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const requestPageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const requestModerationSchema = z
  .object({
    revision: z.number().int().positive(),
    state: z.enum(["NEEDS_INFO", "NEEDS_REVIEW", "REJECTED"]),
    reason: text(2000),
  })
  .strict();
export const requestStateSchema = z.enum(WORK_REQUEST_STATES);
const transitions: Record<WorkRequestState, readonly WorkRequestState[]> = {
  SUBMITTED: [
    "ENRICHING",
    "NEEDS_REVIEW",
    "NEEDS_INFO",
    "REJECTED",
    "CANCELLED",
  ],
  ENRICHING: ["NEEDS_REVIEW", "NEEDS_INFO", "REJECTED", "CANCELLED"],
  NEEDS_REVIEW: [
    "NEEDS_INFO",
    "APPROVED",
    "LINKED_EXISTING",
    "REJECTED",
    "CANCELLED",
  ],
  NEEDS_INFO: ["SUBMITTED", "NEEDS_REVIEW", "REJECTED", "CANCELLED"],
  APPROVED: [],
  LINKED_EXISTING: [],
  REJECTED: [],
  CANCELLED: [],
};
export function canTransitionRequest(
  from: WorkRequestState,
  to: WorkRequestState,
): boolean {
  return transitions[from].includes(to);
}
export const EDITABLE_REQUEST_STATES: readonly WorkRequestState[] = [
  "SUBMITTED",
  "NEEDS_INFO",
];
export const CANCELLABLE_REQUEST_STATES: readonly WorkRequestState[] = [
  "SUBMITTED",
  "ENRICHING",
  "NEEDS_REVIEW",
  "NEEDS_INFO",
];
