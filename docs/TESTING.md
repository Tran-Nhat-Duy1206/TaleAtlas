# Testing and evidence

V0 foundation is implemented. Latest local passes: root static typecheck across all packages/tests including Next type generation; 57 unit tests across six files; lint; production build after native shell navigation/Vietnamese font corrections; cold UTF-8 PostgreSQL 18.4 migration, repeat migration and generate-with-no-changes; six real PostgreSQL integration tests with actual synthetic SMTP capture covering verification/login/reset/session revocation/deletion, role injection/downgrade, forged-origin denial, rollback/uniqueness/FKs and concurrent limiter 12 attempts → 5 allowed/7 rejected. `pnpm audit --prod` reported zero vulnerabilities. None proves hosted deployment, real SMTP or deployed TLS/cookies. Actual commands, environment, results and limitations belong in VALIDATION, maintained by the implementation lead.

**V0 LOCAL ACCEPTANCE COMPLETE; hosted validation remains pending.** All three development Playwright tests passed in two consecutive runs after native locale/account document navigation and bounded Tailwind source scanning. Final production build and post-font/navigation/bounded-source smoke passed Vietnamese SSR HTML language, health/readiness, EN/VI navigation, robots/sitemap and zero browser page errors. Historical mobile-navigation and subsequent 2/3 reload/aborted-navigation failures remain recorded; they were addressed, not waived. Development Next still logs `destination stream errored` during interrupted navigation/prefetch and standard Node NO_COLOR warnings; this diagnostic is not claimed resolved or equivalent to a browser page error. Production smoke did not exhibit it. GitHub CI is prepared but has not actually run.

Root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest), `pnpm test:integration` (integration config), `pnpm test:e2e` (Playwright), `pnpm build`, `pnpm db:generate`, `pnpm db:migrate`. Script presence is not a completed test. Use Node 24 and pnpm 11.7.0.

Reproduction steps are in README. The disposable PostgreSQL helper uses unique ignored `.local/postgres-UUID`, loopback 55432 and private ignored `.local/database.json`; do not print credentials. Integration/E2E requires loopback `TEST_DATABASE_URL` with a database name ending `_test`. Playwright starts its own Next development and synthetic SMTP services with no reuse. Manual synthetic mail capture is `node --import tsx scripts/test-mail.ts` (SMTP 1025, HTTP inbox 1026); never production.

## Acceptance matrix

- Unit: configuration validation/redaction, role policy, i18n dictionary consistency and UI empty/error states.
- Isolated PostgreSQL: cold migration, schema constraints, auth persistence, verified-email denial/acceptance, session reset/change/logout revocation, role injection/downgrade denial and database throttling.
- SMTP capture: verification/reset/deletion message delivery without logging links; expiry/replay/failure paths. Never send CI mail to real addresses.
- Browser: registration → captured verification → explicit sign-in → protected account; sign-out/access denial; reset; en/vi; light/dark/system persistence; keyboard/focus/mobile and no hydration errors.
- Production-shaped smoke: HTTPS/cookie/Origin/proxy behavior, trusted client-IP rate limits and real SMTP using disposable accounts. Requires explicit credentials/authorization; unavailable credentials are a blocker, not a pass.

CI guidance: committed frozen lockfile, fake-shaped secrets, disposable PostgreSQL and SMTP, cold migrations, static/unit/integration/browser/build stages with timeouts and cleanup. Do not use live reference databases. PostgreSQL fixtures must be isolated, synthetic and cleaned; label environment-dependent skips explicitly.

Future catalog/library/provider acceptance adds privacy isolation, duplicate/reread concurrency, idempotent reactions, locale/content-policy/cache failures, SSRF/redirect/body limits and indexed pagination. Those tests do not exist merely because this matrix names them.
