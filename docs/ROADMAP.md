# Roadmap

## V0 — foundation (local acceptance complete; hosted validation pending)

Account UI/verification/reset/session handling, server role guards, EN/VI core pages/themes, explicit migrations and health/readiness are implemented. Latest static typecheck (all packages/tests and Next type generation), 57 unit tests, lint, production build, isolated PostgreSQL migration/repeat/no-change generation, six real PostgreSQL integration tests and zero-vulnerability production dependency audit passed.

**V0 LOCAL ACCEPTANCE COMPLETE; hosted validation remains pending.** Three development Playwright tests passed in two consecutive runs, and final production build/post-font/navigation/bounded-source smoke passed Vietnamese SSR language, health/readiness, EN/VI navigation, robots/sitemap and zero browser page errors. Historical browser failures were addressed through native root-layout document links and bounded Tailwind source scanning, not waived. The development stream-error diagnostic during interrupted navigation/prefetch remains known; no such diagnostic was observed in production smoke. Hosted SMTP, TLS/cookies/proxy and Neon/Vercel acceptance require separate evidence; no live resources are provisioned here.

## V1 — global curated catalog (merged; local and CI acceptance complete)

Implemented canonical identities, multilingual title/alias search, optional editions/creators/relations, source and field evidence, administrator publication attestation and coherent public snapshots. Merge `11d544a497597432ab1bf9d2028158e620f929c4` is on `main`; [post-merge CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37921253474) passed. Original validation history remains in `V1_VALIDATION.md`; hosted acceptance is not implied.

## V2 — requests and shared ingestion (incremental implementation)

Start from verified `main` on `feat/v2-catalog-ingestion`. Complete and verify each stage before advancing; keep the V2 PR open for maintainer review without automatic merge.

- **V2A foundation (local and actual CI acceptance complete):** `e1aba9e`,113 units/47 SQL/4 browser cases and successful [PR](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37935802536)/[push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37935791732) CI. Private request domain/lifecycle, reviewed disabled provider contracts, forward-only schema and durable PostgreSQL jobs; no live processing claim.
- **V2B (local and actual CI acceptance complete):** bilingual guarded/noindex Request a Story, optional title/format search prefill, My Requests, owner history/amend/cancel, reviewed-summary search and explicit equivalent-request follow/unfollow, protected HTTP APIs and safe same-locale sign-in returns. Frozen install/type/lint,147 units/51 SQL, forward0005 migration/repeat/no-drift (24 tables), optimized build/audit and real anonymous loopback production smoke passed. All five distinct browser cases passed across two isolated development sessions, retaining the initial combined4/5 memory-exhaustion/reload timeout; no single local5/5 pass is claimed. V2B is locally and actual-CI accepted at `147d1b3`: both PR/push CI passed all mandatory gates, including all five Chromium cases together with zero retries. Earlier CI fixture setup failures remain in the ledger; PR #2 stays open/unmerged. This does not complete V2C/D or hosted acceptance.
- **V2C (manual/offline slice; local and actual CI accepted):** shared strict normalization/provenance and conservative identity-match explanations, private revision-bound candidates, bounded request-before-job lease-fenced processing, EN/VI administrator queue and pure Open Library/MangaDex-shaped synthetic decoders. Forward0006 fresh/repeat/no-drift checks passed (25 tables); accepted source `ae5822c` passed181 units/66 real SQL/all six Chromium cases together, zero retries, and all mandatory install/type/lint/fresh migration/build/audit gates on both actual PR/push CI. PR #2 remains open/unmerged; V2D has not started. All providers stay disabled/PENDING/storagefalse with no optional live methods while intended-use/storage/image permission is unresolved. Offline fixtures are not live integration evidence; authorized network adapters remain conditional future work.
- **V2D (planned):** administrator candidate comparison/approval/link/reject, separate verified edit-suggestion workflow, Recently Added and evidence-backed release discovery, full acceptance.

Automatic publication is not approved; human authorization and V1 publication controls remain mandatory. No irreversible automatic Work merge, arbitrary URL fetch, chapter storage or unlicensed cover transfer. Hosted Neon/Vercel/SMTP/HTTPS validation is a separate unverified task. Exact milestone state and observations go in `V2_VALIDATION.md`, not revised V0/V1 history.

## V3 — private reading library (planned)

Private-by-default library with reading status/progress, ratings/notes and explicit reading sessions for rereads. Gate owner isolation, uniqueness/concurrency, input limits and privacy-safe public projections. Library data must not silently enter the global catalog/search.

Communities, recommendations, imports and analytics remain unimplemented and require separate product/privacy designs. Durable-job foundation belongs to V2A; manual/offline V2C execution is locally and actual-CI accepted and scheduled/live provider execution is not implemented or accepted. No paid infrastructure, schedule promises or enabled live providers are implied.
