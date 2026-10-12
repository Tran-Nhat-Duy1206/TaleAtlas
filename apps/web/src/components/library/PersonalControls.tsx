"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  personalHttpPatchSchema,
  type PersonalHttpDetails,
} from "@/features/library/personal-http-contracts";
import {
  personalLoad,
  personalCommand,
  PersonalRequestError,
} from "./personal-transport";
import { personalCopy, personalRatings } from "./personal-copy";
import styles from "./personal.module.css";
const subscribe = () => () => {};
export type PersonalControlSeed = Pick<
  PersonalHttpDetails,
  "id" | "workId" | "revision" | "archived"
>;
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
export function PersonalControls({
  seed,
  locale,
}: {
  seed: PersonalControlSeed;
  locale: Locale;
}) {
  const hydrated = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
    ),
    t = personalCopy[locale],
    refresh = useRef<(() => void) | null>(null);
  const loadIdentity = `${seed.id}:${seed.workId}:${seed.revision}:${seed.archived}:${locale}`;
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null),
    [loadBusy, setLoadBusy] = useState(!seed.archived),
    [loadError, setLoadError] = useState(0),
    [loadAttempt, setLoadAttempt] = useState(0);
  const loaded = loadedIdentity === loadIdentity;
  const [rating, setRating] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(false),
    [fenced, setFenced] = useState(false),
    [error, setError] = useState(0),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ url: string; body: string } | null>(null),
    lock = useRef(false),
    fence = useRef(false);
  const disabled =
    !hydrated ||
    !loaded ||
    seed.archived ||
    busy ||
    retry ||
    fenced ||
    error === 409;
  useEffect(() => {
    if (!hydrated || seed.archived) return;
    let active = true;
    const controller = new AbortController();
    void personalLoad(
      `/api/library/${seed.id}/personal?locale=${locale}`,
      controller.signal,
    )
      .then((result) => {
        if (!active) return;
        if (
          result.id !== seed.id ||
          result.workId !== seed.workId ||
          result.revision < seed.revision ||
          result.archived
        )
          throw new PersonalRequestError(0, true);
        if (result.revision > seed.revision) {
          fence.current = true;
          setFenced(true);
          refresh.current?.();
          return;
        }
        setRating(
          result.ratingHalfStars === null ? "" : String(result.ratingHalfStars),
        );
        setNotes(result.notes);
        setLoadedIdentity(loadIdentity);
      })
      .catch((cause) => {
        if (!active) return;
        const failure =
          cause instanceof PersonalRequestError
            ? cause
            : new PersonalRequestError(0, true);
        setLoadError(failure.status || -1);
      })
      .finally(() => {
        if (active) setLoadBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    hydrated,
    seed.id,
    seed.workId,
    seed.revision,
    seed.archived,
    locale,
    loadAttempt,
    loadIdentity,
  ]);
  async function execute() {
    if (
      !hydrated ||
      !loaded ||
      seed.archived ||
      lock.current ||
      fence.current ||
      error === 409
    )
      return;
    if (!pending.current) {
      const input = {
        revision: seed.revision,
        mutationKey: crypto.randomUUID(),
        patch: {
          ratingHalfStars: rating === "" ? null : Number(rating),
          notes,
        },
      };
      const parsed = personalHttpPatchSchema.safeParse(input);
      if (!parsed.success) {
        setError(400);
        setSaved(false);
        return;
      }
      pending.current = {
        url: `/api/library/${seed.id}/personal?locale=${locale}`,
        body: JSON.stringify(parsed.data),
      };
    }
    lock.current = true;
    setBusy(true);
    setError(0);
    setSaved(false);
    try {
      const result = await personalCommand(
        pending.current.url,
        pending.current.body,
      );
      if (
        result.id !== seed.id ||
        result.workId !== seed.workId ||
        result.revision < seed.revision ||
        result.archived
      )
        throw new PersonalRequestError(0, true);
      pending.current = null;
      setRetry(false);
      setSaved(true);
      if (result.revision > seed.revision) {
        fence.current = true;
        setFenced(true);
        refresh.current?.();
      }
    } catch (cause) {
      const failure =
        cause instanceof PersonalRequestError
          ? cause
          : new PersonalRequestError(0, true);
      setError(failure.status || -1);
      setRetry(failure.ambiguous);
      if (!failure.ambiguous) pending.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function changed() {
    setSaved(false);
    setError(0);
  }
  const failureStatus = error || loadError;
  return (
    <section className={styles.personal} aria-label={t.heading}>
      {hydrated && <RefreshBridge targetRef={refresh} />}
      <h2>{t.heading}</h2>
      <p>{t.privacy}</p>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) void execute();
        }}
      >
        <fieldset disabled={disabled}>
          <legend>{t.heading}</legend>
          <div className={styles.fields}>
            <label>
              {t.rating}
              <select
                value={loaded ? rating : ""}
                onChange={(event) => {
                  setRating(event.target.value);
                  changed();
                }}
              >
                <option value="">
                  {loaded
                    ? t.none
                    : seed.archived || loadError || fenced
                      ? t.unavailable
                      : t.loading}
                </option>
                {personalRatings.map((value) => (
                  <option key={value} value={value}>
                    {t.ratings[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.notes}
              <textarea
                maxLength={4000}
                value={loaded ? notes : ""}
                placeholder={loaded ? undefined : t.loading}
                onChange={(event) => {
                  setNotes(event.target.value);
                  changed();
                }}
                aria-describedby={`personal-notes-count-${seed.id}`}
              />
            </label>
          </div>
          {loaded && (
            <p id={`personal-notes-count-${seed.id}`}>
              {notes.length} / 4000 {t.count}
            </p>
          )}
          <button>{t.save}</button>
        </fieldset>
      </form>
      {seed.archived && <p role="status">{t.archived}</p>}
      {!loaded && !seed.archived && !loadError && !fenced && (
        <p role="status">{t.loading}</p>
      )}
      {busy && <p role="status">{t.saving}</p>}
      {failureStatus !== 0 && (
        <p role="alert">
          {failureStatus === 409
            ? t.stale
            : failureStatus === 401 || failureStatus === 403
              ? t.denied
              : failureStatus === 404
                ? t.unavailable
                : failureStatus === 400
                  ? t.invalid
                  : t.error}
        </p>
      )}
      {loadError !== 0 && !loadBusy && !fenced && (
        <button
          type="button"
          onClick={() => {
            setLoadedIdentity(null);
            setLoadBusy(true);
            setLoadError(0);
            setLoadAttempt((value) => value + 1);
          }}
        >
          {t.load}
        </button>
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
      {(failureStatus === 401 || failureStatus === 403) && (
        <Link
          href={`/${locale}/login?callbackURL=${encodeURIComponent(`/${locale}/library/${seed.id}`)}`}
        >
          {t.login}
        </Link>
      )}
      {fenced ? (
        <p role="status">{saved ? t.refreshing : t.stale}</p>
      ) : (
        saved && <p role="status">{t.saved}</p>
      )}
    </section>
  );
}
