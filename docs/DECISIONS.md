# Decisions

V0 foundation is implemented and locally exercised; decisions describe design choices, while VALIDATION records final observed outcomes.

| Decision | Rationale / tradeoff |
| --- | --- |
| Next.js 16 modular monolith | One web/server runtime, straightforward ownership and deployment; no separate API or worker package until justified |
| Web + database application packages; narrow development-only root-glob adapter | Shared typed persistence without a separate provider/jobs framework; the exact scoped Next lint adapter removes an unpatched vulnerable development dependency chain, not a new runtime service |
| Node 24 / pnpm 11.7.0 | Explicit reproducible toolchain; host/CI must support these versions |
| Better Auth 1.7.7 + Drizzle/PostgreSQL | Library-owned password/session lifecycle and typed schema; adapter/account lifecycle exercised on isolated PostgreSQL; production acceptance remains separate |
| Verified email + SMTP | Verification, reset and deletion proof use private email links; development needs capture SMTP, production needs verified sender/TLS |
| Server-owned roles / revocable sessions | No default admin seed/email-derived authority; server guards remain mandatory per resource |
| English/Vietnamese + next-themes | Centralized presentation preferences rather than duplicated scripts; browser/hydration/a11y checks remain required |
| Locale-scoped root layouts | A layout above `[locale]` cannot read descendant locale params. Production smoke caught Vietnamese SSR emitting `lang=en` despite client correction. Entry redirects now use `(entry)` layout; `[locale]/layout` owns HTML/providers/shell. Native locale/account links now cross root-layout documents; Tailwind source scanning is bounded to app source to prevent artifact/document scanning during tests. Historical navigation/reload failures were addressed, not waived: 3/3 dev tests passed twice consecutively and final production smoke verified Vietnamese SSR HTML language/navigation with zero browser page errors. Development stream-error diagnostics during interrupted navigation/prefetch remain known; none observed in production smoke. V0 local acceptance is complete, not hosted deployment acceptance. |
| Explicit immutable migrations | No startup DDL; Neon pooled runtime URL and direct migration URL separate workloads |
| No GitHub sign-in or live provider in V0 | No credentials/approval; feature absence is stated rather than simulated |
| Canonical Works implemented in V1; private libraries remain planned V3 | Prevent StoryNest's private metadata/feed leakage and arbitrary user-owned shared-index lifetime |
| Bounded PostgreSQL durable intent implemented V2A; manual/offline execution accepted V2C | Serverless/replica-safe intent and reconciliation, not fire-and-forget assumptions |

Reference audit conclusions: reuse StoryNest's bilingual reading vocabulary and metadata-ranking concepts; do not inherit its administrator seed, TLS/proxy policy, shared private/public schema or unversioned DDL. Reuse Eiren's typed modules, permission discipline, migration/evidence boundaries proportionally; do not import Discord domains or excessive operational machinery.

Revisit these choices only with concrete evidence and an updated migration/security plan. VALIDATION distinguishes implemented, tested and blocked work; roadmap scope is not a completion promise.
