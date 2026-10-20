# V5B — Advanced Suggest an Edit

**Current status:** V5A–V5D, including V5B and maintainer-merged PR #13, have completed source/CI acceptance and are merged; hosted production acceptance remains separate and unverified. See the [canonical current-status receipt](V5_PLAN.md#current-status-receipt). This document describes V5B's approved scope only; the private validation ledger preserves actual results and failures. Local PostgreSQL and publication-deferred notes below retain their historical milestone-time context, not current merge/CI status.

## Scope and compatibility

One immutable proposal contains exactly one accepted V5A operation:

- Add an additional PRIMARY/ALIAS title; replace or remove an eligible Work-owned title UUID. Replacement keeps the UUID, language, and kind. The canonical PRIMARY and every ORIGINAL title are protected.
- Add, replace, or remove a description by exact `(workId, language)`. New text must be declared ORIGINAL_SUMMARY with an explicit originality acknowledgment, statement, citation, and administrator review.
- Add or remove membership in an existing genre. No taxonomy creation or renaming through this workflow.

The legacy six-field suggestion schema, routes, and forms remain separate. New navigation links do not change their payload semantics. Creators/credits, editions, identifiers, relations, covers, providers, bulk/partial operations, discovery filters, automatic publication, and V5C remain outside this feature.

## Approved persistence

The maintainer explicitly approved forward-only migration 0014 and erasure model B before implementation. Approval permits applying it only to owned disposable test databases; production migration remains unauthorized. Earlier migrations 0000–0013 are not modified.

Exactly three typed tables are added:

1. `metadata_edit_suggestions`: typed operation selectors/values, immutable citation and originality declaration, canonical-input hash and delivery key, lifecycle and erasure tombstone.
2. `metadata_edit_events`: one submission and at most one whole-operation approval/rejection, three approval acknowledgments, private reason, nullable actor FK, irreversible reason redaction.
3. `catalog_metadata_evidence`: approved factual before/after values, exact target identity, source lineage, approval event and catalog audit binding, minimal originality/review bits.

There is no generic JSON patch, canonical-text storage, or rich-object abuse of legacy scalar evidence. Accepted V5A parsing and fixed-order canonicalization enforce the 60,000-byte identity; SQL structural/raw-byte checks do not purport to prove identical canonical bytes.

The migration adds shape/lifecycle checks, immutable guards, deferred event/evidence consistency checks, and TRUNCATE denial. These protect application/database writes, not a database owner who can replace or disable DDL guards. Before-state truth comes from authoritative locked service reads, not independent recovery of deleted rows by the database.

## Transaction and authorization boundaries

Private reads require a current verified signed session. Review requires the exact persisted ADMIN role, not moderator. Lazy body reading follows a persisted-principal check; mutations recheck current users, session ID/token/ownership/expiry, role, visibility, revisions, selectors, and protections in their authoritative transaction.

The lock order starts with sorted relevant users, then the current session, Work, proposal header and children. No later user-lock upgrades are introduced. Origin, JSON/body bounds, and the existing shared catalog mutation quota remain enforced.

Identical delivery keys replay only the same owner-bound canonical proposal. Changed delivery conflicts. Hidden/stale targets do not rebase. Two reviews cannot both win. Rejection of an ACTIVE stale/hidden proposal is allowed without catalog writes; ERASED bodies cannot be reviewed or restored.

Approval uses a selective writer, never the old aggregate delete/rebuild writer. Only the selected row/membership changes; unrelated UUIDs, natural keys, source attribution, editions, credits, identifiers, covers, relations, and scalar history remain untouched. One Work revision increment, complete normalized search (maximum 100,000 characters), approval source, audit, header, event, and typed evidence commit atomically. As in V1, the canonical PRIMARY is indexed once through the Work field; its materialized title row is not counted again. Translated PRIMARY, ALIAS and ORIGINAL rows remain included. Any failure rolls all of them back.

Genre menus are display data, not authority: the exact requested taxonomy row must exist in its locked lookup. Current V1 rejects renaming existing shared creators/genre labels. Future global renames would require an all-affected-Work reindexing and common lock protocol; speculative V5B-only locks do not solve that deferred feature.

## Citation fidelity

Citation URLs are inert and never fetched. Immutable accepted lexical input is not silently normalized. Existing catalog-source SQL representation is separately validated; unsupported forms fail with `CITATION_NOT_REPRESENTABLE` rather than loosening old constraints. Timestamp insertion uses the original lexical SQL cast, preserving PostgreSQL microsecond precision rather than JavaScript millisecond truncation. A timestamp that rounds outside UTC years 1–9999 is rejected with full rollback. Pure lexical acceptance is not a promise of database publication representability.

## Privacy and erasure model B

Unreviewed proposals, reasons, declarations, and queues are private. Public catalog projection is unchanged. Private target DTOs do not expose source, actor, library, or provider data. Owners receive no typed approval evidence; administrator details require approved evidence joined to the matching catalog audit. DTO parsing is not authorization.

Deleting an owner erases the proposal's private payload, citation, rights statement, delivery key and hash in **every** state, plus linked private review reasons. Deleting a reviewer redacts their reasons. Only structural tombstones remain for the private proposal; no rehydration or review is permitted. Event privacy UPDATEs use plain parent snapshots in both immediate and deferred guards to avoid the owner header→event / reviewer event→header lock inversion. Every immutability, actor-erasure and consistency check remains active; lifecycle inserts, header transitions and evidence still lock their parent. The deterministic single-proposal opposite-deletion test is not exhaustive certification of arbitrary cross-owned foreign-key deletion graphs.

Already approved factual before/after history, the publication source/citation and minimal originality/review bits remain. This is neither global anonymity nor legal proof of a license. Retained published facts/citations can still identify a contributor. New audit actor snapshots use the constant `metadata-review`; pre-existing V2 retention is a separate legacy policy.

## EN/VI workflow

Verified users select one operation and an exact target, inspect current values, supply citation and any originality declaration, and explicitly submit. Uncertain delivery freezes the exact key/body for manual identical retry. Stale outcomes require reload or a fresh proposal, not automatic rebasing.

Administrators inspect structured current/proposed values and private history, enter a reason, and explicitly acknowledge metadata, publication and rights review for approval. Rejection does not fabricate approval acknowledgments. Unknown review outcomes freeze controls until reload. Successful responses must bind the same immutable canonical proposal and delivery key before the UI reports success. ERASED details have no restoration controls.

## Verification and limitations

New unit, real signed-auth/SMTP/SQL, concurrency, preservation, citation, and EN/VI browser tests are additive. Local native runs may opt into a validated fresh worktree-local artifact directory so earlier ignored reports are not overwritten; without that override, existing CI artifact defaults and all suite selection settings are unchanged. No existing retries, deadlines, assertions, mandatory jobs, or legacy tests are weakened. Fixture covers use a schema-valid synthetic path for row-preservation testing, not proof of physical asset delivery or a rights grant.

All database execution is restricted to freshly created, ownership-verified disposable loopback test clusters, followed by graceful `pg_ctl` shutdown and owned-parent/child absence checks. Historical clusters are untouched. Local embedded PostgreSQL is 18.4; PostgreSQL 17 verification belongs to the independent existing CI jobs and is not inferred from local results.

Graph tools were unavailable: the independent review is bounded Tier2 direct-source evidence, with graph generation/freshness/coverage unknown, not exhaustive certification. The validation ledger retains failed runs and their diagnoses. At this historical receipt, full local/browser acceptance and exact-head Push/PR publication were still pending authorization; subsequent accepted merge/CI evidence is linked above. Production actions remain unauthorized.
