"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WORK_FORMATS,
  WORK_VISIBILITIES,
  RELEASE_STATUSES,
} from "@taleatlas/database/catalog-types";
import {
  workInputSchema,
  type WorkInputPayload,
} from "@/features/catalog/contracts";
import {
  catalogDictionary,
  formatLabels,
  visibilityLabels,
  releaseLabels,
} from "@/lib/catalog-i18n";
import type { Locale } from "@/lib/i18n";
import styles from "./admin.module.css";
const collections = [
  "titles",
  "descriptions",
  "creators",
  "editions",
  "genres",
  "identifiers",
  "relations",
] as const;
const definitions = {
  titles: "{ title, language, kind: PRIMARY | ORIGINAL | ALIAS }",
  descriptions: "{ language, text }",
  creators:
    "{ id?, name, role: AUTHOR | WRITER | ILLUSTRATOR | ARTIST | TRANSLATOR | EDITOR | PUBLISHER | OTHER, editionIndex? | editionId?, displayOrder }",
  editions:
    "{ id?, title?, language?, publisher?, format?, publicationYear?, publicationLabel?, isbn? }",
  genres: "{ slug, nameEn, nameVi }",
  identifiers: "{ namespace, value }",
  relations:
    "{ toWorkId, type: ADAPTATION_OF | SEQUEL_OF | PREQUEL_OF | SPIN_OFF_OF | SIDE_STORY_OF | REMAKE_OF | SHARED_UNIVERSE | OTHER }",
};
export function WorkEditor({
  locale,
  initial,
  id,
  revision,
}: {
  locale: Locale;
  initial?: WorkInputPayload;
  id?: string;
  revision?: number;
}) {
  const d = catalogDictionary(locale);
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const defaults: WorkInputPayload = initial ?? {
    primaryTitle: "",
    primaryTitleLanguage: "und",
    format: "NOVEL",
    visibility: "DRAFT",
    releaseStatus: "UNKNOWN",
    source: { label: "", citation: "" },
    cover: { rights: "UNKNOWN" },
    titles: [],
    descriptions: [],
    creators: [],
    editions: [],
    genres: [],
    identifiers: [],
    relations: [],
  };
  async function submit(form: HTMLFormElement, visibilityOnly = false) {
    if (lock.current || conflict) return;
    setMessage("");
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "");
    const optional = (key: string) => value(key).trim() || undefined;
    const visibility = value("visibility");
    const publicationReviewAcknowledged = data.get("review") === "on";
    if (visibility === "PUBLISHED" && !publicationReviewAcknowledged) {
      setMessage(d.reviewRequired);
      return;
    }
    let payload: unknown;
    try {
      payload = visibilityOnly
        ? { visibility, revision, publicationReviewAcknowledged }
        : workInputSchema.parse({
            primaryTitle: value("primaryTitle"),
            primaryTitleLanguage: value("primaryTitleLanguage"),
            format: value("format"),
            visibility,
            publicationReviewAcknowledged,
            releaseStatus: value("releaseStatus"),
            originalLanguage: optional("originalLanguage"),
            country: optional("country"),
            publicationYear: optional("publicationYear")
              ? Number(value("publicationYear"))
              : undefined,
            publicationLabel: optional("publicationLabel"),
            source: {
              label: value("sourceLabel"),
              citation: value("citation"),
              url: optional("url"),
              consultedAt: optional("consultedAt"),
            },
            ...Object.fromEntries(
              collections.map((key) => [
                key,
                JSON.parse(value(key)) as unknown,
              ]),
            ),
            cover: JSON.parse(value("cover")) as unknown,
          });
    } catch {
      setMessage(d.invalid);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(
        id
          ? `/api/admin/catalog/works/${encodeURIComponent(id)}${visibilityOnly ? "/visibility" : ""}`
          : "/api/admin/catalog/works",
        {
          method: id && !visibilityOnly ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            id && !visibilityOnly
              ? { ...(payload as WorkInputPayload), revision }
              : payload,
          ),
        },
      );
      if (response.status === 409) {
        setConflict(true);
        setMessage(d.conflict);
        return;
      }
      if (!response.ok) {
        setMessage(d.error);
        return;
      }
      const result: unknown = await response.json();
      setMessage(visibilityOnly ? d.visibilitySaved : d.saved);
      if (!id) {
        if (
          typeof result === "object" &&
          result !== null &&
          "id" in result &&
          typeof result.id === "string"
        ) {
          router.replace(
            `/${locale}/admin/works/${encodeURIComponent(result.id)}`,
          );
        } else {
          setMessage(d.error);
        }
      } else router.refresh();
    } catch {
      setMessage(d.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function field(
    name: string,
    label: string,
    defaultValue: string | number | undefined,
    required = false,
    type = "text",
  ) {
    return (
      <label className={styles.field} key={name}>
        {label}
        <input
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          type={type}
        />
      </label>
    );
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <fieldset disabled={busy || conflict}>
        <legend>{d.edit}</legend>
        <div className={styles.grid}>
          {field("primaryTitle", d.primaryTitle, defaults.primaryTitle, true)}
          {field(
            "primaryTitleLanguage",
            d.primaryLanguage,
            defaults.primaryTitleLanguage ?? "und",
            true,
          )}
          <label className={styles.field}>
            {d.format}
            <select
              name="format"
              aria-label={d.format}
              defaultValue={defaults.format}
            >
              {WORK_FORMATS.map((v) => (
                <option key={v} value={v}>
                  {formatLabels[locale][v]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            {d.visibility}
            <select
              name="visibility"
              aria-label={d.visibility}
              defaultValue={defaults.visibility}
            >
              {WORK_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {visibilityLabels[locale][v]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            {d.release}
            <select
              name="releaseStatus"
              aria-label={d.release}
              defaultValue={defaults.releaseStatus}
            >
              {RELEASE_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {releaseLabels[locale][v]}
                </option>
              ))}
            </select>
          </label>
          {field("originalLanguage", d.language, defaults.originalLanguage)}
          {field("country", d.country, defaults.country)}
          {field(
            "publicationYear",
            d.year,
            defaults.publicationYear,
            false,
            "number",
          )}
          {field("publicationLabel", d.yearLabel, defaults.publicationLabel)}
        </div>
        {field("sourceLabel", d.sourceLabel, defaults.source.label, true)}
        <label className={styles.field}>
          {d.citation}
          <textarea
            name="citation"
            aria-label={d.citation}
            required
            rows={4}
            defaultValue={defaults.source.citation}
          />
        </label>
        {field("url", d.url, defaults.source.url, false, "url")}
        {field("consultedAt", d.consulted, defaults.source.consultedAt)}
        <details>
          <summary>{d.advanced}</summary>
          <p>{d.advancedHint}</p>
          {collections.map((key) => (
            <label className={styles.field} key={key}>
              {d[key]}
              <small>{definitions[key]}</small>
              <textarea
                name={key}
                aria-label={d[key]}
                rows={5}
                defaultValue={JSON.stringify(defaults[key] ?? [], null, 2)}
                spellCheck={false}
              />
            </label>
          ))}
          <label className={styles.field}>
            {d.cover}
            <small>
              {d.coverHint}{" "}
              {
                "{ rights: UNKNOWN | LICENSED | PUBLIC_DOMAIN | PERMISSION, assetPath?, credit?, rightsStatement?, licenseUrl? }"
              }
            </small>
            <textarea
              name="cover"
              aria-label={d.cover}
              rows={5}
              defaultValue={JSON.stringify(
                defaults.cover ?? { rights: "UNKNOWN" },
                null,
                2,
              )}
              spellCheck={false}
            />
          </label>
        </details>
        <label className={styles.review}>
          <input type="checkbox" name="review" />
          {d.review}
        </label>
        <div className={styles.actions}>
          <button className="button button-primary" type="submit">
            {busy ? d.saving : d.save}
          </button>
          {id && (
            <button
              className="button button-secondary"
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) void submit(form, true);
              }}
            >
              {d.applyVisibility}
            </button>
          )}
        </div>
      </fieldset>
      {message && (
        <p className={styles.status} role="status" aria-live="polite">
          {message}
        </p>
      )}
      {conflict && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => window.location.reload()}
        >
          {d.reload}
        </button>
      )}
    </form>
  );
}
