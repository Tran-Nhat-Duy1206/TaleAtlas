"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { RELEASE_STATUSES } from "@taleatlas/database/catalog-types";
import { suggestionCopy, suggestionReplySchema } from "./suggestion-ui";
import {
  submitEditSuggestionSchema,
  type SubmitEditSuggestion,
} from "@/features/catalog/edit-suggestions";
import { releaseLabels } from "@/lib/catalog-i18n";
import type { Locale } from "@/lib/i18n";

const fields = [
  "primaryTitle",
  "primaryTitleLanguage",
  "releaseStatus",
  "publicationYear",
  "publicationLabel",
  "originalLanguage",
] as const;
export function EditSuggestionForm({
  locale,
  target,
}: {
  locale: Locale;
  target: { id: string; revision: number; slug: string; displayTitle?: string };
}) {
  const t = suggestionCopy[locale],
    router = useRouter();
  const [field, setField] = useState<(typeof fields)[number]>("primaryTitle");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [frozen, setFrozen] = useState(false),
    [stale, setStale] = useState(false);
  const key = useRef<string | null>(null),
    attempt = useRef<SubmitEditSuggestion | null>(null),
    lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || stale) return;
    setError("");
    if (!attempt.current) {
      const data = new FormData(event.currentTarget);
      const value = String(data.get("value") ?? "").trim();
      key.current ??= crypto.randomUUID();
      const parsed = submitEditSuggestionSchema.safeParse({
        submitKey: key.current,
        baseWorkRevision: target.revision,
        patch: { [field]: field === "publicationYear" ? Number(value) : value },
        citation: {
          label: String(data.get("label") ?? ""),
          citation: String(data.get("citation") ?? ""),
          url: String(data.get("url") ?? "").trim() || undefined,
        },
      });
      if (!parsed.success || !z.uuid().safeParse(target.id).success) {
        setError(t.invalid);
        return;
      }
      attempt.current = parsed.data;
    }
    lock.current = true;
    setBusy(true);
    setFrozen(true);
    try {
      const response = await fetch(
        `/api/catalog/works/${target.id}/suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt.current),
        },
      );
      if (!response.ok) {
        if (response.status === 409) {
          setStale(true);
          setError(t.stale);
        } else
          setError(
            response.status === 404
              ? t.unavailable
              : response.status === 403 || response.status === 401
                ? t.denied
                : t.error,
          );
        return;
      }
      const reply = suggestionReplySchema.safeParse(await response.json());
      if (
        !reply.success ||
        reply.data.workId !== target.id ||
        reply.data.baseWorkRevision !== target.revision ||
        reply.data.revision !== 1 ||
        reply.data.state !== "SUBMITTED" ||
        reply.data.appliedWorkRevision !== null ||
        reply.data.reviewReason !== null
      ) {
        setError(t.error);
        return;
      }
      router.replace(`/${locale}/edit-suggestions/${reply.data.id}`);
    } catch {
      setError(t.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-card">
      {target.displayTitle && <h2>{target.displayTitle}</h2>}
      <label>
        {t.base}
        <input name="baseWorkRevision" readOnly value={target.revision} />
      </label>
      <fieldset disabled={busy || frozen} style={{ minWidth: 0 }}>
        <label>
          {t.field}
          <select
            name="field"
            value={field}
            onChange={(e) => setField(e.target.value as typeof field)}
          >
            {fields.map((f) => (
              <option key={f} value={f}>
                {t[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.value}
          {field === "releaseStatus" ? (
            <select name="value">
              {RELEASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {releaseLabels[locale][s]}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={field}
              name="value"
              required
              type={field === "publicationYear" ? "number" : "text"}
              min={field === "publicationYear" ? 1 : undefined}
              max={field === "publicationYear" ? 9999 : undefined}
              maxLength={
                field === "primaryTitle"
                  ? 500
                  : field === "publicationLabel"
                    ? 200
                    : 35
              }
            />
          )}
        </label>
        <label>
          {t.label}
          <input name="label" required maxLength={200} />
        </label>
        <label>
          {t.citation}
          <textarea name="citation" required maxLength={4000} rows={5} />
        </label>
        <label>
          {t.url}
          <input name="url" type="url" maxLength={2000} />
        </label>
      </fieldset>
      {frozen && <p role="status">{t.pending}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || stale}>
        {busy ? t.busy : t.submit}
      </button>
      {frozen && !stale && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            attempt.current = null;
            key.current = null;
            setFrozen(false);
            setError("");
          }}
        >
          {t.newAttempt}
        </button>
      )}
      {stale && (
        <button type="button" onClick={() => window.location.reload()}>
          {t.reload}
        </button>
      )}
    </form>
  );
}
