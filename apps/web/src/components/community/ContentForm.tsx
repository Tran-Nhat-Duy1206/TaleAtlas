"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  communityThreadCreateSchema,
  communityReplyCreateSchema,
  communityEditSchema,
} from "../../features/community/contracts";
import { discussionMutationResponseSchema } from "../../features/community/http-contracts";
import type { CommunityPublicDTO } from "../../features/community/projection";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import {
  assertDiscussionScope,
  CommunityClientError,
  communityRequest,
  errorCopy,
  freezeCommunityMutation,
  mutationOptions,
  type FrozenMutation,
} from "./client";
import styles from "./community.module.css";

type Props = {
  locale: Locale;
  workId: string;
  kind: "THREAD" | "REPLY";
  threadId?: string;
  parentId?: string | null;
  depth?: number;
  editing?: CommunityPublicDTO;
  onComplete: () => void;
  onCancel?: () => void;
};
export function ContentForm({
  locale,
  workId,
  kind,
  threadId,
  parentId = null,
  depth = 0,
  editing,
  onComplete,
  onCancel,
}: Props) {
  const t = communityCopy[locale],
    prefix = useId();
  // Intentionally blank, including when editing flagged content. No reveal cache/private data is consulted.
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [context, setContext] = useState("");
  const [titleSpoiler, setTitleSpoiler] = useState(false),
    [bodySpoiler, setBodySpoiler] = useState(false),
    [intent, setIntent] = useState(false),
    [replaceIntent, setReplaceIntent] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState<CommunityClientError | null>(null),
    [frozen, setFrozen] = useState<FrozenMutation | null>(null);
  const inFlight = useRef(false),
    attemptRef = useRef<FrozenMutation | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function send(attempt: FrozenMutation) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setFailure(null);
    try {
      const result = await communityRequest(
        attempt.url,
        discussionMutationResponseSchema,
        mutationOptions(attempt),
      );
      assertDiscussionScope(result.content, {
        workId,
        kind,
        id: editing?.id,
        revision: editing?.revision,
        allowUnchangedRevision: editing !== undefined,
        threadId:
          kind === "REPLY" ? (editing?.threadId ?? threadId) : undefined,
        parentId:
          kind === "REPLY"
            ? editing
              ? editing.parentId
              : parentId
            : undefined,
        depth:
          kind === "REPLY"
            ? editing
              ? (editing.depth ?? undefined)
              : depth
            : undefined,
      });
      if (
        result.content.state !== "ACTIVE" ||
        (!editing && result.content.revision !== 1)
      )
        throw new CommunityClientError(409);
      if (!mounted.current) return;
      attemptRef.current = null;
      setFrozen(null);
      setTitle("");
      setBody("");
      setContext("");
      setTitleSpoiler(false);
      setBodySpoiler(false);
      setIntent(false);
      setReplaceIntent(false);
      setMessage(t.success);
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
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || attemptRef.current) return;
    if (!intent || (editing && !replaceIntent)) {
      setMessage(t.invalid);
      return;
    }
    try {
      const fields = {
        body,
        bodySpoiler,
        spoilerContext: context || null,
        publicSubmissionAcknowledged: true,
        mutationKey: crypto.randomUUID(),
        ...(kind === "THREAD" ? { title, titleSpoiler } : {}),
      };
      const attempt = editing
        ? freezeCommunityMutation(
            communityEditSchema,
            {
              ...fields,
              contentKind: kind,
              expectedRevision: editing.revision,
            },
            `/api/community/works/${workId}/contents/${editing.id}`,
            "PATCH",
          )
        : kind === "THREAD"
          ? freezeCommunityMutation(
              communityThreadCreateSchema,
              fields,
              `/api/community/works/${workId}/threads`,
              "POST",
            )
          : freezeCommunityMutation(
              communityReplyCreateSchema,
              { ...fields, threadId, parentId, depth },
              `/api/community/works/${workId}/threads/${threadId}/replies`,
              "POST",
            );
      attemptRef.current = attempt;
      setFrozen(attempt);
      await send(attempt);
    } catch {
      setMessage(t.invalid);
    }
  }
  return (
    <form
      className={styles.form}
      onSubmit={(e) => void submit(e)}
      aria-label={
        editing ? t.replacement : kind === "THREAD" ? t.newThread : t.reply
      }
    >
      <h2>
        {editing ? t.replacement : kind === "THREAD" ? t.newThread : t.reply}
      </h2>
      <fieldset disabled={busy || frozen !== null} className={styles.form}>
        {kind === "THREAD" && (
          <>
            <label htmlFor={`${prefix}-title`}>
              {t.title}
              <input
                id={`${prefix}-title`}
                value={title}
                required
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={titleSpoiler}
                onChange={(e) => setTitleSpoiler(e.target.checked)}
              />
              {t.titleSpoiler}
            </label>
          </>
        )}
        <label htmlFor={`${prefix}-body`}>
          {t.body}
          <textarea
            id={`${prefix}-body`}
            required
            maxLength={kind === "REPLY" ? 4000 : 8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={bodySpoiler}
            onChange={(e) => setBodySpoiler(e.target.checked)}
          />
          {t.bodySpoiler}
        </label>
        <label htmlFor={`${prefix}-context`}>
          {t.context}
          <input
            id={`${prefix}-context`}
            value={context}
            maxLength={80}
            onChange={(e) => setContext(e.target.value)}
          />
        </label>
        {editing && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={replaceIntent}
              onChange={(e) => setReplaceIntent(e.target.checked)}
            />
            {t.replacementIntent}
          </label>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={intent}
            onChange={(e) => setIntent(e.target.checked)}
          />
          {t.intent}
        </label>
        <button
          type="submit"
          disabled={!intent || (!!editing && !replaceIntent)}
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
        <button type="button" disabled={busy} onClick={() => void send(frozen)}>
          {t.retry}
        </button>
      )}
      {frozen && failure && !failure.uncertain && failure.status !== 409 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            attemptRef.current = null;
            setFrozen(null);
            setFailure(null);
            setMessage("");
          }}
        >
          {t.newAttempt}
        </button>
      )}
      {failure?.status === 409 && (
        <button type="button" disabled={busy} onClick={onComplete}>
          {t.refresh}
        </button>
      )}
      {onCancel && !frozen && (
        <button type="button" onClick={onCancel}>
          {t.cancel}
        </button>
      )}
    </form>
  );
}
