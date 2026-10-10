import { z } from "zod";
import {
  REQUEST_FORMATS,
  type RequestFormat,
  type WorkRequestState,
} from "@taleatlas/database/ingestion-types";
import {
  evidenceUrlSchema,
  normalizeRequestTitle,
  requestPageSchema,
} from "./contracts";
export const ACTIVE_REQUEST_STATES: readonly WorkRequestState[] = [
  "SUBMITTED",
  "ENRICHING",
  "NEEDS_INFO",
  "NEEDS_REVIEW",
];
const title = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .refine((v) => normalizeRequestTitle(v).length > 0);
export const supportRequestSchema = z
  .object({ equivalenceAcknowledged: z.literal(true) })
  .strict();
export const reviewRequestSummarySchema = z
  .object({
    revision: z.number().int().positive(),
    title,
    format: z.enum(REQUEST_FORMATS),
    alternativeTitles: z.array(title).max(12).default([]),
    sourceUrl: evidenceUrlSchema,
    reason: z.string().trim().min(1).max(2000),
    equivalenceReviewAcknowledged: z.literal(true),
  })
  .strict();
export const searchRequestSummarySchema = requestPageSchema
  .extend({ q: z.string().trim().min(1).max(600) })
  .strict();
export interface RequestSummary {
  id: string;
  title: string | null;
  format: RequestFormat | null;
  state: WorkRequestState;
  revision: number;
  supporterCount: number;
  following: boolean;
  work: { slug: string } | null;
}
