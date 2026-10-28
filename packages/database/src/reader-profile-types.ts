/** Provisional B1-compatible persistence bounds; no runtime enrollment policy. */
export const READER_PROFILE_VISIBILITIES = ["PRIVATE", "PUBLIC"] as const;
export type ReaderProfileVisibility =
  (typeof READER_PROFILE_VISIBILITIES)[number];

export const READER_PROFILE_STATES = ["ACTIVE", "REMOVED"] as const;
export type ReaderProfileState = (typeof READER_PROFILE_STATES)[number];

export const READER_PROFILE_MIN_HANDLE_LENGTH = 3;
export const READER_PROFILE_MAX_HANDLE_LENGTH = 24;
export const READER_PROFILE_MAX_DISPLAY_NAME_LENGTH = 80;
export const READER_PROFILE_MAX_DISPLAY_NAME_BYTES = 320;
export const READER_PROFILE_MAX_BIOGRAPHY_LENGTH = 500;
export const READER_PROFILE_MAX_BIOGRAPHY_BYTES = 2000;
export const READER_PROFILE_MAX_INTERESTS = 5;
export const READER_PROFILE_MAX_REVISION = 2_147_483_647;
