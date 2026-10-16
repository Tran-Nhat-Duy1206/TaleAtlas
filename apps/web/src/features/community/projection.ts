import type { communityContents } from "@taleatlas/database/community";
import { communityRevealSchema, type CommunityRevealInput } from "./contracts";

export type CommunityContentRow = typeof communityContents.$inferSelect;
export type CommunityTextDTO =
  | { state: "VISIBLE"; text: string }
  | { state: "MASKED"; text: null }
  | { state: "UNAVAILABLE"; text: null };
export type CommunityPublicDTO = {
  id: string;
  workId: string;
  kind: CommunityContentRow["kind"];
  threadId: string | null;
  parentId: string | null;
  depth: number | null;
  revision: number;
  state: "ACTIVE" | "DELETED" | "ERASED" | "HIDDEN";
  title: CommunityTextDTO;
  body: CommunityTextDTO;
  spoilerContext: string | null;
  ratingHalfStars: number | null;
  author: { displayName: string } | null;
  createdAt: string | null;
  editedAt: string | null;
  lastActivityAt: string | null;
};
const unavailable = (): CommunityTextDTO => ({
  state: "UNAVAILABLE",
  text: null,
});
const text = (value: string | null, masked: boolean): CommunityTextDTO =>
  value === null
    ? unavailable()
    : masked
      ? { state: "MASKED", text: null }
      : { state: "VISIBLE", text: value };
function displayName(value: string | null): { displayName: string } | null {
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
      value,
    )
  )
    return null;
  const name = value.normalize("NFC").trim();
  return name.length > 0 &&
    name.length <= 160 &&
    new TextEncoder().encode(name).length <= 640
    ? { displayName: name }
    : null;
}
/** Caller owns coherent published-Work and ancestor visibility queries. No descendant hydration. */
export function projectCommunityContent(
  row: CommunityContentRow,
  currentAuthorDisplayName: string | null,
): CommunityPublicDTO {
  const live =
    row.authorState === "ACTIVE" && row.moderationState === "VISIBLE";
  return {
    id: row.id,
    workId: row.workId,
    kind: row.kind,
    threadId: row.threadId,
    parentId: row.parentId,
    depth: row.depth,
    revision: row.revision,
    state:
      row.authorState !== "ACTIVE"
        ? row.authorState
        : row.moderationState === "HIDDEN"
          ? "HIDDEN"
          : "ACTIVE",
    title:
      live && row.kind === "THREAD"
        ? text(row.title, row.titleSpoiler)
        : unavailable(),
    body: live ? text(row.body, row.bodySpoiler) : unavailable(),
    // The single context may describe either independent spoiler: conceal until explicit reveal.
    spoilerContext: null,
    ratingHalfStars: live ? row.ratingHalfStars : null,
    author: live ? displayName(currentAuthorDisplayName) : null,
    createdAt: live ? (row.createdAt?.toISOString() ?? null) : null,
    editedAt: live ? (row.editedAt?.toISOString() ?? null) : null,
    lastActivityAt: live ? (row.lastActivityAt?.toISOString() ?? null) : null,
  };
}
/** Verified-owner management metadata only: never authored text or unavailable catalog facts. */
export type CommunityOwnedDTO = {
  id: string;
  workId: string;
  kind: "THREAD" | "REPLY";
  threadId: string | null;
  parentId: string | null;
  depth: number | null;
  revision: number;
  authorState: CommunityContentRow["authorState"];
  moderationState: CommunityContentRow["moderationState"];
  workAvailable: boolean;
  canEdit: boolean;
  canWithdraw: boolean;
};
export type CommunityRevealDTO = {
  id: string;
  workId: string;
  kind: CommunityContentRow["kind"];
  revision: number;
  title?: string;
  body?: string;
  spoilerContext?: string;
};
export class CommunityRevealConflict extends Error {
  readonly code = "COMMUNITY_REVEAL_CONFLICT";
  constructor() {
    super("COMMUNITY_REVEAL_CONFLICT");
  }
}
/** Explicit selected text only. Gate/Work/ancestor authorization MUST precede this pure projector. */
export function projectCommunityReveal(
  row: CommunityContentRow,
  input: CommunityRevealInput,
): CommunityRevealDTO {
  const selected = communityRevealSchema.parse(input);
  if (
    row.id !== selected.targetId ||
    row.workId !== selected.workId ||
    row.kind !== selected.contentKind ||
    row.revision !== selected.expectedRevision ||
    row.authorState !== "ACTIVE" ||
    row.moderationState !== "VISIBLE"
  )
    throw new CommunityRevealConflict();
  const result: CommunityRevealDTO = {
    id: row.id,
    workId: row.workId,
    kind: row.kind,
    revision: row.revision,
  };
  if (selected.title && row.title !== null) result.title = row.title;
  if (selected.body) result.body = row.body;
  // Mixed title/body context cannot reveal an unselected independently masked section.
  if (
    row.spoilerContext !== null &&
    (!row.titleSpoiler || selected.title) &&
    (!row.bodySpoiler || selected.body)
  )
    result.spoilerContext = row.spoilerContext;
  return result;
}
/** No authored titles, catalog metadata, excerpts, or descriptions. */
export function communityPublicMetadata(locale: "en" | "vi"): {
  title: string;
  description: string;
} {
  return locale === "vi"
    ? {
        title: "Cộng đồng tác phẩm",
        description: "Thảo luận công khai về tác phẩm.",
      }
    : { title: "Work community", description: "Public discussion of works." };
}
