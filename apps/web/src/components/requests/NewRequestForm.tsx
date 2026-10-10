"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { REQUEST_FORMATS } from "@taleatlas/database/ingestion-types";
import {
  requestDetailsSchema,
  submitRequestSchema,
  updateRequestSchema,
  type RequestDetails,
} from "../../features/ingestion/contracts";
import type { Locale } from "../../lib/i18n";
import { formatLabels } from "../../lib/catalog-i18n";
import { requestDictionary } from "../../lib/request-i18n";
import styles from "./request.module.css";
const optionalFields = [
  "originalTitle",
  "author",
  "sourceUrl",
  "originalLanguage",
  "publicationLanguage",
  "publicationYear",
  "description",
  "additionalEvidence",
  "notes",
] as const;
const limits = {
  originalTitle: 600,
  author: 300,
  sourceUrl: 2000,
  originalLanguage: 35,
  publicationLanguage: 35,
  publicationYear: 4,
  description: 4000,
  additionalEvidence: 3000,
  notes: 2000,
};
export function NewRequestForm({
  locale,
  prefillTitle,
  initialDetails,
  requestId,
  revision,
}: {
  locale: Locale;
  prefillTitle?: string;
  initialDetails?: RequestDetails;
  requestId?: string;
  revision?: number;
}) {
  const t = requestDictionary(locale);
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setInvalid([]);
    if (data.get("disclaimer") !== "on") {
      setError(t.disclaimer);
      return;
    }
    const details: Record<string, unknown> = {
      title: String(data.get("title") ?? "").trim(),
      format: data.get("format"),
      alternativeTitles: String(data.get("alternativeTitles") ?? "")
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
    };
    for (const field of optionalFields) {
      const value = String(data.get(field) ?? "").trim();
      if (value)
        details[field] = field === "publicationYear" ? Number(value) : value;
    }
    if (new TextEncoder().encode(JSON.stringify(details)).length > 12000) {
      setError(t.size);
      return;
    }
    const parsed = requestDetailsSchema.safeParse(details);
    if (!parsed.success) {
      setInvalid(parsed.error.issues.map((i) => String(i.path[0] ?? "")));
      setError(t.invalid);
      return;
    }
    key.current ??= crypto.randomUUID();
    const payload = requestId
      ? updateRequestSchema.safeParse({ revision, details: parsed.data })
      : submitRequestSchema.safeParse({
          submitKey: key.current,
          details: parsed.data,
        });
    if (!payload.success) {
      setError(t.invalid);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        requestId ? `/api/requests/${requestId}` : "/api/requests",
        {
          method: requestId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.data),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? t.conflict
            : response.status === 401
              ? t.signIn
              : response.status === 413
                ? t.size
                : response.status === 400
                  ? t.invalid
                  : t.error,
        );
        return;
      }
      const result: { id: string } = await response.json();
      router.replace(`/${locale}/requests/${result.id}`);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`feature ${styles.form} ${styles.card}`} onSubmit={submit}>
      <p>{t.optional}</p>
      <div className={styles.fields}>
        <label>
          {t.title}
          <input
            name="title"
            required
            maxLength={600}
            defaultValue={initialDetails?.title ?? prefillTitle ?? ""}
            aria-invalid={invalid.includes("title")}
          />
        </label>
        <label>
          {t.format}
          <select
            name="format"
            required
            defaultValue={initialDetails?.format ?? "UNKNOWN"}
          >
            {REQUEST_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f === "UNKNOWN" ? t.unknown : formatLabels[locale][f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.alternativeTitles}
          <textarea
            name="alternativeTitles"
            defaultValue={initialDetails?.alternativeTitles.join("\n")}
            aria-invalid={invalid.includes("alternativeTitles")}
          />
        </label>
        {optionalFields.map((field) => (
          <label key={field}>
            {t[field]}
            {["description", "additionalEvidence", "notes"].includes(field) ? (
              <textarea
                name={field}
                maxLength={limits[field]}
                defaultValue={initialDetails?.[field]}
                aria-invalid={invalid.includes(field)}
              />
            ) : (
              <input
                name={field}
                type={
                  field === "publicationYear"
                    ? "number"
                    : field === "sourceUrl"
                      ? "url"
                      : "text"
                }
                min={field === "publicationYear" ? 1 : undefined}
                max={field === "publicationYear" ? 9999 : undefined}
                maxLength={limits[field]}
                defaultValue={initialDetails?.[field]}
                aria-invalid={invalid.includes(field)}
              />
            )}
          </label>
        ))}
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="disclaimer" required />
        {t.disclaimer}
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className="button" disabled={busy} type="submit">
        {busy ? t.working : requestId ? t.save : t.submit}
      </button>
    </form>
  );
}
