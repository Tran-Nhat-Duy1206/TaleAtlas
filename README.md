# TaleAtlas

**Discover Stories. Find Your People.** V0 foundation is locally accepted and preserved at `8e00ae4`. V1 persisted global catalog and EN/VI public/admin UI passed mandatory local acceptance gates; see [V1 evidence](docs/V1_VALIDATION.md). No hosted deployment, personal library, active metadata provider or recommendation engine is claimed. Frozen [V0 validation](docs/VALIDATION.md) remains separate from V1 evidence.

## Stack and layout

Node.js 24; pnpm 11.7.0; Next.js 16 / React 19; Better Auth 1.7.7; Drizzle and PostgreSQL; Tailwind CSS and next-themes; English/Vietnamese UI. A modular monolith with only `apps/web` and `packages/database` workspace packages. No independent API service, worker or provider package.

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

The official existing destination is **[Tran-Nhat-Duy1206/TaleAtlas](https://github.com/Tran-Nhat-Duy1206/TaleAtlas)** (`origin=https://github.com/Tran-Nhat-Duy1206/TaleAtlas.git`, intended default branch `main`). It was cloned/inspected and was empty at inspection; local V0 history remains intact. Work continues on `feat/v1-global-catalog`. Never recreate/reinitialize this codebase or repository, force-push, or synchronize to StoryNest. Preserve existing remote history if it changes.

GitHub authentication/synchronization is separate from V1 acceptance. Validate mandatory gates before meaningful Conventional Commits; push verified feature commits when private authentication is available and open a PR into `main`. Do not merge V1 or begin V2. An empty remote needs a separately reviewed initial baseline before a feature PR has a base branch; do not silently overwrite/create main with significant V1 code. Authentication is now verified privately, and remote `main` and the existing feature branch were observed at preserved V0 `8e00ae4`; no remote baseline recreation is needed. Verified V1 implementation `10b1c1d` and tag `v1-local-verified` are pushed; [PR #1](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/1) is open/unmerged. Ubuntu CI initially failed on the missing Linux embedded PostgreSQL build permission; narrowly reviewed fix `7e489d6` passed both push/PR Quality gates runs. See `docs/V1_VALIDATION.md` for exact evidence and limitations; no hosted production acceptance is implied. Never commit `.env`, local credentials, API keys, database passwords or raw sensitive diagnostics.

## Documentation

[Vision](docs/PRODUCT_VISION.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Design](docs/DESIGN_SYSTEM.md) · [Features](docs/FEATURES.md) · [Roadmap](docs/ROADMAP.md) · [Deployment](docs/DEPLOYMENT.md) · [Security/privacy](docs/SECURITY.md) · [Providers](docs/METADATA_PROVIDERS.md) · [Migration](docs/MIGRATION.md) · [Testing](docs/TESTING.md) · [Operations](docs/OPERATIONS.md) · [Decisions](docs/DECISIONS.md) · [Reference audit](docs/REPOSITORY_AUDIT.md)
