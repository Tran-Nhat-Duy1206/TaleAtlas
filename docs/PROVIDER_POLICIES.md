# Provider policies — V2A

Review date: **2026-10-09**. This is our review date, not a claimed publication/update date for source documents. Official documentation was researched read-only with web_search and web_fetch. Graph MCP was unavailable; bounded reads of the pure catalog constants and web package manifest were the source fallback. Branch/base verified as `feat/v2-catalog-ingestion` / `11d544a`.

## Default deny and scope

All production provider policies are **disabled**, approval **PENDING**, `autoPublish: false`, `humanReviewRequired: true`. REVIEWED means documentation examined, **not** approved for intended use. BLOCKED means a concrete documentation barrier. No network adapters, scraping, arbitrary/user URL fetches, image transfer, scheduler, or automatic discovery is implemented. A source URL is inert provenance, not a fetch target. Capability listings express possible contract surface, not permissions or executable implementations; discovery/release capabilities are not granted by any initial policy.

Enablement requires a documented source-specific safe intended-use review, approval, review date, official evidence, known authentication and conservative rate budget. Contract validation is not a runner, security boundary, or legal opinion. Future V2C must gate enabled policy AND declared capability AND actual optional method; parse input/output, allowlist provider-owned endpoint construction, reject redirects/user URLs, bound payloads/pages/timeouts, respect Retry-After, and stop on denial. Credentials never belong in policy records. Rate interval/max and 10-second timeout are local safety budgets, not claims of provider permission. Unknown rates are null, never unlimited. The DB-facing `reviewStatus` matches `reviewState`; `metadataStorageAllowed` is initially false for every provider. `rateLimit` is `{maxRequests, intervalSeconds}` or null (unknown), consistent with the millisecond/max fields. Future budget guards must reject null budgets, false metadata-storage permission, disabled providers, unapproved intended use and unsupported capabilities.

## Open Library: reviewed, not approved

Official sources:

- [API usage and rate limits](https://openlibrary.org/developers/api)
- [Licensing](https://openlibrary.org/developers/licensing)
- [Cover API](https://openlibrary.org/dev/docs/api/covers)

The API documentation explicitly prioritizes public-good, open, human-centered discovery; time-sensitive requests on behalf of humans, caching where possible, and identifying the app with User-Agent/contact email. Register the use case. Default limit is **1 request/second**, identified requests **3/second**. Our proposed lower budget is 1/second, serialized, with caching and no retry storm. No bulk metadata download via API, no HTML scraping, no IP distribution, no hundreds of individual lookups, no high-traffic commercial infrastructure. Bulk needs monthly dumps or provider contact and separate review; dumps are not implemented here.

The licensing page states Internet Archive asserts no new copyright/proprietary rights, but warns of existing rights issues in contributions and jurisdictions. This is **not** a blanket CC0 grant for all payloads, images, descriptions, or commercial exploitation. Prefer minimal bibliographic facts and identifiers, retaining provenance; storage/commercial purpose and third-party text still need intended-use review. Courtesy attribution/backlinks are appreciated, and TaleAtlas preserves source links.

Cover docs prohibit crawling; public-facing covers should point to covers.openlibrary.org. Non-CoverID/non-OLID access is **100 requests/IP/5 minutes** and can return 403. These cover limits are separate from metadata limits. Availability and a cover URL do not establish copyright permission. V2A permits cover IDs/URLs/dimensions with rights UNKNOWN but **never fetches, proxies, caches, transfers or displays the image**. Even documented rights do not turn transfer on in this phase.

Possible metadata capabilities: SEARCH_WORKS, GET_WORK_DETAILS, GET_EDITIONS, GET_CREATORS, GET_ALTERNATIVE_TITLES, GET_COVER_METADATA. Format coverage lists candidate compatibility, not an authoritative format inference; absent or uncertain format remains absent rather than defaulting to NOVEL.

## Google Books: reviewed, not approved

Official sources:

- [Books additional terms, English](https://developers.google.com/books/terms?hl=en)
- [General API terms, English](https://developers.google.com/terms?hl=en)
- [Using API](https://developers.google.com/books/docs/v1/using)
- [Branding](https://developers.google.com/books/branding)

Public data requests identify the application with API key or OAuth token; private user data needs OAuth and is outside scope. Project quota must be checked in the actual console; this review does **not** assert a universal daily/request rate. Search page size maximum 40 is a result limit, not rate permission. Initial policy rates remain unknown/null.

Books terms prohibit fees for use of the application without a separate agreement or Google's written permission, require infringing-content removal and rights-holder contact. General API terms §5a preserve third-party rights; §5e prohibits scraping/database-building/permanent copies and cache beyond headers unless expressly permitted by content owner or applicable law. §8b requires cessation and deletion of permitted cached/stored content on termination. Thus a durable ingestion candidate database cannot be assumed permissible just because the API is public. Obtain explicit approval/legal analysis for facts, provenance retention, cache lifetime, deletions and commercial model before selecting it for ingestion.

Branding requires Google attribution and primary Google Books links, retention of notices, and restrictions on modification/reordering of returned results. Mixed-provider normalized results need a specific compliant design review. Documentation-page CC BY/code Apache notices do **not** license returned book metadata or cover art. `imageLinks` are metadata only; no image download/redistribution license inferred.

Possible initial capability surface is SEARCH_WORKS, GET_WORK_DETAILS (volume-level source, not a canonical work), GET_COVER_METADATA. Do not invent work/edition grouping, creator authority records, releases or discovery permission from volume search ordering.

## MangaDex: blocked documentation review

Official URLs located by search: [documentation](https://api.mangadex.org/docs/), [Swagger/acceptable use](https://api.mangadex.org/docs/swagger.html). web_fetch failed for those and `https://api.mangadex.org/docs/2-limitations/` during this review. Search snippets/third-party summaries are not sufficient evidence of current commercial, metadata-storage, attribution, image, authentication or numerical rate permissions. No policy grants or numerical limits are asserted, capabilities remain empty and auth/rates unresolved. Resolve by reviewing accessible current official acceptable-use/terms and endpoint-specific limits; contact provider if commercial catalog reuse is unclear. Do not fetch chapter pages, chapter images or scanlation content. Cover availability is not rights permission.

## Official publisher or author feeds: source-specific unreviewed category

Official examples actually fetched:

- [Penguin Random House developer portal](https://developer.penguinrandomhouse.com/): public title/author metadata API, registration/access keys and usage reports.
- [PRH vendor data-feed options](https://www.penguinrandomhouse.biz/vendors/rhi_datafeeds): feeds for customers creating/selling books; ONIX, metadata spreadsheets, Direct Market CSV, cover feeds and full/delta cadences; recipients provide delivery configuration and complete onboarding with customer operations.

The existence of a public portal is not a storage/commercial/cover redistribution license. Feed documentation describes customer onboarding, not blanket eligibility for TaleAtlas or anonymous feed crawling. No reviewed numerical API quota or retention/commercial license was established here. Do not treat copyright years or sample-file/implementation-guide filenames as document publication dates. The placeholder OFFICIAL_FEED remains UNREVIEWED with no capabilities. Each named publisher/author must have its own reviewed endpoint allowlist, agreement/license evidence, attribution, credential handling, rate/cadence and retention policy before use. RSS/Atom/ONIX is a transport format, not a license; automatic discovery/release polling and artwork require express source-specific review. No generic author-feed permission is established.

## Realistic future V2C end-to-end slice

**Best candidate: one Open Library human-requested low-volume lookup**, conditional on documented approval of TaleAtlas's exact intended use and storage/commercial model. A human enters a bounded title/ISBN query (never a URL); approved adapter constructs fixed-host search endpoint, asks for minimal bounded fields, returns <=20 candidates, optionally looks up one selected work/edition/creator with a strict total request/page cap. Normalize optional title, identifiers, creator/edition facts; preserve source IDs, retrieval timestamps, conflicting evidence and source links. Human reviews/deduplicates and explicitly approves selected draft bibliographic facts. No publication automation and no cover fetch; UNKNOWN cover rights can remain review-only metadata. Verify cache handling, registration/User-Agent and rights takedown procedure before activation.

This is **not currently runnable** and no provider is approved. Low-volume human lookup is materially different from unattended new-work enumeration, periodic discovery, release polling, bulk catalog backfill or commercial backend use. Those permissions remain unresolved and need separate provider approval/review; do not describe V2A as autonomous catalog ingestion.

## Contracts

`apps/web/src/features/ingestion/providers.ts` exports strict bounded Zod policy, provenance, bibliographic candidate, cover and input schemas plus inferred types and a typed interface with genuinely optional capability methods. Missing bibliographic facts are valid; no invented mandatory title/format/ISBN. Each normalized fact can retain conflicting values with independent provenance. Known cover rights require evidence, UNKNOWN is valid; all cover records prohibit image transfer. Production defaults are parsed through Zod (no validation casts/bypass), import only Zod and pure catalog constants, and perform no I/O. Database jobs/requests/schema architecture remain parent-owned.
