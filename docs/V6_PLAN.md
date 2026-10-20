# TaleAtlas V6 — Social Discovery Roadmap

**Status:** PROPOSED / DOCUMENTATION ONLY — 2026-10-20
**Authority:** Product planning for future independent approvals; not an implementation, migration, release, feature activation, or deployment approval.
**Source baseline:** main commit 55ec938228338960f2612206bcf8ca47f3e5d5d0 (accepted V5 source/CI). The private hosted staging investigation is independent of public production acceptance.

## 1. Product direction and definition of success

Evolve TaleAtlas from a trustworthy, curated catalog plus private reading library into a social discovery destination for manga, manhwa, manhua, and novels. Readers should return to discover works, participate in moderated conversations, follow readers they choose, curate an identity, and find relevant recommendations—not merely look up a known title.

This is a direction, not a claim of current capabilities. Success must be measured with real, consensually collected usage evidence, not synthetic engagement or invented catalog counts.

Core principles:
- **Trustworthy Work identity:** preserve canonical Work IDs, publication review, provenance, and rights evidence.
- **Privacy by default:** existing V3 library data remains strictly private; no silent feed events.
- **Reader control:** make follow, sharing, spoiler reveal, personalization, and notification choices explicit.
- **Safety before scale:** moderation and abuse controls precede any hosted activation of public posting.
- **Bilingual and accessible:** English/Vietnamese equivalence, keyboard support, mobile-first layouts, reduced motion.
- **Cost awareness:** do not introduce paid infrastructure or nontrivial egress without approval.

## 2. Verified source boundaries, not new delivery claims

- V0: Better Auth, email verification, sessions, shared shell, EN/VI and themes.
- V1: curated, published-only, evidence-backed catalog and admin publication review.
- V2: manual/offline story requests, bounded ingestion jobs, human review; live provider adapters remain disabled.
- V3: private reading library, progress, ratings, notes, rereads and history with owner-only reads/writes.
- V4: guarded Work discussions, replies, public reviews and manual moderation exist in merged source/CI, but `V4_COMMUNITIES_ENABLED` remains off for hosted staging pending independent hosted review.
- V5: reviewed metadata changes, advanced discovery filters and accepted source/CI; no feed, personal recommendations, automatic remote import, or recommendation quality claim.

Read `PRODUCT_VISION.md`, `V5_PLAN.md`, `V3_DOMAIN.md`, `V4_RELEASE_STATUS.md`, `V5C_DISCOVERY.md`, `PROVIDER_POLICIES.md`, and `DEPLOYMENT.md` for controlling contracts and historical evidence.

## 3. Milestones and ordering

| Stage | Deliverable | Required predecessor / rollout fence | Dedicated specification |
| --- | --- | --- | --- |
| **V6A — Stability and UI** | Fix observed page layouts, localized loading, session presentation, account/email flow; add regression tests | First implementation stage. No new public/social capability | [V6A_UI_STABILIZATION.md](V6A_UI_STABILIZATION.md) |
| **V6B — Social identity** | Opt-in public profile, editable presentation, visibility controls, social navigation; phased follow primitives | V6A acceptance; privacy and identity threat review before any public sharing | [V6_SOCIAL_PRODUCT.md](V6_SOCIAL_PRODUCT.md) |
| **V6C — Metadata automation** | Source-permission-reviewed adapters, normalized candidates, human approval, safe bounded jobs | Independent provider/source approval; can be researched in parallel with V6B | [V6_METADATA_AUTOMATION.md](V6_METADATA_AUTOMATION.md) |
| **V6D — Feed MVP** | Moderated posts and review/activity feed, follow view, pagination, reactions, report/block, spoiler safety | V6B identity/privacy controls and separate V4 hosted security/moderation approval | [V6_SOCIAL_PRODUCT.md](V6_SOCIAL_PRODUCT.md) |
| **V6E — Recommendations** | Explainable, user-controlled, non-AI-first recommendation MVP with safe cold starts | Real published catalog and explicit preference/privacy contract; no fabricated signals | [V6_RECOMMENDATIONS_MOTION.md](V6_RECOMMENDATIONS_MOTION.md) |
| **V6F — Motion and polish** | Measured progressive motion, reduced motion, UI performance and accessibility | Introduce lightweight improvements earlier where safe; final polish only after functional acceptance | [V6_RECOMMENDATIONS_MOTION.md](V6_RECOMMENDATIONS_MOTION.md) |

V6B and V6C planning/research may overlap if scoped separately; no milestone approval implicitly authorizes another. Feed UI can be prototyped without enabling public posting. Existing V4 code must not be silently enabled by visual design work.

## 4. Immediate backlog: V6A

Use [V6A_UI_STABILIZATION.md](V6A_UI_STABILIZATION.md) as the authoritative task checklist V6A-01 through V6A-12. Observed evidence includes the literal English/Vietnamese loading string; catalog filter misalignment; library controls/empty spacing; cramped request page; dense request form; and an email-send error `auth.mail` despite a successful HTTP registration response. A zero-result staging catalog is *not by itself* a catalog defect. The later outcome of SMTP configuration changes has not yet been verified.

## 5. Scope and approval boundaries

Documentation alone grants **no** permission to:
- implement code, add dependencies, change existing migrations, run hosted DDL/DML, or modify existing credentials;
- seed or copy external/real user data, import unlicensed media, scrape arbitrary sites, or enable provider network calls;
- expose or automatically share V3 private notes, ratings, favorites, or reading history;
- set `V4_COMMUNITIES_ENABLED=true` in hosted environments;
- bypass auth/email verification, moderation, rate limits, or audit controls;
- merge, push to `main` or `staging`, deploy, promote to Production, enable public reachability, or purchase services.

Each implementation task needs its own clearly bounded authorization. Preserve all existing Git worktrees, unrelated changes, test assets, and historical CI records. Hosted operations must be scoped to owner-verified synthetic staging resources and explicitly approved before execution.

## 6. Engineering workflow and acceptance

For each implementation stage: identify the exact starting SHA, review affected contracts, create a dedicated feature branch, publish a scoped task and tests, preserve backwards compatibility, verify data and privacy, execute required checks, publish a reviewable PR, and wait for approval to merge or deploy.

Required gates are the repository's actual applicable frozen-install, lint, typecheck, unit, real SQL integration, forward-migration/repeat/no-drift checks if applicable, production build, browser E2E, dependency audits, required GitHub CI, and manual hosted validation when claimed. Record actual counts and failures rather than pasting historical numbers. Earlier failing attempts remain historical failures; rerun success does not explain an earlier failure.

Scope-specific acceptance adds authorization checks; owner/private/public boundaries; EN/VI; 375/768/1280/1440px reflow and 200% zoom; keyboard/focus; theme; reduced motion; realistic loading/error/empty states; basic low-end-device performance. Never claim complete WCAG certification from automated tests.

Record all new evidence, open issues and blocked gates in [V6_VALIDATION.md](V6_VALIDATION.md); leave unexecuted checks **NOT RUN**. V6A acceptance is the first stop/go decision. Subsequent milestones remain **PLANNED**, not delivered.

## 7. Source of truth and maintenance

- This file defines proposed sequencing, not replacement for historical `ROADMAP.md` receipts.
- [V6_VALIDATION.md](V6_VALIDATION.md) is a prospective evidence ledger and must not mark unobserved tests PASS.
- Changes to scope, public permissions, user data visibility, provider usage, fees, migrations and hosted rollout require new explicit maintainer approval.
