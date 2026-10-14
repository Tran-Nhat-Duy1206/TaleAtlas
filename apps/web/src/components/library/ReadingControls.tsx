"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import type { Locale } from "@/lib/i18n";
import type { ReadingHttpDetails } from "@/features/library/reading-http-contracts";
import {
  readingProgressSchema,
  readingSessionActionSchema,
} from "@/features/library/contracts";
import { readingCommand, ReadingRequestError } from "./reading-transport";
import { readingCopy } from "./reading-copy";
import styles from "./reading.module.css";
import { useEntryRevisionFence } from "./EntryRevisionScope";
const subscribe = () => () => {};
function RefreshBridge({
  targetRef,
}: {
  targetRef: { current: (() => void) | null };
}) {
  const router = useRouter();
  useEffect(() => {
    targetRef.current = () => router.refresh();
    return () => {
      targetRef.current = null;
    };
  }, [router, targetRef]);
  return null;
}
export function ReadingControls({
  entry,
  locale,
}: {
  entry: ReadingHttpDetails;
  locale: Locale;
}) {
  const hydrated = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
    ),
    refresh = useRef<(() => void) | null>(null),
    t = readingCopy[locale],
    session = entry.readingSession,
    scope = useEntryRevisionFence(entry.revision);
  const open =
    session && (session.state === "ACTIVE" || session.state === "PAUSED");
  const [fields, setFields] = useState({
    chapterNumber: String(session?.chapterNumber ?? ""),
    chapterLabel: session?.chapterLabel ?? "",
    volumeNumber: String(session?.volumeNumber ?? ""),
    volumeLabel: session?.volumeLabel ?? "",
    personalChapterTotal: String(session?.personalChapterTotal ?? ""),
    progressNotes: session?.progressNotes ?? "",
    editionId: session?.editionId ?? "",
  });
  const [startedOn, setStartedOn] = useState(
      open ? (session.startedOn ?? "") : "",
    ),
    [finishedOn, setFinishedOn] = useState(
      open ? (session.finishedOn ?? "") : "",
    ),
    [notes, setNotes] = useState(open ? session.notes : ""),
    [ack, setAck] = useState(false),
    [completion, setCompletion] = useState(false),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(false),
    [fenced, setFenced] = useState(false),
    [error, setError] = useState(0),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ url: string; body: string } | null>(null),
    lock = useRef(false),
    fence = useRef(false);
  const editions = entry.work.available
    ? entry.work.editions.filter(
        (edition) => z.uuid().safeParse(edition.id).success,
      )
    : [];
  const selectedKnown = editions.some((e) => e.id === fields.editionId);
  const disabled =
    scope.blocked ||
    !hydrated ||
    !!(entry.currentSession && !session) ||
    busy ||
    retry ||
    fenced ||
    error === 409;
  async function execute(
    action?: "PROGRESS" | "START_READ" | "START_REREAD" | "RESUME" | "COMPLETE",
  ) {
    if (!hydrated || lock.current || fence.current || error === 409) return;
    if (
      !pending.current &&
      (!action ||
        (action === "PROGRESS" && !open) ||
        (action === "COMPLETE" && !completion) ||
        (action === "START_REREAD" && !ack))
    )
      return;
    if (!scope.start()) return;
    if (!pending.current) {
      const commandFence = {
        revision: entry.revision,
        mutationKey: crypto.randomUUID(),
      };
      let payload: unknown;
      if (action === "PROGRESS") {
        if (!open) {
          scope.fail(false, 400);
          return;
        }
        const patch = {
          ...fields,
          chapterNumber:
            fields.chapterNumber === "" ? null : Number(fields.chapterNumber),
          volumeNumber:
            fields.volumeNumber === "" ? null : Number(fields.volumeNumber),
          personalChapterTotal:
            fields.personalChapterTotal === ""
              ? null
              : Number(fields.personalChapterTotal),
          chapterLabel: fields.chapterLabel || null,
          volumeLabel: fields.volumeLabel || null,
          progressNotes: fields.progressNotes || null,
          editionId: fields.editionId || null,
        };
        const parsed = readingProgressSchema.safeParse({
          ...commandFence,
          sessionId: session.id,
          patch,
        });
        if (!parsed.success) {
          scope.fail(false, 400);
          setError(400);
          return;
        }
        payload = parsed.data;
      } else {
        const command = {
          ...commandFence,
          action,
          ...(action === "RESUME" || action === "COMPLETE"
            ? { sessionId: session?.id }
            : {}),
          ...(action === "START_REREAD" ? { acknowledgeReread: true } : {}),
          ...(action === "RESUME" ? { notes } : {}),
          ...(action !== "RESUME"
            ? {
                ...(action === "COMPLETE" || notes ? { notes } : {}),
                ...(startedOn
                  ? { startedOn }
                  : action === "COMPLETE" && session?.startedOn
                    ? { startedOn: null }
                    : {}),
                ...(action === "COMPLETE"
                  ? finishedOn
                    ? { finishedOn }
                    : session?.finishedOn
                      ? { finishedOn: null }
                      : {}
                  : {}),
              }
            : {}),
        };
        const parsed = readingSessionActionSchema.safeParse(command);
        if (
          !parsed.success ||
          (action === "COMPLETE" && finishedOn && startedOn > finishedOn)
        ) {
          scope.fail(false, 400);
          setError(400);
          return;
        }
        payload = {
          ...parsed.data,
          ...(action === "COMPLETE" ? { confirmCompletion: true } : {}),
        };
      }
      pending.current = {
        url: `/api/library/${entry.id}/${action === "PROGRESS" ? "progress" : "sessions"}?locale=${locale}`,
        body: JSON.stringify(payload),
      };
    }
    lock.current = true;
    setBusy(true);
    setError(0);
    setSaved(false);
    try {
      const result = await readingCommand(
        pending.current.url,
        pending.current.body,
      );
      if (
        result.id !== entry.id ||
        result.workId !== entry.workId ||
        result.work.id !== entry.workId ||
        result.revision < entry.revision ||
        result.archived
      )
        throw new ReadingRequestError(0, true);
      scope.commit(result.revision);
      pending.current = null;
      setRetry(false);
      setSaved(true);
      if (result.revision > entry.revision) {
        fence.current = true;
        setFenced(true);
        refresh.current?.();
      }
    } catch (cause) {
      const failure =
        cause instanceof ReadingRequestError
          ? cause
          : new ReadingRequestError(0, true);
      scope.fail(failure.ambiguous, failure.status);
      setError(failure.status || -1);
      setRetry(failure.ambiguous);
      if (!failure.ambiguous) pending.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.reading} aria-label={t.heading}>
      {hydrated && <RefreshBridge targetRef={refresh} />}
      <h2>{t.heading}</h2>
      {session && (
        <p>
          {session.kind === "FIRST_READ" ? t.first : t.again} ·{" "}
          {t.states[session.state]} · {t.recorded}:{" "}
          <time>{session.lastActivityAt ?? t.none}</time>
        </p>
      )}
      {open && (
        <form
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) void execute("PROGRESS");
          }}
        >
          <fieldset disabled={disabled}>
            <legend>{t.heading}</legend>
            <div className={styles.grid}>
              {(
                [
                  "chapterNumber",
                  "chapterLabel",
                  "volumeNumber",
                  "volumeLabel",
                  "personalChapterTotal",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {t[key]}
                  <input
                    type={
                      key.endsWith("Number") || key === "personalChapterTotal"
                        ? "number"
                        : "text"
                    }
                    min={key === "personalChapterTotal" ? 1 : 0}
                    max={
                      key === "volumeNumber"
                        ? 100000
                        : key.endsWith("Number") ||
                            key === "personalChapterTotal"
                          ? 1000000
                          : undefined
                    }
                    maxLength={200}
                    value={scope.blocked ? "" : fields[key]}
                    onChange={(e) => {
                      if (!scope.canEdit()) return;
                      setFields({ ...fields, [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
              <label>
                {t.editionId}
                <select
                  value={scope.blocked ? "" : fields.editionId}
                  onChange={(e) => {
                    if (!scope.canEdit()) return;
                    setFields({ ...fields, editionId: e.target.value });
                  }}
                >
                  <option value="">{t.none}</option>
                  {fields.editionId && !selectedKnown && (
                    <option value={fields.editionId}>{t.unknownEdition}</option>
                  )}
                  {editions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title || e.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.progressNotes}
                <textarea
                  maxLength={2000}
                  value={scope.blocked ? "" : fields.progressNotes}
                  onChange={(e) => {
                    if (!scope.canEdit()) return;
                    setFields({ ...fields, progressNotes: e.target.value });
                  }}
                />
              </label>
            </div>
            {!entry.work.available && <p>{t.hiddenEdition}</p>}
            <button>{t.save}</button>
          </fieldset>
        </form>
      )}
      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <fieldset disabled={disabled}>
          <legend>{t.sessions}</legend>
          <p>{t.datesHint}</p>
          <div className={styles.grid}>
            <label>
              {t.startedOn}
              <input
                type="date"
                value={scope.blocked ? "" : startedOn}
                onChange={(e) => {
                  if (scope.canEdit()) setStartedOn(e.target.value);
                }}
              />
            </label>
            {open && (
              <label>
                {t.finishedOn}
                <input
                  type="date"
                  value={scope.blocked ? "" : finishedOn}
                  onChange={(e) => {
                    if (scope.canEdit()) setFinishedOn(e.target.value);
                  }}
                />
              </label>
            )}
            <label>
              {t.notes}
              <textarea
                maxLength={2000}
                value={scope.blocked ? "" : notes}
                onChange={(e) => {
                  if (scope.canEdit()) setNotes(e.target.value);
                }}
              />
            </label>
          </div>
          <div className={styles.actions}>
            {!open && !entry.hasCompletedRead && (
              <button type="button" onClick={() => void execute("START_READ")}>
                {t.start}
              </button>
            )}
            {!open && entry.hasCompletedRead && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  {t.rereadAck}
                </label>
                <button
                  type="button"
                  disabled={!ack}
                  onClick={() => void execute("START_REREAD")}
                >
                  {t.reread}
                </button>
              </>
            )}
            {session?.state === "PAUSED" && (
              <button type="button" onClick={() => void execute("RESUME")}>
                {t.resume}
              </button>
            )}
            {open && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={completion}
                    onChange={(e) => setCompletion(e.target.checked)}
                  />
                  {t.completeAck}
                </label>
                <button
                  type="button"
                  disabled={!completion}
                  onClick={() => void execute("COMPLETE")}
                >
                  {t.complete}
                </button>
              </>
            )}
          </div>
        </fieldset>
      </form>
      {busy && <p role="status">{t.saving}</p>}
      {error !== 0 && (
        <p role="alert">
          {error === 409
            ? t.stale
            : error === 401 || error === 403
              ? t.denied
              : error === 400
                ? t.invalid
                : t.error}
        </p>
      )}
      {retry && !busy && (
        <button type="button" onClick={() => void execute()}>
          {t.retry}
        </button>
      )}
      {(fenced || error === 409) && (
        <button type="button" onClick={() => refresh.current?.()}>
          {t.refresh}
        </button>
      )}
      {(error === 401 || error === 403) && (
        <Link
          href={`/${locale}/login?callbackURL=${encodeURIComponent(`/${locale}/library/${entry.id}`)}`}
        >
          {t.login}
        </Link>
      )}
      {fenced ? (
        <p role="status">{t.refreshing}</p>
      ) : (
        saved && <p role="status">{t.saved}</p>
      )}
    </section>
  );
}
