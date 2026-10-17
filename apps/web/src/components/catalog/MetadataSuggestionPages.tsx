import "server-only";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  listMetadataSuggestions,
  getMetadataSuggestion,
} from "@/server/catalog/metadata-suggestions";
import {
  metadataSuggestionListSchema,
  metadataSuggestionDetailSchema,
  metadataAdminSuggestionDetailSchema,
} from "@/features/catalog/metadata-suggestion-contracts";
import { suggestionCopy } from "./suggestion-ui";
import { metadataCopy } from "./metadata-suggestion-ui";
import {
  MetadataSuggestionDetails,
  MetadataSuggestionReview,
} from "./MetadataSuggestionReview";

export async function MetadataSuggestionList({
  locale,
  page,
  headers,
  admin = false,
}: {
  locale: Locale;
  page: number;
  headers: Headers;
  admin?: boolean;
}) {
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] };
  const result = await listMetadataSuggestions(
    { page, pageSize: 20 },
    headers,
    admin,
  )
    .then((r) => metadataSuggestionListSchema.parse(r))
    .catch(() => null);
  const prefix = `/${locale}/${admin ? "admin/" : ""}`;
  const states = {
    SUBMITTED: t.submitted,
    APPROVED: t.approved,
    REJECTED: t.rejected,
  };
  return (
    <section
      className="auth-page"
      style={{ width: "100%", maxWidth: "70rem", overflowWrap: "anywhere" }}
    >
      <h1>{admin ? t.review : t.mine}</h1>
      <Link href={`${prefix}edit-suggestions`}>{t.legacy}</Link>
      <p>{t.private}</p>
      {!result ? (
        <p role="alert">{t.unavailable}</p>
      ) : (
        <>
          {result.items.length ? (
            <ul>
              {result.items.map((s) => (
                <li key={s.id}>
                  <Link href={`${prefix}metadata-suggestions/${s.id}`}>
                    {s.proposal
                      ? t.operations[s.proposal.operation.type]
                      : t.erased}{" "}
                    · {s.id}
                  </Link>
                  <p>
                    {t.state}: {states[s.state]} · {t.base}:{" "}
                    {s.baseWorkRevision}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t.empty}</p>
          )}
          <nav
            aria-label={t.page}
            style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}
          >
            {page > 1 && (
              <Link href={`${prefix}metadata-suggestions?page=${page - 1}`}>
                {t.previous}
              </Link>
            )}
            <span>
              {t.page} {page}
            </span>
            {page * 20 < result.total && page < 501 && (
              <Link href={`${prefix}metadata-suggestions?page=${page + 1}`}>
                {t.next}
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
export async function MetadataSuggestionDetail({
  locale,
  id,
  headers,
  admin = false,
}: {
  locale: Locale;
  id: string;
  headers: Headers;
  admin?: boolean;
}) {
  const t = { ...suggestionCopy[locale], ...metadataCopy[locale] };
  const detail = await getMetadataSuggestion(id, headers, admin)
    .then((r) =>
      (admin
        ? metadataAdminSuggestionDetailSchema
        : metadataSuggestionDetailSchema
      ).parse(r),
    )
    .catch(() => null);
  const prefix = `/${locale}/${admin ? "admin/" : ""}`;
  return (
    <section
      className="auth-page"
      style={{ width: "100%", maxWidth: "70rem", overflowWrap: "anywhere" }}
    >
      <h1>{admin ? t.review : t.history}</h1>
      <Link href={`${prefix}metadata-suggestions`}>
        {admin ? t.review : t.mine}
      </Link>
      {!detail ? (
        <p role="alert">{t.unavailable}</p>
      ) : admin ? (
        <MetadataSuggestionReview
          locale={locale}
          suggestion={detail.suggestion}
          current={detail.current}
        />
      ) : (
        <article className="auth-card" style={{ minWidth: 0, width: "100%" }}>
          <MetadataSuggestionDetails
            locale={locale}
            suggestion={detail.suggestion}
            current={detail.current}
          />
        </article>
      )}
      {detail && (
        <section>
          <h2>{t.history}</h2>
          <ol>
            {detail.history.map((event) => (
              <li key={event.revision}>
                {event.revision} ·{" "}
                {event.fromState ? `${event.fromState} → ` : ""}
                {event.toState} ·{" "}
                <time dateTime={event.createdAt}>{event.createdAt}</time>
              </li>
            ))}
          </ol>
        </section>
      )}
      {admin && detail?.evidence && (
        <section className="auth-card" style={{ minWidth: 0, width: "100%" }}>
          <h2>
            {t.proposed} · {t.approved}
          </h2>
          <dl>
            <dt>Evidence UUID</dt>
            <dd>{detail.evidence.id}</dd>
            <dt>Audit UUID</dt>
            <dd>{detail.evidence.auditEventId}</dd>
            <dt>{t.applied}</dt>
            <dd>{detail.evidence.workRevision}</dd>
            <dt>{t.operation}</dt>
            <dd>{t.operations[detail.evidence.operationType]}</dd>
            {detail.evidence.titleId && (
              <>
                <dt>{t.target}</dt>
                <dd>{detail.evidence.titleId}</dd>
              </>
            )}
            {detail.evidence.descriptionLanguage && (
              <>
                <dt>{t.language}</dt>
                <dd>{detail.evidence.descriptionLanguage}</dd>
              </>
            )}
            {detail.evidence.genreSlug && (
              <>
                <dt>{t.genre}</dt>
                <dd>{detail.evidence.genreSlug}</dd>
              </>
            )}
            <dt>
              {t.currentMetadata} ·{" "}
              {locale === "vi" ? "trước xét duyệt" : "before review"}
            </dt>
            <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {detail.evidence.beforeTitle ??
                detail.evidence.beforeDescription ??
                (detail.evidence.beforePresent
                  ? detail.evidence.genreSlug
                  : t.none)}
            </dd>
            <dt>{t.approved}</dt>
            <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {detail.evidence.afterTitle ??
                detail.evidence.afterDescription ??
                (detail.evidence.afterPresent
                  ? detail.evidence.genreSlug
                  : t.none)}
            </dd>
          </dl>
          {detail.evidence.rightsBasis && (
            <p>
              ORIGINAL_SUMMARY · {t.rightsAck}:{" "}
              {detail.evidence.rightsReviewAcknowledged === true ? "✓" : t.none}
            </p>
          )}
          <p>{t.rightsNote}</p>
        </section>
      )}
    </section>
  );
}
