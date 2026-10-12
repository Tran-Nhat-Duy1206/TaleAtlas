export const LIBRARY_STATUSES = [
  "WANT_TO_READ",
  "READING",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const;

export const READING_SESSION_STATES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ABANDONED",
] as const;

export const READING_SESSION_KINDS = ["FIRST_READ", "REREAD"] as const;

export const LIBRARY_EVENT_KINDS = [
  "ADD",
  "RESTORE",
  "REMOVE",
  "UPDATE",
  "START_READ",
  "START_REREAD",
  "RESUME",
  "COMPLETE",
  "PROGRESS",
] as const;

export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export type ReadingSessionState = (typeof READING_SESSION_STATES)[number];
export type ReadingSessionKind = (typeof READING_SESSION_KINDS)[number];
export type LibraryEventKind = (typeof LIBRARY_EVENT_KINDS)[number];

// Owner counts include archived entries. These are rejection bounds, not pruning targets.
export const LIBRARY_MAX_ENTRIES_PER_OWNER = 20_000;
export const LIBRARY_MAX_SESSIONS_PER_ENTRY = 1_000;
export const LIBRARY_MAX_EVENTS_PER_ENTRY = 10_000;
export const LIBRARY_MAX_QUERY_LIMIT = 50;
export const LIBRARY_MAX_ENTRY_NOTES_LENGTH = 4_000;
export const LIBRARY_MAX_SESSION_NOTES_LENGTH = 2_000;
export const LIBRARY_MAX_PROGRESS_NOTES_LENGTH = 2_000;
export const LIBRARY_MAX_PROGRESS_LABEL_LENGTH = 200;
export const LIBRARY_MAX_CHAPTER_NUMBER = 1_000_000;
export const LIBRARY_MAX_VOLUME_NUMBER = 100_000;
export const LIBRARY_MAX_EVENT_SNAPSHOT_BYTES = 32_768;
