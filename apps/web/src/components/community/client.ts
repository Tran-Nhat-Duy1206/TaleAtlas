import type { z } from "zod";
import type {
  CommunityPublicDTO,
  CommunityRevealDTO,
} from "../../features/community/projection";
import { communityCopy } from "../../lib/community-i18n";
import type { Locale } from "../../lib/i18n";

export class CommunityClientError extends Error {
  constructor(
    readonly status: number,
    readonly uncertain = false,
  ) {
    super("COMMUNITY_REQUEST_FAILED");
  }
}
export async function communityRequest<T>(
  url: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  } catch {
    throw new CommunityClientError(0, true);
  }
  if (!response.ok)
    throw new CommunityClientError(response.status, response.status >= 500);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new CommunityClientError(0, true);
  }
}
export function errorCopy(error: unknown, locale: Locale): string {
  const t = communityCopy[locale];
  if (!(error instanceof CommunityClientError)) return t.invalid;
  if (error.status === 409) return t.conflict;
  if (error.status === 401 || error.status === 403) return t.denied;
  return error.uncertain ? t.transport : t.failed;
}
/** Serialize only normalized foundation-schema output. This immutable string/key is reused on uncertainty. */
export function freezeCommunityMutation<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  url: string,
  method: "POST" | "PATCH",
) {
  const body = JSON.stringify(schema.parse(payload));
  return Object.freeze({ url, method, body });
}
export type FrozenMutation = ReturnType<typeof freezeCommunityMutation>;
export function mutationOptions(attempt: FrozenMutation): RequestInit {
  return {
    method: attempt.method,
    headers: { "Content-Type": "application/json" },
    body: attempt.body,
  };
}
/** Only edits may confirm an unchanged revision: the foundation records an authorized NOOP. */
export function assertDiscussionScope(
  content: CommunityPublicDTO,
  scope: {
    workId: string;
    kind: "THREAD" | "REPLY";
    id?: string;
    revision?: number;
    allowUnchangedRevision?: boolean;
    threadId?: string;
    parentId?: string | null;
    depth?: number;
  },
) {
  if (
    content.workId !== scope.workId ||
    content.kind !== scope.kind ||
    (scope.id !== undefined && content.id !== scope.id) ||
    (scope.revision !== undefined &&
      content.revision !== scope.revision + 1 &&
      !(scope.allowUnchangedRevision && content.revision === scope.revision)) ||
    (scope.threadId !== undefined && content.threadId !== scope.threadId) ||
    (scope.parentId !== undefined && content.parentId !== scope.parentId) ||
    (scope.depth !== undefined && content.depth !== scope.depth)
  )
    throw new CommunityClientError(409);
}
export function assertSelectedReveal(
  content: CommunityPublicDTO,
  section: "title" | "body",
  reveal: CommunityRevealDTO,
) {
  if (
    reveal.id !== content.id ||
    reveal.workId !== content.workId ||
    reveal.kind !== content.kind ||
    reveal.revision !== content.revision ||
    typeof reveal[section] !== "string" ||
    (section === "title"
      ? reveal.body !== undefined
      : reveal.title !== undefined)
  )
    throw new CommunityClientError(409);
  // Context may itself disclose the other independently flagged section.
  if (
    reveal.spoilerContext !== undefined &&
    (section === "title"
      ? content.body.state === "MASKED"
      : content.title.state === "MASKED")
  )
    throw new CommunityClientError(409);
}
/** List/detail reads bind scope without requiring a mutation revision increment. */
export function assertDiscussionRead(
  content: CommunityPublicDTO,
  workId: string,
  kind: "THREAD" | "REPLY",
  id?: string,
  threadId?: string,
) {
  assertDiscussionScope(content, { workId, kind, id, threadId });
}
export function discussionCursor(item: CommunityPublicDTO): {
  id: string;
  timestamp: string | null;
} {
  return {
    id: item.id,
    timestamp:
      item.state === "ACTIVE"
        ? item.kind === "THREAD"
          ? item.lastActivityAt
          : item.createdAt
        : null,
  };
}
export function communityListUrl(
  path: string,
  locale: Locale,
  page: number,
): string {
  if (!Number.isInteger(page) || page < 1 || page > 200)
    throw new CommunityClientError(400);
  return `${path}?locale=${locale}&page=${page}`;
}
