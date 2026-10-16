"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  reviewPublicSchema,
  reviewRevealSchema,
  reviewRevealResponseSchema,
  requireReviewScope,
  type ReviewPublicDTO,
} from "../../features/community/review-http-contracts";
import type { Locale } from "../../lib/i18n";
import { reviewCopy } from "../../lib/review-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import styles from "./community.module.css";

export type ReviewBodyProps = {
  locale: Locale;
  content: ReviewPublicDTO;
  refreshToken?: number;
};
/** Reveal text is local read-only state, never an editor source or shared cache. */
export function ReviewBody(props: ReviewBodyProps) {
  const parsed = reviewPublicSchema.safeParse(props.content);
  if (!parsed.success)
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  const content = parsed.data;
  return (
    <ScopedReviewBody
      key={`${props.locale}:${content.workId}:${content.id}:${content.revision}:${content.state}:${content.body.state}:${props.refreshToken ?? 0}`}
      {...props}
      content={content}
    />
  );
}
function ScopedReviewBody({ locale, content }: ReviewBodyProps) {
  const ready = useCommunityReady(),
    id = useId(),
    t = reviewCopy[locale];
  const [revealed, setRevealed] = useState<{
    body: string;
    context?: string;
  } | null>(null);
  const [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (content.state !== "ACTIVE" || content.body.state === "UNAVAILABLE")
    return null;
  if (content.body.state === "VISIBLE")
    return <p className={styles.prose}>{content.body.text}</p>;
  if (revealed)
    return (
      <div>
        <p className={styles.prose}>{revealed.body}</p>
        {revealed.context !== undefined && (
          <p className={styles.prose}>{revealed.context}</p>
        )}
      </div>
    );
  async function reveal() {
    if (!ready || !ack || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = reviewRevealSchema.parse({
        workId: content.workId,
        targetId: content.id,
        contentKind: "REVIEW",
        expectedRevision: content.revision,
        title: false,
        body: true,
        spoilerRevealAcknowledged: true,
      });
      const result = await communityRequest(
        `/api/community/works/${content.workId}/reviews/${content.id}/reveal`,
        reviewRevealResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      requireReviewScope(result, content.workId, content.id);
      if (
        result.revision !== content.revision ||
        typeof result.body !== "string"
      )
        throw new CommunityClientError(0, true);
      if (mounted.current) {
        setRevealed({ body: result.body, context: result.spoilerContext });
        setAck(false);
      }
    } catch (failure) {
      if (mounted.current) setError(errorCopy(failure, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={styles.masked}>
      <p>{t.maskedBody}</p>
      <fieldset disabled={!ready || busy} className={styles.form}>
        <label className={styles.check} htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={ack}
            onChange={(event) => {
              if (ready && !lock.current) setAck(event.target.checked);
            }}
          />
          {t.revealAck}
        </label>
        <button
          type="button"
          disabled={!ready || !ack || busy}
          onClick={() => void reveal()}
        >
          {busy ? t.loading : t.revealBody}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
