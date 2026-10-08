# Metadata providers

**Planned only. V0 contains no provider adapter, catalog search or provider credential.** MangaDex is a candidate based on StoryNest's source audit, not an active integration. No external search results are fabricated.

V1 is a global manually curated, source-attributed catalog with local catalog search, not remote discovery. Remote provider discovery and requests belong to V2; the private reading library belongs to V3.

Before implementation approve:

- Provider terms, request budget/rate-limit behavior and explicit content-rating policy (safe/suggestive/erotica must not silently share a default).
- Canonical `(provider, external_id)` uniqueness; locale-tagged original/alternate titles and metadata provenance. Missing VI must stay missing, not fallback English stored as Vietnamese.
- Centralized versioned normalization used for ranking, not identity; original titles preserved. Chapter labels/unknown totals need deliberate representation.
- Bounded cache capacity; separate short empty-result TTL and transient-failure cooldown; concurrent request collapse, abortable deadlines, global concurrency/rate budget and deterministic offline fixtures.
- HTTPS image-host allowlist, safe redirect handling/egress, streaming byte bounds and timeouts. Never fetch arbitrary image-looking hosts.
- User-local metadata overrides excluded from shared public search unless explicitly reviewed/published.

Future refresh jobs must be bounded and durable when correctness requires completion, with leases/retries and reconciliation for ambiguous outcomes. No fire-and-forget serverless refresh guarantee and no exactly-once external delivery claim. Review these principles against actual query plans and provider behavior before enabling live calls.
