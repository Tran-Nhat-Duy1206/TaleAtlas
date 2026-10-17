---
name: taleatlas-ci-debugging
description: "Diagnose TaleAtlas CI failures, GitHub Actions, Vitest, Playwright, PostgreSQL, and build regressions using evidence-based debugging without weakening quality gates."
---

---
name: taleatlas-ci-debugging
description: Diagnose CI failures and test regressions in the TaleAtlas repository using evidence-based investigation.
---

# TaleAtlas CI Debugging

## Before Investigation

- Identify the current repository, branch, worktree and HEAD.
- Read docs/TESTING.md and relevant validation records.
- Inspect actual error logs before proposing fixes.
- Preserve all uncommitted and untracked files.

## Diagnose Failures

- Classify failures by category:
  - TypeScript and ESLint
  - Vitest unit tests
  - PostgreSQL integration tests
  - Playwright E2E
  - Next.js production build
  - Drizzle migrations
  - GitHub Actions infrastructure
  - Dependency security audits

- Identify the first meaningful failure.
- Separate observed facts from hypotheses.
- Inspect related source and test configuration.
- Avoid speculative fixes.

## Safety Rules

- Never disable tests or mandatory CI jobs.
- Never weaken assertions or security checks.
- Never increase timeouts or retries merely
  to hide unexplained failures.
- Never modify production databases.
- Never reset, clean, stash or discard changes.
- Never commit, push or merge without approval.

## Verification

- Begin with focused tests.
- Confirm the original failure is addressed.
- Check for regressions.
- Preserve existing quality gates.
- Distinguish local results from GitHub CI.

## Final Report

Include:
1. Failure summary
2. Verified root cause or remaining hypotheses
3. Files involved
4. Proposed minimal correction
5. Tests executed and results
6. Remaining risks
7. Next recommended action

Stop before implementation unless authorized.
