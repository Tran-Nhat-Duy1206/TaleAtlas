"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  canonicalMetadataProposalInput,
  submitMetadataProposalSchema,
  type SubmitMetadataProposal,
} from "@/features/catalog/metadata-operations";
import {
  metadataSuggestionSchema,
  type MetadataTarget,
} from "@/features/catalog/metadata-suggestion-contracts";
import type { Locale } from "@/lib/i18n";
import { suggestionCopy } from "./suggestion-ui";
import {
  eligibleMetadataTitles,
  metadataCopy,
  metadataOperationTypes,
  type MetadataOperation,
} from "./metadata-suggestion-ui";

const selectorStyle = { minWidth: 0, maxWidth: "100%", width: "100%" } as const;

export function MetadataSuggestionForm({
  locale,
  target,
}: {
  locale: Locale;
  target: MetadataTarget;
}) {
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] },
    router = useRouter();
  // Name choices from visible label text, never the nested option contents.
  const fieldId = useId();
  const titles = eligibleMetadataTitles(target);
  const [operation, setOperation] =
    useState<MetadataOperation["type"]>("TITLE_ADD");
  const [titleId, setTitleId] = useState(titles[0]?.id ?? "");
  const [language, setLanguage] = useState<string>(locale);
  const [genre, setGenre] = useState(
    target.genreOptions.find(
      (g) => !target.genreMemberships.some((m) => m.slug === g.slug),
    )?.slug ?? "",
  );
  const [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<SubmitMetadataProposal | null>(null),
    lock = useRef(false);
  const titleOperation = operation.startsWith("TITLE_"),
    descriptionOperation = operation.startsWith("DESCRIPTION_");
  const removal = operation.includes("REMOVE"),
    adding = operation === "TITLE_ADD" || operation === "DESCRIPTION_ADD";
  const missing =
    (titleOperation && !adding && titles.length === 0) ||
    (descriptionOperation && !adding && target.descriptions.length === 0) ||
    (operation === "GENRE_REMOVE_MEMBERSHIP" &&
      target.genreMemberships.length === 0);
  const current = titleOperation
    ? adding
      ? null
      : target.titles.find((r) => r.id === titleId)?.title
    : descriptionOperation
      ? target.descriptions.find((r) => r.language === language)?.text
      : target.genreMemberships.some((r) => r.slug === genre)
        ? genre
        : null;
  function changeOperation(value: MetadataOperation["type"]) {
    setOperation(value);
    setError("");
    if (value.startsWith("DESCRIPTION_") && value !== "DESCRIPTION_ADD")
      setLanguage(target.descriptions[0]?.language ?? locale);
    else setLanguage(locale);
    if (value === "GENRE_REMOVE_MEMBERSHIP")
      setGenre(target.genreMemberships[0]?.slug ?? "");
    else
      setGenre(
        target.genreOptions.find(
          (g) => !target.genreMemberships.some((m) => m.slug === g.slug),
        )?.slug ?? "",
      );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || stale || missing) return;
    setError("");
    if (!attempt.current) {
      const data = new FormData(event.currentTarget),
        value = (name: string) => String(data.get(name) ?? "");
      let op: MetadataOperation;
      switch (operation) {
        case "TITLE_ADD":
          op = {
            type: operation,
            value: {
              title: value("text"),
              language,
              kind: value("kind") as "PRIMARY" | "ALIAS",
            },
          };
          break;
        case "TITLE_REPLACE":
          op = { type: operation, titleId, title: value("text") };
          break;
        case "TITLE_REMOVE":
          op = { type: operation, titleId, reason: value("reason") };
          break;
        case "DESCRIPTION_ADD":
        case "DESCRIPTION_REPLACE":
          op = {
            type: operation,
            language,
            text: value("text"),
            rights: {
              basis: "ORIGINAL_SUMMARY",
              originalityAcknowledged: (data.get("originality") ===
                "on") as true,
              statement: value("statement"),
            },
          };
          break;
        case "DESCRIPTION_REMOVE":
          op = { type: operation, language, reason: value("reason") };
          break;
        case "GENRE_ADD_MEMBERSHIP":
          op = { type: operation, slug: genre };
          break;
        case "GENRE_REMOVE_MEMBERSHIP":
          op = { type: operation, slug: genre, reason: value("reason") };
          break;
      }
      const parsed = submitMetadataProposalSchema.safeParse({
        version: 1,
        submitKey: crypto.randomUUID(),
        workId: target.work.id,
        baseWorkRevision: target.work.revision,
        operation: op,
        citation: {
          label: value("label"),
          citation: value("citation"),
          url: value("url").trim() || undefined,
        },
      });
      if (!parsed.success) {
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
        `/api/catalog/works/${target.work.id}/metadata-suggestions`,
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
            response.status === 401 || response.status === 403
              ? t.denied
              : response.status === 404
                ? t.unavailable
                : response.status === 429
                  ? t.rate
                  : t.error,
          );
        return;
      }
      const parsed = metadataSuggestionSchema.safeParse(await response.json()),
        sent = attempt.current;
      if (
        !parsed.success ||
        !parsed.data.proposal ||
        parsed.data.proposal.submitKey !== sent.submitKey ||
        parsed.data.workId !== sent.workId ||
        canonicalMetadataProposalInput(parsed.data.proposal) !==
          canonicalMetadataProposalInput(sent)
      ) {
        setError(t.error);
        return;
      }
      router.replace(`/${locale}/metadata-suggestions/${parsed.data.id}`);
    } catch {
      setError(t.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="auth-card"
      style={{ minWidth: 0, width: "100%" }}
    >
      <p>{t.private}</p>
      <p>
        {t.base}: {target.work.revision}
      </p>
      <fieldset disabled={busy || frozen} style={{ minWidth: 0 }}>
        <label>
          <span id={`${fieldId}-operation`}>{t.operation}</span>
          <select
            style={selectorStyle}
            aria-labelledby={`${fieldId}-operation`}
            name="operation"
            value={operation}
            onChange={(e) =>
              changeOperation(e.target.value as MetadataOperation["type"])
            }
          >
            {metadataOperationTypes.map((type) => (
              <option key={type} value={type}>
                {t.operations[type]}
              </option>
            ))}
          </select>
        </label>
        {titleOperation && <p>{t.protected}</p>}
        {titleOperation && !adding && (
          <label>
            <span id={`${fieldId}-target`}>{t.target}</span>
            <select
              style={selectorStyle}
              aria-labelledby={`${fieldId}-target`}
              name="titleId"
              value={titleId}
              onChange={(e) => setTitleId(e.target.value)}
              required
            >
              {titles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.language} · {r.kind}
                </option>
              ))}
            </select>
          </label>
        )}
        {(adding || descriptionOperation) && (
          <label>
            <span id={`${fieldId}-language`}>{t.language}</span>
            {descriptionOperation && !adding ? (
              <select
                style={selectorStyle}
                aria-labelledby={`${fieldId}-language`}
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
              >
                {target.descriptions.map((r) => (
                  <option key={r.language} value={r.language}>
                    {r.language}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-labelledby={`${fieldId}-language`}
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
                maxLength={35}
              />
            )}
          </label>
        )}
        {operation === "TITLE_ADD" && (
          <label>
            <span id={`${fieldId}-kind`}>{t.kind}</span>
            <select
              style={selectorStyle}
              name="kind"
              aria-labelledby={`${fieldId}-kind`}
            >
              <option value="ALIAS">{t.kinds.ALIAS}</option>
              <option value="PRIMARY">{t.kinds.PRIMARY}</option>
            </select>
          </label>
        )}
        {!titleOperation && !descriptionOperation && (
          <>
            <p>{t.existing}</p>
            <label>
              <span id={`${fieldId}-genre`}>{t.genre}</span>
              {operation === "GENRE_REMOVE_MEMBERSHIP" ? (
                <select
                  style={selectorStyle}
                  aria-labelledby={`${fieldId}-genre`}
                  name="slug"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  required
                >
                  {target.genreMemberships.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.slug}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-labelledby={`${fieldId}-genre`}
                  name="slug"
                  list="metadata-genre-options"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  required
                  maxLength={100}
                />
              )}
            </label>
            <datalist id="metadata-genre-options">
              {target.genreOptions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {locale === "vi" ? r.nameVi : r.nameEn}
                </option>
              ))}
            </datalist>
          </>
        )}
        <section aria-label={t.currentValue}>
          <h2>{t.currentValue}</h2>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {current ?? t.none}
          </p>
        </section>
        {!removal && (titleOperation || descriptionOperation) && (
          <label>
            {descriptionOperation ? t.description : t.title}
            {descriptionOperation ? (
              <textarea
                key={operation}
                name="text"
                required
                maxLength={20000}
                rows={8}
              />
            ) : (
              <input key={operation} name="text" required maxLength={500} />
            )}
          </label>
        )}
        {removal && (
          <label>
            {t.removeReason}
            <textarea name="reason" required maxLength={2000} rows={3} />
          </label>
        )}
        {descriptionOperation && !removal && (
          <>
            <p>{t.rightsNote}</p>
            <label
              style={{ display: "flex", alignItems: "start", gap: ".5rem" }}
            >
              <input
                type="checkbox"
                name="originality"
                required
                style={{ width: "auto" }}
              />
              {t.originality}
            </label>
            <label>
              {t.statement}
              <textarea name="statement" required maxLength={2000} rows={3} />
            </label>
          </>
        )}
        <label>
          {t.label}
          <input name="label" required maxLength={200} />
        </label>
        <label>
          {t.citation}
          <textarea name="citation" required maxLength={4000} rows={4} />
        </label>
        <label>
          {t.url}
          <input name="url" type="url" maxLength={2000} />
        </label>
      </fieldset>
      {missing && <p role="alert">{t.emptyTargets}</p>}
      {frozen && <p role="status">{t.pending}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || stale || missing}>
        {busy ? t.busy : t.submit}
      </button>
      {frozen && !stale && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            attempt.current = null;
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
