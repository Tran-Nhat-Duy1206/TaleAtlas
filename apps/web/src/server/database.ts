import "server-only";
import {
  createDatabase,
  type DatabaseConnection,
} from "@taleatlas/database/client";
import { getDatabaseEnv } from "./env";
import { logServerError } from "./logger";
import { isCommunityEnabled } from "./community/gate";

let connection: DatabaseConnection | undefined;
export function getDatabaseConnection() {
  connection ??= createDatabase(getDatabaseEnv().DATABASE_URL);
  return connection;
}
export function getDatabase() {
  return getDatabaseConnection().db;
}
export type DatabaseHealth = { status: "ok" | "unavailable" };
export async function checkDatabaseHealth(
  timeoutMs = 2000,
): Promise<DatabaseHealth> {
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(100, Math.min(timeoutMs, 5000))
    : 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Independent zero-row scalar plans avoid a large Cartesian join and never read user data.
    // Readiness verifies deployed auth/catalog schema and the required trigram extension.
    const query = getDatabaseConnection().client`
      select
        (select id from users limit 0), (select id from sessions limit 0),
        (select id from accounts limit 0), (select id from verifications limit 0),
        (select id from rate_limits limit 0), (select id from catalog_sources limit 0),
        (select concat(id::text, slug, revision::text, search_vector::text,
          similarity(search_text, search_text)::text) from works limit 0),
        (select id from work_titles limit 0), (select text from work_descriptions limit 0),
        (select id from editions limit 0), (select id from creators limit 0),
        (select edition_id from work_creators limit 0), (select slug from genres limit 0),
        (select genre_slug from work_genres limit 0), (select asset_path from work_covers limit 0),
        (select value from work_identifiers limit 0), (select type from work_relations limit 0),
        (select actor_id_snapshot from catalog_audit_events limit 0),
        (select concat(field_path, revision::text, value::text, source_id::text) from catalog_field_evidence limit 0),
        (select concat(id::text, state::text, revision::text, input_revision::text, public_search_text) from work_requests limit 0),
        (select concat(user_id, request_id::text) from work_request_supporters limit 0),
        (select concat(request_id::text, revision::text) from request_events limit 0),
        (select concat(id, enabled::text, requests_in_window::text) from provider_registry limit 0),
        (select concat(id::text, state::text, lease_token::text, attempts::text) from ingestion_jobs limit 0),
        (select concat(request_id::text, input_revision::text, job_id::text, candidate::text, matches::text) from ingestion_candidates limit 0),
        (select concat(work_id::text, revision::text, base_work_revision::text, proposed::text, citation::text) from edit_suggestions limit 0),
        (select concat(suggestion_id::text, revision::text, payload::text) from edit_suggestion_events limit 0),
        (select concat(work_id::text, release_date::text, source_id::text, reviewed_work_revision::text) from catalog_releases limit 0),
        (select concat(id::text, user_id, work_id::text, status::text, revision::text, removed_at::text) from library_entries limit 0),
        (select concat(entry_id::text, user_id, work_id::text, state::text, edition_id::text, started_on::text, finished_on::text) from reading_sessions limit 0),
        (select concat(entry_id::text, user_id, entry_revision::text, request_hash, snapshot::text) from library_events limit 0),
        (select concat(session_id::text, entry_id::text, user_id, work_id::text, entry_revision::text, chapter_number::text, edition_id::text) from reading_progress_events limit 0),
        (exists (
          select 1 from pg_catalog.pg_index
          where indexrelid = pg_catalog.to_regclass('public.library_events_entry_scope_idx')
            and indrelid = pg_catalog.to_regclass('public.library_events')
            and indisvalid and indisready
        ) and exists (
          select 1 from pg_catalog.pg_trigger t
          join pg_catalog.pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = pg_catalog.to_regclass('public.users')
            and t.tgname = 'library_user_erasure_replan'
            and t.tgenabled in ('O', 'A') and not t.tgisinternal
            and p.oid = pg_catalog.to_regprocedure('public.library_user_erasure_replan()')
            and not p.prosecdef and p.proconfig is null
        )) as library_erasure_ready
    `;
    // Disabled V4 has no schema dependency; enabled readiness must verify privacy infrastructure too.
    const communityQuery = isCommunityEnabled()
      ? getDatabaseConnection().client`
      select
        (select concat(id::text,work_id::text,kind::text,author_state::text,moderation_state::text,revision::text,body_spoiler::text) from community_contents limit 0),
        (select concat(content_id::text,actor_id,content_revision::text,command::text) from community_content_events limit 0),
        (select concat(content_id::text,work_id::text,target_kind::text,reporter_id,state::text,revision::text,evidence_redacted::text) from community_reports limit 0),
        (select concat(content_id::text,work_id::text,target_kind::text,actor_id,report_id::text,evidence_redacted::text) from community_moderation_actions limit 0),
        (select concat(content_id::text,work_id::text,target_kind::text,actor_id,mutation_key::text,request_hash,report_id::text) from community_mutation_receipts limit 0),
        (select count(*)=5 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
          where not t.tgisinternal and t.tgenabled in ('O','A') and not p.prosecdef
          and (t.tgname,t.tgrelid,p.proname) in (
            ('community_content_scope_and_erasure','public.community_contents'::regclass,'community_content_scope_and_erasure'),
            ('community_report_erasure_redact_actions','public.community_reports'::regclass,'community_report_erasure_redact_actions'),
            ('community_reports_erased_target_evidence','public.community_reports'::regclass,'community_erased_target_evidence'),
            ('community_actions_erased_target_evidence','public.community_moderation_actions'::regclass,'community_erased_target_evidence'),
            ('community_user_erasure_budgets','public.users'::regclass,'community_user_erasure_budgets')
          )) as community_erasure_ready
    `
      : null;
    const [rows, communityRows] = await Promise.race([
      Promise.all([query, communityQuery ?? Promise.resolve(null)]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            query.cancel();
            communityQuery?.cancel();
          } catch {
            /* Cancellation must not bypass timeout handling. */
          }
          reject(new Error("Database health timeout"));
        }, boundedTimeout);
      }),
    ]);
    if (rows[0]?.library_erasure_ready !== true) {
      throw new Error("Required private-library erasure migration unavailable");
    }
    if (
      communityQuery &&
      communityRows?.[0]?.community_erasure_ready !== true
    ) {
      throw new Error("Required community privacy migration unavailable");
    }
    return { status: "ok" };
  } catch (error) {
    logServerError("database.health", error);
    return { status: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
