# V5 Metadata & Discovery — proposed domain/security contract

**DESIGN ONLY (V5A planning).** Baseline `main` `b6c0859696d68ea669cbb305c64cfb811204fb30`. No new API, database table, feature flag, authorization or behavior is implemented by this document. V0–V4 source and its required CI remain frozen except separately reviewed additive V5 work.

## 1. Non-negotiable inherited guarantees

1. A canonical Work UUID and unique slug are authoritative. Duplicate/normalized titles, provider records, edition data or equal creator names never authorize an automatic identity merge. Public catalog projections include **only currently published** Works and eligible published relationship targets.
2. V2D existing `Suggest an Edit` currently supports six scalar keys only. Its verified actor, bounded source citation, immutable proposal, full approve/reject, exact revision and audit path must remain backward-compatible. No silent addition of arbitrary patch keys/null deletion.
3. V3 private personal notes, ratings, sessions, rereads, library presence, favorites and progress **must never** enter V5 proposal prefill, public reviews, search, facets, popularity or aggregate data. V4 reviews/ratings are independently deliberate public submissions; staff report metadata is private.
4. `V4_COMMUNITIES_ENABLED` is an exact-`true` **server-only** opt-in and stays absent/false by default. V5 does not enable community posting or treat a V4 moderator as a catalog administrator.
5. Citations and source URLs are inert data, **not** server fetch, copyright license, trusted proof, or cover/media permission. Publication requires explicit human attestation; external provider policies stay disabled/PENDING and no adapter or live scrape is authorized.
6. Keep all applied migrations `0000–0013` immutable, preserve old HTTP routes, strict schema parsing, existing quotas and security gates.

## 2. V5A operation design — conceptual, not real endpoint names

Design a strict, versioned **discriminated union** of specifically approved row operations; do not introduce arbitrary `fieldPath` mutation, permissive JSON patch, object-spreading of unknown keys or whole-Work replacement. Proposed envelope: `submitKey` idempotency UUID, immutable Work target, `baseWorkRevision`, validated source citation and an explicitly typed operation. Prefer **one operation per proposal initially** unless atomic multi-operation order, rollback, audit, cross-row dependencies and UI have been separately approved. The final API and storage shape require source review, not copy/paste from this description.

| Target | Candidate action(s) | Identity and restrictions |
| --- | --- | --- |
| Additional `work_titles` | ADD, REPLACE, REMOVE | Existing stable row ID for edits/deletes; bounded string, validated language/kind, cite facts, protect required primary/original title uniqueness and all siblings |
| `work_descriptions` | ADD, REPLACE, REMOVE | One unambiguously targeted language/row, bounded safe plain text and attribution; respect copyright/rights review, preserve other languages |
| `work_genres` | ADD_MEMBERSHIP, REMOVE_MEMBERSHIP | Only existing curated taxonomy slug, correct Work scope and max membership; no user-created global genre nodes |
| `work_creators` | CONDITIONAL ADD/REMOVE_CREDIT | Existing creator UUID, explicit role/order/optional edition, Work/edition FK guard; never create or merge people by string name |
| Old scalar patch | Continue original V2D behavior | Six fields only in original endpoint; unchanged exact revision, full approval and citation |
| Cover/media, relations, ISBN, editions, external provider IDs, releases | DEFERRED | Each requires separate rights/identity/visibility/date and audit contract |

Baseline V1 bounds to review against schema: title <=500 characters; description <=20,000; at most 30 extra titles/30 descriptions/30 creator credits and 10 genres in the full Work aggregate. These are **current source-level limits**, not blanket authority to loosen or blindly apply them to all new operations. Validate normalized title and language tags. Missing Vietnamese data stays missing, not fabricated from English. No artificial chapter counts, release dates or popularity scores.

### Intent-specific semantics

- **ADD:** explicit target, value and source; reject duplicate/ambiguous uniqueness, title-kind conflict or unknown taxonomy/creator IDs; do not infer identity.
- **REPLACE:** exact Work-owned existing row ID and current Work revision; preserve unrelated children, source history and public visibility. A copied row ID from a different Work is unauthorized even if its title matches.
- **REMOVE:** explicit deletion intent, never implicit `null` or empty string. Refuse removal of required primary/original facts or relationship-dependent data; preserve other rows and auditable evidence.
- **Idempotency:** replayed same key+same canonical input should not duplicate proposals; same key+different input conflicts. Normalized title matching is *not* proposal identity.
- **Review:** authorized administrator sees current/proposed/source and exact revision; immutable proposal approved/rejected as a whole, no automatic amendment, partial selection or stale rebase. Rejected submit leaves catalog unchanged; approved transaction must commit Work revision, child/evidence and audit atomically.

The existing V2 `applyReviewedSuggestion` constructs a full Work aggregate. **Prove** that any V5 extension preserves unrelated collections and transactionally locked sibling edits; do not call a whole-row overwrite safe without fresh concurrent SQL tests. Any new provenance schema, additional row-target indexing or review state needs a separately approved **forward-only** migration and compatible deployments.

## 3. Authority, security and privacy

- Verified Better Auth session for proposing changes; persisted catalog administrator, not client role flags or V4 moderator powers, for approval. Require current published Work, fresh actor/session/role checks, Origin/CSRF/size/rate limits and authority before parsing privileged details.
- Public-facing catalog must remain strict allowlisted published Work data only. No unapproved suggestions, reporter statements, moderation evidence, private source histories, actor IDs, private library details or unpublished linked Work identity may escape via search counts, facets or E2E traces.
- Validate exact Work/row scope, revision, idempotency, safe Unicode, language, bounded content, source metadata, duplicate titles and relationships. Reject unknown/discriminator keys, unsafe URL shapes, excessive arrays, forged actor IDs and foreign-row selectors. Never deserialize arbitrary object paths into SQL.
- Atomic rollback for any audit/citation/linkage failure; serial/adversarial tests for two approvers, reviewer vs Work edit, simultaneous remove/replace, same submitKey with mutated payload, unpublishing and account erasure. No automatic retry after an ambiguous destructive write.
- Reviews and source evidence are not automatically public; account/data deletion and backup/provider/log retention limits remain explicitly unverified in hosted environments. No tokens, login links, raw reports, auth cookies or credentials in CI logs or artifacts.

## 4. V5C search and discovery contract

Preserve existing catalog URLs and validated `q`, `format`, `genre`, `page`, `pageSize`; propose only a small evidence-backed addition. Candidate filters: original language and release status first, then country and approved existing creator relationships if profiling allows. Validate unknown/missing values and sanitize/scope all selected fields. Deterministic public-only ordering/paging is required, including when records change. Any join/count/facet must filter unpublished Works **before** aggregation and avoid hidden related Work leakage.

Vietnamese accent folding is lookup assistance only, never automatic bibliographic equivalence. Do not fabricate translations, publication exact days, genre membership, review scores or "trending" when unsupported by the source. No user-profile recommendations, personal reading activity search, live provider response blending or V4 private moderation statistics.

## 5. Mandatory acceptance and safe sequencing

V5A implementation after this design is reviewed: strict typed contracts and unit/security tests (and only independently authorized schema changes), then fresh locally executable frozen gates and both actual Push and PR CI on the same source SHA before V5B. V5B must add real authenticated PostgreSQL tests for every new operation, cross-user/stale/identity/duplicates, audit/rollback/erasure, and EN/VI browser workflow; V5C must add published-only/filter/pagination/performance tests; V5D must pass complete required CI and post-merge `main`.

**Never weaken:** original Legacy 17 native browser suite, V4 enabled 8 native suite with zero retries, unit/SQL/type/lint/build/migration generation and both security audits, final mandatory `verify`. Scenario isolation stays mandatory when suites are split. Actual Push **and** Pull Request events required; one diagnostic run or status green on a different SHA does not satisfy acceptance. Keep `main` ruleset PR/`verify` enforcement.

## 6. Decisions required for maintainer V5A approval

1. Supported title kinds and whether an original title is ever replaceable; exact UUID/revision targeting and duplicate behavior.
2. Synopsis rights and length policy; evidence needed to replace a language-specific description.
3. Genre add/remove impact and whether a retired taxonomy node is selectable (recommended no).
4. Whether adding/removing existing creator credits fits MVP (recommended defer until joins/order/evidence are proven).
5. One operation per proposal initially (recommended yes) vs explicitly audited atomic multi-operation approval.
6. Which two V5C filters ship first; index and catalog query-plan expectations.
7. Separate hosted go/no-go for migration, SMTP/TLS/proxy/privacy/backups/load, and any future V4 public activation; this planning PR does not address that operator decision.

**STOP:** If a field's proof, rights, identity, authority, security or contract bounds are uncertain, mark it **DEFERRED**, not an unchecked feature. No new data ingestion, provider call, V3 public sharing, V4 flag activation, automatic publication, regression waiver or merge without human review and actual CI.
