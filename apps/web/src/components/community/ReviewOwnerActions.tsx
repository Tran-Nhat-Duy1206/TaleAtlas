"use client";
import { useEffect, useRef, useState } from "react";
import { communityUuidSchema } from "../../features/community/contracts";
import {
  reviewOwnedSchema,
  reviewWithdrawSchema,
  reviewMutationResponseSchema,
  requireReviewScope,
  type ReviewOwnedDTO,
} from "../../features/community/review-http-contracts";
import type { Locale } from "../../lib/i18n";
import { reviewCopy } from "../../lib/review-i18n";
import {
  CommunityClientError,
  communityRequest,
  errorCopy,
  freezeCommunityMutation,
  mutationOptions,
  type FrozenMutation,
} from "./client";
import { ReviewForm } from "./ReviewForm";
import { useCommunityReady } from "./useCommunityReady";
import styles from "./community.module.css";

export type ReviewOwnerActionsProps = {
  locale: Locale;
  scope: { id: string; workId: string; revision: number };
  seed?: ReviewOwnedDTO;
  disabled?: boolean;
  onComplete: (outcome: "UPDATED" | "WITHDRAWN") => void;
  onLockChange?: (locked: boolean) => void;
};
export function ReviewOwnerActions(props: ReviewOwnerActionsProps) {
  const work = communityUuidSchema.safeParse(props.scope.workId),
    id = communityUuidSchema.safeParse(props.scope.id);
  if (
    !work.success ||
    !id.success ||
    work.data !== props.scope.workId ||
    id.data !== props.scope.id ||
    !Number.isInteger(props.scope.revision) ||
    props.scope.revision < 1 ||
    props.scope.revision > 2_147_483_647
  )
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  const seed =
    props.seed === undefined ? null : reviewOwnedSchema.safeParse(props.seed);
  if (
    seed &&
    (!seed.success ||
      seed.data.id !== id.data ||
      seed.data.workId !== work.data ||
      seed.data.revision !== props.scope.revision)
  )
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  return (
    <ScopedReviewOwnerActions
      key={`${props.locale}:${props.scope.workId}:${props.scope.id}:${props.scope.revision}`}
      {...props}
    />
  );
}
function ScopedReviewOwnerActions({
  locale,
  scope,
  seed,
  disabled = false,
  onComplete,
  onLockChange,
}: ReviewOwnerActionsProps) {
  const ready = useCommunityReady(),
    t = reviewCopy[locale];
  const [owned, setOwned] = useState<ReviewOwnedDTO | null>(() =>
    seed ? reviewOwnedSchema.parse(seed) : null,
  );
  const [editing, setEditing] = useState(false),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState<FrozenMutation | null>(null),
    [failure, setFailure] = useState<CommunityClientError | null>(null);
  const lock = useRef(false),
    attemptRef = useRef<FrozenMutation | null>(null),
    attemptRevision = useRef<number | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function metadata() {
    const result = await communityRequest(
      `/api/community/works/${scope.workId}/reviews/${scope.id}/owned?locale=${locale}&contentKind=REVIEW`,
      reviewOwnedSchema,
    );
    requireReviewScope(result, scope.workId, scope.id);
    return result;
  }
  async function check(startEdit = false) {
    if (
      !ready ||
      disabled ||
      lock.current ||
      attemptRef.current ||
      editing ||
      failure?.status === 409
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    onLockChange?.(true);
    let keepLocked = false;
    try {
      const latest = await metadata();
      if (!mounted.current) return;
      setOwned(latest);
      setAck(false);
      setFailure(null);
      if (startEdit) {
        if (
          !latest.canEdit ||
          !latest.workAvailable ||
          latest.authorState !== "ACTIVE" ||
          latest.moderationState !== "VISIBLE"
        ) {
          // Changed ownership capability is not an email-verification failure.
          setMessage(t.failed);
          return;
        }
        keepLocked = true;
        setEditing(true);
      }
    } catch (error) {
      if (mounted.current) {
        setOwned(null);
        setAck(false);
        setFailure(
          error instanceof CommunityClientError
            ? error
            : new CommunityClientError(0, true),
        );
        setMessage(errorCopy(error, locale));
      }
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        if (!keepLocked) onLockChange?.(false);
      }
    }
  }
  async function withdraw(retry = false) {
    if (
      !ready ||
      disabled ||
      lock.current ||
      editing ||
      (!retry &&
        (!ack ||
          !owned?.canWithdraw ||
          attemptRef.current ||
          failure?.status === 409)) ||
      (retry && (!attemptRef.current || !failure?.uncertain))
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFailure(null);
    onLockChange?.(true);
    try {
      let attempt = attemptRef.current;
      if (!retry) {
        const latest = await metadata();
        if (!mounted.current) return;
        if (
          !owned ||
          latest.revision !== owned.revision ||
          !latest.canWithdraw
        ) {
          setOwned(latest);
          setAck(false);
          throw new CommunityClientError(409);
        }
        attempt = freezeCommunityMutation(
          reviewWithdrawSchema,
          {
            contentKind: "REVIEW",
            expectedRevision: latest.revision,
            mutationKey: crypto.randomUUID(),
          },
          `/api/community/works/${scope.workId}/reviews/${scope.id}/withdraw`,
          "POST",
        );
        attemptRevision.current = latest.revision;
        attemptRef.current = attempt;
        setPending(attempt);
      }
      if (!attempt) return;
      const result = await communityRequest(
        attempt.url,
        reviewMutationResponseSchema,
        mutationOptions(attempt),
      );
      const content = result.content;
      requireReviewScope(content, scope.workId, scope.id);
      if (
        attemptRevision.current === null ||
        content.revision !== attemptRevision.current + 1 ||
        content.state !== "DELETED" ||
        content.body.text !== null ||
        content.title.text !== null ||
        content.author !== null ||
        content.ratingHalfStars !== null ||
        content.spoilerContext !== null
      )
        throw new CommunityClientError(0, true);
      if (!mounted.current) return;
      attemptRef.current = null;
      attemptRevision.current = null;
      setPending(null);
      setOwned(null);
      setAck(false);
      setEditing(false);
      setMessage(t.withdrawn);
      onLockChange?.(false);
      onComplete("WITHDRAWN");
    } catch (error) {
      if (mounted.current) {
        const next =
          error instanceof CommunityClientError
            ? error
            : new CommunityClientError(0, true);
        setFailure(next);
        setMessage(errorCopy(next, locale));
        if (next.status === 409) setAck(false);
        if (!attemptRef.current) onLockChange?.(false);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function restart() {
    if (!ready || disabled || lock.current) throw new CommunityClientError(0);
    lock.current = true;
    setBusy(true);
    onLockChange?.(true);
    try {
      const latest = await metadata();
      if (!mounted.current) return;
      attemptRef.current = null;
      attemptRevision.current = null;
      setPending(null);
      setFailure(null);
      setOwned(latest);
      setAck(false);
      setEditing(false);
      setMessage("");
      onLockChange?.(false);
    } catch (error) {
      if (mounted.current) {
        setMessage(errorCopy(error, locale));
        if (!attemptRef.current && !editing) onLockChange?.(false);
      }
      throw error;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function complete() {
    setOwned(null);
    setAck(false);
    setEditing(false);
    setFailure(null);
    onLockChange?.(false);
    onComplete("UPDATED");
  }
  const editable =
    ready && !disabled && !busy && pending === null && failure?.status !== 409;
  return (
    <div className={styles.form}>
      {!editing && (
        <fieldset className={styles.form} disabled={!editable}>
          {!owned && (
            <button
              type="button"
              disabled={!editable}
              onClick={() => void check()}
            >
              {t.checkOwner}
            </button>
          )}
          {owned?.canEdit && (
            <button
              type="button"
              disabled={!editable}
              onClick={() => void check(true)}
            >
              {t.edit}
            </button>
          )}
          {owned?.canWithdraw && (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => {
                    if (editable && !lock.current) setAck(event.target.checked);
                  }}
                />
                {t.withdrawAck}
              </label>
              <button
                type="button"
                disabled={!editable || !ack}
                onClick={() => void withdraw()}
              >
                {t.withdraw}
              </button>
            </>
          )}
        </fieldset>
      )}
      {editing && owned && (
        <ReviewForm
          locale={locale}
          workId={scope.workId}
          editing={owned}
          onComplete={complete}
          onRestart={restart}
          onCancel={() => {
            if (!ready || disabled || lock.current) return;
            setEditing(false);
            setAck(false);
            onLockChange?.(false);
          }}
        />
      )}
      {message && (
        <p role={message === t.withdrawn ? "status" : "alert"}>{message}</p>
      )}
      {pending && failure?.uncertain && (
        <button
          type="button"
          disabled={!ready || disabled || busy}
          onClick={() => void withdraw(true)}
        >
          {t.retry}
        </button>
      )}
      {!editing && (failure?.status === 409 || (pending && failure)) && (
        <button
          type="button"
          disabled={!ready || disabled || busy}
          onClick={() => {
            void restart().catch(() => {});
          }}
        >
          {failure?.status === 409 ? t.loadOwned : t.newAttempt}
        </button>
      )}
    </div>
  );
}
