"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { libraryCopy } from "./copy";
import {
  libraryCommand,
  LibraryRequestError,
  ownStateSchema,
  type OwnState,
} from "./transport";
import styles from "./library.module.css";
export function OwnWorkLibrary({
  workId,
  locale,
}: {
  workId: string;
  locale: Locale;
  slug: string;
}) {
  const t = libraryCopy[locale];
  const [state, setState] = useState<OwnState | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [retryReady, setRetryReady] = useState(false),
    [error, setError] = useState(0),
    [generation, setGeneration] = useState(0);
  const pending = useRef<string | null>(null),
    lock = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/library/work/${workId}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new LibraryRequestError(response.status);
        const data: unknown = await response.json();
        const value = data === null ? null : ownStateSchema.parse(data);
        if (active) setState(value);
      } catch (cause) {
        if (active)
          setError(cause instanceof LibraryRequestError ? cause.status : -1);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workId, generation]);
  async function add() {
    if (lock.current || error === 409) return;
    pending.current ??= JSON.stringify({
      workId,
      mutationKey: crypto.randomUUID(),
      ...(state?.archived ? { revision: state.revision } : {}),
    });
    lock.current = true;
    setBusy(true);
    setError(0);
    try {
      const result = await libraryCommand(
        `/api/library?locale=${locale}`,
        "POST",
        pending.current,
      );
      if (result.workId !== workId || result.archived)
        throw new LibraryRequestError(0, true);
      pending.current = null;
      setRetryReady(false);
      setState(result);
    } catch (cause) {
      const failure =
        cause instanceof LibraryRequestError
          ? cause
          : new LibraryRequestError(0, true);
      setError(failure.status || -1);
      setRetryReady(failure.ambiguous);
      if (!failure.ambiguous) pending.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const destination = `/${locale}/library`;
  return (
    <section className={styles.widget} aria-label={t.title}>
      <h2>{t.title}</h2>
      {loading ? (
        <p role="status">{t.loading}</p>
      ) : (
        <>
          {error === 401 || error === 403 ? (
            <Link
              href={`/${locale}/login?callbackURL=${encodeURIComponent(destination)}`}
            >
              {t.login}
            </Link>
          ) : (
            <>
              {state && !state.archived ? (
                <>
                  <p>
                    {t.labels[state.status]}
                    {state.favorite ? ` · ${t.favorite}` : ""}
                  </p>
                  <Link href={`/${locale}/library/${state.id}`}>
                    {t.detail}
                  </Link>
                </>
              ) : (
                (!error || retryReady) && (
                  <button disabled={busy} onClick={() => void add()}>
                    {busy
                      ? t.saving
                      : retryReady
                        ? t.retry
                        : state?.archived
                          ? t.restore
                          : t.add}
                  </button>
                )
              )}
              {!!error && (
                <p role="alert">{error === 409 ? t.stale : t.error}</p>
              )}
              {!!error && !retryReady && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setLoading(true);
                    setError(0);
                    setGeneration((value) => value + 1);
                  }}
                >
                  {t.refresh}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
