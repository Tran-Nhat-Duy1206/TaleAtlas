"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  communityOwnedSchema,
  discussionMutationResponseSchema,
} from "../../features/community/http-contracts";
import { communityDeleteSchema } from "../../features/community/contracts";
import type { CommunityPublicDTO } from "../../features/community/projection";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import { ContentForm } from "./ContentForm";
import {
  assertDiscussionScope,
  communityRequest,
  CommunityClientError,
  errorCopy,
  freezeCommunityMutation,
  mutationOptions,
  type FrozenMutation,
} from "./client";
import styles from "./community.module.css";
export type OwnedContent = z.infer<typeof communityOwnedSchema>;
export function canReplaceOwnedContent(
  owned: OwnedContent,
  content: CommunityPublicDTO,
): boolean {
  return (
    owned.canEdit &&
    owned.workAvailable &&
    owned.authorState === "ACTIVE" &&
    owned.moderationState === "VISIBLE" &&
    content.state === "ACTIVE" &&
    owned.id === content.id &&
    owned.workId === content.workId &&
    owned.kind === content.kind &&
    owned.revision === content.revision &&
    owned.threadId === content.threadId &&
    owned.parentId === content.parentId &&
    owned.depth === content.depth
  );
}
type Props = {
  locale: Locale;
  scope: {
    id: string;
    workId: string;
    kind: "THREAD" | "REPLY";
    revision: number;
  };
  publicContent?: CommunityPublicDTO;
  seed?: OwnedContent;
  onComplete: () => void;
};
/** Changing identity/revision unmounts all private eligibility and retry state synchronously. */
export function OwnerActions(props: Props) {
  return (
    <ScopedOwnerActions
      key={`${props.scope.workId}:${props.scope.id}:${props.scope.kind}:${props.scope.revision}`}
      {...props}
    />
  );
}
function ScopedOwnerActions({
  locale,
  scope,
  publicContent,
  seed,
  onComplete,
}: Props) {
  const t = communityCopy[locale];
  const parsedSeed = communityOwnedSchema.safeParse(seed);
  const safeSeed =
    parsedSeed.success &&
    parsedSeed.data.id === scope.id &&
    parsedSeed.data.workId === scope.workId &&
    parsedSeed.data.kind === scope.kind &&
    parsedSeed.data.revision === scope.revision
      ? parsedSeed.data
      : null;
  const [owned, setOwned] = useState<OwnedContent | null>(safeSeed),
    [verified, setVerified] = useState(false),
    [editing, setEditing] = useState(false),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState<FrozenMutation | null>(null),
    [failure, setFailure] = useState<CommunityClientError | null>(null);
  const lock = useRef(false),
    attemptRef = useRef<FrozenMutation | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function metadata() {
    const result = await communityRequest(
      `/api/community/works/${scope.workId}/contents/${scope.id}/owned?contentKind=${scope.kind}`,
      communityOwnedSchema,
    );
    if (
      result.id !== scope.id ||
      result.workId !== scope.workId ||
      result.kind !== scope.kind ||
      result.revision !== scope.revision
    )
      throw new CommunityClientError(409);
    return result;
  }
  async function check(startEdit = false) {
    if (lock.current || attemptRef.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await metadata();
      if (
        startEdit &&
        (!publicContent || !canReplaceOwnedContent(result, publicContent))
      )
        throw new CommunityClientError(409);
      if (mounted.current) {
        setOwned(result);
        setVerified(true);
        if (startEdit) setEditing(true);
      }
    } catch (error) {
      if (mounted.current) {
        setOwned(null);
        setVerified(false);
        setFailure(error instanceof CommunityClientError ? error : null);
        setMessage(
          error instanceof CommunityClientError && error.status === 404
            ? t.ownerMissing
            : errorCopy(error, locale),
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function withdraw(retry = false) {
    if (
      lock.current ||
      (!retry && (!ack || !owned?.canWithdraw || attemptRef.current))
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFailure(null);
    try {
      let attempt = attemptRef.current;
      if (!retry) {
        const latest = await metadata();
        if (!latest.canWithdraw) throw new CommunityClientError(409);
        if (!mounted.current) return;
        attempt = freezeCommunityMutation(
          communityDeleteSchema,
          {
            contentKind: scope.kind,
            expectedRevision: latest.revision,
            mutationKey: crypto.randomUUID(),
          },
          `/api/community/works/${scope.workId}/contents/${scope.id}/withdraw`,
          "POST",
        );
        attemptRef.current = attempt;
        setPending(attempt);
      }
      if (!attempt) return;
      const result = await communityRequest(
        attempt.url,
        discussionMutationResponseSchema,
        mutationOptions(attempt),
      );
      assertDiscussionScope(result.content, scope);
      if (
        owned &&
        (result.content.threadId !== owned.threadId ||
          result.content.parentId !== owned.parentId ||
          result.content.depth !== owned.depth)
      )
        throw new CommunityClientError(409);
      if (
        result.content.state !== "DELETED" ||
        result.content.title.text !== null ||
        result.content.body.text !== null ||
        result.content.author !== null ||
        result.content.spoilerContext !== null
      )
        throw new CommunityClientError(409);
      if (!mounted.current) return;
      attemptRef.current = null;
      setPending(null);
      setOwned(null);
      setVerified(false);
      setAck(false);
      setMessage(t.withdrawn);
      onComplete();
    } catch (error) {
      if (mounted.current) {
        setFailure(
          error instanceof CommunityClientError
            ? error
            : new CommunityClientError(0, true),
        );
        setMessage(errorCopy(error, locale));
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function complete() {
    setOwned(null);
    setVerified(false);
    setEditing(false);
    onComplete();
  }
  return (
    <div className={styles.actions}>
      {!verified && (
        <button
          type="button"
          disabled={busy || pending !== null}
          onClick={() => void check()}
        >
          {busy ? t.loading : t.checkOwner}
        </button>
      )}
      {verified &&
        owned &&
        publicContent &&
        canReplaceOwnedContent(owned, publicContent) &&
        !editing && (
          <button
            type="button"
            disabled={busy || pending !== null}
            onClick={() => void check(true)}
          >
            {t.edit}
          </button>
        )}
      {editing &&
        publicContent &&
        owned &&
        verified &&
        canReplaceOwnedContent(owned, publicContent) && (
          <ContentForm
            locale={locale}
            workId={scope.workId}
            kind={scope.kind}
            editing={publicContent}
            threadId={publicContent.threadId ?? undefined}
            parentId={publicContent.parentId}
            depth={publicContent.depth ?? 0}
            onComplete={complete}
            onCancel={() => setEditing(false)}
          />
        )}
      {owned?.canWithdraw && !editing && (
        <div className={styles.form}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={ack}
              disabled={busy || pending !== null}
              onChange={(e) => setAck(e.target.checked)}
            />
            {t.withdrawAck}
          </label>
          <button
            type="button"
            disabled={!ack || busy || pending !== null}
            onClick={() => void withdraw()}
          >
            {t.withdraw}
          </button>
        </div>
      )}
      {message && (
        <p role={message === t.withdrawn ? "status" : "alert"}>{message}</p>
      )}
      {pending && failure?.uncertain && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void withdraw(true)}
        >
          {t.retry}
        </button>
      )}
      {failure?.status === 409 && (
        <button type="button" disabled={busy} onClick={onComplete}>
          {t.refresh}
        </button>
      )}
      {pending && failure && !failure.uncertain && failure.status !== 409 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            attemptRef.current = null;
            setPending(null);
            setFailure(null);
            setMessage("");
          }}
        >
          {t.newAttempt}
        </button>
      )}
    </div>
  );
}
