# V0 validation ledger

## Milestone status

**V0 local acceptance: complete. Hosted/production-service acceptance: unverified.** This is a working account/application foundation, not a completed catalog or social platform. V1 is next; no catalog/provider/library/community functionality is claimed by this milestone.

Environment actually used: Windows, Node.js 24.19.0, pnpm 11.7.0, Next.js 16.4.0, Better Auth 1.7.7, real PostgreSQL 18.4 with UTF-8 encoding, Chromium via Playwright. Database data and SMTP recipients were isolated synthetic fixtures. No StoryNest production database, user data, paid service or deployment credential was used.

## Executed gates

| Gate | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed for database, web (including generated Next route types), tests and scripts |
| `pnpm lint` | Passed |
| `pnpm test` | **57 passed**, six files: configuration, authorization, HTTP error/health contracts, database TLS options, i18n and React Testing Library UI |
| `pnpm db:generate` | Passed; no schema changes after committed V0 migration generation |
| `pnpm db:migrate` | Passed on a fresh isolated UTF-8 PostgreSQL database; repeat application passed without re-creating tables |
| `pnpm test:integration` | **6 passed**, using real PostgreSQL and SMTP capture |
| `pnpm test:e2e` | **3 passed**, then **3 passed again** in a separate full browser run after the final navigation/source-scanning fixes |
| `pnpm build` | Passed after final locale layout, navigation, typography and bounded Tailwind scanning changes; no live database/auth credentials required to compile |
| `pnpm audit --prod` | No known vulnerabilities reported after remediation |
| `node --import tsx scripts/smoke-production.ts` | Passed against the production build on loopback: health/readiness, EN/VI server-rendered HTML, navigation, robots/sitemap, screenshots and zero browser `pageerror` events |

The smoke server used a synthetic canonical origin and local HTTP transport. It did **not** prove production HTTPS cookie behavior, real SMTP delivery, Vercel hosting, Neon connectivity or deployment DNS.

## Behaviors verified

- Real persisted registration; password stored as a hash, not the submitted password; unverified email cannot sign in.
- SMTP-delivered verification link activates the account; subsequent login sets HTTP-only SameSite cookies and returns the persisted session.
- Client-supplied administrator role is ignored. Authorization observes database role changes/downgrades without cookie-role caching.
- Forged mutation Origin is denied. Origin/CSRF checks are explicitly enabled even in test mode.
- Logout and password reset invalidate sessions; consumed/invalid password-reset tokens cannot reset again.
- Explicit password-confirmed, email-confirmed deletion removes the account and its owned sessions/accounts.
- Twelve concurrent sign-in attempts under one fresh limiter identity yielded exactly five admitted attempts and seven HTTP 429 responses.
- Transactions roll back; concurrent email uniqueness, invalid enum values and session foreign keys are enforced by PostgreSQL.
- Liveness does not require a database; readiness fails closed when the schema/database is unavailable. Auth exceptions and backend 5xx responses are sanitized rather than returning private driver details.
- English/Vietnamese navigation, light/dark/system selection and persistence, mobile width, protected settings and private-page noindex behavior work in Chromium.
- Vietnamese `html lang` is correct in raw server HTML, not only after client JavaScript. Actual 390px and desktop screenshots were inspected; Vietnamese serif glyphs use a complete font fallback rather than broken mixed-glyph shaping.
- Remote database connections are configured with certificate verification even when a URL requests weaker SSL modes. These transport-option tests are not a live Neon certificate-handshake test.

## Implementation outputs and decisions

- `apps/web`: locale-scoped root layout, separate root redirect layout, theme/navigation, real account forms/settings, health/readiness and auth handlers, safe error boundaries and localized metadata.
- `apps/web/src/server`: lazy environment/database/auth initialization, revocable database-backed sessions, role guards, bounded SMTP, structured sanitized logging and verified-email flows.
- `packages/database`: strict schema/client and reviewed `drizzle/0000_strange_justin_hammer.sql` plus Drizzle journal/snapshot. Five identity tables only; migrations are explicit operator actions, never application startup logic.
- `tests` and `scripts`: unit/RTL, PostgreSQL integration, browser acceptance, isolated PostgreSQL/SMTP harnesses and production smoke.
- `.github/workflows/ci.yml`, `apps/web/vercel.json`, `.env.example`, lockfile and required product/architecture/security/deployment documentation. CI is prepared but has **not** run on GitHub.
- Modular monolith with only web/database workspace packages; Next Route Handlers, PostgreSQL/Drizzle, server-only services, centralized branding and locale routing. No copied legacy bootstrap credentials or per-user story/catalog identity.

## Failures found and corrected

The initial dependency installation stopped because build-script approvals were unspecified in pnpm 11; only required build scripts were explicitly permitted. Database-health cancellation typing and test module/mocking resolution were corrected. Production dependency advisories prompted patched Drizzle/Nodemailer versions and a scoped esbuild override; migration generation/application and builds passed afterward.

A production smoke check caught Vietnamese pages initially emitting `html lang=en`; the document layout was moved beneath `[locale]`, with a separate redirect root. Password input hint text was separated from its accessible name. Actual screenshots revealed Vietnamese serif fallback artifacts; a complete language-specific serif stack was selected and re-inspected.

Development browser runs reproduced repeated reloads and aborted navigation. Tailwind scanning is now explicitly limited to application source (not documents, traces or database artifacts), document-boundary links use native navigation, and test runs use settled source. Two consecutive complete browser runs passed afterward; failed runs were not converted to successes or silently waived.

## Remaining limitations / launch gates

- **No live Neon, Vercel deployment, GitHub repository provisioning or production SMTP verification.** Configure authorized isolated branches/secrets and execute the deployment acceptance checklist before launch. Original StoryNest and Eiren references remain unchanged.
- Next development mode still occasionally logged `The destination stream errored while writing data` during browser navigation/prefetch interruption. Both final browser runs passed; this diagnostic was not observed in the production smoke. Its underlying framework cause has not been independently proven. Do not claim perfectly clean development logs.
- Transactional emails currently use English. Interface pages support EN/VI; the database preferred-locale field remains a read-only/default-English foundation, not a completed account-language preference service.
- Better Auth session token storage is sensitive/raw; verification identifiers are hashed. Restrict database/backups. Session/verification/limiter retention cleanup, comprehensive export/retention policy and wider privacy features remain planned.
- Accessibility has semantic/keyboard-native foundations and component/browser coverage, not a formal WCAG certification. No scale/load or million-user capacity claim is made.
- Provider terms, catalog metadata/rights workflows, real story discovery, libraries, moderation and social features are not implemented in V0. Do not seed production with test fixtures.

## Next milestone

V1: a real, manually curated, source-attributed global catalog with multilingual titles, flexible editions, creators/genres, rights-aware visual fallback, indexed local search, public work pages and permission-controlled audited administration. Remote provider discovery belongs to V2; private reading libraries belong to V3.
