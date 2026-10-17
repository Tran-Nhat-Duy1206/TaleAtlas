import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { user, session as sessions } from "@taleatlas/database/schema";
import {
  metadataEditSuggestions as suggestions,
  metadataEditEvents as events,
  catalogMetadataEvidence as evidence,
} from "@taleatlas/database/metadata-edits";
import {
  works,
  workTitles,
  workDescriptions,
  workGenres,
  genres,
  creators,
  workCreators,
  catalogSources,
  catalogAuditEvents,
} from "@taleatlas/database/catalog";
import { getDatabase } from "../database";
import { requireSession, AuthorizationError } from "../session";
import { HttpError, limitCatalogMutation, requireTrustedOrigin } from "../http";
import { getAuthEnv } from "../env";
import { normalizeTitle, sourceSchema } from "../../features/catalog/contracts";
import {
  submitMetadataProposalSchema,
  reviewMetadataProposalSchema,
  canonicalMetadataProposalInput,
  type SubmitMetadataProposal,
} from "../../features/catalog/metadata-operations";
import { preflightMetadataProposal } from "../../features/catalog/metadata-operation-safety";
import {
  metadataSuggestionSchema,
  metadataTargetSchema,
  metadataSuggestionDetailSchema,
  metadataAdminSuggestionDetailSchema,
  metadataSuggestionPageSchema,
} from "../../features/catalog/metadata-suggestion-contracts";

type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Row = typeof suggestions.$inferSelect;
type Principal = Awaited<ReturnType<typeof requireSession>>;
type Input = unknown | (() => Promise<unknown>);
const missing = () => new HttpError(404, "SUGGESTION_NOT_FOUND");
async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await getDatabase().transaction(run);
  } catch (error) {
    if (
      error instanceof HttpError ||
      error instanceof AuthorizationError ||
      error instanceof z.ZodError
    )
      throw error;
    // Driver exceptions can contain bound session tokens or private proposal text.
    // Direct server-page callers must be as safe as the no-store HTTP wrappers.
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  }
}
const pageSchema = metadataSuggestionPageSchema;
async function actor(headers: Headers, admin = false) {
  const principal = await requireSession(headers);
  if (
    !principal.user.emailVerified ||
    (admin && principal.user.role !== "admin")
  )
    throw new AuthorizationError(403);
  return principal;
}
function origin(headers: Headers) {
  requireTrustedOrigin(new Request(getAuthEnv().APP_ORIGIN, { headers }));
}
async function capability(tx: Tx) {
  const [row] = await tx.execute(
    sql`with expected(name, relation_name, function_name, trigger_type, deferred) as (values
      ('metadata_edit_header_guard', 'metadata_edit_suggestions', 'metadata_edit_header_guard', 31, false),
      ('metadata_edit_event_guard', 'metadata_edit_events', 'metadata_edit_event_guard', 31, false),
      ('metadata_edit_redact_owner_reasons', 'metadata_edit_suggestions', 'metadata_edit_redact_owner_reasons', 17, false),
      ('catalog_metadata_evidence_guard', 'catalog_metadata_evidence', 'catalog_metadata_evidence_guard', 31, false),
      ('metadata_edit_header_consistency', 'metadata_edit_suggestions', 'metadata_edit_consistency_guard', 21, true),
      ('metadata_edit_event_consistency', 'metadata_edit_events', 'metadata_edit_consistency_guard', 21, true),
      ('metadata_edit_evidence_consistency', 'catalog_metadata_evidence', 'metadata_edit_consistency_guard', 5, true),
      ('metadata_edit_header_no_truncate', 'metadata_edit_suggestions', 'metadata_edit_no_truncate', 34, false),
      ('metadata_edit_event_no_truncate', 'metadata_edit_events', 'metadata_edit_no_truncate', 34, false),
      ('catalog_metadata_evidence_no_truncate', 'catalog_metadata_evidence', 'metadata_edit_no_truncate', 34, false)
    ) select not exists (
      select 1 from expected e where not exists (
        select 1 from pg_catalog.pg_trigger t
        join pg_catalog.pg_proc p on p.oid = t.tgfoid
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where t.tgname = e.name
          and t.tgrelid = pg_catalog.to_regclass('public.' || e.relation_name)
          and not t.tgisinternal and t.tgenabled in ('O', 'A')
          and t.tgtype = e.trigger_type and t.tgnargs = 0
          and t.tgdeferrable = e.deferred and t.tginitdeferred = e.deferred
          and (t.tgconstraint <> 0) = e.deferred
          and n.nspname = 'public' and p.proname = e.function_name
          and p.pronargs = 0 and p.prorettype = 'pg_catalog.trigger'::regtype
          and not p.prosecdef
          and p.proconfig @> array['search_path=pg_catalog, public']::text[]
      )
    ) as ready`,
  );
  if (row?.ready !== true) throw new HttpError(503, "SERVICE_UNAVAILABLE");
  // Probe every typed column without reading private rows. Table presence alone
  // is not readiness, and this check does not attest to function-body hashes.
  await tx.select().from(suggestions).limit(0);
  await tx.select().from(events).limit(0);
  await tx.select().from(evidence).limit(0);
}
async function lockPrincipal(
  tx: Tx,
  principal: Principal,
  admin = false,
  owner?: string | null | (string | null)[],
) {
  const owners = Array.isArray(owner)
    ? owner.filter((id): id is string => id !== null)
    : owner
      ? [owner]
      : [];
  const ids = [...new Set([principal.user.id, ...owners])].sort();
  const locked = await tx
    .select({ id: user.id, role: user.role, verified: user.emailVerified })
    .from(user)
    .where(inArray(user.id, ids))
    .orderBy(user.id)
    .for("no key update");
  const persisted = locked.find((u) => u.id === principal.user.id);
  if (!persisted?.verified || (admin && persisted.role !== "admin"))
    throw new AuthorizationError(403);
  const [current] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, principal.session.id),
        eq(sessions.token, principal.session.token),
        eq(sessions.userId, persisted.id),
        sql`${sessions.expiresAt} > clock_timestamp()`,
      ),
    )
    .for("share");
  if (!current) throw new AuthorizationError(401);
  await capability(tx);
}
function proposal(row: Row): SubmitMetadataProposal {
  const common = {
    version: row.version,
    workId: row.workId,
    submitKey: row.submitKey,
    baseWorkRevision: row.baseWorkRevision,
    citation: {
      label: row.citationLabel,
      citation: row.citationText,
      ...(row.citationUrl === null ? {} : { url: row.citationUrl }),
      ...(row.citationConsultedAt === null
        ? {}
        : { consultedAt: row.citationConsultedAt }),
    },
  };
  let operation: unknown;
  switch (row.operationType) {
    case "TITLE_ADD":
      operation = {
        type: row.operationType,
        value: {
          title: row.titleText,
          language: row.titleLanguage,
          kind: row.titleKind,
        },
      };
      break;
    case "TITLE_REPLACE":
      operation = {
        type: row.operationType,
        titleId: row.titleId,
        title: row.titleText,
      };
      break;
    case "TITLE_REMOVE":
      operation = {
        type: row.operationType,
        titleId: row.titleId,
        reason: row.operationReason,
      };
      break;
    case "DESCRIPTION_ADD":
    case "DESCRIPTION_REPLACE":
      operation = {
        type: row.operationType,
        language: row.descriptionLanguage,
        text: row.descriptionText,
        rights: {
          basis: row.rightsBasis,
          originalityAcknowledged: row.originalityAcknowledged,
          statement: row.rightsStatement,
        },
      };
      break;
    case "DESCRIPTION_REMOVE":
      operation = {
        type: row.operationType,
        language: row.descriptionLanguage,
        reason: row.operationReason,
      };
      break;
    case "GENRE_ADD_MEMBERSHIP":
      operation = { type: row.operationType, slug: row.genreSlug };
      break;
    case "GENRE_REMOVE_MEMBERSHIP":
      operation = {
        type: row.operationType,
        slug: row.genreSlug,
        reason: row.operationReason,
      };
      break;
    default:
      throw new HttpError(503, "SERVICE_UNAVAILABLE");
  }
  return submitMetadataProposalSchema.parse({ ...common, operation });
}
async function project(tx: Tx, row: Row) {
  const [review] = await tx
    .select({
      reviewReason: events.reviewReason,
      reasonRedacted: events.reasonRedacted,
    })
    .from(events)
    .where(and(eq(events.suggestionId, row.id), eq(events.revision, 2)));
  return metadataSuggestionSchema.parse({
    id: row.id,
    workId: row.workId,
    baseWorkRevision: row.baseWorkRevision,
    revision: row.revision,
    state: row.state,
    appliedWorkRevision: row.appliedWorkRevision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contentState: row.contentState,
    proposal: row.contentState === "ERASED" ? null : proposal(row),
    reviewReason: review?.reviewReason ?? null,
    reasonRedacted: review?.reasonRedacted ?? false,
  });
}
async function snapshot(tx: Tx, workId: string) {
  const [work] = await tx
    .select()
    .from(works)
    .where(eq(works.id, workId))
    .for("update");
  if (!work || work.visibility !== "PUBLISHED")
    throw new HttpError(404, "WORK_NOT_FOUND");
  const titles = await tx
    .select()
    .from(workTitles)
    .where(eq(workTitles.workId, workId))
    .orderBy(workTitles.id)
    .limit(32)
    .for("update");
  const descriptions = await tx
    .select()
    .from(workDescriptions)
    .where(eq(workDescriptions.workId, workId))
    .orderBy(workDescriptions.language)
    .limit(31)
    .for("update");
  const memberships = await tx
    .select()
    .from(workGenres)
    .where(eq(workGenres.workId, workId))
    .orderBy(workGenres.genreSlug)
    .limit(11)
    .for("update");
  if (titles.length > 31 || descriptions.length > 30 || memberships.length > 10)
    throw new HttpError(409, "INVALID_CONTEXT");
  const options = await tx
    .select()
    .from(genres)
    .orderBy(genres.slug)
    .limit(200);
  const current = memberships.length
    ? await tx
        .select()
        .from(genres)
        .where(
          inArray(
            genres.slug,
            memberships.map((g) => g.genreSlug),
          ),
        )
        .limit(10)
    : [];
  const genreOptions = [
    ...new Map([...options, ...current].map((g) => [g.slug, g])).values(),
  ];
  const target = metadataTargetSchema.parse({
    work: {
      id: work.id,
      slug: work.slug,
      primaryTitle: work.primaryTitle,
      primaryTitleLanguage: work.primaryTitleLanguage,
      revision: work.revision,
      visibility: work.visibility,
    },
    titles: titles.map(({ id, workId, title, language, kind }) => ({
      id,
      workId,
      title,
      language,
      kind,
    })),
    descriptions: descriptions.map(({ workId, language, text }) => ({
      workId,
      language,
      text,
    })),
    genreMemberships: memberships.map(({ workId, genreSlug }) => ({
      workId,
      slug: genreSlug,
    })),
    genreOptions,
  });
  return { work, titles, descriptions, memberships, target };
}
function representableCitation(value: SubmitMetadataProposal["citation"]) {
  if (value.url !== undefined && !/^https:\/\/[^\s]+$/.test(value.url))
    throw new HttpError(400, "CITATION_NOT_REPRESENTABLE");
  if (value.consultedAt !== undefined) {
    const date = new Date(value.consultedAt);
    representableSourceDate(date);
  }
}
function representableSourceDate(date: Date | null) {
  if (
    date &&
    (!Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 1 ||
      date.getUTCFullYear() > 9999)
  )
    throw new HttpError(400, "CITATION_NOT_REPRESENTABLE");
}
async function preflight(
  tx: Tx,
  value: SubmitMetadataProposal,
  state: Awaited<ReturnType<typeof snapshot>>,
) {
  representableCitation(value.citation);
  const op = value.operation;
  // Resolve only the requested taxonomy row, never enumerate the taxonomy.
  const requested =
    op.type === "GENRE_ADD_MEMBERSHIP"
      ? await tx
          .select({ slug: genres.slug })
          .from(genres)
          .where(eq(genres.slug, op.slug))
          .for("share")
      : [];
  // Display options are not authority: the exact taxonomy row must still exist
  // in the locked lookup, including during concurrent operator curation.
  if (op.type === "GENRE_ADD_MEMBERSHIP" && requested.length !== 1)
    throw new HttpError(409, "TARGET_MISSING");
  const result = preflightMetadataProposal(value, {
    ...state.target,
    existingGenreSlugs: [
      ...new Set([
        ...state.target.genreOptions.map((g) => g.slug),
        ...requested.map((g) => g.slug),
      ]),
    ],
  });
  if (!result.ok) throw new HttpError(409, result.code);
  const titleText = state.titles
    // V1 materializes this row, but indexes primaryTitle separately, once.
    // Keep translated PRIMARY and same-text ALIAS/ORIGINAL rows intact.
    .filter(
      (t) =>
        !(
          t.kind === "PRIMARY" &&
          t.language === state.work.primaryTitleLanguage &&
          t.title === state.work.primaryTitle
        ),
    )
    .filter((t) => !(op.type === "TITLE_REMOVE" && t.id === op.titleId))
    .map((t) =>
      op.type === "TITLE_REPLACE" && t.id === op.titleId ? op.title : t.title,
    );
  if (op.type === "TITLE_ADD") titleText.push(op.value.title);
  const descriptionText = state.descriptions
    .filter(
      (d) => !(op.type === "DESCRIPTION_REMOVE" && d.language === op.language),
    )
    .map((d) =>
      op.type === "DESCRIPTION_REPLACE" && d.language === op.language
        ? op.text
        : d.text,
    );
  if (op.type === "DESCRIPTION_ADD") descriptionText.push(op.text);
  const slugs = state.memberships
    .filter(
      (g) =>
        !(op.type === "GENRE_REMOVE_MEMBERSHIP" && g.genreSlug === op.slug),
    )
    .map((g) => g.genreSlug);
  if (op.type === "GENRE_ADD_MEMBERSHIP") slugs.push(op.slug);
  const names = slugs.length
    ? await tx.select().from(genres).where(inArray(genres.slug, slugs))
    : [];
  const people = await tx
    .select({ name: creators.name })
    .from(workCreators)
    .innerJoin(creators, eq(creators.id, workCreators.creatorId))
    .where(eq(workCreators.workId, state.work.id));
  const searchText = normalizeTitle(
    [
      state.work.primaryTitle,
      ...titleText,
      ...descriptionText,
      ...people.map((p) => p.name),
      ...names.flatMap((g) => [g.nameEn, g.nameVi]),
    ].join(" "),
  );
  if (!searchText || searchText.length > 100000)
    throw new HttpError(409, "LIMIT_EXCEEDED");
  return searchText;
}
function columns(value: SubmitMetadataProposal) {
  const op = value.operation;
  return {
    version: value.version,
    workId: value.workId,
    baseWorkRevision: value.baseWorkRevision,
    submitKey: value.submitKey,
    operationType: op.type,
    citationLabel: value.citation.label,
    citationText: value.citation.citation,
    citationUrl: value.citation.url ?? null,
    citationConsultedAt: value.citation.consultedAt ?? null,
    titleId: "titleId" in op ? op.titleId : null,
    titleText:
      op.type === "TITLE_ADD"
        ? op.value.title
        : op.type === "TITLE_REPLACE"
          ? op.title
          : null,
    titleLanguage: op.type === "TITLE_ADD" ? op.value.language : null,
    titleKind: op.type === "TITLE_ADD" ? op.value.kind : null,
    descriptionLanguage: "language" in op ? op.language : null,
    descriptionText: "text" in op ? op.text : null,
    genreSlug: "slug" in op ? op.slug : null,
    operationReason: "reason" in op ? op.reason : null,
    rightsBasis: "rights" in op ? op.rights.basis : null,
    originalityAcknowledged:
      "rights" in op ? op.rights.originalityAcknowledged : null,
    rightsStatement: "rights" in op ? op.rights.statement : null,
  };
}
export async function submitMetadataSuggestion(
  workId: string,
  input: Input,
  headers: Headers,
) {
  const principal = await actor(headers);
  origin(headers);
  await transaction((tx) => lockPrincipal(tx, principal));
  await limitCatalogMutation(principal.user.id);
  const id = z.uuid().parse(workId).toLowerCase();
  const value = submitMetadataProposalSchema.parse(
    typeof input === "function" ? await input() : input,
  );
  if (value.workId !== id) throw new HttpError(400, "WORK_ID_MISMATCH");
  const inputHash = createHash("sha256")
    .update(canonicalMetadataProposalInput(value))
    .digest("hex");
  return transaction(async (tx) => {
    await lockPrincipal(tx, principal);
    const [published] = await tx
      .select({ id: works.id })
      .from(works)
      .where(and(eq(works.id, id), eq(works.visibility, "PUBLISHED")))
      .for("update");
    if (!published) throw new HttpError(404, "WORK_NOT_FOUND");
    const [existing] = await tx
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.ownerUserId, principal.user.id),
          eq(suggestions.submitKey, value.submitKey),
        ),
      );
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
      return project(tx, existing);
    }
    const state = await snapshot(tx, id);
    await preflight(tx, value, state);
    const [row] = await tx
      .insert(suggestions)
      .values({ ...columns(value), ownerUserId: principal.user.id, inputHash })
      .returning();
    await tx.insert(events).values({
      suggestionId: row.id,
      revision: 1,
      fromState: null,
      toState: "SUBMITTED",
      actorUserId: principal.user.id,
    });
    return project(tx, row);
  });
}
export async function getMetadataTarget(workId: string, headers: Headers) {
  const principal = await actor(headers);
  const id = z.uuid().parse(workId).toLowerCase();
  return transaction(async (tx) => {
    await lockPrincipal(tx, principal);
    return (await snapshot(tx, id)).target;
  });
}
export async function listMetadataSuggestions(
  input: { page: unknown; pageSize: unknown },
  headers: Headers,
  admin = false,
) {
  const principal = await actor(headers, admin);
  const { page, pageSize } = pageSchema.parse(input);
  return transaction(async (tx) => {
    await capability(tx);
    const where = admin
      ? eq(suggestions.contentState, "ACTIVE")
      : eq(suggestions.ownerUserId, principal.user.id);
    const discovered = await tx
      .select({ id: suggestions.id, owner: suggestions.ownerUserId })
      .from(suggestions)
      .where(where)
      .orderBy(desc(suggestions.createdAt), desc(suggestions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    await lockPrincipal(
      tx,
      principal,
      admin,
      discovered.map((r) => r.owner),
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(where);
    const rows = discovered.length
      ? await tx
          .select()
          .from(suggestions)
          .where(
            and(
              where,
              inArray(
                suggestions.id,
                discovered.map((r) => r.id),
              ),
            ),
          )
          .orderBy(desc(suggestions.createdAt), desc(suggestions.id))
      : [];
    return {
      items: await Promise.all(rows.map((r) => project(tx, r))),
      total: count?.total ?? 0,
      page,
      pageSize,
    };
  });
}
export async function getMetadataSuggestion(
  suggestionId: string,
  headers: Headers,
  admin = false,
) {
  const principal = await actor(headers, admin);
  const id = z.uuid().parse(suggestionId).toLowerCase();
  return transaction(async (tx) => {
    await capability(tx);
    const predicate = and(
      eq(suggestions.id, id),
      admin ? undefined : eq(suggestions.ownerUserId, principal.user.id),
    );
    const [discovered] = await tx
      .select({ owner: suggestions.ownerUserId })
      .from(suggestions)
      .where(predicate);
    await lockPrincipal(tx, principal, admin, discovered?.owner);
    const [row] = await tx.select().from(suggestions).where(predicate);
    if (!row) throw missing();
    let current = null;
    const [work] = await tx
      .select({ visibility: works.visibility })
      .from(works)
      .where(eq(works.id, row.workId));
    if (work?.visibility === "PUBLISHED" && row.contentState === "ACTIVE")
      current = (await snapshot(tx, row.workId)).target;
    const history = await tx
      .select({
        revision: events.revision,
        fromState: events.fromState,
        toState: events.toState,
        createdAt: events.createdAt,
        metadataReviewAcknowledged: events.metadataReviewAcknowledged,
        publicationReviewAcknowledged: events.publicationReviewAcknowledged,
        rightsReviewAcknowledged: events.rightsReviewAcknowledged,
        reasonRedacted: events.reasonRedacted,
      })
      .from(events)
      .where(eq(events.suggestionId, id))
      .orderBy(events.revision)
      .limit(2);
    // Deliberate private audit-to-factual-evidence join: no citation/source IDs,
    // contributor identities, private rights statement or narrative review copy.
    const retained = admin
      ? await tx
          .select({
            id: evidence.id,
            auditEventId: evidence.auditEventId,
            workRevision: evidence.workRevision,
            operationType: evidence.operationType,
            titleId: evidence.titleId,
            descriptionLanguage: evidence.descriptionLanguage,
            genreSlug: evidence.genreSlug,
            beforePresent: evidence.beforePresent,
            afterPresent: evidence.afterPresent,
            beforeTitle: evidence.beforeTitle,
            afterTitle: evidence.afterTitle,
            titleLanguage: evidence.titleLanguage,
            titleKind: evidence.titleKind,
            beforeDescription: evidence.beforeDescription,
            afterDescription: evidence.afterDescription,
            rightsBasis: evidence.rightsBasis,
            originalityAcknowledged: evidence.originalityAcknowledged,
            rightsReviewAcknowledged: evidence.rightsReviewAcknowledged,
          })
          .from(evidence)
          .innerJoin(
            catalogAuditEvents,
            and(
              eq(catalogAuditEvents.id, evidence.auditEventId),
              eq(catalogAuditEvents.workId, evidence.workId),
              eq(catalogAuditEvents.newRevision, evidence.workRevision),
            ),
          )
          .where(
            and(eq(evidence.suggestionId, id), eq(evidence.workId, row.workId)),
          )
          .limit(1)
      : [];
    if (admin && row.state === "APPROVED" && !retained.length)
      throw new HttpError(503, "SERVICE_UNAVAILABLE");
    return (
      admin
        ? metadataAdminSuggestionDetailSchema
        : metadataSuggestionDetailSchema
    ).parse({
      suggestion: await project(tx, row),
      current,
      history: history.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      evidence: retained[0] ?? null,
    });
  });
}
export async function reviewMetadataSuggestion(
  suggestionId: string,
  input: Input,
  headers: Headers,
) {
  const principal = await actor(headers, true);
  origin(headers);
  await transaction((tx) => lockPrincipal(tx, principal, true));
  await limitCatalogMutation(principal.user.id);
  const id = z.uuid().parse(suggestionId).toLowerCase();
  const value = reviewMetadataProposalSchema.parse(
    typeof input === "function" ? await input() : input,
  );
  if (value.suggestionId !== id)
    throw new HttpError(400, "SUGGESTION_ID_MISMATCH");
  return transaction(async (tx) => {
    await capability(tx);
    const [discovered] = await tx
      .select({ owner: suggestions.ownerUserId, workId: suggestions.workId })
      .from(suggestions)
      .where(eq(suggestions.id, id));
    if (!discovered) throw missing();
    await lockPrincipal(tx, principal, true, discovered.owner);
    // Work precedes header/children for every decision, including stale rejection.
    const [work] = await tx
      .select()
      .from(works)
      .where(eq(works.id, discovered.workId))
      .for("update");
    const [previous] = await tx
      .select()
      .from(suggestions)
      .where(eq(suggestions.id, id))
      .for("update");
    if (!previous) throw missing();
    if (
      previous.ownerUserId !== discovered.owner ||
      previous.contentState !== "ACTIVE" ||
      previous.state !== "SUBMITTED" ||
      previous.revision !== value.revision ||
      previous.baseWorkRevision !== value.baseWorkRevision
    )
      throw new HttpError(409, "REVISION_CONFLICT");
    let appliedWorkRevision: number | null = null;
    const eventId = randomUUID();
    if (value.decision === "APPROVE") {
      if (
        !work ||
        work.visibility !== "PUBLISHED" ||
        work.revision !== previous.baseWorkRevision
      )
        throw new HttpError(409, "WORK_REVISION_CONFLICT");
      const intent = proposal(previous);
      const state = await snapshot(tx, work.id);
      const searchText = await preflight(tx, intent, state);
      const op = intent.operation;
      const title =
        "titleId" in op
          ? state.titles.find((t) => t.id === op.titleId)
          : undefined;
      const description =
        "language" in op
          ? state.descriptions.find((d) => d.language === op.language)
          : undefined;
      const membership =
        "slug" in op
          ? state.memberships.find((g) => g.genreSlug === op.slug)
          : undefined;
      const titleId =
        op.type === "TITLE_ADD" ? randomUUID() : (title?.id ?? null);
      const source = sourceSchema.parse(intent.citation);
      let decisionSource: typeof catalogSources.$inferSelect;
      try {
        [decisionSource] = await tx
          .insert(catalogSources)
          .values({
            label: source.label,
            citation: source.citation,
            url: source.url ?? null,
            // Preserve sub-millisecond citation precision; never normalize intent.
            consultedAt: source.consultedAt
              ? sql`${source.consultedAt}::timestamptz`
              : null,
          })
          .returning();
      } catch (error) {
        const code =
          (error as { cause?: { code?: string }; code?: string })?.cause
            ?.code ?? (error as { code?: string })?.code;
        if (["22007", "22008", "22009"].includes(code ?? ""))
          throw new HttpError(400, "CITATION_NOT_REPRESENTABLE");
        throw error;
      }
      // PostgreSQL may round microseconds across the year boundary.
      representableSourceDate(decisionSource.consultedAt);
      const sourceId = decisionSource.id;
      switch (op.type) {
        case "TITLE_ADD":
          await tx.insert(workTitles).values({
            id: titleId!,
            workId: work.id,
            ...op.value,
            normalized: normalizeTitle(op.value.title),
            sourceId,
          });
          break;
        case "TITLE_REPLACE":
          await tx
            .update(workTitles)
            .set({
              title: op.title,
              normalized: normalizeTitle(op.title),
              sourceId,
            })
            .where(
              and(
                eq(workTitles.workId, work.id),
                eq(workTitles.id, op.titleId),
              ),
            );
          break;
        case "TITLE_REMOVE":
          await tx
            .delete(workTitles)
            .where(
              and(
                eq(workTitles.workId, work.id),
                eq(workTitles.id, op.titleId),
              ),
            );
          break;
        case "DESCRIPTION_ADD":
          await tx.insert(workDescriptions).values({
            workId: work.id,
            language: op.language,
            text: op.text,
            sourceId,
          });
          break;
        case "DESCRIPTION_REPLACE":
          await tx
            .update(workDescriptions)
            .set({ text: op.text, sourceId })
            .where(
              and(
                eq(workDescriptions.workId, work.id),
                eq(workDescriptions.language, op.language),
              ),
            );
          break;
        case "DESCRIPTION_REMOVE":
          await tx
            .delete(workDescriptions)
            .where(
              and(
                eq(workDescriptions.workId, work.id),
                eq(workDescriptions.language, op.language),
              ),
            );
          break;
        case "GENRE_ADD_MEMBERSHIP":
          await tx
            .insert(workGenres)
            .values({ workId: work.id, genreSlug: op.slug, sourceId });
          break;
        case "GENRE_REMOVE_MEMBERSHIP":
          await tx
            .delete(workGenres)
            .where(
              and(
                eq(workGenres.workId, work.id),
                eq(workGenres.genreSlug, op.slug),
              ),
            );
          break;
      }
      appliedWorkRevision = work.revision + 1;
      await tx
        .update(works)
        .set({
          revision: appliedWorkRevision,
          sourceId,
          searchText,
          updatedAt: new Date(),
        })
        .where(eq(works.id, work.id));
      await tx
        .update(suggestions)
        .set({
          state: "APPROVED",
          revision: 2,
          appliedWorkRevision,
          updatedAt: new Date(),
        })
        .where(eq(suggestions.id, id));
      await tx.insert(events).values({
        id: eventId,
        suggestionId: id,
        revision: 2,
        fromState: "SUBMITTED",
        toState: "APPROVED",
        actorUserId: principal.user.id,
        reviewReason: value.reason,
        appliedWorkRevision,
        metadataReviewAcknowledged: true,
        publicationReviewAcknowledged: true,
        rightsReviewAcknowledged: true,
      });
      const [audit] = await tx
        .insert(catalogAuditEvents)
        .values({
          workId: work.id,
          previousRevision: work.revision,
          newRevision: appliedWorkRevision,
          actorUserId: principal.user.id,
          actorIdSnapshot: "metadata-review",
          operation: "UPDATE",
          changes: { sourceId },
        })
        .returning();
      const added =
        op.type.endsWith("ADD") || op.type === "GENRE_ADD_MEMBERSHIP";
      const removed =
        op.type.endsWith("REMOVE") || op.type === "GENRE_REMOVE_MEMBERSHIP";
      await tx.insert(evidence).values({
        suggestionId: id,
        workId: work.id,
        workRevision: appliedWorkRevision,
        approvalEventId: eventId,
        auditEventId: audit.id,
        operationType: op.type,
        titleId,
        titleLanguage:
          op.type === "TITLE_ADD"
            ? op.value.language
            : (title?.language ?? null),
        titleKind:
          op.type === "TITLE_ADD" ? op.value.kind : (title?.kind ?? null),
        descriptionLanguage: "language" in op ? op.language : null,
        genreSlug: "slug" in op ? op.slug : null,
        beforePresent: !added,
        afterPresent: !removed,
        beforeTitle: title?.title ?? null,
        afterTitle:
          op.type === "TITLE_ADD"
            ? op.value.title
            : op.type === "TITLE_REPLACE"
              ? op.title
              : null,
        beforeDescription: description?.text ?? null,
        afterDescription: "text" in op ? op.text : null,
        decisionSourceId: sourceId,
        previousSourceId:
          title?.sourceId ??
          description?.sourceId ??
          membership?.sourceId ??
          null,
        resultingSourceId: removed ? null : sourceId,
        rightsBasis: "rights" in op ? op.rights.basis : null,
        originalityAcknowledged: "rights" in op ? true : null,
        rightsReviewAcknowledged: "rights" in op ? true : null,
      });
    } else {
      await tx
        .update(suggestions)
        .set({ state: "REJECTED", revision: 2, updatedAt: new Date() })
        .where(eq(suggestions.id, id));
      await tx.insert(events).values({
        id: eventId,
        suggestionId: id,
        revision: 2,
        fromState: "SUBMITTED",
        toState: "REJECTED",
        actorUserId: principal.user.id,
        reviewReason: value.reason,
      });
    }
    const [row] = await tx
      .select()
      .from(suggestions)
      .where(eq(suggestions.id, id));
    return project(tx, row);
  });
}
