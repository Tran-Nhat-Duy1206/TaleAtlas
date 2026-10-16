"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { communityUuidSchema } from "../../features/community/contracts";
import {
  reviewCreateSchema,
  reviewEditSchema,
  reviewMutationResponseSchema,
  reviewOwnedSchema,
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
import { useCommunityReady } from "./useCommunityReady";
import styles from "./community.module.css";

export type ReviewFormProps = {
  locale: Locale;
  workId: string;
  /** Current, deliberately fetched ownership metadata ONLY. Never public/revealed text or rating. */
  editing?: ReviewOwnedDTO;
  onComplete: () => void;
  /** Reload current metadata before discarding any frozen/conflicting attempt. Must reject on read failure. */
  onRestart: () => Promise<void>;
  onCancel?: () => void;
};
export function ReviewForm(props: ReviewFormProps) {
  const work = communityUuidSchema.safeParse(props.workId);
  const owned =
    props.editing === undefined
      ? null
      : reviewOwnedSchema.safeParse(props.editing);
  if (
    !work.success ||
    work.data !== props.workId ||
    (owned &&
      (!owned.success ||
        owned.data.workId !== work.data ||
        !owned.data.canEdit ||
        !owned.data.workAvailable ||
        owned.data.authorState !== "ACTIVE" ||
        owned.data.moderationState !== "VISIBLE"))
  )
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  const editing = owned?.success ? owned.data : undefined;
  return (
    <ScopedReviewForm
      key={`${props.locale}:${props.workId}:${editing?.id ?? "new"}:${editing?.revision ?? 0}`}
      {...props}
      editing={editing}
    />
  );
}
function ScopedReviewForm({
  locale,
  workId,
  editing,
  onComplete,
  onRestart,
  onCancel,
}: ReviewFormProps) {
  const ready = useCommunityReady(),
    prefix = useId(),
    t = reviewCopy[locale];
  // Blank by construction. Even an unrated submission requires a fresh explicit choice.
  const [body, setBody] = useState(""),
    [context, setContext] = useState(""),
    [rating, setRating] = useState("");
  const [spoiler, setSpoiler] = useState(false),
    [intent, setIntent] = useState(false),
    [replacement, setReplacement] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [failure, setFailure] = useState<CommunityClientError | null>(null),
    [frozen, setFrozen] = useState<FrozenMutation | null>(null);
  const lock = useRef(false),
    attemptRef = useRef<FrozenMutation | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function blank() {
    setBody("");
    setContext("");
    setRating("");
    setSpoiler(false);
    setIntent(false);
    setReplacement(false);
  }
  async function send(attempt: FrozenMutation) {
    if (!ready || lock.current || attemptRef.current !== attempt) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFailure(null);
    try {
      const result = await communityRequest(
        attempt.url,
        reviewMutationResponseSchema,
        mutationOptions(attempt),
      );
      const content = result.content;
      requireReviewScope(content, workId, editing?.id);
      if (
        content.state !== "ACTIVE" ||
        (editing
          ? content.id !== editing.id ||
            (content.revision !== editing.revision + 1 &&
              content.revision !== editing.revision)
          : content.revision !== 1)
      )
        throw new CommunityClientError(0, true);
      if (!mounted.current) return;
      attemptRef.current = null;
      setFrozen(null);
      blank();
      setMessage(t.success);
      onComplete();
    } catch (error) {
      if (mounted.current) {
        const next =
          error instanceof CommunityClientError
            ? error
            : new CommunityClientError(0, true);
        setFailure(next);
        setMessage(errorCopy(next, locale));
        if (next.status === 409) {
          setIntent(false);
          setReplacement(false);
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guard BEFORE any field extraction, validation, UUID allocation or network operation.
    if (!ready || lock.current || attemptRef.current || failure?.status === 409)
      return;
    if (!intent || (editing && !replacement) || rating === "") {
      setMessage(t.invalid);
      return;
    }
    try {
      const fields = {
        body,
        bodySpoiler: spoiler,
        spoilerContext: context || null,
        rating: rating === "unrated" ? null : Number(rating),
        publicSubmissionAcknowledged: true,
        mutationKey: crypto.randomUUID(),
      };
      const attempt = editing
        ? freezeCommunityMutation(
            reviewEditSchema,
            {
              ...fields,
              contentKind: "REVIEW",
              expectedRevision: editing.revision,
            },
            `/api/community/works/${workId}/reviews/${editing.id}`,
            "PATCH",
          )
        : freezeCommunityMutation(
            reviewCreateSchema,
            fields,
            `/api/community/works/${workId}/reviews`,
            "POST",
          );
      attemptRef.current = attempt;
      setFrozen(attempt);
      void send(attempt);
    } catch {
      setMessage(t.invalid);
    }
  }
  async function restart() {
    if (!ready || lock.current || !attemptRef.current) return;
    lock.current = true;
    setBusy(true);
    try {
      // A confirmed conflict never starts another command without a current metadata read.
      await onRestart();
      if (mounted.current) {
        attemptRef.current = null;
        setFrozen(null);
        setFailure(null);
        setMessage("");
        blank();
      }
    } catch (error) {
      if (mounted.current) setMessage(errorCopy(error, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const editable = ready && !busy && frozen === null && failure?.status !== 409;
  return (
    <form
      className={styles.form}
      onSubmit={submit}
      aria-label={editing ? t.replacement : t.newReview}
    >
      <h2>{editing ? t.replacement : t.newReview}</h2>
      {editing && <p>{t.replacementRatingNotice}</p>}
      <fieldset disabled={!editable} className={styles.form}>
        <label htmlFor={`${prefix}-body`}>
          {t.reviewBody}
          <textarea
            id={`${prefix}-body`}
            required
            minLength={20}
            maxLength={8000}
            value={body}
            aria-describedby={`${prefix}-body-help`}
            onChange={(event) => {
              if (editable && !lock.current) setBody(event.target.value);
            }}
          />
        </label>
        <p id={`${prefix}-body-help`}>{t.reviewBodyHelp}</p>
        <label htmlFor={`${prefix}-rating`}>{t.rating}</label>
        <select
          id={`${prefix}-rating`}
          required
          value={rating}
          aria-describedby={`${prefix}-rating-help`}
          onChange={(event) => {
            if (editable && !lock.current) setRating(event.target.value);
          }}
        >
          <option value="" disabled>
            {t.chooseRating}
          </option>
          <option value="unrated">{t.unrated}</option>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((halfStars) => (
            <option key={halfStars} value={halfStars}>
              {new Intl.NumberFormat(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(halfStars / 2)}
            </option>
          ))}
        </select>
        <p id={`${prefix}-rating-help`}>{t.ratingHelp}</p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(event) => {
              if (editable && !lock.current) setSpoiler(event.target.checked);
            }}
          />
          {t.bodySpoiler}
        </label>
        <label htmlFor={`${prefix}-context`}>
          {t.context}
          <input
            id={`${prefix}-context`}
            value={context}
            maxLength={80}
            onChange={(event) => {
              if (editable && !lock.current) setContext(event.target.value);
            }}
          />
        </label>
        {editing && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={replacement}
              onChange={(event) => {
                if (editable && !lock.current)
                  setReplacement(event.target.checked);
              }}
            />
            {t.replacementIntent}
          </label>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={intent}
            onChange={(event) => {
              if (editable && !lock.current) setIntent(event.target.checked);
            }}
          />
          {t.intent}
        </label>
        <button
          type="submit"
          disabled={
            !editable || !intent || rating === "" || (!!editing && !replacement)
          }
        >
          {busy ? t.loading : editing ? t.save : t.submit}
        </button>
      </fieldset>
      {message && (
        <p role={failure || message === t.invalid ? "alert" : "status"}>
          {message}
        </p>
      )}
      {frozen && failure?.uncertain && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void send(frozen)}
        >
          {t.retry}
        </button>
      )}
      {frozen && failure && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void restart()}
        >
          {failure.status === 409 ? t.loadOwned : t.newAttempt}
        </button>
      )}
      {onCancel && !frozen && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            if (ready && !lock.current && !attemptRef.current) onCancel();
          }}
        >
          {t.cancel}
        </button>
      )}
    </form>
  );
}
