# Deployment guidance

V0 foundation is implemented with local checks; final evidence is in VALIDATION. **No real Neon/Vercel deployment or production mail delivery is claimed.** Node 24, pnpm 11.7.0, Next.js 16, PostgreSQL and SMTP are required. No GitHub authentication, Vercel token or Neon API credential is supplied.

## Neon setup (operator action)

1. Create a Neon project in the chosen region. Create deliberately isolated development and production branches/databases; restrict access and do not copy live personal data into development. Preview deployments must target a synthetic/isolated branch, never production.
2. Obtain the pooled runtime connection string for `DATABASE_URL` and direct non-pooler connection for `DATABASE_URL_DIRECT`, with certificate-verifying `sslmode=verify-full` (or provider-supported `sslrootcert=system`), including migration-driver URLs. `sslmode=require` alone can disable certificate verification in postgres.js 3.4 and is not sufficient. Runtime additionally forces `rejectUnauthorized:true` for remote hosts; plain TCP is restricted to loopback development/test. This is source/unit coverage, not a live Neon TLS test.
3. Use least-privilege runtime DML credentials and a controlled migration role with necessary DDL permissions. Restrict who can retrieve branch credentials; rotate leaked values. Prefer holding the direct/migration credential outside the steady-state runtime.
4. Review SQL and take a protected backup/snapshot before production schema changes. Apply migrations explicitly against the confirmed branch. No startup/request-time migration.

## Private environment and scopes

- `APP_ORIGIN`: canonical HTTPS production origin, no path/query/credentials. Development may use loopback HTTP. Preview auth requires its own deliberately configured canonical origin.
- `BETTER_AUTH_SECRET`: privately generated cryptographic value of at least 32 characters; never the example placeholder.
- `DATABASE_URL`: pooled runtime URL; `DATABASE_URL_DIRECT`: migration URL (tooling prefers it, falls back to runtime URL).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`; `SMTP_USER`/`SMTP_PASSWORD` together when authentication is required. Verify sender identity/domain. Production requires implicit TLS when secure=true or STARTTLS otherwise.

Use distinct Development/Preview/Production secret scopes. Never expose DB/auth/mail secrets as NEXT_PUBLIC variables. Configure variables in the host secret store; do not commit them or print connection strings. Root CLI variables must be exported explicitly; Next app-local environment loading does not imply migration CLI loading.

## Vercel setup (operator action)

Import the GitHub TaleAtlas repository after private authentication. Select Next.js and **Root Directory `apps/web`**; enable access to source files outside the Root Directory so `packages/database` and the root lockfile/workspace are included. Select Node **24.x**. Pin pnpm **11.7.0** via the root package-manager declaration/tool bootstrap.

The committed `apps/web/vercel.json` selects Next.js, `pnpm install --frozen-lockfile` and `pnpm --filter @taleatlas/web build`. pnpm must resolve the included root workspace/lockfile/shared package; validate Vercel's first install/build log confirms that resolution. Root local equivalents are `pnpm install --frozen-lockfile` and `pnpm build`. Keep Next's standard output configuration; do not override paths without inspecting the actual working directory. Do not place DB migrations in either command.

Supply production scoped environment values before runtime acceptance; the production build itself has been checked without credentials. Deploy only after final local/CI gates. Verify `/api/health`, `/api/ready`, HTTPS cookies, exact Origin, real SMTP verification/reset and disposable-account revocation/role denial. No deployment is verified merely because a build succeeds.

## IP/proxy boundary

When `VERCEL=1`, auth uses `x-vercel-forwarded-for`; otherwise it uses `x-real-ip`. Trust these only when the platform/proxy overwrites them from connection metadata. Self-hosting must overwrite `x-real-ip` and block direct origin access; never trust arbitrary client forwarding headers. Validate actual hosting behavior and rate limits.

## Manual migration, failure and recovery

Review `pnpm db:generate` SQL/journal; confirm intended DB branch and use `pnpm db:migrate` with direct credentials. Keep already-applied migrations immutable and favor additive schema changes compatible with old code.

If a migration fails, stop deployment. Inspect sanitized diagnostics and migration journal/schema from a private administrative session. A failed transaction must be rolled back and its connection closed/reopened before retry; do not assume all multi-statement work committed or none did. Determine exact committed state before repairing with a reviewed forward migration. Never delete journal rows or rerun destructive SQL blindly. Restore only from a verified protected backup with explicit authorization; code rollback is safe only if schema compatibility remains.

CI uses synthetic PostgreSQL/SMTP and fake-shaped secrets, frozen lockfile, cold migration, static/unit/integration/browser/build checks with cleanup. Production recovery, hosted TLS/proxy behavior and real sender delivery require separate evidence.
