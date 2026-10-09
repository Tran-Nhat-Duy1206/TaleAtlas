# Metadata providers

**V2A provider contracts/policy review passed local foundation acceptance; fresh CI is pending. Live adapters remain disabled.** V0's lack of providers and V1's local-only catalog are preserved historical scope, not today's full architecture description. MangaDex remains unapproved, not active because a reference repository used it. No external search results are fabricated. See `PROVIDER_POLICIES.md` for current official-source review and `V2_VALIDATION.md` for actual evidence.

V1 is a global manually curated, source-attributed catalog with local catalog search, not remote discovery. Remote provider discovery and requests belong to V2; the private reading library belongs to V3.

Before implementation approve:

- Provider terms, request budget/rate-limit behavior and explicit content-rating policy (safe/suggestive/erotica must not silently share a default).
- Canonical `(provider, external_id)` uniqueness; locale-tagged original/alternate titles and metadata provenance. Missing VI must stay missing, not fallback English stored as Vietnamese.
- Centralized versioned normalization used for ranking, not identity; original titles preserved. Chapter labels/unknown totals need deliberate representation.
- Bounded cache capacity; separate short empty-result TTL and transient-failure cooldown; concurrent request collapse, abortable deadlines, global concurrency/rate budget and deterministic offline fixtures.
- HTTPS image-host allowlist, safe redirect handling/egress, streaming byte bounds and timeouts. Never fetch arbitrary image-looking hosts.
- User-local metadata overrides excluded from shared public search unless explicitly reviewed/published.

V2A durable job primitives implement persisted intent, bounded lease claims/recovery and retries/dead letters. V2C refresh execution must reuse these primitives and reconcile ambiguous outcomes. No fire-and-forget serverless refresh guarantee and no exactly-once external delivery claim. Review these principles against actual query plans and provider behavior before enabling live calls.
