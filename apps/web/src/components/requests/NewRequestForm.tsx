"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
const fieldErrorKeys = {
  title: "titleError",
  format: "formatError",
  alternativeTitles: "alternativeTitlesError",
  originalTitle: "originalTitleError",
  author: "authorError",
  sourceUrl: "sourceUrlError",
  originalLanguage: "originalLanguageError",
  publicationLanguage: "publicationLanguageError",
  publicationYear: "publicationYearError",
  description: "descriptionError",
  additionalEvidence: "additionalEvidenceError",
  notes: "notesError",
  disclaimer: "disclaimerError",
} as const;
type FieldName = keyof typeof fieldErrorKeys;
function isFieldName(value: string): value is FieldName {
  return Object.hasOwn(fieldErrorKeys, value);
}
function hasOptionalDetails(details?: RequestDetails) {
  return Boolean(
    details?.alternativeTitles.some((title) => title.trim().length > 0) ||
    optionalFields.some((field) => {
      const value = details?.[field];
      return typeof value === "string"
        ? value.trim().length > 0
        : value !== undefined && value !== null;
    }),
  );
}
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
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FieldName | "summary" | null>(null);
  const [expanded, setExpanded] = useState(() =>
    hasOptionalDetails(initialDetails),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<FieldName[]>([]);
  const fieldId = (field: FieldName) => `${prefix}-${field}`;
  const errorId = (field: FieldName) => `${fieldId(field)}-error`;
  const optionalHelpId = `${prefix}-optional-help`;
  const requiredHelpId = `${prefix}-required-help`;
  const notesHelpId = `${prefix}-notes-help`;

  function revealOptional(fields: FieldName[]) {
    if (
      fields.some(
        (field) =>
          field === "alternativeTitles" ||
          optionalFields.some((name) => name === field),
      )
    ) {
      // Native validation focuses immediately after the invalid event dispatch.
      // Set the DOM property synchronously, not just React's batched state.
      if (detailsRef.current) detailsRef.current.open = true;
      setExpanded(true);
    }
  }
  function focusField(field: FieldName) {
    revealOptional([field]);
    const control = formRef.current?.elements.namedItem(field);
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ) {
      control.focus();
    }
  }
  useEffect(() => {
    if (!error) return;
    const destination = pendingFocus.current;
    pendingFocus.current = null;
    if (destination === "summary") errorRef.current?.focus();
    else if (destination) {
      const control = formRef.current?.elements.namedItem(destination);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        // Every optional error has already opened the disclosure synchronously.
        control.focus();
      }
    }
  }, [error, invalid]);

  function failure(message: string, fields: FieldName[] = []) {
    const names = [...new Set(fields)];
    revealOptional(names);
    pendingFocus.current = names.length === 1 ? names[0] : "summary";
    setInvalid(names);
    setError(message);
  }
  function nativeInvalid(event: FormEvent<HTMLFormElement>) {
    const control = event.target;
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      !isFieldName(control.name)
    )
      return;
    const field = control.name;
    revealOptional([field]);
    pendingFocus.current = null;
    setInvalid((previous) => [...new Set([...previous, field])]);
    setError(t.validationSummary);
    // Do not cancel native validation, replace validity, or steal its first-field focus.
  }
  function describedBy(field: FieldName, help?: string) {
    return (
      [help, invalid.includes(field) ? errorId(field) : undefined]
        .filter(Boolean)
        .join(" ") || undefined
    );
  }
  function fieldError(field: FieldName) {
    return invalid.includes(field) ? (
      <p id={errorId(field)} className={styles.fieldError}>
        {t[fieldErrorKeys[field]]}
      </p>
    ) : null;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    pendingFocus.current = null;
    setError("");
    setInvalid([]);
    if (data.get("disclaimer") !== "on") {
      failure(t.disclaimer, ["disclaimer"]);
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
      failure(t.size);
      return;
    }
    const parsed = requestDetailsSchema.safeParse(details);
    if (!parsed.success) {
      failure(
        t.invalid,
        parsed.error.issues
          .map((i) => String(i.path[0] ?? ""))
          .filter(isFieldName),
      );
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
      failure(t.invalid);
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
        failure(
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
      failure(t.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className={`feature ${styles.form} ${styles.card} ${styles.progressiveForm}`}
      onSubmit={submit}
      onInvalidCapture={nativeInvalid}
    >
      <fieldset className={styles.basicFields}>
        <legend>{t.basicInformation}</legend>
        <p id={requiredHelpId} className={styles.formHelp}>
          {t.optional}
        </p>
        <div className={styles.fields}>
          <div className={styles.formField}>
            <label htmlFor={fieldId("title")}>{t.title}</label>
            <input
              id={fieldId("title")}
              name="title"
              required
              maxLength={600}
              defaultValue={initialDetails?.title ?? prefillTitle ?? ""}
              aria-invalid={invalid.includes("title")}
              aria-describedby={describedBy("title", requiredHelpId)}
            />
            {fieldError("title")}
          </div>
          <div className={styles.formField}>
            <label htmlFor={fieldId("format")}>{t.format}</label>
            <select
              id={fieldId("format")}
              name="format"
              required
              defaultValue={initialDetails?.format ?? "UNKNOWN"}
              aria-invalid={invalid.includes("format")}
              aria-describedby={describedBy("format", requiredHelpId)}
            >
              {REQUEST_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f === "UNKNOWN" ? t.unknown : formatLabels[locale][f]}
                </option>
              ))}
            </select>
            {fieldError("format")}
          </div>
        </div>
      </fieldset>
      <details
        ref={detailsRef}
        className={styles.moreDetails}
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>{t.moreDetails}</summary>
        <p id={optionalHelpId} className={styles.formHelp}>
          {t.moreDetailsHelp}
        </p>
        <div className={styles.fields}>
          <div className={`${styles.formField} ${styles.multilineField}`}>
            <label htmlFor={fieldId("alternativeTitles")}>
              {t.alternativeTitles}
            </label>
            <textarea
              id={fieldId("alternativeTitles")}
              name="alternativeTitles"
              defaultValue={initialDetails?.alternativeTitles.join("\n")}
              aria-invalid={invalid.includes("alternativeTitles")}
              aria-describedby={describedBy(
                "alternativeTitles",
                optionalHelpId,
              )}
            />
            {fieldError("alternativeTitles")}
          </div>
          {optionalFields.map((field) => (
            <div
              className={`${styles.formField} ${["description", "additionalEvidence", "notes"].includes(field) ? styles.multilineField : ""}`}
              key={field}
            >
              <label htmlFor={fieldId(field)}>{t[field]}</label>
              {["description", "additionalEvidence", "notes"].includes(
                field,
              ) ? (
                <textarea
                  id={fieldId(field)}
                  name={field}
                  maxLength={limits[field]}
                  defaultValue={initialDetails?.[field]}
                  aria-invalid={invalid.includes(field)}
                  aria-describedby={describedBy(
                    field,
                    field === "notes" ? notesHelpId : optionalHelpId,
                  )}
                />
              ) : (
                <input
                  id={fieldId(field)}
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
                  aria-describedby={describedBy(field, optionalHelpId)}
                />
              )}
              {field === "notes" && (
                <p id={notesHelpId} className={styles.formHelp}>
                  {t.privateNotesHelp}
                </p>
              )}
              {fieldError(field)}
            </div>
          ))}
        </div>
      </details>
      <div className={styles.formField}>
        <label className={styles.check} htmlFor={fieldId("disclaimer")}>
          <input
            id={fieldId("disclaimer")}
            type="checkbox"
            name="disclaimer"
            required
            aria-invalid={invalid.includes("disclaimer")}
            aria-describedby={describedBy("disclaimer")}
          />
          {t.disclaimer}
        </label>
        {fieldError("disclaimer")}
      </div>
      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className={styles.error}>
          <p>{error}</p>
          {invalid.length > 0 && (
            <ul>
              {invalid.map((field) => (
                <li key={field}>
                  <a
                    href={`#${fieldId(field)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      focusField(field);
                    }}
                  >
                    {t[field]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button className="button" disabled={busy} type="submit">
        {busy ? t.working : requestId ? t.save : t.submit}
      </button>
    </form>
  );
}
