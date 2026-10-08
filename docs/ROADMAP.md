# Roadmap

## V0 — foundation (IN PROGRESS, not verified)

Complete account UI/verification/reset/session handling, secure role guards, en/vi/theme consistency, explicit migrations and repeatable checks. Gate: static/build checks plus isolated PostgreSQL auth/rate-limit/revocation tests and browser flows; record actual results/blockers in VALIDATION. Production SMTP, host/proxy and DB readiness require separate evidence.

## V1 — catalog and private library (planned)

Canonical works/external identities/localized titles; private-by-default library with progress, status, rating and notes; explicit reading sessions for rereads. Gate owner isolation, uniqueness/races, finite input limits and privacy-safe public projections.

## V2 — metadata search (planned)

Reviewed MangaDex adapter, provenance/content policy, normalized indexed search, bounded cache/negative TTL/timeouts, strict image egress and durable refresh only if needed. Gate deterministic fixtures and no private metadata leakage.

## V3 — communities (planned)

Stable work hubs, one thread model, explicit reaction state, abuse limits/moderation and privacy-aware publication. No normalized-title identity.

Later discovery/recommendations/import/analytics need independent product, privacy and operational decisions. No schedule promises, live providers or job infrastructure are implied by this roadmap.
