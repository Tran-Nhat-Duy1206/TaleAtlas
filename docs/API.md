# API contracts

V0 identity foundation is implemented; no independent REST API service. Next route `apps/web/src/app/api/auth/[...all]/route.ts` delegates authentication to Better Auth under `/api/auth`. Use the configured Better Auth client/server APIs rather than inventing token formats.

Configured email/password flows include sign-up, email verification, sign-in, password-reset request/completion, sign-out, session retrieval/revocation and verified account deletion. Exact request/response/error shapes follow Better Auth 1.7.7 and must be pinned by integration tests before consumers rely on them. Sign-in requires verified email; password length is 12–128; sign-up/verification do not auto-sign-in. Reset revokes sessions. The server change-password wrapper requests revocation of other sessions.

`src/server/session.ts` supplies `requireSession` (401 on missing session), `requireRole` (403 on disallowed role), session revocation and guarded password change. Authorization must be checked at the server resource boundary; client routing is not access control.

Mutations must use the trusted `APP_ORIGIN`, library origin/CSRF protections and appropriate content types. Database-backed auth rate limits are configured; deployment must supply a trustworthy client-IP header. Auth server-error responses are standardized to generic 503 at the application boundary; driver errors are sanitized before reaching Next SSR logging. Do not return raw DB/SMTP errors, secrets or stack traces.

Operational GET routes: `/api/health` returns liveness with no dependency check; `/api/ready` returns 200 when the bounded two-second DB/required-schema probe succeeds, otherwise 503. Responses are no-store and contain no credentials; readiness does not check SMTP/backups.

## V1 catalog (implemented; locally verified)

All routes use Node runtime, dynamic/no-store responses and actual PostgreSQL records. Public slug/search count/IDs/children share a read-only REPEATABLE READ snapshot; a concurrent hide can leave an in-flight old public result, but cannot inject newly private metadata. The next request sees the committed hidden state. See `V1_VALIDATION.md` for verification status, not a hosted acceptance claim.

| Method/path                                     | Boundary                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| GET `/api/catalog/works`                        | Public published-only search/list                                     |
| GET `/api/catalog/works/[slug]`                 | Public published detail; draft/hidden/missing is 404                  |
| GET `/api/admin/catalog/works`                  | Administrator-only full-visibility list                               |
| POST `/api/admin/catalog/works`                 | Administrator-only create, 200                                        |
| GET `/api/admin/catalog/works/[id]`             | Administrator-only UUID lookup                                        |
| PATCH `/api/admin/catalog/works/[id]`           | Full metadata update with current `revision`                          |
| POST `/api/admin/catalog/works/[id]/visibility` | `{ revision, visibility, publicationReviewAcknowledged? }` transition |

List queries are strict: `q` ≤200 characters, `page` ≥1, `pageSize` 1–50 (default20), bounded offset ≤10000, optional known `format`, normalized genre slug, `locale=en|vi`. Response is `{ items, total, page, pageSize }`, not invented counts. UUIDs/slugs are output identifiers, not editable metadata. Work/edition/creator/source/rights contracts are in `src/features/catalog/contracts.ts`; omitted unknown values stay unknown. Work ISBN belongs to editions, not a global work namespace.

All create/full-update/visibility commands targeting `PUBLISHED` require strict boolean `publicationReviewAcknowledged: true`, even when updating already published metadata. Omitted/false is allowed only for DRAFT/HIDDEN. This command-only attestation is not a persisted/public Work DTO property; the session-owned actor and attestation are committed in audit. It does not independently certify citations/content/rights. Edition IDs must remain work-owned and supplied to retain identity. Full PATCH still replaces the submitted aggregate, so omitted optional metadata is removal, not an implicit partial patch. Unchanged assertions retain their prior source attribution; changed scalars on compound records have per-field evidence. The public `source` remains the latest editorial submission, not proof of all values.

Mutations require exact configured Origin, application/json, bounded streamed body64KiB and smaller parsed aggregate60KB to accommodate audit storage. Independent atomic administrator write limiting is30/minute. Role is read at the backend before privileged input parsing. API errors are generic and bounded: 400 invalid input, 401 missing session, 403 role/Origin, 409 identity/revision conflict, 413 body limit, 415 content type, 429 limit, 503 unavailable; do not leak driver text. Updates/revision/audit snapshots commit atomically. A conflict never authorizes overwriting another editor. Public output excludes revision, visibility, actors/audit and unpublished relation targets.

**Not implemented:** provider lookup/refresh, library CRUD/progress, community, recommendation or public statistics APIs. No placeholder endpoint implies these exist.

## V2 request contracts (V2B locally verified; actual CI pending)

V2A is verified at `e1aba9efdc76e5b5feb6d353f1fc362d797f8193`; actual [PR CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37935802536) and [push CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37935791732) succeeded. V2B routes below have local unit/SQL, browser and production build/smoke evidence; actual V2B commit/CI acceptance remains pending. Five distinct browser cases passed across two isolated sessions, not one combined5/5 run; the initial4/5 memory-exhaustion/reload timeout remains recorded.

| Method/path                             | Contract                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| POST `/api/requests`                    | `{submitKey, details}` → owner DTO                                                                                                   |
| GET `/api/requests`                     | Own requests only → paginated owner DTOs                                                                                             |
| GET `/api/requests/[id]`                | `{kind:'OWNED', request, supporterCount, work}` or `{kind:'FOLLOWED', request:RequestSummary}`; non-following other users receive404 |
| PATCH `/api/requests/[id]`              | Owner-only `{revision, details}` → owner DTO; withdraws reviewed summary/search key                                                  |
| POST `/api/requests/[id]/cancel`        | Owner-only `{revision}` → owner DTO; withdraws summary/search key                                                                    |
| POST `/api/requests/[id]/support`       | `{equivalenceAcknowledged:true}` → safe summary; active reviewed requests only; owner409, unavailable/unreviewed/missing404          |
| DELETE `/api/requests/[id]/support`     | Blind own-relationship deletion → `{following:false}` even for missing IDs; idempotent                                               |
| GET `/api/requests/search`              | Authenticated reviewed-title/alias search; required `q` (1–600), never raw private request search                                    |
| GET `/api/requests/following`           | Own followed relationships → paginated safe summaries, including redacted withdrawn entries                                          |
| POST `/api/admin/requests/[id]/summary` | Administrator human review of an active request, not approval/publication                                                            |

All reads require a session. Pagination is strict `page`1–1000 and `pageSize`1–50 (defaults1/20); list responses are `{items,total,page,pageSize}`. Every mutation checks session/admin role before body parsing, exact configured Origin, and (when a body is required) application/json with streamed64KiB limit. `safeJson` returns no-store sanitized errors. Existing atomic30/minute catalog mutation limiting uses only the authenticated actor; owner writes are not charged twice.

`RequestSummary` contains only `{id,title:string|null,format:RequestFormat|null,state,revision,supporterCount,following,work:{slug}|null}`. A published Work slug is visibility-qualified in the same read-only REPEATABLE READ snapshot as details/counts. Owned detail includes private input/events; followed detail never includes raw title, normalized title, notes, evidence, events or owner/supporter identities. Withdrawn/cancelled summaries have null title/format, never private fallback. Search can offer safe reviewed summaries to non-followers without granting private detail access.

Summary review requires `{revision,title,format,alternativeTitles?,sourceUrl,reason,equivalenceReviewAcknowledged:true}`: UNKNOWN is permitted, aliases ≤12, reason ≤2000 and sourceUrl uses the citation-only evidence URL validator. The request lock protects revision increment, reviewed summary triplet, curated title/alias search key and same-revision `SUMMARY_REVIEWED` audit reason/citation/request-identity/review markers. No raw-input title equality proves identity; no approval or Work creation is implied. Support requires an explicit equivalence acknowledgment and unique(user,request) concurrency protection, not fuzzy matching or fake notifications.

Strict private details require title+format with optional bibliographic/evidence fields; client-owned user/state/result/publication authority is excluded. Administrator NEEDS_INFO/NEEDS_REVIEW/REJECTED moderation remains an internal V2A service. Approval/link/provider-trigger/edit-suggestion routes remain later milestones.

Idempotency is per owner/submission key plus exact canonical input hash; conflicting reuse is409, not an automatic title/author merge. Revisions conflict with409; cross-owner/missing requests use404. Shared catalog mutation limiter applies30/minute authenticated writes. Public routes must use existing safeJson to sanitize errors, session/role checks before parsing, trusted Origin and body budgets. Request input cap12KB reserves space for bounded transactional32KiB old/new event snapshots. Failure-only job codes and provider policy are not raw private request DTO data. Full candidate identity/publication controls do not exist merely because future contracts name them.
