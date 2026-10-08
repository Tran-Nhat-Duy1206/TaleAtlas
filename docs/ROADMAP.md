# Roadmap

## V0 — foundation (local acceptance complete; hosted validation pending)

Account UI/verification/reset/session handling, server role guards, EN/VI core pages/themes, explicit migrations and health/readiness are implemented. Latest static typecheck (all packages/tests and Next type generation), 57 unit tests, lint, production build, isolated PostgreSQL migration/repeat/no-change generation, six real PostgreSQL integration tests and zero-vulnerability production dependency audit passed.

**V0 LOCAL ACCEPTANCE COMPLETE; hosted validation remains pending.** Three development Playwright tests passed in two consecutive runs, and final production build/post-font/navigation/bounded-source smoke passed Vietnamese SSR language, health/readiness, EN/VI navigation, robots/sitemap and zero browser page errors. Historical browser failures were addressed through native root-layout document links and bounded Tailwind source scanning, not waived. The development stream-error diagnostic during interrupted navigation/prefetch remains known; no such diagnostic was observed in production smoke. Hosted SMTP, TLS/cookies/proxy and Neon/Vercel acceptance require separate evidence; no live resources are provisioned here.

## V1 — global manually curated, source-attributed catalog and local catalog search (planned)

Build canonical works and localized titles with explicit source attribution through manual curation. Search the locally stored catalog; do not imply remote provider discovery. Gate stable identity, source/provenance quality, finite input limits, indexed pagination and truthful missing-data states.

## V2 — remote provider discovery and requests (planned)

Review provider terms/content policy and add bounded remote discovery plus requests with clear lifecycle/authorization. Gate deterministic fixtures, provenance, cache/timeouts/rate budgets, safe image egress and separation from private user metadata. No provider or request implementation exists yet.

## V3 — private reading library (planned)

Private-by-default library with reading status/progress, ratings/notes and explicit reading sessions for rereads. Gate owner isolation, uniqueness/concurrency, input limits and privacy-safe public projections. Library data must not silently enter the global catalog/search.

Communities, recommendations, imports, analytics and durable jobs are not implemented and need separately approved product/privacy/operational designs; they are not substituted for these milestones. No schedule promises or live providers are implied.
