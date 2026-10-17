---
name: taleatlas-testing-verification
description: "Verify TaleAtlas implementations through focused tests, regression checks, PostgreSQL integration tests, Playwright E2E, security audits, and evidence-based acceptance gates."
---

# TaleAtlas Testing & Verification

## Purpose

Ensure that TaleAtlas changes are correct, secure, compatible, and supported by reproducible verification evidence.

## Before Testing

- Identify the repository root, Git branch, HEAD, and worktree.
- Read docs/TESTING.md and relevant validation documents.
- Inspect the current Git diff and preserve unrelated changes.
- Identify the approved feature scope and acceptance criteria.
- Never assume previously recorded results apply to a new HEAD.

## Verification Strategy

### 1. Static Verification
- TypeScript typecheck.
- ESLint.
- Validate relevant contracts and schemas.

### 2. Unit Tests
- Execute focused Vitest tests first.
- Verify normal, invalid, boundary, and conflict cases.
- Preserve existing assertions.

### 3. Integration Tests
- Use isolated disposable PostgreSQL databases.
- Verify authentication, authorization, and ownership.
- Check transaction atomicity and rollback.
- Verify privacy and cross-user isolation.
- Test concurrent operations where relevant.

### 4. Database Verification
- Verify migration compatibility.
- Check fresh migrations and repeat application.
- Check Drizzle schema generation for unexpected drift.
- Never modify existing applied migrations.
- Never execute tests against production data.

### 5. Browser Verification
- Execute relevant Playwright E2E scenarios.
- Validate English and Vietnamese interfaces.
- Check navigation, accessibility, responsive layout,
  and authentication boundaries.
- Preserve the existing browser test suites.
- Do not introduce retries to hide failures.

### 6. Production Build & Security
- Verify the Next.js production build.
- Check dependency security audits.
- Preserve required CI jobs and verification gates.
- Never bypass security requirements.

## V5C Verification

When testing Advanced Story Discovery:

- Verify combined catalog filters.
- Preserve published-only visibility.
- Confirm correct search ranking and pagination.
- Test URL state and locale switching.
- Verify genre selector and metadata filters.
- Ensure no private V3 data is exposed.
- Ensure V4 feature gates remain unchanged.
- Verify real PostgreSQL behavior and EN/VI browser flows.

## Evidence Rules

- Distinguish PASS, FAIL, BLOCKED, and NOT RUN.
- Report the exact executed commands and outcomes.
- Identify the commit or worktree state tested.
- Do not claim GitHub CI passed based on local tests.
- Do not claim production readiness from synthetic CI.
- Preserve failed test evidence.

## Safety

- Never change code without explicit approval.
- Never disable or weaken tests.
- Never change timeout, retry, or security limits
  merely to obtain passing results.
- Never reset, clean, stash, commit, push, merge,
  or deploy without explicit authorization.

## Final Report

Include:
1. Scope and acceptance criteria.
2. Verified Git state.
3. Tests executed.
4. Passed, failed, blocked, and untested cases.
5. Regression and security findings.
6. Remaining acceptance gaps.
7. Recommended next step.

Stop and request approval before making changes.
