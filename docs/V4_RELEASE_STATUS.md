# TaleAtlas V4 — Final source and CI closure

**Recorded 2026-10-16. Status: DONE for implemented V4 source and GitHub CI. NOT DONE for hosted/public deployment or operational activation.**

## Verifiable acceptance chain

- V4A: bounded community data, ownership, publication/privacy guards and erasure; V4B: EN/VI discussions/replies and deliberate spoiler reveal; V4C: separate intentional public reviews and optional public ratings with no private-library reuse; V4D: reports, private reporter status and reasoned manual moderator decisions.
- Exact feature HEAD `6aff4bf428f02be73098fb6996e98036141676be` passed [Push](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38842239084) and [Pull Request](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38842244397) Quality gates independently. Each required foundation checks, original **17/17** scenarios, enabled V4 **8/8** scenarios, both dependency audits and aggregate `verify`.
- Maintainer [PR #4](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/4) **merged** on 2026-10-16 at `ac7cf2610dd2e048e8d0e3b1c51d40bfa7cb134b`; [post-merge main CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38844260208) **succeeded** separately with all five required jobs and full 17+8 E2E coverage.
- CI is now scenario-isolated with bounded synthetic PostgreSQL17, guarded production HTTPS/STARTTLS test fixtures; unchanged product assertions and enabled V4 retry-zero policy. Historical failed dev-server connections are not claimed causally fixed. Earlier failed runs remain failed in [append-only V4 validation](V4_VALIDATION.md).
- [Protect main](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/rules/25216018) active, required PR + GitHub Actions `verify`, force-push/deletion blocked. Up-to-date check policy was not strict when reviewed.

## What is not authorized by the merge

`V4_COMMUNITIES_ENABLED` is server-only exact-`true`; absent or false remains OFF. CI's simulated production HTTPS does not imply Neon/Vercel deployment, real SMTP, migrated production database, verified hosted auth/cookies, proxy ownership, operational backups, rate/performance guarantees, real moderator staffing or public-posting safety. **Do not enable V4 or deploy through this documentation closure.** Separately review hosted credentials and least-privilege DB/migration roles, forward SQL and backup/restore, HTTPS/cookies/origin/trusted proxy, real SMTP, privacy erasure/retention, moderation staffing/revocation, and representative capacity/abuse limits before an operator go/no-go.

## Transition decision

V4 source+CI is ready to be closed after this documentation-only PR passes its own `verify` check and is merged under the active ruleset. No V5 product implementation is implied. The next planning step is to separately scope V5 relative to pending deployment readiness, broader V2 edit corrections, licensed metadata providers, privacy and expected user value. Historical milestone notes remain preserved in the append-only [V4 validation ledger](V4_VALIDATION.md), and [V4 domain/security contract](V4_DOMAIN.md) remains authoritative.
