"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { reviewEditSuggestionSchema } from "@/features/catalog/edit-suggestions";
import {
  informationalUrlSchema,
  type AdminWork,
} from "@/features/catalog/contracts";
import type { Locale } from "@/lib/i18n";
import { releaseLabels } from "@/lib/catalog-i18n";
import {
  suggestionCopy,
  suggestionReplySchema,
  type SuggestionView,
} from "./suggestion-ui";

export function SuggestionMetadata({
  locale,
  suggestion,
}: {
  locale: Locale;
  suggestion: SuggestionView;
}) {
  const t = suggestionCopy[locale];
  return (
    <section>
      <h2>{t.proposed}</h2>
      <dl>
        {Object.entries(suggestion.patch).map(([field, value]) => (
          <div key={field}>
            <dt>{t[field as keyof typeof suggestion.patch]}</dt>
            <dd style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
              {field === "releaseStatus"
                ? releaseLabels[locale][value as keyof typeof releaseLabels.en]
                : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      <h3>{t.citation}</h3>
      <p style={{ overflowWrap: "anywhere" }}>{suggestion.citation.label}</p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {suggestion.citation.citation}
      </p>
      {suggestion.citation.url &&
        informationalUrlSchema.safeParse(suggestion.citation.url).success && (
          <a
            href={suggestion.citation.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            style={{ overflowWrap: "anywhere" }}
          >
            {suggestion.citation.url}
          </a>
        )}
    </section>
  );
}
export function EditSuggestionReview({
  locale,
  suggestion,
  current,
}: {
  locale: Locale;
  suggestion: SuggestionView;
  current: AdminWork | null;
}) {
  const t = suggestionCopy[locale],
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [stale, setStale] = useState(false);
  const lock = useRef(false);
  const conflict =
    !current ||
    current.revision !== suggestion.baseWorkRevision ||
    current.visibility !== "PUBLISHED";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || done || stale) return;
    const data = new FormData(event.currentTarget);
    const decision = data.get("decision");
    const parsed = reviewEditSuggestionSchema.safeParse({
      decision,
      revision: suggestion.revision,
      baseWorkRevision: suggestion.baseWorkRevision,
      reason: String(data.get("reason") ?? ""),
      ...(decision === "APPROVE"
        ? {
            metadataReviewAcknowledged: data.get("metadataAck") === "on",
            publicationReviewAcknowledged: data.get("publicationAck") === "on",
          }
        : {}),
    });
    if (!parsed.success || (decision === "APPROVE" && conflict)) {
      setError(
        decision === "APPROVE"
          ? `${t.metadataAck}. ${t.publicationAck}. ${t.reason}.`
          : t.reason,
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/edit-suggestions/${suggestion.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
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
              : response.status === 401 || response.status === 403
                ? t.denied
                : t.error,
          );
        return;
      }
      const reply = suggestionReplySchema.safeParse(await response.json());
      if (
        !reply.success ||
        reply.data.id !== suggestion.id ||
        reply.data.workId !== suggestion.workId ||
        reply.data.baseWorkRevision !== suggestion.baseWorkRevision ||
        reply.data.revision !== suggestion.revision + 1 ||
        reply.data.state !==
          (decision === "APPROVE" ? "APPROVED" : "REJECTED") ||
        reply.data.appliedWorkRevision !==
          (decision === "APPROVE" ? current!.revision + 1 : null) ||
        reply.data.reviewReason !== parsed.data.reason
      ) {
        setError(t.error);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="feature" style={{ minWidth: 0 }}>
      <p>
        {t.state}: {suggestion.state}
      </p>
      <p>
        {t.base}: {suggestion.baseWorkRevision} · {t.current}:{" "}
        {current?.revision ?? t.missing}
      </p>
      <p>{t.identity}</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
          gap: "1rem",
        }}
      >
        <SuggestionMetadata locale={locale} suggestion={suggestion} />
        <section>
          <h2>{t.currentMetadata}</h2>
          {current ? (
            <dl>
              {Object.keys(suggestion.patch).map((field) => (
                <div key={field}>
                  <dt>{t[field as keyof typeof suggestion.patch]}</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>
                    {field === "releaseStatus"
                      ? releaseLabels[locale][current.releaseStatus]
                      : String(current[field as keyof AdminWork] ?? t.missing)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{t.unavailable}</p>
          )}
        </section>
      </div>
      {conflict && <p role="status">{t.conflict}</p>}
      {suggestion.state === "SUBMITTED" && !done && (
        <form onSubmit={submit} className="auth-card">
          <fieldset disabled={busy || stale} style={{ minWidth: 0 }}>
            <label>
              {t.reason}
              <textarea name="reason" required maxLength={2000} rows={3} />
            </label>
            <label>
              <input name="metadataAck" type="checkbox" />
              {t.metadataAck}
            </label>
            <label>
              <input name="publicationAck" type="checkbox" />
              {t.publicationAck}
            </label>
            <label>
              {t.review}
              <select name="decision">
                <option value="REJECT">{t.reject}</option>
                <option value="APPROVE" disabled={conflict}>
                  {t.approve}
                </option>
              </select>
            </label>
            <button type="submit">{busy ? t.busy : t.review}</button>
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{t.saved}</p>}
      {stale && (
        <button type="button" onClick={() => window.location.reload()}>
          {t.reload}
        </button>
      )}
    </article>
  );
}
