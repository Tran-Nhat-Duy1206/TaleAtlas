# V6C — Permission-Reviewed Metadata Automation

**Status:** PROPOSED / NOT IMPLEMENTED / PROVIDERS DISABLED.
**Authority:** Research and design only. No scraping, provider enablement, network calls, auto-publication, hosted DB writes, paid subscription or scheduler is authorized.

## 1. Problem and desired outcome

The public catalog currently depends on manual curation. A scalable discovery product needs a *bounded, auditable source-to-candidate pipeline* that reduces manual entry without sacrificing canonical identities, metadata accuracy, license compliance or human publication control.

Existing V2 code already has durable job primitives, normalized human-request candidates and synthetic provider-shaped decoders. Those do **not** fetch remote data. Preserve and review these primitives rather than replacing them with an unrestricted crawler.

## 2. Ingestion pipeline proposal

1. **Provider review:** record intended use, API terms, metadata storage license, display/publication and image rights separately, rate quotas, commercial restrictions, authentication, security and approval owner. Unknown permission means **DISABLED**.
2. **Transport design:** construct requests from fixed approved provider endpoints and canonical identifiers, not arbitrary user-submitted URLs; strict HTTPS and redirect policy, fixed host allowlists, byte/page/deadline/concurrency bounds, verified TLS and cautious Retry-After behavior.
3. **Normalization:** map source-specific identifiers and supported titles/aliases/format/language/status/credits to *strict typed candidates*; retain source attribution and original values; do not invent dates, country, translations, reading counts or reviews.
4. **Identity and conflict review:** match on verified provider external IDs; offer potential duplicates for manual review, never merge canonical Works based only on normalized titles. Preserve revision-bound human conflict checks.
5. **Private candidate queue:** stage proposed changes with citation, license/retention limits and current vs proposed diffs. No public appearance before authorized admin approval and publication attestation.
6. **Controlled publication:** reuse approved V1/V2/V5 publishing and edit contracts; apply atomic reviewed changes, audit decisions and rejection reasons.
7. **Operations:** bounded leases and jobs, cancellation/reconciliation, idempotency, cooldowns, dead-letter handling and separate opt-in schedule; observe free-tier limits. Avoid long-running serverless promises.

## 3. Source approval matrix (all initially unapproved)

| Candidate source | Potential coverage | Must verify before any adapter |
| --- | --- | --- |
| Open Library official API | Bibliographic books and editions | Intended-use restrictions, attribution, permitted storage, API request limits, source freshness and individual field rights |
| MangaDex official API | Manga-related structured metadata | Current official terms, permitted caching/display, rate limits, authorization and cover-media rights independently |
| Other licensed/approved metadata source | Source-dependent manga/manhwa/manhua/novel titles | Provider-specific written review and approved fixed endpoint; no assumption that a public endpoint permits reuse |

These are **review candidates**, not recommendations to scrape or proof of authorization. Official terms may change; rerun a dated review before a proposal is approved. Reference existing [PROVIDER_POLICIES.md](PROVIDER_POLICIES.md) and [METADATA_PROVIDERS.md](METADATA_PROVIDERS.md), which currently record disabled/PENDING policies.

## 4. Content and rights limits

- Do not copy chapters, scans, unofficial translations, unlicensed covers, reviews or full external descriptions.
- Original editor-written summaries are preferred; source facts require provenance and permitted use. Separate metadata facts from copyrightable creative expression.
- Explicitly manage source retention and deletion restrictions; do not imply that all upstream data is freely licensed.
- Do not create AI-authored pseudo-facts, fake publication years, inferred authors or synthetic real-world works.
- Synthetic demo fixtures are allowed only in disposable tests with unmistakable labels, not published catalog records.

## 5. Sequencing and gates

**V6C-1:** source-permission/rights review and cost envelope, no network. **V6C-2:** fixed-host transport and offline contract tests. **V6C-3:** isolated trial importer with limited real calls *only after explicit provider approval*. **V6C-4:** human candidate-review UI plus anti-duplicate tests. **V6C-5:** scheduled automation only after explicit operator consent and measured quotas.

Acceptance for each: malformed content, oversized data, hostile URLs/redirects, denial, timeouts, retry loops, license/retention, duplicates, stale revisions, unpublished visibility, privacy, rate limits and audit behavior. For SQL changes propose new forward-only migration separately; never rewrite applied 0000–0014. Preserve existing V0–V5 suites and mandatory CI.

## 6. Data, billing and hosted safety

No live scraping or mass harvesting from the staging app. Neon Free and Vercel Hobby are not a guarantee of free unlimited background work or outbound traffic. Require a budget (requests/day, storage/retention and retry ceilings), alert/stop policy and separate approval for any new paid provider, snapshot, worker or deployment.

The current staging database is synthetic and is not a destination for production or private real data. No hosted migration, import, provider activation, job schedule or secret change is authorized by this document.

## 7. Open decisions

Which licensed provider and field set? Rights and date of review? Manual approval capacity? Metadata refresh vs new title discovery? How to reconcile provider retractions? TTL and retention? Scheduling mechanism under free tier? Per-source quotas and billing protection? Locale and content rating policy?

See [V6_PLAN.md](V6_PLAN.md), [V2_PR_REVIEW.md](V2_PR_REVIEW.md), [PROVIDER_POLICIES.md](PROVIDER_POLICIES.md), [V5_DOMAIN.md](V5_DOMAIN.md) and [V6_VALIDATION.md](V6_VALIDATION.md).
