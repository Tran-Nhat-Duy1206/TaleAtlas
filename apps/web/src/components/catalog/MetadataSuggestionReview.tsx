"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  canonicalMetadataProposalInput,
  reviewMetadataProposalSchema,
} from "@/features/catalog/metadata-operations";
import {
  metadataSuggestionSchema,
  type MetadataSuggestion,
  type MetadataTarget,
} from "@/features/catalog/metadata-suggestion-contracts";
import type { Locale } from "@/lib/i18n";
import { suggestionCopy } from "./suggestion-ui";
import {
  currentMetadataValue,
  eligibleMetadataTitles,
  metadataCopy,
} from "./metadata-suggestion-ui";

const textStyle = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;
export function MetadataSuggestionDetails({
  locale,
  suggestion,
  current,
}: {
  locale: Locale;
  suggestion: MetadataSuggestion;
  current: MetadataTarget | null;
}) {
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] },
    value = suggestion.proposal;
  const states = {
    SUBMITTED: t.submitted,
    APPROVED: t.approved,
    REJECTED: t.rejected,
  };
  if (!value) return <p role="status">{t.erased}</p>;
  const op = value.operation;
  const proposed =
    op.type === "TITLE_ADD"
      ? op.value.title
      : op.type === "TITLE_REPLACE"
        ? op.title
        : op.type === "DESCRIPTION_ADD" || op.type === "DESCRIPTION_REPLACE"
          ? op.text
          : op.type === "GENRE_ADD_MEMBERSHIP"
            ? op.slug
            : t.operations[op.type];
  const currentValue = currentMetadataValue(op, current);
  return (
    <>
      <dl style={{ overflowWrap: "anywhere" }}>
        <dt>{t.state}</dt>
        <dd>{states[suggestion.state]}</dd>
        <dt>Work UUID</dt>
        <dd>{suggestion.workId}</dd>
        <dt>{t.operation}</dt>
        <dd>{t.operations[op.type]}</dd>
        <dt>{t.base}</dt>
        <dd>{suggestion.baseWorkRevision}</dd>
        <dt>{t.current}</dt>
        <dd>{current?.work.revision ?? t.unavailable}</dd>
        {"titleId" in op && (
          <>
            <dt>{t.target}</dt>
            <dd>{op.titleId}</dd>
          </>
        )}
        {"language" in op && (
          <>
            <dt>{t.language}</dt>
            <dd>{op.language}</dd>
          </>
        )}
        {op.type === "TITLE_ADD" && (
          <>
            <dt>{t.language}</dt>
            <dd>{op.value.language}</dd>
            <dt>{t.kind}</dt>
            <dd>{t.kinds[op.value.kind]}</dd>
          </>
        )}
        {"slug" in op && (
          <>
            <dt>{t.genre}</dt>
            <dd>{op.slug}</dd>
          </>
        )}
        {suggestion.appliedWorkRevision !== null && (
          <>
            <dt>{t.applied}</dt>
            <dd>{suggestion.appliedWorkRevision}</dd>
          </>
        )}
      </dl>
      <section>
        <h3>{t.currentMetadata}</h3>
        <p style={textStyle}>
          {current ? (currentValue ?? t.none) : t.unavailable}
        </p>
      </section>
      <section>
        <h3>{t.proposed}</h3>
        <p style={textStyle}>{proposed}</p>
      </section>
      {"reason" in op && (
        <section>
          <h3>{t.removeReason}</h3>
          <p style={textStyle}>{op.reason}</p>
        </section>
      )}
      {"rights" in op && (
        <section>
          <h3>{t.rights}</h3>
          <p>{t.originality} · ORIGINAL_SUMMARY</p>
          <p style={textStyle}>{op.rights.statement}</p>
          <p>{t.rightsNote}</p>
        </section>
      )}
      <section>
        <h3>{t.citation}</h3>
        <p style={textStyle}>{value.citation.label}</p>
        <p style={textStyle}>{value.citation.citation}</p>
        {value.citation.url && (
          <p style={{ overflowWrap: "anywhere" }}>
            <a
              href={value.citation.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {value.citation.url}
            </a>
          </p>
        )}
        {value.citation.consultedAt && (
          <time dateTime={value.citation.consultedAt}>
            {value.citation.consultedAt}
          </time>
        )}
      </section>
      {suggestion.reviewReason && (
        <section>
          <h3>{t.reasonSaved}</h3>
          <p style={textStyle}>{suggestion.reviewReason}</p>
        </section>
      )}
      {suggestion.reasonRedacted && <p>{t.removedReason}</p>}
      <p>
        {t.submitted}:{" "}
        <time dateTime={suggestion.createdAt}>{suggestion.createdAt}</time>
      </p>
    </>
  );
}

export function MetadataSuggestionReview({
  locale,
  suggestion,
  current,
}: {
  locale: Locale;
  suggestion: MetadataSuggestion;
  current: MetadataTarget | null;
}) {
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] },
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const lock = useRef(false),
    op = suggestion.proposal?.operation;
  const targetMissing =
    !op ||
    !current ||
    ((op.type === "TITLE_REMOVE" || op.type === "TITLE_REPLACE") &&
      !eligibleMetadataTitles(current).some((r) => r.id === op.titleId)) ||
    ((op.type === "DESCRIPTION_REMOVE" || op.type === "DESCRIPTION_REPLACE") &&
      !current.descriptions.some((r) => r.language === op.language)) ||
    (op.type === "GENRE_REMOVE_MEMBERSHIP" &&
      !current.genreMemberships.some((r) => r.slug === op.slug));
  const stale =
    targetMissing || current?.work.revision !== suggestion.baseWorkRevision;
  const reviewable =
    suggestion.state === "SUBMITTED" && suggestion.contentState === "ACTIVE";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !reviewable || saved || uncertain) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const decision = submitter?.value;
    const input = {
      version: 1,
      suggestionId: suggestion.id,
      revision: suggestion.revision,
      baseWorkRevision: suggestion.baseWorkRevision,
      reason: String(data.get("reason") ?? ""),
      decision,
      ...(decision === "APPROVE"
        ? {
            metadataReviewAcknowledged: data.get("metadataAck") === "on",
            publicationReviewAcknowledged: data.get("publicationAck") === "on",
            rightsReviewAcknowledged: data.get("rightsAck") === "on",
          }
        : {}),
    };
    const parsed = reviewMetadataProposalSchema.safeParse(input);
    if (!parsed.success || (decision === "APPROVE" && stale)) {
      setError(t.invalid);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/metadata-suggestions/${suggestion.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) {
        if (response.status === 409) {
          setUncertain(true);
          setError(t.stale);
        } else if (response.status >= 500) {
          setUncertain(true);
          setError(t.uncertainReview);
        } else
          setError(
            response.status === 401 || response.status === 403
              ? t.denied
              : response.status === 429
                ? t.rate
                : t.invalid,
          );
        return;
      }
      const reply = metadataSuggestionSchema.safeParse(await response.json());
      if (
        !reply.success ||
        reply.data.id !== suggestion.id ||
        reply.data.workId !== suggestion.workId ||
        reply.data.baseWorkRevision !== suggestion.baseWorkRevision ||
        reply.data.revision !== 2 ||
        reply.data.contentState !== "ACTIVE" ||
        !reply.data.proposal ||
        !suggestion.proposal ||
        reply.data.proposal.submitKey !== suggestion.proposal.submitKey ||
        canonicalMetadataProposalInput(reply.data.proposal) !==
          canonicalMetadataProposalInput(suggestion.proposal) ||
        reply.data.state !== (decision === "APPROVE" ? "APPROVED" : "REJECTED")
      ) {
        setUncertain(true);
        setError(t.uncertainReview);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setUncertain(true);
      setError(t.uncertainReview);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article
      className="auth-card"
      style={{ minWidth: 0, width: "100%", marginBottom: "1rem" }}
    >
      <h2>
        {t.heading} · {suggestion.id}
      </h2>
      <MetadataSuggestionDetails
        locale={locale}
        suggestion={suggestion}
        current={current}
      />
      {reviewable && (
        <form onSubmit={submit}>
          {stale && <p role="alert">{t.conflict}</p>}
          <fieldset
            disabled={busy || saved || uncertain}
            style={{ minWidth: 0 }}
          >
            <label>
              {t.reason}
              <textarea name="reason" required maxLength={2000} rows={4} />
            </label>
            <label style={{ display: "flex", gap: ".5rem" }}>
              <input
                type="checkbox"
                name="metadataAck"
                style={{ width: "auto" }}
              />
              {t.metadataAck}
            </label>
            <label style={{ display: "flex", gap: ".5rem" }}>
              <input
                type="checkbox"
                name="publicationAck"
                style={{ width: "auto" }}
              />
              {t.publicationAck}
            </label>
            <label style={{ display: "flex", gap: ".5rem" }}>
              <input
                type="checkbox"
                name="rightsAck"
                style={{ width: "auto" }}
              />
              {t.rightsAck}
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
              <button
                type="submit"
                name="decision"
                value="APPROVE"
                disabled={stale}
              >
                {t.approve}
              </button>
              <button type="submit" name="decision" value="REJECT">
                {t.reject}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {saved && <p role="status">{t.saved}</p>}
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <button type="button" onClick={() => window.location.reload()}>
          {t.reload}
        </button>
      )}
    </article>
  );
}
