# API contracts

V0 identity foundation is implemented; no independent REST API service. Next route `apps/web/src/app/api/auth/[...all]/route.ts` delegates authentication to Better Auth under `/api/auth`. Use the configured Better Auth client/server APIs rather than inventing token formats.

Configured email/password flows include sign-up, email verification, sign-in, password-reset request/completion, sign-out, session retrieval/revocation and verified account deletion. Exact request/response/error shapes follow Better Auth 1.7.7 and must be pinned by integration tests before consumers rely on them. Sign-in requires verified email; password length is 12–128; sign-up/verification do not auto-sign-in. Reset revokes sessions. The server change-password wrapper requests revocation of other sessions.

`src/server/session.ts` supplies `requireSession` (401 on missing session), `requireRole` (403 on disallowed role), session revocation and guarded password change. Authorization must be checked at the server resource boundary; client routing is not access control.

Mutations must use the trusted `APP_ORIGIN`, library origin/CSRF protections and appropriate content types. Database-backed auth rate limits are configured; deployment must supply a trustworthy client-IP header. Auth server-error responses are standardized to generic 503 at the application boundary; driver errors are sanitized before reaching Next SSR logging. Do not return raw DB/SMTP errors, secrets or stack traces.

Operational GET routes: `/api/health` returns liveness with no dependency check; `/api/ready` returns 200 when the bounded two-second DB/required-schema probe succeeds, otherwise 503. Responses are no-store and contain no credentials; readiness does not check SMTP/backups.

**Not implemented:** catalog, MangaDex, library CRUD/progress, community, recommendation, public statistics or provider refresh APIs. Their future contracts require schema validation, stable IDs, owner scoping, idempotent state changes, pagination and explicit privacy projection. No placeholder endpoint should imply these services exist.
