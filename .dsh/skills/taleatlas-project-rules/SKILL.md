---
name: taleatlas-project-rules
description: "Project-specific coding, architecture, security, Git worktree, and verification rules for TaleAtlas."
---

# TaleAtlas Project Rules

## Before starting
- Identify the actual repository root, worktree, branch, and HEAD.
- Read the relevant documentation under docs/.
- Inspect existing implementations before proposing changes.
- Preserve all uncommitted and untracked work.

## Development rules
- Prefer minimal, reviewable changes.
- Follow existing Next.js, React, TypeScript, Drizzle, and PostgreSQL conventions.
- Never silently expand an approved feature scope.
- Do not weaken authentication, authorization, privacy, rate limits, or existing tests.
- Keep V3 private reading data out of public metadata and discovery.
- Preserve V4's server-side feature gate and default-off behavior.

## Database safety
- Never rewrite applied migrations.
- Require explicit approval for new migrations.
- Use disposable test databases for verification.
- Never access or mutate production data without authorization.

## Git safety
- Never reset, clean, stash, delete, commit, push, merge, or force-update without explicit authorization.
- Preserve existing worktrees and unfinished V5C work.
- Stop when the worktree state or change ownership is uncertain.

## Testing
- Run appropriate focused tests before broader validation.
- Preserve mandatory CI gates, security audits, and browser tests.
- Do not weaken assertions, timeouts, retry policies, or quality gates to obtain passing results.
- Distinguish locally observed results from actual GitHub CI evidence.

## Reporting
- Summarize changed files, test results, unresolved risks, and the next safe step.
- Clearly separate verified facts from assumptions.
- Stop and request approval before high-risk or out-of-scope operations.
