# TaleAtlas

**Discover Stories. Find Your People.** V0 and V1 history is preserved. A maintainer merged [V2 PR #2](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/2) into `main` at `7ce745f22fdd6a6a43577b47a80f4b83ba8b008c`; actual [post-merge CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38045464937) passed326 units/83 SQL/all9 browser cases and every mandatory gate BEFORE V3 began. V2 accepts its documented manual/offline, human-review and six-scalar correction scope, not full catalog-field correction coverage or live-provider discovery. Frozen [V0](<docs/VALIDATION.md>), [V1](<docs/V1_VALIDATION.md>) and [V2](<docs/V2_VALIDATION.md>) receipts remain unchanged.

## Current repository status

V3 is accepted and actually merged through [PR #3](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/3) at `b8cec8de874759d14aba570f406af7b0afd2813a`. Freshly inspected [post-merge main CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38189215191) passed710 units/156 PostgreSQL17 cases/all14 browsers and every mandatory gate. Private library facts remain private.

V4A Work-community foundation is being implemented on `feat/v4-work-communities`, under the [precise domain/privacy contract](<docs/V4_DOMAIN.md>) and [append-only validation ledger](<docs/V4_VALIDATION.md>). Community posting stays server-gated **off by default**; discussions/reviews/moderation UI and V4A acceptance are not yet claimed. Public reviews will require separate deliberate submissions, never private-rating/note copying or a library prerequisite. No deployment, automatic merge, hosted enablement or external-provider activation.

### Preserved V3 milestone receipts

The following paragraph retains its original milestone-time evidence and then-pending notes; it is not today's merge/status summary. V3 proceeded only on `feat/v3-reading-library`: A private schema/contracts/domain first, then B library CRUD/API/UI, C progress/session/reread UI, D private rating/notes and final acceptance. A's initial local gates passed, but published [draft PR #3](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/3) failed actual CI on20k-entry account erasure under the unchanged5s SQL budget. Forward0009 adds a measured scoped-index/backend-cache repair without quota/timeout/constraint weakening; fresh/repeat migrations and focused36 real SQL regressions passed. Combined119 real SQL, all9 original browsers together14.4m, final production build/types/lint/510units/no drift/both audits0 also passed with sources frozen. V3A accepted at`796fad6`: actual [push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38095560652) and [PR](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38095563609) CI both green510units/119PG17SQL/all9browsers/everymandatorygate/audits0. V3B private CRUD/API/bilingual UI is implemented at `4a5efd0`, with a narrow native auth safety repair at `5711c37`. Actual [push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38123785317) and [PR](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38123787459) CI passed592 units/132 PostgreSQL17 cases/all12 native scenarios and all mandatory gates. V3B is accepted at `5711c37`: local full optimized HTTPS verification passed all12 scenarios1.4m, including private CRUD8.6s and pagination4.4s, with strict TLS and original business limits preserved. Local cold-dev navigation failures are retained as unresolved development-runtime limits, not silently called passes or a causal source fix. C owner-private progress/session/completion/reread/history API and EN/VI UI now pass local628 units/144 real SQL/full13 optimized HTTPS scenarios, types/lint/build/audits/preservation. C accepted at `9aad634`: actual [push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38141130592) and [PR](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38141133054) CI both green628units/144PG17SQL/all13native/allmandatorygates/audits0. D private ratings/entry notes are now implemented only after that acceptance; complete local710units/156realSQL/types/lint/optimizedbuild/fresh+repeat/no drift/audits0/preservation pass. D whole14 strict-HTTPS optimized smoke also passed1.9m with original budgets and real signed/SMTP flows. D accepted at `e7c6b01`: actual [push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38184145649) and [PR](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38184149129) CI both green710units/156PG17SQL/all14native/everymandatorygate/audits0, without retries/flaky cases. A/B/C/D were delivered and accepted sequentially. This final documentation head still requires its own exact-head push/PR CI before the session's final completion. See [V3 domain/privacy policy](<docs/V3_DOMAIN.md>) and the [V3 evidence ledger](<docs/V3_VALIDATION.md>). No hosted deployment, enabled metadata provider, public reading-event feed, recommendation engine or automatic merge is claimed.

The V0–V3 milestone paragraphs preserve their original receipt-time context. Historical “PR open/unmerged” or “final gates pending” notes are not today's repository status; V2 and V3 were subsequently accepted and merged by a maintainer. Current V4 status is stated above.

## Using the private reading library

- Sign in with a verified account, then save a published catalog Work from its page. Library entries use the canonical Work UUID; missing Works belong in Request a Story, not invented private catalog records.
- Open **My library** in English or Vietnamese. Filter by status/favorite and sort saved entries; each owner has a separate private entry, including administrators. There is no sharing/public reading feed.
- On the entry page, choose Plan to read/Reading/On hold/Dropped/Completed. Reading resumes the same unfinished attempt; completion and subsequent reread actions require explicit confirmation. Recorded activity is not inferred reading duration or a historical finished date.
- Save personal chapter/volume numbers or labels, optional published Edition, and an optional **personal** total. Unknown totals stay unknown; zero and explicit clears are supported. Session/progress notes and retained attempt histories are separate from entry notes.
- Private rating is optional1–5 stars by0.5, with an explicit Not rated option. Plain entry notes are bounded4000 characters and never become public reviews or catalog facts. If the entry changes, refresh before editing; ambiguous mutations offer an exact-request retry rather than creating duplicate commands.
- Archive only after confirmation; history/private details remain, and explicit Restore returns the same entry. Unavailable Works hide catalog metadata while retaining owner facts. Account deletion cascades private application rows; backup/log erasure and hosted production guarantees remain unverified.

Hard limits, retention and deployment nonclaims are in the [V3 domain policy](<docs/V3_DOMAIN.md>) and [validation ledger](<docs/V3_VALIDATION.md>). Providers remain disabled; no automatic merge, deployment or production migration is performed.

## Stack and layout

Node.js 24; pnpm 11.7.0; Next.js 16 / React 19; Better Auth 1.7.7; Drizzle and PostgreSQL; Tailwind CSS and next-themes; English/Vietnamese UI. A modular monolith with [web](<apps/web/package.json>) and [database](<packages/database/package.json>) workspace packages, plus a narrowly scoped development-only [Next lint root-glob adapter](<packages/next-root-glob/package.json>). No independent API service, worker or provider package.

## Local development

1. Install Node 24 and pnpm 11.7.0; run `pnpm install` (use `--frozen-lockfile` when a committed lockfile is available).
2. Copy `.env.example` into your private environment. Use an isolated PostgreSQL database and local SMTP capture service; never reuse production data or credentials.
3. Supply environment variables to the running process. Next reads app-local `.env.local` under `apps/web`; root CLI variables must be exported explicitly. Do not assume a root `.env` is loaded by every command.
4. Review generated SQL, then run `pnpm db:migrate` against the isolated database; migration is an explicit operator action, never startup behavior.
5. Run `pnpm dev`. Open the URL emitted by Next. Email verification is required before password sign-in; read verification/reset messages in the SMTP capture service, not application logs.

## Reproducible isolated checks (PowerShell)

Run from the repository root. In a separate terminal, keep the disposable database alive:

```powershell
node --import tsx scripts/local-postgres.ts
```

It creates a unique ignored `.local/postgres-UUID` directory, binds loopback port 55432 and saves credentials only in ignored `.local/database.json`. Do not print or commit that file. In the test terminal, load the URL without displaying it:

```powershell
$localDb = Get-Content .local/database.json -Raw | ConvertFrom-Json
$env:DATABASE_URL = $localDb.url
$env:DATABASE_URL_DIRECT = $localDb.url
$env:TEST_DATABASE_URL = $localDb.url
node --import tsx scripts/verify-local-database.ts
pnpm db:migrate
pnpm db:migrate # Repeat should be harmless
pnpm db:generate # Review output; unchanged schema should generate no changes
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm audit --prod
```

Integration/E2E guards require `TEST_DATABASE_URL` to target loopback and a database name ending `_test`; never substitute a production URL. Playwright manages its own Next development server and synthetic SMTP capture, with no existing-server reuse; leave ports 3000, 1025 and 1026 free. Install the configured Playwright Chromium browser if absent (`pnpm exec playwright install chromium`). Stop the isolated DB with Ctrl+C after checks; keep `.local` private/ignored.

For manual development only, `node --import tsx scripts/test-mail.ts` starts synthetic-only loopback SMTP on 1025 and an HTTP inbox at `http://127.0.0.1:1026/messages`. Configure local SMTP accordingly and read messages privately; the inbox contains sensitive verification/reset links. Never run this capture service in production (it explicitly rejects `NODE_ENV=production`). Transactional emails are English-only; core interface pages support EN/VI, while database `preferredLocale` is a read-only reserved field defaulting to `en`.

## Commands

| Command                                  | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop, compile, serve web app                   |
| `pnpm typecheck` / `pnpm lint`           | Static checks                                     |
| `pnpm test`                              | Vitest unit checks                                |
| `pnpm test:integration`                  | Integration configuration; isolated DB only       |
| `pnpm test:e2e`                          | Playwright browser checks                         |
| `pnpm db:generate` / `pnpm db:migrate`   | Generate reviewed SQL / apply explicit migrations |

Scripts are defined in root `package.json`; a script's presence is not evidence it passed. Production SMTP and Neon/Vercel credentials remain unavailable; GitHub source authentication is now verified privately. GitHub social sign-in is not configured.

## Verification and repository setup

Frozen V0 checks passed: root static typecheck (all packages and tests, including Next type generation), 57 unit tests across six files, lint and production build after native shell navigation/Vietnamese font corrections. Cold isolated UTF-8 PostgreSQL 18.4 migration, repeat migration and generate-with-no-changes passed; six real PostgreSQL integration tests passed with SMTP capture, auth verification/login/reset/session revocation/deletion, role injection/downgrade and forged-origin denial, concurrent limiter (12 attempts → 5 allowed/7 rejected), rollback, uniqueness and foreign keys. `pnpm audit --prod` reported zero vulnerabilities; this is not a security certification.

**V0 LOCAL ACCEPTANCE COMPLETE; hosted validation remains pending.** After native root-layout locale/account links and bounded Tailwind source scanning, all three development Playwright tests passed in two consecutive runs. Final post-font/navigation/bounded-source production build and smoke passed: Vietnamese SSR HTML language, health/readiness, EN/VI navigation, robots/sitemap and zero browser page errors. Historical mobile/reload/navigation failures were observed and addressed, not waived. Development Next logs still show `destination stream errored` during interrupted navigation/prefetch and standard Node NO_COLOR warnings; passing browser tests do not imply clean development server logs. No such stream diagnostic was observed in production smoke. No live Neon/Vercel/GitHub repository provisioning, real SMTP delivery or deployed TLS/proxy/cookie proof is claimed. GitHub CI is prepared, not actually executed.

The official existing repository is **[Tran-Nhat-Duy1206/TaleAtlas](https://github.com/Tran-Nhat-Duy1206/TaleAtlas)** (`origin=https://github.com/Tran-Nhat-Duy1206/TaleAtlas.git`, default branch `main`). V2 starts from the verified V1 merge, not the earlier empty-repository setup state. Never recreate/reinitialize the repository, force-push, delete history, modify StoryNest/Eiren or rewrite applied migrations. Preserve the V0/V1 baseline.

[PR #1](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/1) was accepted and merged at `11d544a`; actual post-merge CI succeeded. The preceding V0 paragraph is frozen historical evidence, not today's GitHub status. V1's original failures, corrections and exact passing source evidence remain in `docs/V1_VALIDATION.md`, unchanged. V2 milestones must pass all local gates before meaningful Conventional Commits, then be pushed to `feat/v2-catalog-ingestion` and verified by actual GitHub Actions on a new PR into `main`. Do not merge V2 automatically. Never commit `.env`, provider tokens, local credentials, database passwords or raw sensitive diagnostics.

## V2B request workflow (local and actual CI acceptance complete)

EN/VI `/[locale]/requests`, `/new` and UUID detail pages are session-guarded, dynamic and noindex. Submit title/format (UNKNOWN permitted), optionally add metadata/citation, view private owner history and amend/cancel; stable submission UUIDs support retries. Authenticated discovery searches only administrator-reviewed titles/aliases. Following requires explicit equivalence acknowledgment, not title equality; duplicate concurrent relationships remain unique. Owner edits/cancellation withdraw searchable summaries, and followers see null metadata rather than private fallback. No fake images, notifications or emails are added; citation URLs are never fetched.

Local verification passed frozen install/type/lint,147 units/51 actual SQL cases, forward0005 migration/repeat/no-drift (24 tables), optimized production build and zero-known-vulnerability audit. All five distinct browser cases passed across two isolated development sessions: four V0/V1 cases, then the complete V2B case with zero retries. The initial combined run was4/5 after a native owner-reload timeout following Next development-worker memory exhaustion; this is not a single5/5 run. Real anonymous loopback production HTTP/Chromium smoke also passed; Final `147d1b3` actual PR/push CI passed all mandatory gates and all five browser cases together, zero retries; earlier fixture setup failures remain in the ledger. PR #2 is open/unmerged. Local HTTP smoke does not prove hosted TLS or authenticated production flows. Providers remain disabled; V2C manual/offline candidate processing is locally and actual-CI accepted; V2D approval/link and limited edit suggestions are now separately accepted locally and in actual CI for their implemented scope. No automatic publication or hosted deployment is claimed.

## V2C manual/offline processing (local and actual CI acceptance complete)

The private EN/VI administrator ingestion queue can run a bounded batch of durable request jobs into revision-bound candidate snapshots and identity-match explanations. Human request facts remain explicitly unverified; exact identifiers and normalized aliases are suggestions, never automatic Work merging or publication. Open Library/MangaDex-shaped synthetic JSON decoders are pure offline preparation, not live adapters; cover metadata stays inert text with no image transfer. All providers remain disabled/PENDING with storage permission false and no optional retrieval methods. Forward0006 adds private candidates (25 tables; fresh/repeat/no-drift checks passed locally); accepted source `ae5822c757a1f01aa30ba489242d0e36db34c2e7` passed181 units/66 real SQL and all six Chromium cases together, zero retries, plus all mandatory install/type/lint/fresh migration/build/audit gates on both [PR CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38014323645) and [push CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38014320156). The subsequent login-navigation correction is accepted at `eab1beabf5dc04657ee1f2a8194127069c88c91e`:205 units/66 SQL/all six Chromium cases together, zero retries, on actual [PR CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38018827989) and [push CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38018826094). PR #2 remains open/unmerged; V2D is now locally and actual-CI accepted below; live-provider/hosted acceptance is not implied. See [provider policies](docs/PROVIDER_POLICIES.md) for this session's intended-use barriers, not a permission grant.

## V2D review and discovery (implemented scope accepted locally and in actual CI)

Administrators can compare unverified candidates with curated metadata, approve manually supplied V1 Work facts with explicit identity/publication review, link an exact current published Work, or issue reasoned rejection/information requests. No automatic merge or publication occurs. Verified users can submit six-scalar cited corrections from a live published revision and view their private history; administrators explicitly compare, attest and apply/reject without overwriting unrelated metadata or evidence.

Public EN/VI Recently Added uses first attested publication, not draft creation. Verified Releases contains only manually cited exact calendar days; a publication year never implies a day. Both feeds requalify current publication visibility. Forward0007 adds separate suggestion/history/release tables; fresh/repeat/no-drift28-table checks passed. All nine original/new native Chromium workflows passed together locally in14.0m with zero retries, including human publication/owner history and the exact audited Recent clock. Final local326 units/83 real SQL/full types/lint/repeat migrations/no drift/clean build/raw whole-tree audit0 also passed. Accepted source `acad8191fca763d4da8c180d347f77c27b0c0361` passed these mandatory gates and all nine Chromium cases together with zero retries on actual [PR CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38037998562) and [push CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38037996112), including fresh PostgreSQL17/repeat migrations/no drift and both production/whole-tree audit0. V2A→B→C→D acceptance is complete for the implemented scope; this is not full Suggest an Edit/catalog-field parity or live external-provider discovery. [Supported corrections and remaining gaps](<docs/FEATURES.md#suggest-an-edit-supported-and-unsupported-corrections>) and the [requirement/implementation PR review](<docs/V2_PR_REVIEW.md>) are explicit; maintainers must accept the documented subset/deferred work rather than assume full original field coverage. PR #2 stays open/unmerged. Full evidence and failed attempts remain in the [V2 ledger](<docs/V2_VALIDATION.md>). Providers stay disabled/PENDING and production SMTP/TLS/Neon/Vercel acceptance remains unverified.

## Documentation

[Vision](docs/PRODUCT_VISION.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Design](docs/DESIGN_SYSTEM.md) · [Features](docs/FEATURES.md) · [Roadmap](docs/ROADMAP.md) · [Deployment](docs/DEPLOYMENT.md) · [Security/privacy](docs/SECURITY.md) · [Providers](docs/METADATA_PROVIDERS.md) · [Migration](docs/MIGRATION.md) · [Testing](docs/TESTING.md) · [Operations](docs/OPERATIONS.md) · [Decisions](docs/DECISIONS.md) · [Reference audit](docs/REPOSITORY_AUDIT.md)
