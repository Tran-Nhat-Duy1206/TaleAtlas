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

**Planned, not current:** user-library uniqueness, reading sessions/progress, provider requests/jobs and work-based threads/reactions. Private notes/user overrides must not enter shared catalog/search tables. See `V1_VALIDATION.md` for current gate evidence.
