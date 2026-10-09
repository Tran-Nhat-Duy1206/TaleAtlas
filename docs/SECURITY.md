# Security and privacy

V0 foundation is implemented and local acceptance is complete; hosted SMTP/TLS/proxy/cookie checks remain unverified. Source configuration and green tests are not a security certification. Report suspected vulnerabilities privately to the repository maintainer; do not publish credentials, live verification links or personal data in issues.

## Current controls

Better Auth 1.7.7 owns password/session flows. Passwords require 12–128 characters; email verification is required; reset revokes sessions. The server password-change wrapper requests other-session revocation. Production cookies are Secure/HttpOnly/SameSite=Lax; cookie session caching is disabled. Only the canonical `APP_ORIGIN` is trusted. Sign-up cannot set role or preferred-locale additional fields. Roles are `user`, `moderator`, `admin`, with server-side session/role helpers; there is no default administrator password or email-derived privilege.

Auth throttling is database-backed with tighter sign-in/sign-up/reset/verification/deletion rules. Auth uses `x-vercel-forwarded-for` only when `VERCEL=1`; otherwise a trusted proxy must overwrite `x-real-ip` and prevent direct origin access. Origin and CSRF checks are explicitly enabled (`disableOriginCheck=false`, `disableCSRFCheck=false`), including NODE_ENV=test. SMTP timeouts are bounded and production transport requires TLS. Remote PostgreSQL clients explicitly require certificate verification; use verify-full migration URLs rather than require-only modes that can disable verification. Plain TCP is restricted to loopback development/test; live hosted TLS verification is not claimed. Boundary logs are sanitized; neither password nor email link should be logged.

## V1 catalog boundaries (implemented; locally verified)

Administrative metadata mutations require backend administrator authorization independently of UI links. Role is checked before privileged body parsing and reread from persisted identity, not trusted from submitted fields. Exact configured Origin, content-type/streamed-body limits and independent PostgreSQL-backed write throttling protect administrative API mutations. Positive optimistic revisions and work-row locks prevent silent concurrent overwrites; source/audit/child replacement rolls back with failures.

Public catalog output is allowlisted: published works only, no revision/visibility/audit/actor values, and no references to unpublished relation targets. Source URLs are HTTPS informational links only, never arbitrary server fetch targets. Approved cover paths are constrained to local raster assets with explicit rights statement and attribution; UNKNOWN uses an original nonofficial illustration, not copied official art. No image proxy/provider is activated.

Catalog history records opaque actor snapshots and asserted metadata/source values. Account deletion SET NULLs its actor FK but deliberately does not erase global catalog/history; this application-append-only history is not cryptographic or administrator-tamper-proof. Bound snapshots avoid accidentally copying entire identity/session objects. Callback tokens can occur in Next development request URLs, so incoming-request logging is disabled as well as using sanitized application logs. Traces/screenshots are ignored local diagnostics with synthetic test actors, not artifacts to publish with raw cookies/tokens.

## Data inventory and handling

Current schema stores identity/email verification, optional profile image, role/locale, account credentials, session expiry/token and optional IP/user-agent, expiring verification values and rate-limit metadata. Treat session/verification/account tables and backups as sensitive. Better Auth session tokens remain raw sensitive database values; verification identifiers are configured hashed. This is not blanket encryption/hashing of every verification/account column.

Account deletion is configured with an email-verification hook; user-linked sessions/accounts have cascading FKs. This is not evidence of universal erasure: emails, logs, host data, replicas and historical backups may remain. Expired verification/session cleanup, retention windows, export and backup deletion policy need explicit operational decisions and tests. No legal-compliance certification is claimed.

## Required gates / future policy

Test unverified sign-in denial, invalid/expired tokens, logout/reset/password-change revocation, forged origin, role injection/downgrade, cross-user access and multi-process rate limiting. Validate production cookies/proxy/IP behavior and SMTP failure handling.

Future libraries/notes/progress must be private by default. Public feeds/search must never implicitly learn private user metadata; publish only explicit public projections. Provider imports need content-rating policy, provenance, bounded egress/timeouts and strict image allowlists. Community abuse and moderation policies must precede publication features. Never run reference-repository scripts on an unknown/live database.
