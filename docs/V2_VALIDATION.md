# V2 validation ledger

## Baseline and execution boundaries

- Official repository: https://github.com/Tran-Nhat-Duy1206/TaleAtlas; branch `feat/v2-catalog-ingestion`.
- Clean existing checkout fetched, switched to `main`, fast-forwarded and verified V1 merge `11d544a497597432ab1bf9d2028158e620f929c4` is an ancestor. Branch created from that exact main head, not recreated V1.
- Actual [post-merge workflow37921253474](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37921253474): completed SUCCESS.
- Frozen V0/V1 validation ledgers and migrations0000–0003 remain untouched. StoryNest/Eiren are not modified. V2 PR must remain open/unmerged; no force-push, historical deletion or automatic merge.
- Complete and validate V2A before V2B, then V2C and V2D. Foundation source is not whole V2 acceptance.

## V2A — local acceptance complete; GitHub CI pending

### Implemented and locally validated foundation

Private request details require only title and format including UNKNOWN. Original/alternative titles, author, citation URL, languages, year, description/evidence/notes are optional and bounded. Citation URLs are stored references, never fetch instructions. Pure normalization supports Đ/diacritics; equal normalized titles are not identity evidence.

Server services require real authenticated sessions before parsing. Owner-scoped detail/list/amend/cancel return404 for other owners; administrators alone may inspect/moderate. Revision locks and explicit state transitions prevent final-state resurrection. SUBMITTED/NEEDS_INFO input may be amended; eligible requests may be cancelled. Human reasons and opaque actor snapshots are recorded. There is no APPROVED/publication command in V2A, no candidate exposed as a Work, no fabricated administrator acknowledgment. User-input revision is distinct from state revision.

Creation writes request/event/idempotent enrichment intent in one transaction. Amendments retain old/new details, withdraw reviewed summaries, cancel obsolete leases and enqueue a new content revision atomically. Shared existing catalog mutation limiter is30 authenticated writes/minute. Processing errors belong to jobs, not automatic REJECTED request decisions. Raw private request details are not pending-request public summaries; separately reviewed summary fields remain null until a later authorized review flow.

Forward migration `0004_lowly_mentor.sql` adds only four used foundation tables: work_requests, request_events, provider_registry, ingestion_jobs. FK/unique/JSON bounds, state/result invariants, lease/retry constraints and indexes are enforced. Request/event retention after user deletion detaches nullable FKs and retains opaque snapshots; this is not full erasure or tamper-proof evidence. Details are capped12KB parsed/16KiB database; old+new event snapshots are capped32KiB. Existing catalog metadata, IDs, sources, field evidence, publication requirements and migrations are not rewritten.

The job core provides bounded1–10 SKIP LOCKED claims, tokens/owners/expiry, database-time fencing after row-lock waits, interrupted-lease recovery, capped exponential backoff, idempotent enqueue and dead letters. Maintenance itself is bounded10. Claim locks jobs only; request writers lock request before its jobs. Provider budgets serialize counters and deny missing/disabled/unapproved/unknown-limit policies. There is no HTTP worker/scheduler/provider execution yet and no infinite serverless worker.

Pure optional provider capability contracts preserve fact-level evidence/timestamps/conflicts and unknown cover rights. [Provider review](PROVIDER_POLICIES.md) records official documentation and exact limits. All production policies are disabled/PENDING, storage permission false, automatic publication false and human review mandatory. Open Library is a conditional low-volume human-requested lookup candidate, not authorized bulk discovery or blanket third-party image licensing. Google permanent storage/commercial restrictions, MangaDex unavailable official policy documentation and publisher onboarding remain limitations. No adapter result, cover transfer, live integration or release discovery is claimed.

### Observations / failures

- Initial integrated TypeScript check passed app/database but root test compile failed because the new job test imported drizzle-orm outside its declaring workspace. It was corrected to guarded raw PostgreSQL fixture queries, not added dependencies, physical node_modules imports or disabled typing. Subsequent gates pending.
- Offline Drizzle generation created0004; review caught bind placeholders in its compile-time format CHECK. The **unapplied** new SQL/snapshot and schema were corrected to trusted allowlist literals before any migration execution. No previously applied SQL/snapshot was edited.
- Read-only review identified live-fence evaluation before a job row-lock wait. Completion/failure now first lock the job ID, then evaluate expiry using a fresh database clock query. Added actual PostgreSQL unchanged-tuple lock-holder regression for both paths; execution pending.

- First full static/migration run passed frozen install, TypeScript/lint and113 units in11 files. Fresh/repeat0000–0004 migrations passed; offline regeneration reported23 tables/no drift. First actual SQL run passed38/46 cases (all28 V0/V1 plus10 request cases);8 new job cases failed at raw fixture JSON serialization before exercising job logic. The fixture now passes explicit serialized JSON with `::jsonb`, not weakened assertions or production queue changes. Full corrected-source rerun is underway.
- The next SQL run passed45/46; the retry fixture assumed raw PostgreSQL timestamps were Date objects, but the Drizzle-configured raw client returns timestamp strings. Backoff is now measured by PostgreSQL interval arithmetic (`extract(epoch ...)::double precision`), preserving exact30s/60s/capped3600s assertions. Added an actual provider-disabled job/request separation case and normalization-expansion bounds. The final rerun passed113 units in11 files and47 actual PostgreSQL cases in6 files, including both unchanged-row lock-wait fences. All4 existing Chromium cases passed in6.0m (catalog4.6m, zero retries and unchanged budgets); production Turbopack build completed successfully and audit found zero known vulnerabilities. Development logs retain NO_COLOR, placeholder LCP, React script-tag advisory and interrupted destination-stream diagnostics; no warning-free framework claim.
- Independent bounded read-only review rechecked ownership, revisions/idempotency, history budgets, lifecycle/cancellation, lease fencing/claim bounds and provider fail-closed policy; no remaining material foundation issue was identified. It ran no tests and does not certify future worker/network logic.

### Acceptance evidence

All required local V2A gates passed: frozen install; all-package/root-test TypeScript, lint;113 unit tests in11 files;47 actual PostgreSQL tests in6 files;4 Chromium cases in6.0m with zero retries; fresh/repeat migrations0000–0004;23-table regeneration/no drift; production build; audit with zero known vulnerabilities. V2A adds14 units and19 SQL cases to the99/28 V1 baseline. No new public browser interface is claimed at this foundation stage. Meaningful milestone commit, V2 PR and actual CI are next; earlier V1 CI is not substituted for V2 CI.

### API/UI status

V2A exposes internal server domain functions and validated pure contracts only. Public Request a Story/My Requests/supporters routes and bilingual UI belong to V2B; candidate execution to V2C; approval/link/edit suggestions/release discovery to V2D. Do not advertise an incomplete public interface. No notifications, supporter tables or unused future candidate/release/suggestion tables were created merely to match a conceptual list.

## Hosted validation — separate, unverified

No authorized Neon/Vercel deployment credentials or isolated preview resource have been supplied or validated. A name-only environment check found VERCEL_TOKEN/NEON_API_KEY/NEON_TOKEN absent; workspace discovery found no Vercel project configuration or private environment file (only examples). No secret values were printed. This is bounded local-access evidence, not a claim that the owner has no accounts elsewhere. Local feature work continues without claiming hosted acceptance. No production migration, paid infrastructure, provider subscription or deployed cron is authorized by these tests. HTTPS/session cookies/proxy/serverless recovery and real SMTP require actual preview evidence when access exists. Hobby cron must not exceed once-per-day; a replaceable bounded scheduler will be added only with V2C execution.

## Remaining sequential milestones

- V2B: public protected routes, accessible bilingual prefilled form, owned status/details/amend/cancel, reviewed equivalent-request search/support, actual browser acceptance.
- V2C: one shared candidate pipeline, explainable identity retrieval/resolution, source/rights checks, safe network boundaries and bounded authorized processing. Real adapter only if documented intended-use/storage permission is adequate; otherwise deterministic offline fixture acceptance and explicit disabled live discovery.
- V2D: transactional authorized approve/link/reject, human attestation, provenance-safe decisions, editable metadata suggestions as a separately complete workflow, actual catalog Recently Added/verified release sections and complete end-to-end acceptance.
