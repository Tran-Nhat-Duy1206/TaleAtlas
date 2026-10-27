import { z } from "zod";
import {
  createReaderProfileContracts,
  readerProfileAccountIdSchema,
  readerProfilePlainDataSchema,
  type ReaderProfileSnapshot,
  type ReservedHandlePolicy,
} from "./contracts";

export type PublicProfileDTO = Readonly<{
  publicId: string;
  handle: string;
  displayName: string;
  biography?: string;
  interests: readonly string[];
}>;

export type OwnerProfileDTO = PublicProfileDTO &
  Readonly<{
    visibility: ReaderProfileSnapshot["visibility"];
    revision: number;
  }>;

export type ReaderProfileProjection =
  | { readonly kind: "OWNER"; readonly profile: OwnerProfileDTO }
  | { readonly kind: "PUBLIC"; readonly profile: PublicProfileDTO }
  | { readonly kind: "UNAVAILABLE" }
  | { readonly kind: "SESSION_UNAVAILABLE" };

const contextSchema = z
  .object({
    viewer: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("ANONYMOUS") }).strict(),
      z
        .object({
          kind: z.literal("AUTHENTICATED"),
          accountId: readerProfileAccountIdSchema,
          role: z.enum(["user", "moderator", "admin"]),
        })
        .strict(),
      z.object({ kind: z.literal("UNAVAILABLE") }).strict(),
    ]),
    blockedByOwner: z.boolean(),
    blockedByViewer: z.boolean(),
  })
  .strict();

const snapshotFields = [
  "publicId",
  "ownerAccountId",
  "handle",
  "displayName",
  "biography",
  "interests",
  "visibility",
  "revision",
  "state",
] as const;

/** Only inspect known own data fields; unrelated mixed-row fields stay unread. */
function pickSnapshot(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const picked: Record<string, unknown> = {};
  for (const field of snapshotFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor) {
      if (field === "biography") continue;
      return null;
    }
    if (!("value" in descriptor)) return null;
    picked[field] = descriptor.value;
  }
  return picked;
}

function publicFields(snapshot: ReaderProfileSnapshot): PublicProfileDTO {
  return {
    publicId: snapshot.publicId,
    handle: snapshot.handle,
    displayName: snapshot.displayName,
    ...(snapshot.biography === undefined
      ? {}
      : { biography: snapshot.biography }),
    interests: [...snapshot.interests],
  };
}

/**
 * Pure projection of caller-supplied facts, not token/session verification or
 * mutation authorization. Future callers must verify sessions and query coherent
 * visibility/block facts. Anonymous public access does not prevent logout-based
 * block circumvention; this conservative filter is not a platform blocking policy.
 */
export function createReaderProfileProjector(policy: ReservedHandlePolicy) {
  const { snapshot } = createReaderProfileContracts(policy);
  return function project(
    profile: unknown | null,
    context: unknown,
  ): ReaderProfileProjection {
    try {
      // Guard before Zod reads any properties. Infrastructure failure is resolved
      // before even inspecting the profile, so it cannot reveal its existence.
      if (!readerProfilePlainDataSchema.safeParse(context).success)
        return { kind: "UNAVAILABLE" };
      const parsedContext = contextSchema.safeParse(context);
      if (!parsedContext.success) return { kind: "UNAVAILABLE" };
      const { viewer, blockedByOwner, blockedByViewer } = parsedContext.data;
      if (viewer.kind === "UNAVAILABLE") return { kind: "SESSION_UNAVAILABLE" };
      if (blockedByOwner || blockedByViewer) return { kind: "UNAVAILABLE" };

      const picked = pickSnapshot(profile);
      if (
        picked === null ||
        !readerProfilePlainDataSchema.safeParse(picked).success
      )
        return { kind: "UNAVAILABLE" };
      const parsedSnapshot = snapshot.safeParse(picked);
      if (!parsedSnapshot.success || parsedSnapshot.data.state !== "ACTIVE")
        return { kind: "UNAVAILABLE" };
      const data = parsedSnapshot.data;
      if (
        viewer.kind === "AUTHENTICATED" &&
        viewer.accountId === data.ownerAccountId
      ) {
        return {
          kind: "OWNER",
          profile: {
            ...publicFields(data),
            visibility: data.visibility,
            revision: data.revision,
          },
        };
      }
      if (data.visibility !== "PUBLIC") return { kind: "UNAVAILABLE" };
      return { kind: "PUBLIC", profile: publicFields(data) };
    } catch {
      // Descriptor/prototype inspection can execute Proxy traps and throw.
      // Never expose those errors or claim that arbitrary proxies are inert.
      return { kind: "UNAVAILABLE" };
    }
  };
}
