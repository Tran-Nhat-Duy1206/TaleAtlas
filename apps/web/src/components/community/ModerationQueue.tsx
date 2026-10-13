"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { z } from "zod";
import {
  moderationQueueResponseSchema,
  moderationQueueQuerySchema,
  moderationTargetSchema,
  requireModerationScope,
  type ModerationQueueDTO,
  type moderationQueueItemSchema,
  type moderationActionSchema,
} from "../../features/community/moderation-http-contracts";
import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import { ModerationEvidence } from "./ModerationEvidence";
import { ModerationHistory } from "./ModerationHistory";
import { ModerationActionForm } from "./ModerationActionForm";
import styles from "./community.module.css";

type Item = z.infer<typeof moderationQueueItemSchema>;
type Action = z.infer<typeof moderationActionSchema>;
type State = "OPEN" | "DISMISSED" | "UPHELD";
type Cursor = NonNullable<ModerationQueueDTO["nextCursor"]>;
export type ModerationQueueProps = {
  locale: Locale;
  initial: ModerationQueueDTO;
};
function validate(data: ModerationQueueDTO, state: State) {
  if (
    new Set(data.items.map((item) => item.id)).size !== data.items.length ||
    data.items.some((item) => item.state !== state)
  )
    throw new CommunityClientError(0, true);
}
export function ModerationQueue(props: ModerationQueueProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  if (source.initial !== props.initial)
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  try {
    validate(moderationQueueResponseSchema.parse(props.initial), "OPEN");
  } catch {
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  }
  return <ScopedQueue key={`${props.locale}:${source.epoch}`} {...props} />;
}
function ScopedQueue({ locale, initial }: ModerationQueueProps) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale],
    prefix = useId();
  const [data, setData] = useState<ModerationQueueDTO | null>(() =>
    moderationQueueResponseSchema.parse(initial),
  );
  const [filter, setFilter] = useState<State>("OPEN"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false),
    [actionLocked, setActionLocked] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    mounted = useRef(true),
    cursors = useRef<(Cursor | null)[]>([null]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load(nextPage = page, preserveSelected = false) {
    if (!ready || lock.current || nextPage < 1 || nextPage > 200)
      throw new CommunityClientError(0);
    const cursor =
      nextPage === 1
        ? null
        : nextPage === page + 1
          ? (data?.nextCursor ?? null)
          : (cursors.current[nextPage - 1] ?? null);
    if (nextPage > 1 && cursor === null) throw new CommunityClientError(400);
    lock.current = true;
    setBusy(true);
    if (!preserveSelected) setSelected(null);
    setData(null);
    setMessage("");
    try {
      const query = moderationQueueQuerySchema.parse({
        locale,
        state: filter,
        ...(cursor ? { cursor } : { page: 1 }),
      });
      const params = new URLSearchParams({ locale, state: query.state });
      if (query.cursor) {
        params.set("cursorId", query.cursor.id);
        params.set("cursorTimestamp", query.cursor.timestamp);
      }
      const result = await communityRequest(
        `/api/community/moderation/reports?${params}`,
        moderationQueueResponseSchema,
      );
      validate(result, filter);
      if (mounted.current) {
        cursors.current =
          nextPage === 1
            ? [null]
            : [...cursors.current.slice(0, nextPage - 1), cursor];
        setSelected(null);
        setData(result);
        setPage(nextPage);
        setActionLocked(false);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(errorCopy(error, locale));
        if (!preserveSelected) setActionLocked(false);
      }
      throw error;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function reload(nextPage = page) {
    if (ready && !actionLocked && !lock.current)
      void load(nextPage).catch(() => {});
  }
  function confirmed() {
    setSelected(null);
    setData(null);
    setActionLocked(false);
    setMessage(t.decisionSuccess);
    // No optimistic public DTO/statistics patch or implicit evidence/history read.
  }
  return (
    <section className={styles.community}>
      <h1>{t.moderation}</h1>
      <p>{t.moderatorNotice}</p>
      <h2>{t.queue}</h2>
      <fieldset
        className={styles.form}
        disabled={!ready || busy || actionLocked}
      >
        <label htmlFor={`${prefix}-filter`}>{t.filter}</label>
        <select
          id={`${prefix}-filter`}
          value={filter}
          onChange={(event) => {
            if (!ready || lock.current || actionLocked) return;
            const value = event.target.value;
            if (value !== "OPEN" && value !== "DISMISSED" && value !== "UPHELD")
              return;
            setFilter(value);
            setData(null);
            setSelected(null);
            setPage(1);
            cursors.current = [null];
            setMessage("");
          }}
        >
          <option value="OPEN">{t.open}</option>
          <option value="DISMISSED">{t.dismissed}</option>
          <option value="UPHELD">{t.upheld}</option>
        </select>
        <button
          type="button"
          disabled={!ready || busy || actionLocked}
          onClick={() => reload()}
        >
          {t.refresh}
        </button>
      </fieldset>
      {message && (
        <p role={message === t.decisionSuccess ? "status" : "alert"}>
          {message}
        </p>
      )}
      {busy && <p role="status">{t.loading}</p>}
      {data?.items.length === 0 && <p>{t.emptyReports}</p>}
      {data?.items.map((item) => (
        <article
          className={styles.card}
          key={item.id}
          aria-label={`${t.reportId} ${item.id}`}
        >
          <ReportMetadata locale={locale} item={item} />
          <button
            type="button"
            disabled={!ready || busy || actionLocked}
            onClick={() => {
              if (ready && !lock.current && !actionLocked) setSelected(item);
            }}
          >
            {t.selectTarget}
          </button>
        </article>
      ))}
      {selected && (
        <ModerationTargetPanel
          key={`${selected.id}:${selected.revision}:${selected.target.revision}`}
          locale={locale}
          item={selected}
          onLocked={setActionLocked}
          onReload={() => load(page, true)}
          onConfirmed={confirmed}
        />
      )}
      {data && (
        <nav className={styles.navigation} aria-label={t.pagination}>
          <button
            type="button"
            disabled={!ready || busy || actionLocked || page <= 1}
            onClick={() => reload(page - 1)}
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
              busy ||
              actionLocked ||
              page >= 200 ||
              data.nextCursor === null
            }
            onClick={() => reload(page + 1)}
          >
            {t.next}
          </button>
        </nav>
      )}
    </section>
  );
}
export function ReportMetadata({
  locale,
  item,
}: {
  locale: Locale;
  item: Item;
}) {
  const t = moderationCopy[locale],
    target = item.target;
  return (
    <>
      <dl className={styles.meta}>
        <dt>{t.reportId}</dt>
        <dd>{item.id}</dd>
        <dt>{t.reportState}</dt>
        <dd>
          {item.state === "OPEN"
            ? t.open
            : item.state === "DISMISSED"
              ? t.dismissed
              : t.upheld}
        </dd>
        <dt>{t.reportRevision}</dt>
        <dd>{item.revision}</dd>
        <dt>{t.work}</dt>
        <dd>{target.workId}</dd>
        <dt>{t.content}</dt>
        <dd>{target.id}</dd>
        <dt>{t.revision}</dt>
        <dd>{target.revision}</dd>
      </dl>
      <p>
        {target.kind === "THREAD"
          ? t.thread
          : target.kind === "REPLY"
            ? t.replyKind
            : t.reviewKind}
      </p>
      <p>{target.workAvailable ? t.available : t.unavailable}</p>
      <p>
        {target.authorState === "ACTIVE"
          ? t.active
          : target.authorState === "DELETED"
            ? t.deleted
            : t.erased}
      </p>
      <p>{target.moderationState === "VISIBLE" ? t.visible : t.hidden}</p>
      {item.evidenceRedacted && <p>{t.redacted}</p>}
    </>
  );
}
export function ModerationTargetPanel({
  locale,
  item,
  onReload,
  onConfirmed,
  onLocked,
}: {
  locale: Locale;
  item: Item;
  onReload: () => Promise<void>;
  onConfirmed: () => void;
  onLocked: (locked: boolean) => void;
}) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale];
  const [action, setAction] = useState<Action | undefined>(),
    [epoch, setEpoch] = useState(0),
    [formEpoch, setFormEpoch] = useState(0);
  const [invalid, setInvalid] = useState(false),
    [locked, setLocked] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const ref = useRef(false),
    decisionLocked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function invalidate(error?: unknown) {
    setAction(undefined);
    setEpoch((value) => value + 1);
    setInvalid(true);
    if (!decisionLocked.current) setFormEpoch((value) => value + 1);
    setMessage(error ? errorCopy(error, locale) : t.conflict);
  }
  async function refresh() {
    if (!ready || ref.current || locked) return;
    ref.current = true;
    setBusy(true);
    setAction(undefined);
    setEpoch((value) => value + 1);
    setFormEpoch((value) => value + 1);
    setInvalid(true);
    try {
      const result = await communityRequest(
        `/api/community/works/${item.target.workId}/contents/${item.target.id}/moderation/metadata?locale=${locale}&kind=${item.target.kind}`,
        moderationTargetSchema,
      );
      requireModerationScope(
        result,
        item.target.workId,
        item.target.id,
        item.target.kind,
      );
      if (result.revision < item.target.revision)
        throw new CommunityClientError(0, true);
      // Re-read queue metadata too: current report state/revision is never inferred from the target alone.
      await onReload();
    } catch (error) {
      if (mounted.current) setMessage(errorCopy(error, locale));
    } finally {
      ref.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className={styles.form}
      aria-label={`${t.content} ${item.target.id}`}
    >
      <h2>{t.metadataOnly}</h2>
      <ReportMetadata locale={locale} item={item} />
      <button
        type="button"
        disabled={!ready || busy || locked}
        onClick={() => void refresh()}
      >
        {t.refreshTarget}
      </button>
      {message && <p role="alert">{message}</p>}
      <ModerationEvidence
        key={`evidence:${epoch}:${action?.id ?? "none"}`}
        locale={locale}
        target={item.target}
        report={item}
        action={action}
        disabled={invalid || busy || locked}
        onFailure={invalidate}
      />
      <ModerationHistory
        key={`history:${epoch}`}
        locale={locale}
        target={item.target}
        disabled={invalid || busy || locked}
        onAction={(selected) => {
          if (ready && !invalid && !locked && !ref.current) {
            setAction(selected);
            setEpoch((value) => value + 1);
          }
        }}
        onFailure={invalidate}
      />
      <ModerationActionForm
        key={`decision:${formEpoch}`}
        locale={locale}
        item={item}
        disabled={invalid || busy}
        onLocked={(value) => {
          decisionLocked.current = value;
          setLocked(value);
          onLocked(value);
          if (value) {
            setAction(undefined);
            setEpoch((current) => current + 1);
          }
        }}
        onConfirmed={onConfirmed}
        onReload={onReload}
        onConflict={() => invalidate()}
      />
    </section>
  );
}
