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

## V2A contracts (internal only; public endpoints not yet implemented)

`features/ingestion/contracts` defines strict title+format (UNKNOWN allowed), optional bibliographic/evidence fields, UUID submission keys, expected revisions, pagination and reasoned moderation. Input excludes client-owned user/state/result/publication authority. Internal server services implement authenticated private submission/list/detail/amend/cancel and administrator-only NEEDS_INFO/NEEDS_REVIEW/REJECTED transitions. They are not exposed as public HTTP routes in V2A; Request a Story/My Requests/support routes and Origin/bounded JSON wrappers arrive in verified V2B. Approval/link/provider job-trigger/edit-suggestion routes remain later milestones. No scaffold endpoint is advertised as complete.

Idempotency is per owner/submission key plus exact canonical input hash; conflicting reuse is409, not an automatic title/author merge. Revisions conflict with409; cross-owner/missing requests use404. Shared catalog mutation limiter applies30/minute authenticated writes. Public routes must use existing safeJson to sanitize errors, session/role checks before parsing, trusted Origin and body budgets. Request input cap12KB reserves space for bounded transactional32KiB old/new event snapshots. Failure-only job codes and provider policy are not raw private request DTO data. Full candidate identity/publication controls do not exist merely because future contracts name them.
