# TaleAtlas V5 — Metadata & Discovery plan

**Historical planning context:** The original design proposal used `main` at `b6c0859696d68ea669cbb305c64cfb811204fb30`, after V4 closure, and changed only two Markdown documents. Its baseline, branch instructions, proposed decisions and planning-only acceptance below are historical, not the current implementation status.

## Current status receipt

**V5A–V5C are accepted and merged. V5D Phase 1 is an authorized evidence-only candidate, not final accepted or published V5D.** This status supersedes historical candidate, unmerged, future-wiring and publication-pending notes in the milestone documents; their original design, contract and local verification context remains preserved.

- Accepted [PR #12](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/12) feature head: `a07183443612adc936243594f3a3149accd6e667`. [Push 39178806723](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39178806723) and [PR 39178810725](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39178810725) each passed all five mandatory jobs on attempt 1.
- Actual PR checkout: `a8f5b246f9d87610245fc619f3ac5156d04381c7`, not the feature head. Merge/main: `144de9a14f1e4b8517596545a884d3c0a1dfab86`. Both checkout and main have tree `0f822763a1affe535d54f75c4e74e5a6872f2c2c`. [Main CI 39180956802](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39180956802) passed all five mandatory jobs on attempt 1.
- Existing main evidence observed 2030 unit tests and PostgreSQL 17.11. Integration/browser numeric runtime totals are private and withheld here. The 20 default / 8 V4 browser cases are source-defined inventory, not a newly observed runtime footer. Historical PostgreSQL 18.4, 2023-unit, 326-SQL and 31+9 performance receipts below and in [V5C](V5C_DISCOVERY.md#verification-and-performance) remain historical, not current totals.
- Performance query SHA-256 `f115e398eb5b932a577d31a88e94eeec69ba5a6da163143b9e6938d5aa3fb3d5` matches the current query only. Local 31+9 bounded measurements are neither a production SLO nor clean-checkout reproducibility proof; all four optional benchmark/diagnostic files remain excluded and unchanged.
- New deterministic V5D A-update/B-hide/C-remove-replace schedules are runtime-pending; earlier CI cannot prove new tests pass. These new SQL schedules have not been executed locally; no passing SQL result is claimed.

Description rights remain original-summary-only; Model B retains approved factual history/citations with its documented privacy limits. All scope/non-goals, the 200-genre overflow bound, default-off V4 and unverified hosted deployment remain unchanged. Final V5D acceptance/publication requires its own authorized evidence and review.

## Original design objective and baseline (historical)

Improve the completeness and usefulness of TaleAtlas's existing curated canonical Work catalog without violating privacy, evidence rights, human publication decisions or existing performance/security budgets.

Capabilities observed at the original design baseline:
- **V1:** published-only canonical Work identities, titles/aliases, creator credits, editions, descriptions, genres, identifiers, relations, source evidence and local bilingual catalog search.
- **V2D:** `Suggest an Edit` accepts precisely six scalar fields (`primaryTitle`, `primaryTitleLanguage`, `releaseStatus`, `publicationYear`, `publicationLabel`, `originalLanguage`). Browser submits one field, API accepts one or more of these fields, and administrator approves or rejects the whole proposal against the exact published Work revision.
- **V3:** private personal reading data. Never infer public metadata or recommendation from library notes, ratings, progress, histories or favorites.
- **V4:** separate deliberately public discussions and reviews, reports and manual moderation, with exact-`true` server-only `V4_COMMUNITIES_ENABLED` disabled by default. V5 must not turn it on.
- **Discovery at that baseline:** catalog `q`, `format`, `genre`, `page`, `pageSize`; no live metadata providers, automated imports or recommendation engine.

## Milestone sequence

| Milestone | Scope | Approval gate |
| --- | --- | --- |
| **V5A — Domain, contracts and safety** | Reconcile remaining V2 edit types and approve operation matrix; add bounded strict typed contracts, source/rights and stable-ID/revision semantics, no arbitrary patches; security/compatibility tests. Any new migration is separately proposed and reviewed. | Reviewed design and meaningful contract implementation; local mandatory gates + actual same-head Push and PR `verify` both pass before B. This documentation PR alone is **not** V5A implementation or acceptance. |
| **V5B — Advanced Suggest an Edit** | Approved MVP: multilingual alias/secondary title rows, language-scoped descriptions, curated genre membership; possibly existing-creator credit associations **only after separate explicit approval of FK/identity handling**. Verified submission and explicit human current/proposed/source review in EN/VI. | Signed-authorization, privacy, duplicate, stale/conflict, preservation, audit, rollback and browser scenarios pass; both actual Quality gates pass before C. |
| **V5C — Advanced Story Discovery** | Bilingual usable genre selector, carefully chosen validated public filters such as original language and release status; optional country/creator if measured safe; stable pagination and published-only related-Work navigation. | Published-only visibility, unknown fields, language/accents, filter composition, deterministic paging, SQL performance and browser accessibility/mobile tests; actual same-head CI before D. |
| **V5D — Final polish & acceptance** | Review implemented-vs-specified scope, regression, migration and rights, error/empty states, documentation, performance and final full CI. | Fresh final source with mandatory gates, independent Push and PR `verify`; maintainer review/merge and post-merge `main` CI. |

**Ordering:** merge/review this docs-only design first. Then branch `feat/v5-metadata-discovery` from the latest reviewed `main` and open a draft product PR; V5A→B→C→D only after each exact milestone's gates are satisfied. No speculative fixes, forced merges or weakening of older V0–V4 checks.

## V5A: actionable specification

1. **Operation matrix:** for each proposed field, list target row/collection, exact add/replace/remove operation, who can submit/review, Work/row identity, citation and rights, max sizes, uniqueness, current revision, migration effect, tests and an explicit INCLUDED/DEFERRED decision. Start from [V2 scope gap review](V2_PR_REVIEW.md) and inspect actual V1 schema, V2D contracts and service before finalizing.
2. **Strict versioned contracts:** do not widen the current six-field patch with arbitrary JSON paths or collection replacement. If a new proposal form is required, use a narrowly discriminated operation union and well-defined compatibility. Keep idempotency keys, bounded payloads, validated source and exact Work base revision.
3. **Target and value identity:** immutable Work UUID/slug; never automatically join Works or creators by normalized titles. Existing title/description/creator rows must be unambiguously targeted. Protect required primary/original title invariants, normalized uniqueness, referential constraints, source attribution and unmodified sibling collections.
4. **MVP field choices:** (a) secondary localized/alias title row operations; (b) description by verified language/row, rights-safe plain text only; (c) membership add/remove for **existing curated genre slugs**. Existing-creator credit links are conditional, not assumed safe to implement. Defer editions, ISBN/identifiers, Work relations, covers, release correction/retraction, global source-history editing, new creator identities and partial administration of a submitted proposal until separately approved.
5. **Atomic human review:** signed verified submitter; persisted authorized catalog administrator, not V4 moderator flag; existing Origin/CSRF, size/rate/role-before-body requirements; exact current published Work revision, no automatic stale rebasing; approved updates and source/audit/history succeed or roll back together. Reject must not change catalog.
6. **Migration safety:** do not modify applied migrations `0000–0013`; new forward migration only if V5A design proves necessary. Validate on disposable PostgreSQL 17 fresh+repeat/no-drift, FK/unique constraints, compatibility and measured cost. Never migrate or load live data as part of the planning PR.
7. **V5C contracts:** preserve existing query keys and URL compatibility; propose two initial filters from published Work fields, strict bounded parsing and deterministic paging, never expose drafts/unpublished relations or private/community report data. Treat unknown metadata as unknown, not a guessed language, release or popularity score.
8. **Acceptance matrix:** pure/unit validation, authenticated cross-user/role/real SQL tests, concurrent/stale revisions, wrong Work row IDs, duplicate/multi-locale facts, deletion invariants, atomic rollback and idempotency, source/rights denial, EN/VI SSR/browser/mobile and search plans. Preserve full original Legacy 17 and V4 8 cases with V4 retry zero.
9. **Decision record:** confirm rights policy for descriptions, title kinds, genre retirement, conditional credit scope and first public filters. If unclear, defer—never implement catch-all acceptance.

### Initial MVP decisions to request during V5A review

| Feature | Recommendation |
| --- | --- |
| Localized/secondary/alias titles | Typed ADD/REPLACE/REMOVE with stable existing row identity; enforce title uniqueness, kind, language and required facts |
| Language-specific descriptions | Typed row operations with explicit source/rights review; no unlicensed third-party reproduction |
| Curated genres | Add/remove membership only for existing approved taxonomy slugs |
| Creator credits | **Conditional** existing creator ID association; no new creator identity/automatic person-name match |
| Format/country, editions, ISBN, relations, cover, release correction | Deferred pending separate per-field rights/identity review |
| Proposal amendment, partial approval, auto-rebase | Deferred; existing full-proposal human decision retained |

## Non-goals

No live provider API, scraping, scheduled refresh, licensing bypass, copyright chapter/cover acquisition, image proxy, arbitrary URL fetch, automated catalog publication, AI recommendation engine, social feed, import, private-library social projection, live deployment or new V4 public activation. The source-only V4 merge does not authorize real hosting. Provider review remains pending and all policies remain disabled.

## Mandatory evidence & STOP rule

All meaningful source milestones require frozen lockfile install, typecheck, lint, all unit tests, fresh/repeat database migration/generate/no-drift, full real PostgreSQL integration tests, build and post-build typecheck, all original native 17 and enabled V4 native 8 E2E suites, additive V5 tests, both dependency audits and **mandatory `verify`**. Each suite must pass under both actual Push and Pull Request events for the exact same commit; diagnostics never replace mandatory acceptance. Continue with fresh controlled evidence, not blind retries. Keep `Protect main` PR/`verify` safeguards.

**STOP** on uncertain data provenance, missing rights, possible private-data exposure, incompatible schema change, unapproved migration, ambiguous writes, stale review without explicit conflict, failing/flaky CI or absent approvals. No merge/deploy/test waiver or flag enablement to force a green status. V5 is only complete after independently confirmed source, PR and `main` post-merge acceptance.

## Parallel separate work — Hosted release readiness

Neon/Vercel provisioning, reviewed production migrations/roles and backup/restore, SMTP verification/recovery, HTTPS/cookie/Origin/proxy, abuse/moderation operation, privacy/erasure and representative load checks are **not** V5 source implementation. Track a separate operator go/no-go before a real-user rollout; `V4_COMMUNITIES_ENABLED` remains off until explicitly authorized. See [V4 release closure](V4_RELEASE_STATUS.md) and [deployment](DEPLOYMENT.md).

**Planning PR acceptance:** exactly `docs/V5_PLAN.md` and `docs/V5_DOMAIN.md`, Draft review only. Passing CI and merging these files approves a product/engineering plan, **not** delivered V5A–V5D code.
