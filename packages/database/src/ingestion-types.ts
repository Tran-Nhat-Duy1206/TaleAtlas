import { WORK_FORMATS } from "./catalog-types";

export const WORK_REQUEST_STATES = [
  "SUBMITTED",
  "ENRICHING",
  "NEEDS_REVIEW",
  "NEEDS_INFO",
  "APPROVED",
  "LINKED_EXISTING",
  "REJECTED",
  "CANCELLED",
] as const;
export const INGESTION_JOB_KINDS = [
  "REQUEST_ENRICH",
  "DISCOVER_PROVIDER",
] as const;
export const INGESTION_JOB_STATES = [
  "QUEUED",
  "RUNNING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "DEAD_LETTER",
  "CANCELLED",
] as const;
export const REQUEST_FORMATS = [...WORK_FORMATS, "UNKNOWN"] as const;
export type WorkRequestState = (typeof WORK_REQUEST_STATES)[number];
export type IngestionJobKind = (typeof INGESTION_JOB_KINDS)[number];
export type IngestionJobState = (typeof INGESTION_JOB_STATES)[number];
export type RequestFormat = (typeof REQUEST_FORMATS)[number];
