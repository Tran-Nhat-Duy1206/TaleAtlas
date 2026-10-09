export const WORK_FORMATS = [
  "MANGA",
  "MANHWA",
  "MANHUA",
  "WEBTOON",
  "WEB_NOVEL",
  "LIGHT_NOVEL",
  "NOVEL",
  "GRAPHIC_NOVEL",
  "COMIC",
  "SHORT_STORY",
  "OTHER",
] as const;
export const WORK_VISIBILITIES = ["DRAFT", "PUBLISHED", "HIDDEN"] as const;
export const RELEASE_STATUSES = [
  "UNKNOWN",
  "ANNOUNCED",
  "ONGOING",
  "COMPLETED",
  "HIATUS",
  "CANCELLED",
] as const;
export const CREATOR_ROLES = [
  "AUTHOR",
  "WRITER",
  "ILLUSTRATOR",
  "ARTIST",
  "TRANSLATOR",
  "EDITOR",
  "PUBLISHER",
  "OTHER",
] as const;
export const TITLE_KINDS = ["PRIMARY", "ORIGINAL", "ALIAS"] as const;
export const COVER_RIGHTS = [
  "UNKNOWN",
  "LICENSED",
  "PUBLIC_DOMAIN",
  "PERMISSION",
] as const;
export const RELATION_TYPES = [
  "ADAPTATION_OF",
  "SEQUEL_OF",
  "PREQUEL_OF",
  "SPIN_OFF_OF",
  "SIDE_STORY_OF",
  "REMAKE_OF",
  "SHARED_UNIVERSE",
  "OTHER",
] as const;
export const AUDIT_OPERATIONS = [
  "CREATE",
  "UPDATE",
  "HIDE",
  "RESTORE",
] as const;
export type WorkFormat = (typeof WORK_FORMATS)[number];
export type WorkVisibility = (typeof WORK_VISIBILITIES)[number];
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export type CreatorRole = (typeof CREATOR_ROLES)[number];
export type TitleKind = (typeof TITLE_KINDS)[number];
export type CoverRights = (typeof COVER_RIGHTS)[number];
export type RelationType = (typeof RELATION_TYPES)[number];
export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];
