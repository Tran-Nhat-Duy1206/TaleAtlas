# Operations

V0 foundation is implemented with local verification; no production operational proof. There is one web runtime plus PostgreSQL and SMTP. No worker, provider refresh scheduler or production monitoring stack is claimed.

## Startup and configuration

Validate Node 24/pnpm 11.7.0, canonical origin, private auth secret, DB and SMTP. Production auth rejects non-HTTPS origin and invalid mail configuration. SMTP failure means verification/recovery cannot be assumed available. Supply CLI variables explicitly; Next app-local environment loading differs from root tools. Apply reviewed migrations manually before releasing compatible code.

## Incident handling

- DB unavailable: retain generic client errors; inspect sanitized operation categories and DB health privately. Do not retry writes blindly or run automatic DDL.
- Mail unavailable: inspect provider status/sender/TLS privately, restore configuration and retry via rate-limited user flows; never paste credentials or verification URLs into logs/issues.
- Suspected session compromise: revoke affected sessions using server APIs, assess secret/account compromise and rotate credentials with a reviewed user-impact plan.
- Proxy/rate-limit anomaly: verify trusted infrastructure supplies `x-vercel-forwarded-for` when VERCEL=1, or overwrites `x-real-ip` otherwise; prevent direct-origin bypass.

## Backups and evidence

Choose encrypted restricted backups, explicit retention and restore drills before production launch. An isolated synthetic restore proves mechanics only, not recovery of live data or deletion compliance. Document target, timestamp, tool versions, results and cleanup. Never restore production data into a developer/CI database.

Session/verification/rate-limit retention and bounded cleanup require explicit implementation review; do not claim garbage collection from expiry timestamps alone. `GET /api/health` is liveness only (fixed healthy response, no dependency probe). `GET /api/ready` probes database connectivity and required schema with a two-second bound, returning 200 or 503 without secrets; neither verifies SMTP, backup recovery or complete application health. No operational dashboard is claimed. Future jobs need bounded batches, durable claims, timeouts and reconciliation, not long process timers/fire-and-forget promises.

Maintain VALIDATION with observed failures and blockers. Real SMTP, Neon/Vercel provisioning and production TLS/proxy checks remain unavailable unless separately supplied and verified.
