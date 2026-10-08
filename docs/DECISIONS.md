# Decisions

**V0 IN PROGRESS; these are implementation/design choices, not verified outcomes.**

| Decision | Rationale / tradeoff |
| --- | --- |
| Next.js 16 modular monolith | One web/server runtime, straightforward ownership and deployment; no separate API or worker package until justified |
| Only web + database workspace packages | Shared typed persistence without premature shared/provider/jobs framework |
| Node 24 / pnpm 11.7.0 | Explicit reproducible toolchain; host/CI must support these versions |
| Better Auth 1.7.7 + Drizzle/PostgreSQL | Library-owned password/session lifecycle and typed schema; integration/adapter behavior still requires real DB tests |
| Verified email + SMTP | Verification, reset and deletion proof use private email links; development needs capture SMTP, production needs verified sender/TLS |
| Server-owned roles / revocable sessions | No default admin seed/email-derived authority; server guards remain mandatory per resource |
| English/Vietnamese + next-themes | Centralized presentation preferences rather than duplicated scripts; browser/hydration/a11y checks remain required |
| Explicit immutable migrations | No startup DDL; Neon pooled runtime URL and direct migration URL separate workloads |
| No GitHub sign-in or live provider in V0 | No credentials/approval; feature absence is stated rather than simulated |
| Canonical works separate from private libraries (planned) | Prevent StoryNest's private metadata/feed leakage and arbitrary user-owned shared-index lifetime |
| Bounded durable jobs only when needed (planned) | Serverless/replica-safe intent and reconciliation, not fire-and-forget assumptions |

Reference audit conclusions: reuse StoryNest's bilingual reading vocabulary and metadata-ranking concepts; do not inherit its administrator seed, TLS/proxy policy, shared private/public schema or unversioned DDL. Reuse Eiren's typed modules, permission discipline, migration/evidence boundaries proportionally; do not import Discord domains or excessive operational machinery.

Revisit these choices only with concrete evidence and an updated migration/security plan. VALIDATION distinguishes implemented, tested and blocked work; roadmap scope is not a completion promise.
