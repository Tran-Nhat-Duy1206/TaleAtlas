# Database

V0 schema is implemented; isolated UTF-8 PostgreSQL 18.4 migration and integration constraints were exercised locally. This is not production certification. PostgreSQL with Drizzle schema in `packages/database/src/schema.ts` and explicit tooling in `packages/database/drizzle.config.ts`.

Current identity schema:

| Table           | Purpose / important constraints                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | Text ID; unique email; email-verification state; name/image; enum role (`user`, `moderator`, `admin`); read-only reserved preferred locale (default `en`); timestamps |
| `sessions`      | Unique token; expiry; user FK with cascade; optional IP/user-agent; indexed user ID                                                                                   |
| `accounts`      | Better Auth credentials/provider fields; user cascade; unique provider/account pair                                                                                   |
| `verifications` | Expiring verification values; indexed identifier; sensitive security material                                                                                         |
| `rate_limits`   | Unique key, count and last-request timestamp for database-backed auth limits                                                                                          |

Passwords and credential/session representations are controlled by Better Auth. Session tokens remain raw sensitive Better Auth values; verification identifiers are configured hashed. Do not describe every credential column as encrypted or hashed. Restrict DB access/backups accordingly. Roles are server-owned, not editable sign-up fields.

Runtime uses `DATABASE_URL` (Neon pooled in deployment); migration configuration prefers `DATABASE_URL_DIRECT`, falling back to `DATABASE_URL`. Supply variables explicitly to CLI commands. Review `pnpm db:generate` output before `pnpm db:migrate`; never rewrite an applied migration. Neither operation belongs in app startup.

## V1 global catalog (implemented; locally verified)

`src/catalog-schema.ts` is separate from the preserved identity schema. Reviewed/applied forward migrations `0001_nostalgic_daredevil.sql` and `0002_talented_cloak.sql` add catalog data without rewriting `0000` or introducing library/community tables. `0002` strengthens approved-cover attribution. Final-review forward `0003_absent_tag.sql` adds per-field source evidence and permits the typed publication attestation in bounded audit JSON; earlier SQL/snapshots remain unchanged. Apply all reviewed forward migrations before deployment; readiness now probes the evidence schema.

| Table                              | Purpose / boundaries                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog_sources`                  | Actual human citation/optional HTTPS informational URL and consultation time; never server-fetch arbitrary citation URLs                                                                                     |
| `works`                            | Global UUID, database-enforced immutable slug, canonical title/language, story format, visibility/release state and optional publication metadata; positive optimistic revision; generated simple FTS vector |
| `work_titles`, `work_descriptions` | Preserved Unicode original/localized/alternate text; one primary per language and original title per work; normalized search is not cross-work identity                                                      |
| `editions`                         | Optional bibliographic editions; same language may recur; publication medium distinct from story format; ISBN is edition-scoped                                                                              |
| `creators`, `work_creators`        | Names are not global identity; credited roles/edition references and display order; composite FK prevents another work's edition credit                                                                      |
| `genres`, `work_genres`            | Stable vocabulary slugs and actual EN/VI names                                                                                                                                                               |
| `work_covers`                      | UNKNOWN placeholder or vetted local raster path with explicit rights, statement and credit; no remote image proxy                                                                                            |
| `work_identifiers`                 | Globally unique namespace/value; known aliases canonicalized but custom namespace punctuation preserved                                                                                                      |
| `work_relations`                   | Typed references; public projections remove whole unpublished target references                                                                                                                              |
| `catalog_audit_events`             | Transactional application-append-only asserted-value/source snapshots, bounded JSON and opaque actor snapshot; nullable user FK with SET NULL on account deletion; not cryptographic tamper-proof storage    |

`catalog_field_evidence` stores application-append-only scalar assertions for Work, Edition and cover paths, immutable citation FK, positive revision and bounded JSON scalar/JSON-null value. Unique (work,path,revision) and work/revision/source indexes support the history. Join to audit by work/revision for the actor and publication decision. Current unchanged child records preserve original source IDs; modified compound records can have a newer row source while unchanged fields retain older assertions. Explicit removal appends null and retains history. Old rows bootstrap only their currently available attribution on the first new update; prior lost attribution is not claimed reconstructed. Direct DB administration can still tamper: this is not cryptographic evidence.

GIN search-vector and `pg_trgm` indexes are applied; actual index presence, filtering/pagination and Unicode/Đ normalization have integration evidence. Production-scale latency/query plans are not asserted. Updates lock the work and compare revision before replacing children and recording history. Equal titles and equal creator names never auto-merge work identities. Unknown counts/dates are not seeded. Readiness checks required auth/catalog columns and the trigram function without reading user rows.

**Planned:** user-library uniqueness, reading sessions/progress and work-based threads/reactions. Private notes/user overrides must not enter shared catalog/search tables. V1 history remains in `V1_VALIDATION.md`.

## V2 forward-only request foundation (V2A CI verified; V2B local and actual CI accepted)

New migration0004 adds `work_requests` (private bounded input, owner+submission idempotency, input/state revisions and separately reviewed summary), `request_events` (same-revision append-only decisions/old-new input), `provider_registry` (non-secret disabled policy and atomic window counter), and `ingestion_jobs` (unique intent, bounded attempts, due time, live token/owner/expiry). V2B forward migration0005 adds `work_request_supporters` and nullable `work_requests.public_search_text`; candidate/release/edit-suggestion tables remain future work. Fresh/repeat migrations through0005 and no-drift generation passed locally (24 tables); V2B is locally and actual-CI accepted at `147d1b3`; both PR/push CI passed migrations and all mandatory gates. PR #2 remains open/unmerged; hosted migration/deployment is unverified.

Request result FK is present exactly for APPROVED/LINKED_EXISTING; V2A exposes neither approval nor catalog insertion. Nullable user FKs SET NULL retain opaque history after deletion; Work/request/provider FKs RESTRICT protect identity/history. Details/registry JSON object caps are16KiB; audit old+new details cap32KiB, parsed input12KB. Positive revisions, lifecycle/job enums, all-or-none leases, retry ceiling8, public summary verification triplet and per-owner submission uniqueness are database-enforced. Exact transition authorization and application append-only history are server contracts, not triggers/tamper-proof storage. Idempotency is delivery identity, never normalized bibliographic equality.

Supporters have a unique(user,request) pair, indexed user/request lookups, user FK CASCADE and request FK RESTRICT. Cleanup must remove supporters before jobs/events/requests. Account deletion removes following relationships but retains detached private request/event history. The curated search text is ≤9000 characters and nonnull iff the summary verification timestamp is nonnull; title/format/timestamp retain their all-or-none constraint. Only reviewed title/aliases populate this key. Owner amendment/cancellation clears all four fields atomically. Summary review increments revision and appends `SUMMARY_REVIEWED`; relationship deduplication never merges bibliographic identities.

Run migrations only after review against isolated databases; existing0000–0004 SQL and snapshots remain unchanged. Readiness now probes ingestion tables without reading private rows. Actual acceptance observations and limitations are in `V2_VALIDATION.md`.
