"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import type { Locale } from "@/lib/i18n";
import {
  readingSessionHistoryResponseSchema,
  readingProgressHistoryResponseSchema,
  readingEntryHistoryResponseSchema,
  type ReadingHttpProgressHistory,
  type ReadingHttpSession,
} from "@/features/library/reading-http-contracts";
import { readingRequest } from "./reading-transport";
import { readingCopy } from "./reading-copy";
import styles from "./reading.module.css";
const subscribe = () => () => {};
type Progress = ReadingHttpProgressHistory["items"][number];
function ProgressFields({
  value,
  locale,
}: {
  value: Pick<
    ReadingHttpSession,
    | "chapterNumber"
    | "chapterLabel"
    | "volumeNumber"
    | "volumeLabel"
    | "personalChapterTotal"
    | "progressNotes"
    | "editionId"
  >;
  locale: Locale;
}) {
  const t = readingCopy[locale];
  return (
    <dl>
      {(
        [
          "chapterNumber",
          "chapterLabel",
          "volumeNumber",
          "volumeLabel",
          "personalChapterTotal",
          "progressNotes",
        ] as const
      ).map((key) => (
        <div key={key}>
          <dt>{t[key]}</dt>
          <dd>{value[key] === "" ? t.none : (value[key] ?? t.none)}</dd>
        </div>
      ))}
      {value.editionId && (
        <div>
          <dt>{t.editionId}</dt>
          <dd>
            {t.unknownEdition}: {value.editionId}
          </dd>
        </div>
      )}
    </dl>
  );
}
function Records<T extends { id: string }>({
  url,
  schema,
  cursorKey,
  title,
  locale,
  renderRow,
}: {
  url: string;
  schema: z.ZodType<{ items: T[]; next: number | null }>;
  cursorKey: string;
  title: string;
  locale: Locale;
  renderRow: (item: T) => React.ReactNode;
}) {
  const hydrated = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
    ),
    t = readingCopy[locale];
  const [items, setItems] = useState<T[]>([]),
    [next, setNext] = useState<number | null>(null),
    [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const lock = useRef(false);
  async function load(older = false) {
    if (!hydrated || lock.current || (older && next === null)) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      const page = await readingRequest(
        `${url}?locale=${locale}${older ? `&${cursorKey}=${next}` : ""}`,
        schema,
      );
      if (older && page.next !== null && next !== null && page.next >= next)
        throw new Error("Invalid cursor");
      setItems((previous) => {
        const combined = older ? [...previous] : [];
        const ids = new Set(combined.map((item) => item.id));
        for (const item of page.items)
          if (!ids.has(item.id)) {
            combined.push(item);
            ids.add(item.id);
          }
        return combined;
      });
      setNext(page.next);
      setOpened(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {!opened && (
        <button
          type="button"
          disabled={!hydrated || busy}
          onClick={() => void load()}
        >
          {title}
        </button>
      )}
      {busy && <p role="status">{t.loading}</p>}
      {error && <p role="alert">{t.error}</p>}
      {opened && !items.length && <p>{t.empty}</p>}
      <ol>
        {items.map((item) => (
          <li key={item.id}>{renderRow(item)}</li>
        ))}
      </ol>
      {opened && next !== null && (
        <button type="button" disabled={busy} onClick={() => void load(true)}>
          {t.older}
        </button>
      )}
    </section>
  );
}
const sessionsSchema = readingSessionHistoryResponseSchema.transform((p) => ({
  items: p.items,
  next: p.nextBeforeSequence,
}));
const progressPageSchema = readingProgressHistoryResponseSchema.transform(
  (p) => ({ items: p.items, next: p.nextBeforeRevision }),
);
const eventsSchema = readingEntryHistoryResponseSchema.transform((p) => ({
  items: p.items,
  next: p.nextBeforeRevision,
}));
export function ReadingHistory({ id, locale }: { id: string; locale: Locale }) {
  const t = readingCopy[locale];
  return (
    <section className={styles.reading} aria-label={t.history}>
      <h2>{t.history}</h2>
      <Records
        url={`/api/library/${id}/sessions`}
        locale={locale}
        schema={sessionsSchema}
        cursorKey="beforeSequence"
        title={t.open}
        renderRow={(session) => (
          <>
            <h4>
              {session.sequence} ·{" "}
              {session.kind === "FIRST_READ" ? t.first : t.again} ·{" "}
              {t.states[session.state]}
            </h4>
            <dl>
              <dt>{t.startedOn}</dt>
              <dd>{session.startedOn ?? t.none}</dd>
              <dt>{t.finishedOn}</dt>
              <dd>{session.finishedOn ?? t.none}</dd>
              <dt>{t.notes}</dt>
              <dd>{session.notes || t.none}</dd>
              <dt>{t.recordedStart}</dt>
              <dd>
                <time>{session.startedAt ?? t.none}</time>
              </dd>
              <dt>{t.recordedComplete}</dt>
              <dd>
                <time>{session.completedAt ?? t.none}</time>
              </dd>
              <dt>{t.recordedClose}</dt>
              <dd>
                <time>{session.closedAt ?? t.none}</time>
              </dd>
              <dt>{t.recorded}</dt>
              <dd>
                <time>{session.lastActivityAt ?? t.none}</time>
              </dd>
            </dl>
            <ProgressFields value={session} locale={locale} />
            <Records<Progress>
              url={`/api/library/${id}/sessions/${session.id}/progress`}
              locale={locale}
              schema={progressPageSchema}
              cursorKey="beforeRevision"
              title={t.progressHistory}
              renderRow={(progress) => (
                <>
                  <p>
                    {t.recorded}: <time>{progress.recordedAt ?? t.none}</time>
                  </p>
                  <ProgressFields value={progress} locale={locale} />
                </>
              )}
            />
          </>
        )}
      />
      <Records
        url={`/api/library/${id}/history`}
        locale={locale}
        schema={eventsSchema}
        cursorKey="beforeRevision"
        title={t.events}
        renderRow={(event) => (
          <p>
            {event.revision} · {t.eventKinds[event.kind]} · {t.recorded}:{" "}
            <time>{event.recordedAt ?? t.none}</time>
          </p>
        )}
      />
    </section>
  );
}
