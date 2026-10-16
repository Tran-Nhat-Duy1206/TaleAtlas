"use client";
import { useEffect, useRef, useState } from "react";
import {
  moderationTargetSchema,
  moderationHistoryQuerySchema,
  moderationHistoryResponseSchema,
  requireModerationScope,
  type ModerationTargetDTO,
  type ModerationHistoryDTO,
  type moderationActionSchema,
} from "../../features/community/moderation-http-contracts";
import type { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import styles from "./community.module.css";

type Action = z.infer<typeof moderationActionSchema>;
export function ModerationHistory(props: {
  locale: Locale;
  target: ModerationTargetDTO;
  disabled?: boolean;
  onAction: (action: Action) => void;
  onFailure: (error: unknown) => void;
}) {
  const parsed = moderationTargetSchema.safeParse(props.target);
  if (!parsed.success)
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  return (
    <ScopedHistory
      key={`${props.locale}:${parsed.data.workId}:${parsed.data.id}:${parsed.data.revision}`}
      {...props}
      target={parsed.data}
    />
  );
}
function ScopedHistory({
  locale,
  target,
  disabled = false,
  onAction,
  onFailure,
}: {
  locale: Locale;
  target: ModerationTargetDTO;
  disabled?: boolean;
  onAction: (action: Action) => void;
  onFailure: (error: unknown) => void;
}) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale];
  const [history, setHistory] = useState<ModerationHistoryDTO | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const lock = useRef(false),
    mounted = useRef(true),
    cursors = useRef<(number | null)[]>([null]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load(stream: "EVENTS" | "ACTIONS", nextPage = 1) {
    if (!ready || disabled || lock.current || nextPage < 1 || nextPage > 200)
      return;
    const cursor =
      nextPage === 1
        ? null
        : nextPage === page + 1 && history?.stream === stream
          ? history.nextCursor
          : (cursors.current[nextPage - 1] ?? null);
    if (nextPage > 1 && cursor === null) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setHistory(null);
    try {
      const query = moderationHistoryQuerySchema.parse({
        locale,
        kind: target.kind,
        expectedRevision: target.revision,
        stream,
        ...(cursor === null ? { page: 1 } : { cursor }),
      });
      const params = new URLSearchParams({
        locale,
        kind: query.kind,
        expectedRevision: String(query.expectedRevision),
        stream: query.stream,
      });
      if (query.cursor !== undefined)
        params.set("cursor", String(query.cursor));
      const result = await communityRequest(
        `/api/community/works/${target.workId}/contents/${target.id}/moderation/history?${params}`,
        moderationHistoryResponseSchema,
      );
      requireModerationScope(
        result.content,
        target.workId,
        target.id,
        target.kind,
      );
      if (
        result.content.revision !== target.revision ||
        result.stream !== stream ||
        new Set(result.items.map((item) => item.id)).size !==
          result.items.length
      )
        throw new CommunityClientError(0, true);
      if (mounted.current) {
        cursors.current =
          nextPage === 1
            ? [null]
            : [...cursors.current.slice(0, nextPage - 1), cursor];
        setPage(nextPage);
        setHistory(result);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(errorCopy(error, locale));
        onFailure(error);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className={styles.form}>
      <h3>{t.history}</h3>
      <p>{t.metadataOnly}</p>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!ready || disabled || busy}
          onClick={() => void load("EVENTS")}
        >
          {t.events}
        </button>
        <button
          type="button"
          disabled={!ready || disabled || busy}
          onClick={() => void load("ACTIONS")}
        >
          {t.actions}
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
      {history?.items.length === 0 && <p>{t.emptyHistory}</p>}
      {history?.stream === "EVENTS" &&
        history.items.map((item) => (
          <dl key={item.id} className={styles.meta}>
            <dt>{t.content}</dt>
            <dd>{item.id}</dd>
            <dt>{t.eventRevision}</dt>
            <dd>{item.contentRevision}</dd>
            <dt>{t.action}</dt>
            <dd>{item.command}</dd>
            <dt>{t.authorState}</dt>
            <dd>
              {item.beforeAuthorState} → {item.afterAuthorState}
            </dd>
            <dt>{t.moderationState}</dt>
            <dd>
              {item.beforeModerationState} → {item.afterModerationState}
            </dd>
            <dt>{t.occurredAt}</dt>
            <dd>
              <time dateTime={item.createdAt}>{item.createdAt}</time>
            </dd>
          </dl>
        ))}
      {history?.stream === "ACTIONS" &&
        history.items.map((item) => (
          <article key={item.id} className={styles.card}>
            <dl className={styles.meta}>
              <dt>{t.actionId}</dt>
              <dd>{item.id}</dd>
              <dt>{t.sequence}</dt>
              <dd>{item.sequence}</dd>
              <dt>{t.eventRevision}</dt>
              <dd>{item.contentRevision}</dd>
              <dt>{t.action}</dt>
              <dd>{item.action}</dd>
              <dt>{t.occurredAt}</dt>
              <dd>
                <time dateTime={item.createdAt}>{item.createdAt}</time>
              </dd>
            </dl>
            {item.evidenceRedacted && <p>{t.redacted}</p>}
            <button
              type="button"
              disabled={!ready || disabled || busy}
              onClick={() => {
                if (ready && !disabled && !lock.current) onAction(item);
              }}
            >
              {t.actionReasonEvidence}
            </button>
          </article>
        ))}
      {history && (
        <nav className={styles.navigation} aria-label={t.pagination}>
          <button
            type="button"
            disabled={!ready || disabled || busy || page <= 1}
            onClick={() => void load(history.stream, page - 1)}
          >
            {t.previous}
          </button>
          <span>
            {t.page} {page}
          </span>
          <button
            type="button"
            disabled={
              !ready ||
              disabled ||
              busy ||
              page >= 200 ||
              history.nextCursor === null
            }
            onClick={() => void load(history.stream, page + 1)}
          >
            {t.next}
          </button>
        </nav>
      )}
    </section>
  );
}
