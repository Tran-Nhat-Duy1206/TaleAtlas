"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { libraryCopy, statuses, type Status } from "./copy";
import { libraryCommand, LibraryRequestError } from "./transport";
import styles from "./library.module.css";
import { useEntryRevisionFence } from "./EntryRevisionScope";
export type EntryControlData = {
  id: string;
  workId: string;
  revision: number;
  status: Status;
  favorite: boolean;
  hasCompletedRead: boolean;
  currentSession: { state: string } | null;
};
export function EntryControls({
  entry,
  locale,
}: {
  entry: EntryControlData;
  locale: Locale;
}) {
  const t = libraryCopy[locale],
    router = useRouter(),
    scope = useEntryRevisionFence(entry.revision);
  const [status, setStatus] = useState(entry.status),
    [favorite, setFavorite] = useState(entry.favorite),
    [ack, setAck] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [awaitingRefresh, setAwaitingRefresh] = useState(false),
    [retryReady, setRetryReady] = useState(false),
    [error, setError] = useState(0),
    [saved, setSaved] = useState(false),
    [archived, setArchived] = useState(false);
  const pending = useRef<{ method: string; payload: string } | null>(null),
    lock = useRef(false),
    refreshFence = useRef(false);
  const unfinished =
    entry.currentSession &&
    ["ACTIVE", "PAUSED"].includes(entry.currentSession.state);
  const needsAck =
    entry.hasCompletedRead &&
    !unfinished &&
    status !== entry.status &&
    (status === "READING" || status === "COMPLETED");
  async function execute(method?: string) {
    if (
      lock.current ||
      refreshFence.current ||
      archived ||
      awaitingRefresh ||
      error === 409
    )
      return;
    if (
      !pending.current &&
      (!method ||
        (method === "DELETE" && !confirm) ||
        (method === "PATCH" && needsAck && !ack))
    )
      return;
    // Fence sibling editors before minting a command or dispatching a request.
    if (!scope.start()) return;
    if (!pending.current) {
      pending.current = {
        method,
        payload: JSON.stringify({
          revision: entry.revision,
          mutationKey: crypto.randomUUID(),
          ...(method === "DELETE"
            ? { confirmRemoval: true }
            : {
                patch: { status, favorite },
                ...(needsAck ? { acknowledgeReread: true } : {}),
              }),
        }),
      };
    }
    lock.current = true;
    setBusy(true);
    setError(0);
    setSaved(false);
    try {
      const command = pending.current;
      const result = await libraryCommand(
        `/api/library/${entry.id}?locale=${locale}`,
        command.method,
        command.payload,
      );
      if (
        result.id !== entry.id ||
        result.workId !== entry.workId ||
        result.revision < entry.revision ||
        result.archived !== (command.method === "DELETE")
      )
        throw new LibraryRequestError(0, true);
      scope.commit(result.revision, result.archived);
      pending.current = null;
      setRetryReady(false);
      if (command.method === "DELETE") setArchived(true);
      else {
        setSaved(true);
        if (result.revision !== entry.revision) {
          refreshFence.current = true;
          setAwaitingRefresh(true);
        }
        router.refresh();
      }
    } catch (cause) {
      const failure =
        cause instanceof LibraryRequestError
          ? cause
          : new LibraryRequestError(0, true);
      scope.fail(failure.ambiguous, failure.status);
      setError(failure.status || -1);
      setRetryReady(failure.ambiguous);
      if (!failure.ambiguous) pending.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (archived)
    return (
      <div role="status">
        <p>{t.archived}</p>
        <Link href={`/${locale}/library`}>{t.back}</Link>
      </div>
    );
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void execute("PATCH");
        }}
      >
        <fieldset
          disabled={
            scope.blocked ||
            busy ||
            awaitingRefresh ||
            retryReady ||
            error === 409
          }
        >
          <div className={styles.controls}>
            <label>
              {t.status}
              <select
                value={status}
                onChange={(e) => {
                  if (!scope.canEdit()) return;
                  setStatus(e.target.value as Status);
                  setAck(false);
                }}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {t.labels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            {t.favorite}
          </label>
          {status === "COMPLETED" && !unfinished && <p>{t.completedHint}</p>}
          {status === "ON_HOLD" && <p>{t.holdHint}</p>}
          {status === "DROPPED" && <p>{t.dropHint}</p>}
          {status === "WANT_TO_READ" && unfinished && <p>{t.planHint}</p>}
          {needsAck && (
            <>
              <p>{t.rereadHint}</p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                {t.reread}
              </label>
            </>
          )}
          <button disabled={needsAck && !ack}>
            {busy ? t.saving : t.save}
          </button>
        </fieldset>
      </form>
      <fieldset
        disabled={
          scope.blocked ||
          busy ||
          awaitingRefresh ||
          retryReady ||
          error === 409
        }
      >
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          {t.confirm}
        </label>
        <button
          type="button"
          disabled={!confirm}
          onClick={() => void execute("DELETE")}
        >
          {t.archive}
        </button>
      </fieldset>
      {busy && <p role="status">{t.saving}</p>}
      {!!error && (
        <p role="alert">
          {error === 409
            ? t.stale
            : error === 401 || error === 403
              ? t.denied
              : t.error}
        </p>
      )}
      {retryReady && !busy && (
        <button type="button" onClick={() => void execute()}>
          {t.retry}
        </button>
      )}
      {awaitingRefresh && <p role="status">{t.refreshing}</p>}
      {(error === 409 || awaitingRefresh) && (
        <button type="button" onClick={() => router.refresh()}>
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
      {saved && <p role="status">{t.saved}</p>}
    </div>
  );
}
