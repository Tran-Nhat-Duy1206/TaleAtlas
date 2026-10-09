# Operations

V0 foundation is implemented with local verification; no production operational proof. There is one web runtime plus PostgreSQL and SMTP. No worker, provider refresh scheduler or production monitoring stack is claimed.

## Startup and configuration

Validate Node 24/pnpm 11.7.0, canonical origin, private auth secret, DB and SMTP. Production auth rejects non-HTTPS origin and invalid mail configuration. SMTP failure means verification/recovery cannot be assumed available. Supply CLI variables explicitly; Next app-local environment loading differs from root tools. Apply reviewed migrations manually before releasing compatible code.

## V1 catalog operations (locally verified; hosted operations unverified)

Apply the reviewed catalog `0001`, forward cover-credit `0002` and final-review field-evidence/audit `0003` before releasing the matching catalog code. Never rewrite applied SQL; readiness now requires the evidence table. Older attribution overwritten before this fix is not certified repaired: first new edits bootstrap only currently available row sources. The PostgreSQL role must be allowed to install `pg_trgm`; absence is a failed readiness/migration gate, not a reason to fake search or skip migration. The readiness probe includes required catalog columns and trigram functionality while remaining bounded and not reading user rows.

No administrator is created automatically. An authorized operator must select an already verified, independently confirmed existing user ID, privately review a least-privilege role change through controlled database access, and record that operational action. Never derive privilege from email alone or use a public bootstrap endpoint/default password. Routine moderators cannot call V1 admin CRUD. Revoke roles/sessions promptly when staff access ends.

Publication requires human review of source citation, title/edition/creator identity and cover rights. Every PUBLISHED-target create/update/visibility command (also edits staying published) must carry `publicationReviewAcknowledged: true`; server guards enforce and transactionally audit the authorized administrator's attestation. A checked box cannot independently prove truthful factual/content/rights review. Field evidence and unchanged child sources retain their earlier attribution; the latest editorial source is not a blanket replacement citation. Unknown cover rights mean placeholder, not downloading a remote image. Original source metadata/aliases remain auditable; don't claim a source is official merely because someone entered its URL. Normal retitle changes metadata but never UUID/slug. Revision409 means reload/reconcile, not forced overwrite; hidden/draft works and unpublished relation targets disappear from public queries.

Development uses `next dev --webpack`; production is built with `next build`. Keep application source held while recording browser acceptance. Incoming-request URL logging is disabled to avoid callback-token exposure. Local diagnostics and disposable database credentials belong only under ignored `.local`, never GitHub artifacts containing live data.

## Incident handling

- DB unavailable: retain generic client errors; inspect sanitized operation categories and DB health privately. Do not retry writes blindly or run automatic DDL.
- Mail unavailable: inspect provider status/sender/TLS privately, restore configuration and retry via rate-limited user flows; never paste credentials or verification URLs into logs/issues.
- Suspected session compromise: revoke affected sessions using server APIs, assess secret/account compromise and rotate credentials with a reviewed user-impact plan.
- Proxy/rate-limit anomaly: verify trusted infrastructure supplies `x-vercel-forwarded-for` when VERCEL=1, or overwrites `x-real-ip` otherwise; prevent direct-origin bypass.

## Backups and evidence

Choose encrypted restricted backups, explicit retention and restore drills before production launch. An isolated synthetic restore proves mechanics only, not recovery of live data or deletion compliance. Document target, timestamp, tool versions, results and cleanup. Never restore production data into a developer/CI database.

Session/verification/rate-limit retention and bounded cleanup require explicit implementation review; do not claim garbage collection from expiry timestamps alone. `GET /api/health` is liveness only (fixed healthy response, no dependency probe). `GET /api/ready` probes database connectivity and required schema with a two-second bound, returning 200 or 503 without secrets; neither verifies SMTP, backup recovery or complete application health. No operational dashboard is claimed. Future jobs need bounded batches, durable claims, timeouts and reconciliation, not long process timers/fire-and-forget promises.

Maintain VALIDATION with observed failures and blockers. Real SMTP, Neon/Vercel provisioning and production TLS/proxy checks remain unavailable unless separately supplied and verified.
