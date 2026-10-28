# V6 — Validation and Decision Ledger

**Current A2 state:** LOCAL UNCOMMITTED / **NO-GO for further full A2 verification** — one separately authorized isolated Library diagnostic **PASS** does not explain or erase the original full-run failure. Its new disposable PostgreSQL cluster was verifiably shut down gracefully. See [section 14](#14-a2-isolated-library-sql-diagnostic-2026-10-22-utc); section13 and all earlier receipts remain historical snapshots. No full A2, candidate CI, hosted or release acceptance is claimed.

**Initialization status (historical):** INITIALIZED / PLANNING ONLY — 2026-10-20
**Planning baseline (historical):** main 55ec938228338960f2612206bcf8ca47f3e5d5d0
**Current A1 state:** PUBLISHED / DRAFT PR [#16](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/16) — implementation commit [`ff01fdc`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/ff01fdc6b239dac3bbc138e23ecafbf284e2bef0) passed independent Push and PR CI. This documentation follow-up requires fresh CI on its own HEAD before the amended PR is accepted; see the [publication receipt](#8-a1-publication-and-exact-commit-ci-receipt-2026-10-21-utc). Manual/hosted and whole-V6A acceptance are not claimed; merge/deployment are not authorized.
**Evidence rule:** This ledger records observed conditions and prospective checks. It does **not** upgrade historical CI evidence to V6 acceptance, claim hosted production readiness, or infer a fixed root cause.

## 1. Status vocabulary

- **OBSERVED:** owner supplied a screenshot or sanitized output proving that limited observation.
- **PASS:** named test executed and the actual result was seen and recorded with scope/ref/time.
- **FAIL:** named test executed and failed; retain the failure after any later successful rerun.
- **BLOCKED:** prerequisite or authorization missing; do not substitute a PASS.
- **NOT RUN:** no execution/evidence.
- **PROPOSED:** documentation or intended work, not implementation.

Every future execution entry must include precise branch/commit, environment, command/scenario, observed count/status, safe evidence reference, affected ownership, failures, and explicit next decision. No unverified PASS claims.

## 2. Hosted staging observations (operator-provided, not CI certification)

| Check or observation | Current state | Boundaries and follow-up |
| --- | --- | --- |
| Staging project protection | OBSERVED | Vercel Authentication redirected an unauthenticated InPrivate visitor to Vercel sign-in. Recheck after material protection changes. |
| Vercel Preview and branch | OBSERVED | `staging` Preview deployment built and owner reported it ran; do not equate this with broad application acceptance. |
| Database readiness | OBSERVED (transient then OK) | Owner saw `{"status":"unavailable","database":"unavailable"}`, then after reloads `{"status":"ok","database":"ok"}`. Cold Neon start/2s probe is a hypothesis, not confirmed root cause. |
| Migration state | OPERATOR REPORTED | 15 applied migrations through 0014; 40 app tables and restricted runtime role reported; do not rerun migrations or expose credentials. |
| SMTP verification | **BLOCKED / UNVERIFIED** | Sign-up POST showed 200, but sanitized `auth.mail` level 50 error and Mailtrap 0 messages at that time. Preview SMTP variables were later updated. No successful end-to-end verification is yet recorded. |
| Catalog results | OBSERVED | 0 published Works on shown staging catalog; not by itself a bug or proof ingestion broken. |
| Library loading locale | **OBSERVED DEFECT** | English route showed literal "Loading / Đang tải…"; source hardcodes it in [Library loading](<../apps/web/src/app/[locale]/library/loading.tsx>). |
| Catalog filter geometry | OBSERVED DEFECT | Original-language helper and uneven row alignment in screenshot. |
| Library filter geometry | OBSERVED DEFECT | Unbalanced spacing and vertically displaced control area in screenshot. |
| My Requests page hierarchy | OBSERVED DEFECT | Crowded/overlapping-looking headings and actions in screenshot. |
| Request form density | OBSERVED UX ISSUE | Many optional fields shown simultaneously. No evidence of form submission failure. |
| Session header state | NEEDS REPRODUCTION | Screenshot of loading showed temporary signed-out header; determine whether hydration flicker is persistent and user-visible. |

Staging screenshots shared privately by the operator are **not** to be committed to a public GitHub repository, nor are callback tokens, private account identifiers, raw request bodies, real user addresses, personal notes or full database URLs.

## 3. Proposed V6A implementation test matrix (initialization snapshot)

| Area | Required scenario | Status |
| --- | --- | --- |
| Localized loading | English and Vietnamese loading states render only their own locale; refresh/navigation | NOT RUN |
| Catalog UI | Filter layout, description, query/URL preservation, zero results, invalid filters, overflow | NOT RUN |
| Library UI | Signed-in owner filters, empty state, 375–1440px reflow, authorization intact | NOT RUN |
| Request UI | Links/headings, empty/populated lists, paging, full and narrow widths | NOT RUN |
| Request form | Basic/optional fields, invalid values, disclaimer, revision/idempotency, error states | NOT RUN |
| Hosted email | One synthetic Mailtrap verification + authenticated login/logout; sanitized logs | NOT RUN |
| Session UI | Pending vs signed-out vs signed-in, EN/VI navigation without leaking authorization | NOT RUN |
| Accessibility | Keyboard, visible focus, 200% zoom, contrast, screen-reader spot-check | NOT RUN |
| Themes/motion | Light/dark/system; reduced-motion; no uncontrolled animation | NOT RUN |
| Code gates | Frozen install, lint, types, unit, integration, build, E2E, audits, required CI | NOT RUN |
| Staging regression | Separately approved protected Preview deployment and runtime tests | NOT RUN |

## 4. Milestone state at initialization (historical)

| Milestone | Source implementation | Source/CI acceptance | Hosted acceptance |
| --- | --- | --- | --- |
| V6A | NOT STARTED | NOT RUN | NOT RUN |
| V6B | NOT STARTED | NOT RUN | NOT RUN |
| V6C | NOT STARTED | NOT RUN | NOT RUN |
| V6D | NOT STARTED | NOT RUN | NOT RUN |
| V6E | NOT STARTED | NOT RUN | NOT RUN |
| V6F | NOT STARTED | NOT RUN | NOT RUN |

## 5. STOP / audit trail requirements

STOP on missing rights/permission, ambiguous private/public exposure, schema risk, wrong target database, paid operation, missing protected build, unapproved deployment, changed migration history, unsupported providers, auth regressions, access-control failures or missing moderator staffing for public features.

Existing source/CI acceptance for V0–V5 remains governed by its original append-only records. Do not rewrite old run outcomes or transplant historical test totals as V6 proof. New development must preserve required GitHub `verify` and all prior test suites. Updates to this ledger must be evidence-backed in the implementing PR.

See [V6_PLAN.md](V6_PLAN.md) and [V6A_UI_STABILIZATION.md](V6A_UI_STABILIZATION.md).

## 6. V6A Batch A1 — uncommitted local candidate (2026-10-20 UTC)

**Historical pre-publication snapshot:** The uncommitted-state statements below apply only to this receipt; current publication/CI evidence is recorded in [section 8](#8-a1-publication-and-exact-commit-ci-receipt-2026-10-21-utc). This entry superseded the initialization-only state for **A1 only** at its receipt time. The earlier matrix, milestone rows, operator observations and failures retain their receipt-time meaning. No V6A-03 or later implementation, whole-V6A acceptance, publication or deployment is claimed.

### Source and scope

- Existing worktree: `E:\TaleAtlas-v6a-loading-library`; branch `fix/v6a-loading-library`; HEAD/base `86030bf3926646e4e2490b0883ff224d1e40adbd`. Changes remain uncommitted and unstaged; there is no candidate commit SHA.
- Baseline CI `39449569229` was verified SUCCESS, attempt 1, before original worktree creation. This is **baseline evidence**, not CI for the working diff.
- [Library loading](<../apps/web/src/app/[locale]/library/loading.tsx>) now uses Next's selected route params, strict locale validation and a dedicated centralized `routeLoading` key. The sole status is `Loading…` or `Đang tải…`, with `role="status"` and `lang`; no effect-driven language guess, pathname parsing or session preference. Existing authentication loading messages are unchanged.
- [Library CSS](<../apps/web/src/components/library/library.module.css>) adds only `form.controls { flex-direction: row; }`; global form styles, wrapping/mobile rules and the editor's `div.controls` remain unchanged.
- [Library form](<../apps/web/src/app/[locale]/library/page.tsx>) has a validated locale/status/favorite/sort-derived key. It rebinds uncontrolled selects when the server filter model changes; explicit `false` differs from omitted, and page-only changes do not change the key. Native Reset navigation also clears unsent selections when the current URL is already bare. Names, machine values, GET action, defaults, query parser, guards, services and private-data projection remain unchanged.

### Newly executed final-source checks after resumption

Environment: Windows, Node `24.19.0`, pnpm `11.7.0`, frozen existing dependencies, Next `16.4.0`, Playwright `1.63.0` with the existing Chromium installation. No reinstall or new dependency was needed after resumption. Operator database/auth/SMTP configuration was removed from validation child processes; V4 remained off. Only owned loopback UI fixtures with synthetic authority/data were started and subsequently closed.

| Command/scenario | Observed result | Scope/time (UTC) |
| --- | --- | --- |
| `pnpm test tests/unit/library-loading.test.tsx tests/unit/i18n.test.ts tests/unit/library-pages.test.tsx tests/unit/library-ui.test.tsx` | **PASS: 110 tests / 4 files** | Resume execution starting 23:12; loading16, dictionaries16, pages21, entry/library UI57. Actual React SSR/hydration, filter serialization/rebinding and mocked server authority/privacy; not real SQL/auth. |
| `node --check scripts/test-v6a-library-ui.mjs` | **PASS** | Final helper syntax. |
| Scoped `pnpm exec prettier --check` and `git diff --check` | **PASS** | Eight changed code/test files and final tracked-diff whitespace; 23:41:27. No broad historical-document formatting. |
| `pnpm lint` | **PASS** | Final source, completed by 23:26:52. |
| `pnpm typecheck` | **PASS** | Final source, including changed page/tests. |
| `pnpm build` | **PASS** | Optimized production application build; rerun specifically because the reset/page correction postdated the earlier successful build. |
| `pnpm typecheck` after build | **PASS** | Final generated production route types; completed 23:26:52. |
| `node scripts/test-v6a-library-ui.mjs` | **PASS: 74/74 scenario groups, zero retries** | Fresh separate execution 23:27:27–23:33:39; all final assertions including zero tracked browser/network/hydration errors passed. |

The browser check uses the actual loading component, dictionaries, CSS and an exact page-source adapter replacing **only two server imports** with explicit synthetic guard/list stubs. It runs a test-only Next development App Router server, not the authenticated production application. Its scenarios are:

- EN/VI: JavaScript-disabled SSR status, pending status after root hydration, fresh direct refresh, and actual no-prefetch Link/RSC navigation: **2/2 each**.
- EN/VI real keyboard traversal, visible outline, native GET Apply, applied-filter Reset and unsent-select Reset at an already-bare URL: **2/2**.
- EN/VI × empty/populated × 375/768/1280/1440px × light/dark CSS tokens × normal/reduced motion: **64/64**. Computed direction, wrapping, containment, desktop alignment/mobile stacking and no horizontal overflow passed. An unrelated global form remained column; representative editor-style div controls retained their layout. Actual EntryControls interactions are additionally covered by the focused unit file, not by those representative browser probes.
- Theme classes are applied **after hydration** for CSS measurements. This does not test next-themes integration, system-preference persistence or theme hydration.

The [final local result](<../.local/v6a-a1-ui-77bdec53-cbaf-4ef8-9779-ed031a1c5266/evidence/result.json>) and 64 JSON/PNG pairs remain in the owned ignored fixture. [English desktop](<../.local/v6a-a1-ui-77bdec53-cbaf-4ef8-9779-ed031a1c5266/evidence/en-populated-1440-light-no-preference.png>) and [Vietnamese mobile](<../.local/v6a-a1-ui-77bdec53-cbaf-4ef8-9779-ed031a1c5266/evidence/vi-empty-375-dark-reduce.png>) were inspected. These are synthetic local presentation evidence, not operator/private-account screenshots, and are not published. The browser helper is opt-in; existing CI suite selection/workflows were not changed to run it automatically.

### Historical failures retained — not converted to PASS

| Local browser receipt | Observed failure | Subsequent action/qualification |
| --- | --- | --- |
| [ccbb1393 setup](<../.local/v6a-a1-ui-ccbb1393-00bd-4b62-bfe3-86de54328850/evidence/failure.json>) | FAIL before scenarios: fixture could not resolve `@/lib/i18n`. | Fixture-only explicit webpack alias and relative tsconfig mapping; no product/config change. |
| [1076a873 keyboard](<../.local/v6a-a1-ui-1076a873-de67-4959-8bc5-e45233526871/evidence/failure.json>) | FAIL after EN loading flows: stale Reset selector; fixture document-ID API also failed in about:blank contexts. | Subsequent actual-page React regression reproduced stale selects; filter key/native Reset implemented. Fixture IDs use compatible random values, and a committed-server-query marker distinguishes URL changes from completed renders. |
| [89a54120 hydration](<../.local/v6a-a1-ui-89a54120-4b1c-4912-8e4b-8a35c358995d/evidence/failure.json>) | All 74 scenario assertions completed, but overall **FAIL** on 32 tracked hydration console errors. | Fixture injected the dark HTML class before hydration. Injection moved after hydration; no hydration assertion, timeout or retry was relaxed. This was not a production-theme fix. |
| [482a76ca deadline](<../.local/v6a-a1-ui-482a76ca-d7d2-4085-a48e-f64e41704db0/evidence/failure.json>) | Resume **FAIL** at EN/empty/1440/light hydration: unchanged 15s deadline; 12/64 geometry groups and EN flows/keyboard completed, no tracked browser errors. | Cause remains **UNCONFIRMED**. Added failure-only diagnostic capture; a separate fresh run passed all74 with unchanged deadlines/assertions and zero retries. This does not erase or explain the deadline failure; residual timing/flakiness risk remains. |

Earlier-session terminal history also reported two failing reset regression cases before the correction, and an intermediate two-case hydration failure from using non-hydratable static markup in that new unit. The unit now uses React `renderToString` text-boundary markers; its reset-value and zero-recovery assertions remain intact and passed in the newly executed final-source suite.

Earlier reported focused146/6 and full2056/72 successes predated the final reset changes. They are **not final-source whole-suite acceptance**. The entire unit suite was deliberately **NOT RERUN** after resumption; affected final-source coverage is the newly observed110/4 above. Earlier build success was not reused for the modified page; the final build/types/lint were rerun as recorded.

### Exact tested working-source fingerprints (SHA-256)

The four production hashes were verified before/after final checks; no production source changed during validation. Test hashes identify the final focused/browser implementations. The ledger itself is an evidence update, not part of the tested application bundle.

```text
apps/web/src/app/[locale]/library/loading.tsx eb276639f686bda7b6800e1c75d48dce48c399c38623c5b92696814a4265f4b7
apps/web/src/app/[locale]/library/page.tsx 398bfcacbbddeebaf9f397d43134ab307286b050e7e9c868910b3fa0a98444ea
apps/web/src/components/library/library.module.css 64b5c8f790817fdb06b8ba3712ba13d58267567bf7fce0c720c960da3a5c7893
apps/web/src/lib/i18n.ts 14885117c34f35452be7bfd83b31c2601a3b9c226863fe6fbcd72cd6dc10c50b
tests/unit/i18n.test.ts b6aacdc6834e398c5682f69402e1ea526b614f035a95dd3bdde45be7f1a1766b
tests/unit/library-loading.test.tsx 3a37496433812bf37c551586142f5b303faf08d675241954b2dc6d38ceedaa1f
tests/unit/library-pages.test.tsx e068aa8ada36ffdff8aae46e8dc63ed5d7d00b772a1b7890fcd264caed569c5e
scripts/test-v6a-library-ui.mjs 8d24fb403efe5168c984eb6d721b38fcee8d0f567ddee89b4915b82772a772ff
```

Final read-only preservation verification passed: main remained exact/clean at the approved baseline; all six other historical worktree HEAD/status/index states were preserved, including both acknowledged generated-file modifications. All 512 protected source entries, eight historical fingerprints and four excluded performance files matched their pins. The A1 index is empty; its nine-file inventory is scoped to four production files, four test/helper files and this ledger. All prior failed fixtures remain intact. No dependency, global form CSS, workflow, server/service, migration or infrastructure change was made.

### Remaining gates and decision

- **NOT RUN:** real database/auth/owner isolation integration; database-writing default/enabled-V4 E2E; fresh/repeat migrations or generation/no-drift checks; new dependency audits; candidate GitHub CI. No migrations/schema/dependencies/workflows were changed. Separate explicit authorization and verified disposable owned loopback resources are required before DB-writing suites; staging/production are never fixtures.
- **NOT RUN:** actual browser-UI 200% zoom (no CSS/DPR/page-scale substitute), manual rendered contrast, assistive technology, complete full-shell/system-theme persistence, low-end performance and production-mode authenticated browser acceptance. No WCAG/hosted certification is claimed.
- Existing lazy placeholder-image LCP advisories were observed in the synthetic populated cases; no image/motion/SMTP/infrastructure optimization was included in A1.
- Source implementation and the stated local A1 checks are complete; the earlier timeout remains a recorded risk. Full V6A, CI and hosted acceptance remain pending. No commit, push, PR, merge, deployment or Batch A2 is authorized or performed. Await maintainer approval for further testing and any publication.

## 7. A1 final verification and pre-commit review (2026-10-21 UTC)

**Historical local pre-commit snapshot:** The statements below retain their pre-publication meaning; current publication/CI evidence is recorded in [section 8](#8-a1-publication-and-exact-commit-ci-receipt-2026-10-21-utc). [Section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc) retains its earlier source-bound results, NOT RUN states and failed attempts; those are not silently rewritten as passes. The maintainer subsequently authorized the full local gates on fresh owned loopback databases and explicitly confirmed unchanged, isolated test-only V4 fixtures. No operator/hosted V4 setting was enabled.

### Candidate and complete diff review

- Existing worktree/branch/base remain `E:\TaleAtlas-v6a-loading-library`, `fix/v6a-loading-library`, `86030bf3926646e4e2490b0883ff224d1e40adbd`; index empty. The same nine files remain the candidate: four product files, four test/helper files and this ledger. All nine initial versions were copied and hash-verified into a fresh ignored review directory before corrections. No worktree was recreated or historical change discarded.
- Complete tracked diffs plus both untracked files were reviewed. The four product files and three unit files retain the exact hashes recorded in [section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc): selected-locale status text/central copy, filter-only row CSS, validated filter-state form key/native Reset, and focused regression coverage. No new product change was needed in this review.
- Two **fixture-only P2 findings** in the [browser helper](<../scripts/test-v6a-library-ui.mjs>) were minimally corrected: (1) cancellation now fences resource acquisition and closes late browser/context/listener handles instead of relying only on cached cleanup; (2) webpack checks canonical resolved server/database resource paths and forbidden package resources, supplementing the original raw import-prefix guard. The exact pure library-types module remains allowed. No assertion, timeout, retry, test selection or public feature was relaxed/added.
- [Eleven extracted-function/config contract checks](<../.local/v6a-a1-final-review-b9884510-f7cc-451a-86bb-46987a8fa5a9/helper-contract-results.json>) passed for cancellation/late acquisition and direct, relative/absolute database/server imports. These use synthetic handles/hooks, not an OS signal or process-isolation certification. A targeted independent read-only patch review found no remaining must-fix defect in those corrections; the full browser run below additionally validated the real compiler/normal teardown.
- Security/portability review: no real hardcoded credentials or project-specific local path in the candidate helper; root/dependency paths are derived, commands use argument arrays, child env is allowlisted, resources/ports are owned loopback-only and writes are exclusive. The helper requires the locked Next16.4.0/Playwright1.63.0 dependency layout, Node24, an installed Chromium and a physical checkout. Windows junction and POSIX symlink/process-group branches were reviewed; **clean Linux execution is not claimed**. Next/Node and same-user local filesystem writers remain trusted: this is not an OS network/filesystem sandbox. Existing CI does not automatically invoke this opt-in helper; no workflow was changed.

### Owned SQL/native resource gate

The legacy fixed-port/shared-manifest launcher and database-recreation verifier were **not run**. Installed native PostgreSQL `initdb`, `postgres` and `pg_ctl`18.4 passed executable-version checks. This review used those official tools with run-owned lifecycle glue around unmodified project commands, not a historical runner or existing cluster.

A new data directory under this review's private resource root was exclusively created; current-user ownership and a current-user-only FullControl DACL were independently verified. A redundant `Set-Acl` owner-assignment attempt **FAILED** with missing `SeSecurityPrivilege`; it was not retried or escalated. Read-only inspection proved the actual owner/DACL already met the isolation requirement before any database started. That failed preparation operation is retained separately and is not a failed application test or a permission bypass.

PostgreSQL bound **127.0.0.1:58435** only. Before tests, native listener PID/executable/account/data-directory/creation time and postmaster PID-file tuple were matched; SQL verified exact database/role/owner/address/port, UTF8 encoding, version, canonical data directory, server start time and stable cluster system identifier. Separate newly created, empty integration and E2E databases ending `_test` were verified before migrations; generated random credentials were process-private and never printed. The pre-existing port3000 service was untouched; native HTTPS used fresh port60023. The shared database manifest remained absent. No hosted database/mail/provider resource was accessed.

### Newly observed final-source gate matrix

Environment: Windows x64, Node24.19.0, pnpm11.7.0, Next16.4.0, Playwright1.63.0/installed Chromium, **PostgreSQL18.4**. This is not Ubuntu/PostgreSQL17 GitHub CI parity. Raw integration/browser/mail evidence remains private and ignored; [sanitized aggregates](<../.local/v6a-a1-final-review-b9884510-f7cc-451a-86bb-46987a8fa5a9/final-summary.json>) contain no credentials or callback tokens.

| Gate | Final observed result | Scope / completion (UTC) |
| --- | --- | --- |
| Helper syntax + extracted safety contracts | **PASS: 11/11** | Actual helper AST/config, synthetic resource handles; same budgets. |
| Focused four-file unit selection from [section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc) | **PASS: 110/110, 4 files** | Both loading locales, SSR/hydration/rebinding/native GET, auth/privacy denial units and EntryControls/library interactions. |
| `pnpm test` | **PASS: 2058/2058, 72 files** | Complete final-source unit suite, not the earlier2056 count. |
| `pnpm lint` | **PASS** | Final product/helper candidate; application ESLint scope unchanged. |
| `pnpm typecheck` | **PASS** | Entire workspace/test TypeScript. |
| `pnpm build` | **PASS** | Optimized production application. |
| Post-build `pnpm typecheck` | **PASS** | Static gate group completed00:14:51. |
| Scoped Prettier (eight code/test files) + `git diff --check` | **PASS** | Final00:50:27 check; no broad historical-document reformatting. |
| `pnpm db:migrate`, repeated | **PASS** | Fresh owned integration target;00:22:00/00:22:05. |
| `pnpm db:generate` + complete migration byte/inventory comparison | **PASS: no drift** | 00:22:14; identical migration tree also verified after all database/browser gates. No historical migration was modified. |
| Entire `pnpm test:integration` | **PASS: 332/332, 34 files; 0 failed, 0 skipped** | Only JSON reporter/output routing changed; no selection/assertion/budget change. Completed00:29:41. |
| Database-free A1 browser helper | **PASS: 74/74 groups, zero retries** | [New final receipt](<../.local/v6a-a1-ui-052bfb80-4d11-4613-998b-9db3862c2940/evidence/result.json>), completed00:34:15. Both locales' SSR/pending hydration/refresh/real Link navigation and keyboard/native Reset passed;64 geometry combinations retained. Zero tracked hydration/network/page errors. |
| Fresh/repeat migrations on separate new E2E target | **PASS** | 00:34:31/00:34:36; same owned cluster, independently empty database. |
| Complete unfiltered `pnpm test:e2e`, production native mode | **PASS: default20/20 + isolated enabled8/8** | Real HTTPS/STARTTLS/signed sessions, unchanged canonical wrapper/configs/deadlines, CI unset/local retries0;20 passed3.7m +8 passed2.1m. Completed00:40:52. Test-only V4 opt-in explicitly approved; no operator activation. |
| `pnpm audit --prod --audit-level high --json` | **PASS: 0 vulnerabilities at every severity** | Public registry, empty run-owned npm configs/no copied credentials. |
| `pnpm audit --audit-level moderate --json` | **PASS: 0 vulnerabilities at every severity** | Both audits completed00:22:24; no dependency changes. |

The final helper hash is `43feb1bf333fbcecfbbb6f7f1a64bea41167f7e3a4a04aab0a793aa445679d81`; the former `8d24…` in [section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc) correctly identifies its earlier version. All four product and three unit-file hashes still match the initial candidate. Initial versions, all failure receipts and new evidence are retained; no staging/commit/push/PR/merge/deployment occurred.

### Prior 15-second timeout: investigation and classification

The [original failure](<../.local/v6a-a1-ui-482a76ca-d7d2-4085-a48e-f64e41704db0/evidence/failure.json>) remains **FAIL**: the pending hydration marker did not appear within15000ms at EN/empty/1440/light after EN flow/keyboard groups and12 geometry groups had completed. Its tracked browser-error list was empty. The preserved [development log](<../.local/v6a-a1-ui-482a76ca-d7d2-4085-a48e-f64e41704db0/.next/dev/logs/next-development.log>) shows startup/route compilation, browser activity through+03:34 and no recorded server/client error; the owner readiness and earlier hydration/navigation cases had already succeeded. It was therefore not a failure of the initial startup-readiness gate.

**Classification: unresolved fixture/client-readiness or environmental timing, not a demonstrated A1 language/filter regression.** The old run did not capture the failed DOM/probe state, request timing or resource/scheduler profile, so the exact cause cannot be established or an intermittent product issue categorically excluded. Failure-only diagnostics were added later and cannot retroactively explain it. The later [section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc) pass, this review's74-group pass and complete native production passes establish later successes only. The safety fixes in this review address separate lifecycle/import-boundary findings, **not** that timeout. No timeout increase, automatic retry or weakened assertion was used. Retain the timing issue as an explicit PR-review risk rather than claim it resolved.

### Cleanup, limitations and decision

Owned postmaster identity was reverified before official `pg_ctl -D <exact-owned-data-directory> -m fast -w stop`; cleanup completed00:41:09. Subsequent read-only checks confirmed no listeners on the owned SQL58435/native60023/mail1025/inbox1026 ports and no owned PostgreSQL process. Only run-created resources were stopped; database files/logs/reports/snapshots remain preserved. There was no global or process-name-wide shutdown, no termination of unverified PIDs, no unrelated cluster operation and no shared-manifest overwrite. The browser helper reported successful owned-child teardown.

Final00:50:27 preservation checks passed: main exact/clean; all six historical worktree HEAD/status/index states preserved;512 protected source entries/eight historical fingerprints/four optional performance files/two acknowledged generated-file modifications unchanged. All nine initial candidate snapshots still match their captured hashes. Only this ledger and the scoped browser-helper safety corrections changed during this review; the four product and three unit files are unchanged. Candidate inventory remains seven tracked modifications plus two untracked additions, index empty; no schema/dependency/global CSS/workflow/server-service change.

- **NOT RUN:** actual browser-UI 200% zoom, screen reader/manual composed contrast, broad low-end performance, clean Linux/PG17 execution of this candidate, candidate GitHub CI or hosted staging/production acceptance. Existing full native scenarios are not a WCAG certification or a hosted SMTP delivery result. Earlier operator SMTP observations remain unverified; no SMTP product/infrastructure change was made.
- Existing lazy-placeholder LCP advisories remain non-fatal observations, not an A1 performance fix.
- **Recommendation: GO for a scoped A1 commit and review PR, only after explicit maintainer approval.** All applicable local gates above passed and no release-blocking A1 product defect was identified. This is not authority to stage/publish now, not merge/deploy approval, not whole-V6A acceptance, and not permission to start A2. Mandatory real PR/main CI, including Linux/PostgreSQL17, still governs merge acceptance; the historical timeout and manual-validation limits must remain disclosed.

## 8. A1 publication and exact-commit CI receipt (2026-10-21 UTC)

GitHub run metadata and each run's attempt-1 job list were independently verified at **2026-10-21T11:52:58Z**; these are actual GitHub results, not an inference from local tests.

- Published A1 implementation: [`ff01fdc6b239dac3bbc138e23ecafbf284e2bef0`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/ff01fdc6b239dac3bbc138e23ecafbf284e2bef0), branch `fix/v6a-loading-library`, base `86030bf3926646e4e2490b0883ff224d1e40adbd`.
- [Draft PR #16](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/16) targets `main` and remains open/draft, not merged. The approved A1 change set contains the same nine file paths; this follow-up changes only this ledger.
- [Section 6](#6-v6a-batch-a1--uncommitted-local-candidate-2026-10-20-utc) and [section 7](#7-a1-final-verification-and-pre-commit-review-2026-10-21-utc) are historical local/pre-commit snapshots. Their earlier uncommitted states, local results, NOT RUN entries and failed attempts retain their receipt-time meaning.

Both independently executed runs below identify the exact published commit `ff01fdc6b239dac3bbc138e23ecafbf284e2bef0`:

| Event | GitHub run | Attempt | Final result | Mandatory jobs |
| --- | --- | --- | --- | --- |
| Push | [39525577751](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39525577751) | 1 | **SUCCESS** | **5/5 successful** |
| Pull request | [39525728895](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39525728895) | 1 | **SUCCESS** | **5/5 successful** |

For each run, all five completed successfully: `Quality foundations`, `Native original 17 (V4 disabled)`, `Native enabled V4 8 (retry zero)`, `Dependency security audits` and aggregate `verify`. These required Ubuntu/PostgreSQL 17 CI gates passed on the published implementation; the Windows/PostgreSQL 18.4 results above remain separate local evidence. The opt-in A1 browser helper is still not automatically invoked by CI.

**Acceptance boundary:** A1 implementation source/CI acceptance is evidenced for **`ff01fdc6b239dac3bbc138e23ecafbf284e2bef0` only**. This documentation-only follow-up requires independently successful new Push and PR CI runs on its own exact HEAD, including all mandatory jobs, before the amended PR is treated as CI-accepted. The earlier green runs do not certify a later commit. Draft publication/source CI is not ready-for-review, merge, deployment or whole-V6A acceptance.

**Still pending:** actual browser-UI 200% zoom, screen-reader/manual composed contrast and broader manual accessibility/performance acceptance; hosted SMTP verification/delivery and protected staging/production runtime validation. Local synthetic HTTPS/STARTTLS and GitHub fixture success do not establish hosted mail or deployment acceptance. No deployment, V4 activation or Batch A2 work is authorized by this receipt.

**Historical failure retained:** the earlier 15000ms hydration-readiness timeout remains **FAIL / UNEXPLAINED**. Neither the later local passes nor these exact-commit CI successes diagnose its cause or prove it fixed. All earlier failed evidence and limitations remain preserved; no timeout, assertion or retry requirement was relaxed.

## 9. A2 Catalog filter layout — local receipt (2026-10-21 UTC)

**Historical initial A2 receipt:** The retained 70/74 FAIL result and Reset deferral below describe that snapshot only. The separately authorized investigation/correction is recorded in [section 10](#10-a2-catalog-reset-correction-2026-10-21-utc); no earlier failure has been deleted or converted to PASS.

### Scope, synchronization and baseline

V6A-03 only: Catalog form control alignment and visible full-width descriptions. No A1 implementation was repeated, no V6A-04 or later feature was implemented, and all earlier A1 receipts/failures/limitations above are retained unchanged.

- The first preflight stopped safely while local `main` was still `86030bf3926646e4e2490b0883ff224d1e40adbd`. On authorized resumption it was **already** at approved `4791c0373588aef9a6895049d2def67fc045a1c1`, not the reported old HEAD, so the old-HEAD guard stopped before any fetch/merge. Read-only checks showed local/remote approved main and a clean index/worktree. The maintainer then explicitly chose to proceed from the already-updated main without synchronization. **This agent did not perform a fetch/merge/fast-forward**; prior-to-approved ancestry was verified.
- [Post-merge main CI39599291927](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39599291927) was independently verified **SUCCESS**, attempt1, all five mandatory jobs, on exact approved `4791c0373588aef9a6895049d2def67fc045a1c1`. This is baseline CI, **not A2 candidate CI**.
- A fresh `E:\TaleAtlas-v6a-catalog-filters` / `fix/v6a-catalog-filters` worktree was created from that main, tree `8f4ba5aa139dd496fd80e4780331ec88452b0883`. A2 HEAD remains the baseline; the candidate is unstaged/uncommitted. Main and all seven other pre-existing worktrees, including clean A1 at `09b655a430bd3c4886b3950ed32584f72cfbc556`, were preserved.
- Dependencies were prepared only in the new worktree using `pnpm install --frozen-lockfile --offline --ignore-scripts`:507 reused,0 downloaded, no dependency metadata changes or lifecycle scripts. Environment: Windows x64, Node24.19.0, pnpm11.7.0, Next16.4.0, Playwright1.63.0/existing Chromium. No database/mail/provider credentials were copied into fixture children; no database, SMTP fixture or hosted service was started.

### Root cause and minimal correction

Actual source and **rendering before product edits** confirmed that the form was already wrapping row flex. Its `align-items:end` aligned each complete field wrapper, including the long original-language paragraph and conditional genre-capacity paragraph, rather than the input/select edges. Merely changing global form direction or stretching wrappers would not address wrapped labels correctly.

The [baseline fixture receipt](<../.local/v6a-a2-ui-3e9e6662-0be6-4199-92be-9090798fae80/evidence/result.json>) is **BASELINE_MEASUREMENT_ONLY**, not final PASS. All16 desktop EN/VI × empty/populated × normal/overflow ×1280/1440 measurements showed same-row actual control-bottom spread **160.25px**. For EN/empty/normal1280, language input bottom341.046875 versus peer bottom501.296875; the helper occupied349.046875–501.296875 inside that wrapper. [English before](<../.local/v6a-a2-ui-3e9e6662-0be6-4199-92be-9090798fae80/evidence/before-en-empty-normal-1280-light.png>) and [Vietnamese overflow before](<../.local/v6a-a2-ui-3e9e6662-0be6-4199-92be-9090798fae80/evidence/before-vi-populated-overflow-1440-light.png>) were inspected. These are explicit synthetic presentation fixtures, not staged publications or hosted screenshots.

- [PublicCatalog](<../apps/web/src/components/catalog/PublicCatalog.tsx>) moves both existing paragraphs, unchanged, into one visible help area after all controls/actions **inside the same form**. Original IDs, labels, `aria-describedby`, EN/VI text and overflow condition remain intact; no tooltip, hiding, truncation or new interaction was substituted.
- [Catalog module CSS](<../apps/web/src/components/catalog/catalog.module.css>) gives only that area a full row (`flex:0 0 100%`, full width, min-width0, grid gap). The narrow column breakpoint resets its flex basis to auto. Existing bottom alignment, nested-label flex override, field/search widths, wrapping and focus styles remain unchanged. Global CSS is unchanged.
- [Discovery UI units](<../tests/unit/catalog-discovery-ui.test.tsx>) add eight EN/VI normal/overflow cases: description uniqueness/association, same-form/outside-field placement in empty/populated rendering, hidden single genre value and exact successful native FormData/parser roundtrip. All original assertions remain.
- [Opt-in A2 browser helper](<../scripts/test-v6a-catalog-ui.mjs>) renders the real PublicCatalog/query/CSS in an owned Next development fixture with synthetic props. It has frozen dependencies, allowlisted child env, loopback owner readiness, resolved server/DB import rejection except pure catalog types, cancellation/late-handle fences, exclusive per-run writes and owned process-tree cleanup. It is not an OS sandbox, complete application shell or SQL/authentication acceptance; no CI wiring changed.

No query parser, API, SQL, schema, publication visibility, ownership/security check, copy, pageSize/pagination, exact genre/language validation, missing-genre fallback, disabled overflow selector, hidden genre value, GET destination or Reset implementation was changed. A read-only contract/patch audit found no blocking semantic/layout/ARIA defect in these changes; that audit is not runtime or SQL proof.

### Preserved failures and final static checks

- New help-placement units **failed before correction**:4 failed/30 passed (34 total), exactly the four EN/VI normal/overflow placement cases. The [original regression receipt](<../.local/v6a-a2-unit-before-660df9f2-8814-480c-b1cd-8a7641bfc8ae/result.json>) remains intact.
- First static attempt: scoped113/113 and lint **PASS**, then typecheck **FAIL** at two new test assertions because generic `Element` query results were not assignable to Jest DOM's HTML/SVG matcher types. Build/post-build types were not executed after that failed prerequisite. Explicit `HTMLParagraphElement` query-selector types corrected only the new test typing; runtime assertions and budgets were unchanged.
- Corrected final-source [static receipt](<../.local/v6a-a2-static-c9a0e64f-00f1-4d9f-b9a2-2d6110c3eb00.json>): **113/113 tests, six files PASS**; `pnpm lint` **PASS**; `pnpm typecheck` **PASS**; `pnpm build` **PASS**; post-build `pnpm typecheck` **PASS**, completed2026-10-21T13:13:03Z. Selected files: discovery UI34, discovery query41, catalog contracts9, catalog HTTP8, catalog service9 and catalog projection12. Mocked API/service units are not PostgreSQL proof.

### Final database-free browser results — overall FAIL retained

The single final `node scripts/test-v6a-catalog-ui.mjs` execution used frozen product/helper source after the static checks. [Final receipt](<../.local/v6a-a2-ui-f251854b-edb3-43bc-a07a-ee6b05af59dc/evidence/result.json>): **70 PASS /4 FAIL out of74 checks; process exit1; overall FAIL**, not a fully passing browser gate. All four failures are the independently reproduced baseline Reset cases described below. No skip, xfail, suppression, retry or deadline increase was introduced; hydration15s/startup90s remain unchanged.

| Final browser scope | Observed result |
| --- | --- |
| EN/VI × empty/populated × normal/overflow genres ×375/768/1280/1440px | **64/64 geometry checks PASS**, using two paired states per core case: light/no-preference and dark/reduce. This is not all four theme/motion Cartesian combinations. |
| Row alignment | Actual control-bottom spread **0px** in every measured same-flex-line group, including actions when sharing that line; groups are identified by direct wrapper bottoms, not displaced control y positions. |
| Full-width help and reflow | Help-area edges/width match computed form content within1px; both paragraphs fill the area and follow controls/actions. All64 cases have no horizontal overflow, clipped label text, direct item overlap or label-text/control overlap; mobile fields fill content width and retain stack order. |
| Native keyboard, GET, exact values/fallback/overflow | **6/6 other functional checks PASS** across both locales: Tab/focus through all seven enabled controls/actions, real keyboard selections, all five native GET values/pageSize7/first-page behavior and destinations, exact recorded-language case, missing selected genre fallback and disabled overflow+single hidden value. |
| Applied Reset and bare-URL unsent Reset | **4/4 checks FAIL**, matching the pre-edit baseline; unchanged by explicit scope decision. |
| Browser errors and cleanup | Tracked page/hydration/network errors **0**, retries0; owned Next process exited and browser contexts closed. Independent post-run check found no A2-owned Node process. |

The final fixture retains72 PNGs,74 JSONs and the exact helper source snapshot. [English desktop after](<../.local/v6a-a2-ui-f251854b-edb3-43bc-a07a-ee6b05af59dc/evidence/after-en-empty-normal-1280-light.png>), [Vietnamese populated overflow after](<../.local/v6a-a2-ui-f251854b-edb3-43bc-a07a-ee6b05af59dc/evidence/after-vi-populated-overflow-1440-dark.png>) and [375px overflow/dark after](<../.local/v6a-a2-ui-f251854b-edb3-43bc-a07a-ee6b05af59dc/evidence/after-en-empty-overflow-375-dark.png>) were visually inspected. The populated result is synthetic test data, not a real published Work or hosted catalog-size observation. Dark classes are applied only after hydration for CSS measurement; no system-theme persistence/integration claim.

Representative measured EN/empty/normal1280 improvement:

| Measurement | Before | A2 after |
| --- | --- | --- |
| Same-row filter-bottom spread |160.25px|0px|
| Original-language help width |168.28125px|1062px, matching content x109–1171|
| Filter form height |367.453125px|244.953125px|

### Explicitly deferred pre-existing Reset defect

Before **any** product edit, both locales failed applied Reset and unsent Reset at the bare URL, while the server-rendered query-complete marker had already committed `{}`. Applied Reset cleared text/default pageSize but retained stale `NOVEL`/`fantasy`/`ONGOING` selects; bare-URL unsent Reset retained all five edited filter values. These are real observed uncontrolled-state reuse problems in the fixture, not speculation from `defaultValue` source. They are not attributed to the A2 layout change. Baseline/final failure JSON and screenshots are all retained; the Reset Link/destination, defaultValue props and form key behavior remain untouched.

After this evidence was reported, the maintainer explicitly selected **KEEP A2 LAYOUT-ONLY**, deferring Reset rather than authorizing behavioral expansion. Accordingly no controlled-state effect, remount key or native Reset replacement was added. The new browser checks still assert correct Reset values and still fail; the overall browser gate must not be represented as PASS. A later behavioral correction or publication decision accepting that deferral requires separate maintainer approval.

During helper authoring, a review also found that a browser-close error could otherwise skip owned server cleanup. The helper now aggregates cleanup errors while still terminating only its owned process tree; both observed runs cleaned up successfully. This was a fixture review correction, not an observed leaked process or an explanation of A1's historical timeout. Existing placeholder-image LCP and smooth-scroll advisories remain non-fatal observations, not A2 fixes.

### Final scope, fingerprints and remaining gates

Exactly five candidate paths: the two Catalog product files, the additive discovery UI unit, the new opt-in browser helper, and this ledger. The two product files are the only application changes; no global styles, parser, dictionary/copy, API, backend, dependency, workflow, migration or historical-worktree change. Index empty; no commit/push/PR/merge/deployment.

Final2026-10-21T13:24:37Z scoped Prettier check (four code/test/helper files) and `git diff --check` **PASS**. All four tested source fingerprints still match; the entire original A1 ledger prefix is preserved byte-for-byte after removing only the new A2 header. All eight pre-existing worktree HEAD/status/index states are preserved. No full historical-document reformatting was performed.

```text
apps/web/src/components/catalog/PublicCatalog.tsx b1f9c5d1463274d7784f58f6895920c659273c8127fa25f12efeb49428f760a5
apps/web/src/components/catalog/catalog.module.css 3e0dcd0a7ba883c6a7af4ea255bdf64e7d78d3ddc92b28cff5f2c03f1ce569f6
tests/unit/catalog-discovery-ui.test.tsx 6eff656f145e1bf276996ebb6b8100eb01c534ce4f10e56d3b6afdb3329b7ae6
scripts/test-v6a-catalog-ui.mjs 985bcf7e243adbf6f0d35aacab90c02c8b21ea5e6aae9825d31cdd35257ee0ef
```

- **NOT RUN:** complete unit suite, SQL/integration/default or enabled native E2E, migrations/generation, new dependency audits, candidate GitHub CI and any hosted check. No dependency/schema change was made; earlier A1/main results are not candidate evidence. Database-writing gates require separate explicit authorization plus freshly owned, identity-verified disposable loopback resources; none was assumed or used for A2.
- **NOT RUN:** actual browser-UI 200% zoom, assistive technology/manual composed contrast, full-shell/theme persistence, real published-only SQL behavior or low-end/hosted acceptance. Unit/source contracts and synthetic browser presentation checks are not equivalent to these gates.
- Main/A1/all historical states were preserved;512 protected historical source entries/eight fingerprints/four optional performance files/two acknowledged generated-file modifications matched their pins. No historical runner or cluster was executed. The older A1 15-second hydration failure remains unexplained and is not diagnosed/fixed by this work.
- **Decision:** the scoped V6A-03 layout correction is locally demonstrated; the full browser harness remains **FAIL** on the explicitly deferred baseline Reset defect. No overall source/CI, whole-V6A or release acceptance is claimed. Obtain maintainer approval for any Reset follow-up, additional database-writing validation and any commit/PR publication. V6A-04+, SMTP/infra, V4/providers and deployment remain out of scope. STOP with the candidate preserved uncommitted.

## 10. A2 Catalog Reset correction (2026-10-21 UTC)

### Authority, exact state and preservation

The maintainer explicitly authorized this limited Reset extension, **superseding** the earlier layout-only deferral, without authorizing publication, A3 or database-writing tests. The existing worktree was reused, not recreated: `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`. The expected five changed/new paths and empty index were verified, with all five prior candidate fingerprints matching the initial A2 receipt. Main, A1 and six other historical worktree HEAD/status/index states matched their protected states.

Before modification, all five candidate files and both old browser evidence sets were copied to a fresh ignored [preservation directory](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/preservation.json>). Its200 hashes cover the original candidate/evidence snapshots; originals were retained and later rechecked unchanged. The alignment CSS remained byte-identical to the initial A2 candidate throughout this extension. No reset/clean/stash/rebase/force operation, commit or remote write occurred.

### Verify classification rather than inherit the old assumption

A read-only forensic review found that the old baseline helper source/hash was **not retained**, while its geometry/version differed from the retained candidate helper. Therefore the two earlier runs alone do **not** establish byte-equivalent test conditions. It also found a real readiness weakness: at a bare URL, both `waitForURL(!search)` and the `{}` query marker were already true before Reset. The old immediate unsent observation could precede the new render. Native-document navigation is an additional implementation assertion, not the documented V5C semantic-clearing contract; all four old failures occurred at the clear-values assertion first.

A fresh [controlled A/B report](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/experiment-6c2ccac9-95eb-4b9f-8641-9ef5da184cdc/REPORT.md>) resolves those uncertainties. [Source proof](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/experiment-6c2ccac9-95eb-4b9f-8641-9ef5da184cdc/source-proof.json>) verifies original HEAD Catalog/CSS against Git blobs and the initial A2 pair against preserved snapshots. Eleven explicitly copied pure dependencies form frozen mirrors; only PublicCatalog/CSS differ. Both use identical normalized diagnostic logic (SHA256 `a42d2a298700119f0daca53273aac2c5106308220c64eef20c18cd41501b3770`), framework versions, synthetic props/cookies, real server component/Next Link/App Router, actions, locale,1280px context and15s/90s budgets, retries0. No live SUT swapping or fictional controlled-client wrapper was used.

A sibling effect records each fresh server-render nonce **after client commit**, without wrapping/keying/resetting the form. Every Reset was observed both immediately and after the existing15000ms DOM-clearing condition expired. Both arms then had a new server nonce matching the client-commit nonce, committed default query, unchanged document/form/control nodes, and stale values. [Complete14-case comparison](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/experiment-6c2ccac9-95eb-4b9f-8641-9ef5da184cdc/comparison.json>) retains exact per-case URLs, initial/draft FormData, expected/actual state, node identities and transport traces. Both raw runs remain **FAIL:12 failed/2 passed**, exit1; these are retained reproductions, not passing correctness gates.

Values below are ordered `q / format / genre / originalLanguage / releaseStatus / pageSize`. Applied URL suffix is exactly `?q=Synthetic&format=NOVEL&genre=fantasy&originalLanguage=zh-Hant&releaseStatus=ONGOING&pageSize=7`.

| Case | Initial URL/state and interaction | Expected committed URL/values | Settled baseline AND initial A2 actual | Classification |
| --- | --- | --- | --- | --- |
| EN applied | `/en/works` + applied suffix; `Synthetic / NOVEL / fantasy / zh-Hant / ONGOING /7`; focus actual Reset, Enter | `/en/works`; blank five filters, size20 | Bare correct URL/parsed defaults, but `blank / NOVEL / fantasy / blank / ONGOING /20` | Application: stale uncontrolled selects after committed client navigation |
| VI applied | `/vi/works` + same suffix/state/action | `/vi/works`; blank five filters, size20 | Same stale three selects as EN | Application: same reconciliation defect |
| EN unsent | Bare `/en/works`, default fields; edit `Unsent / NOVEL / fantasy / zh-Hant / ONGOING /20`; Reset Enter | Same bare URL; blank five filters, size20 | All five draft values retained after a confirmed new render and full15s clearing wait | Application: same effective query reuses dirty uncontrolled fields; old immediate fixture observation was insufficient but not the sole cause |
| VI unsent | Bare `/vi/works`, same default/edit/action sequence | Same bare URL; blank five filters, size20 | Same persistent five draft values as EN | Application, with the same corrected observation caveat |

Thus all four defects are **verified present at unchanged HEAD**, not caused by A2's helper relocation. The fixture also needed stronger readiness, but correcting only that observation did not clear the application values. Real WorksPage and the fixture both parse actual search parameters and render server PublicCatalog; the actual Shell has no query-dependent main/child key or form-reset effect. This is faithful isolated form-reconciliation evidence, not a database-backed/full-shell production run.

Six stronger normal/overflow Reset cases and two newly committed all-filter changes also failed identically in both arms. The latter commits `q=Committed`, formatMANGA, genre science-fiction, language ja, statusCOMPLETED, pageSize9/page2 while the visible draft stays stale; the **controlled hidden pageSize does update7→9**. Two page-only navigation probes pass with the same form/control nodes and draft preserved. PageSize-only preservation was not separately browser-probed in this pre-fix A/B; it must not be inferred from the combined change.

Owned RSC request scheduling, canceled `net::ERR_ABORTED` fetches and finish counts varied across arms; all raw traces remain. The first analysis-only comparator was too broad and failed on those transport differences; semantic comparison explicitly excludes only dynamic transport/timing fields, retaining them alongside the outcomes. No browser rerun or correctness assertion was changed to obtain equivalence, and no byte-identical/network-clean claim is made. A diagnostic preparation syntax error and quoted PowerShell Git tree-expression correction occurred before browser execution; no SUT was changed by them.

### Minimum application correction, not a mechanical A1 transplant

Only [PublicCatalog](<../apps/web/src/components/catalog/PublicCatalog.tsx>) application code changed during this extension:

1. A deterministic ordered JSON form key contains **route locale plus the five committed visible filter values**: search, format, genre, exact original-language tag and release status. It rebinds uncontrolled controls when those server values change. JSON escaping handles arbitrary search delimiters/quotes; missing/blank optional values retain their existing equivalent blank-control semantics, while explicit `UNKNOWN` and case-distinct language tags remain distinct.
2. **Both page and pageSize are excluded.** The former must preserve the existing draft during pagination; the latter already updates its controlled hidden input without remounting five visible fields. Results, taxonomy, invalid-query flag and raw query shape are not gratuitous identity inputs. Only the form is keyed, not the whole Catalog/page.
3. Reset is a native `<a>` to the **unchanged bare locale Catalog URL**, with unchanged class/copy/keyboard semantics. A query-derived key alone cannot clear dirty values when bare→bare commits the same effective filter key; the settled reproduction justifies a fresh document. No client-state framework, effect-based reset or new dependency was introduced.

The old layout/help relocation and CSS are preserved. No parser, validation, blank/default semantics, filtering, selected-genre fallback, disabled overflow/single hidden genre serialization, invalid-query notice, pageSize/pagination URL, public visibility, API, SQL, auth/privacy/security or help ID/ARIA association changed.

The [A2 helper](<../scripts/test-v6a-catalog-ui.mjs>) keeps all74 groups and original semantic/native assertions. It now records initial and draft URLs/DOM/FormData, registers actual navigation completion **before** Enter, requires the owned bare locale document GET200/load, then verifies hydration/query completion, actual values and fresh document token. It never writes/reset/remounts the fixture's controls. Both original configured deadlines15s/90s and retries0 remain unchanged. The native-navigation checks now guard the deliberately chosen implementation rather than being mistaken for the independent behavioral contract.

### Focused regression proof and static validation

The [discovery UI unit](<../tests/unit/catalog-discovery-ui.test.tsx>) adds46 deterministic EN/VI normal/overflow cases: all five committed-filter/locale identity changes, exact language case, missing filters, displayed overflow fallback plus successful hidden genre, `UNKNOWN` versus absence in both directions, page/pageSize-only node/draft preservation and controlled hidden updates, plus native Reset element structure. All existing initial A2 assertions remain. Before the fix the expanded80-case UI suite was **FAIL:38 failed/42 passed**, exactly the new binding/native expectations; [pre-fix JSON](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/unit-before-e63689eb-66f0-4572-a058-4d5df83fe036.json>) is retained.

[Corrected static receipt](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/static-after-df28e06c-1a2e-4b0e-a3c6-988a22c0c236.json>): **159/159 focused tests, six files PASS** (UI80, query41, contracts9, HTTP8, service9, projection12), `pnpm lint` **PASS**, `pnpm typecheck` **PASS**, `pnpm build` **PASS**, post-build `pnpm typecheck` **PASS**, completed2026-10-21T23:14:07Z. These remain scoped/unit/mock/static observations, not new SQL or hosted acceptance. An independent read-only delta review against the preserved A2 snapshots found no blocker: product delta is only form identity/native anchor, CSS unchanged, and helper delta is observation/navigation readiness with existing assertions and group counts retained.

### Final browser result and causal after-checks

The complete default `node scripts/test-v6a-catalog-ui.mjs` run genuinely achieved **74/74 PASS**, exit0, zero retries, after the final static checks. [Final default result](<../.local/v6a-a2-ui-743aeb8b-846a-4607-bffd-57e3b1bae452/evidence/result.json>) contains64 passing geometry groups, six other passing keyboard/native GET/exact-value/overflow groups and all four passing Reset groups; findings0 and tracked page/hydration/non-owned-network errors0. This was one final default execution, not a retried or selectively skipped run.

- All64 EN/VI × empty/populated × normal/overflow ×375/768/1280/1440px geometry cases still pass, with paired light/no-preference and dark/reduce states, **maximum same-row control-bottom spread0px** and no horizontal overflow. Full-width help, text/control containment, no overlaps, labels/ARIA, keyboard focus, native GET and overflow serialization assertions remain active.
- **EN applied, VI applied, EN unsent and VI unsent all clear every visible filter** and restore pageSize20 at the exact bare locale URL. Each records actual document GET200/load, completed hydration/default query, `native=true`, fresh document token and new form/control nodes. Initial/draft/after URLs, DOM and successful FormData are retained, not inferred from URL alone. [EN unsent exact before/after](<../.local/v6a-a2-ui-743aeb8b-846a-4607-bffd-57e3b1bae452/evidence/reset-unsent-en.json>) and [VI applied screenshot](<../.local/v6a-a2-ui-743aeb8b-846a-4607-bffd-57e3b1bae452/evidence/reset-applied-vi.png>) were inspected; the displayed result data remains explicitly synthetic.
- The additional fresh corrected-mirror [causal verification](<../.local/v6a-a2-reset-review-29003c77-e710-46f6-aecf-f913e8b97e52/experiment-49e8bbd0-c335-4aad-b6ae-0ab973699ed9/verification-summary.json>) achieved **16/16 PASS**, exit0: the same14 diagnostic correctness cases that previously failed12/14, plus two distinctly new EN/VI pageSize-only probes. The latter are not mislabeled as pre-fix shared cases.
- In both locales, a real client Next Link committing new filters changes the form and all six control nodes **within the same document**, yielding exact newly committed values. This demonstrates the query identity correction, independently of native Reset reloads. Page-only commits preserve the same form/all controls and drafts; pageSize-only commits also preserve them while the controlled hidden value updates7→9. Normal/overflow Reset and hidden/visible genre semantics pass.
- Default and corrected diagnostic servers ran sequentially. Owned browser contexts and exact spawned Next process trees exited; no unrelated process was stopped and no artifact was deleted. Preparation and the old failed comparisons/runs remain retained. Corrected transport traces may still contain owned RSC cancellations; no claim of byte-identical scheduling, complete application acceptance or exhaustive network reliability is made.

### Final inventory, limits and recommendation

The complete candidate inventory is still exactly five files: [PublicCatalog](<../apps/web/src/components/catalog/PublicCatalog.tsx>), [Catalog module CSS](<../apps/web/src/components/catalog/catalog.module.css>), [discovery UI units](<../tests/unit/catalog-discovery-ui.test.tsx>), [A2 browser helper](<../scripts/test-v6a-catalog-ui.mjs>) and this ledger. During this extension the CSS is unchanged; only the component, unit, helper and A2 evidence were extended. Original A1 receipts, initial A2 70/74 FAIL/deferred decision, original four failure artifacts, fresh baseline/candidate FAIL reproductions and pre-fix38 unit failures remain preserved.

Final2026-10-21T23:21:44Z checks: scoped Prettier, helper `node --check` and `git diff --check` **PASS**; four tested source hashes match; all eight pre-existing worktree HEAD/status/index states and the original A1 ledger prefix remain unchanged. The200-file preservation manifest and original failure artifacts were rechecked intact. No A2-owned Node process remains, index empty, no publication. No full historical-document formatting was performed.

```text
apps/web/src/components/catalog/PublicCatalog.tsx f6c4a8ac1366115134f0b88cfdd026d3d3c141c6ed8f74baad5e17cb38a3360b
apps/web/src/components/catalog/catalog.module.css 3e0dcd0a7ba883c6a7af4ea255bdf64e7d78d3ddc92b28cff5f2c03f1ce569f6
tests/unit/catalog-discovery-ui.test.tsx b64c18f32a7ea36cc5a3be4b8ebecb3a0932eb7b78c27e44080bf25f98c47d33
scripts/test-v6a-catalog-ui.mjs 530e1aa4548efdc8991b0cbf5087ae218f874a3e52661cfac5a9752b71748e06
```

**NOT RUN:** complete unit suite, database-writing integration/default or enabled native E2E, migrations/generation, new audits, candidate CI, actual database-backed publication/security/full-shell behavior, hosted operations, manual browser-UI 200% zoom, composed-contrast/screen-reader certification or full theme persistence. Baseline CI and prior A1 evidence are not acceptance of this uncommitted working tree. DB-free props and real-framework rendering isolate UI behavior, not actual public SQL projections, account lifecycle or hosted readiness. The old A1 hydration timeout remains unexplained; this unrelated Reset diagnosis does not explain or fix it.

**Recommendation: GO for the subsequent A2 full-verification stage, subject to separately approved scope/resources.** This is not commit, push, PR, merge, deployment or whole-V6A acceptance. Any database-writing gates still require separate explicit authorization and freshly owned, identity-verified disposable loopback resources. Main/A1/historical worktrees remain protected; preserve this existing uncommitted candidate and STOP pending maintainer approval. No A3/V6A-04, SMTP, providers, migration, global-style or infrastructure work is authorized.

## 11. A2 Vitest security patch attempt (2026-10-22 UTC)

### Authority, preflight and preservation

The maintainer authorized only an exact root Vitest4.1.12 pin through the normal pnpm resolver, compatible official internal packages, frozen installation, unchanged audits and conditional database-free compatibility checks. Full A2 verification, database writes/recovery/cleanup, web servers, publication and A3 remain unauthorized. The existing worktree/branch/HEAD were reused: `E:\TaleAtlas-v6a-catalog-filters`, `fix/v6a-catalog-filters`, `4791c0373588aef9a6895049d2def67fc045a1c1`; original five-file status/index empty and initial dependency/configuration cleanliness were verified. Node24.19.0 and pnpm11.7.0 were confirmed. All eight protected main/A1/historical worktree states matched their pinned receipts.

A fresh, owner-exclusive [patch preservation manifest](<../.local/v6a-a2-vitest-patch-5a4acea5-c152-40b5-a5d6-9d2c4e0fa57c/initial-state.json>) snapshots11 source/configuration files, including the complete five-file A2 candidate and original dependency manifests/lock. It rechecks all441 prior protected originals/copies and hashes28 newer evidence files plus all1890 retained PostgreSQL files. PostgreSQL data/credential contents were not copied or disclosed; file hashes were read only. The old cluster had no owned process/listener on57164 and was not restarted, recovered, stopped, deleted or reused. Its stale PID/data/evidence remain retained; the earlier host reboot did not establish a controlled-shutdown receipt.

### Historical audit blocker retained, not rewritten

The earlier broader verification [progress receipt](<../.local/v6a-a2-final-review-dd5e68e7-514e-41fd-afa4-fa102c656ffb/non-db-c405fc36-582c-4d8d-9beb-00a60aa8d4b2/progress.json>) records focused159/159, full units2112/2112 across72 files, lint/types/build/post-build types PASS at the old dependency graph. Its [full audit](<../.local/v6a-a2-final-review-dd5e68e7-514e-41fd-afa4-fa102c656ffb/non-db-c405fc36-582c-4d8d-9beb-00a60aa8d4b2/full-audit.log>) exited1: moderate2, high0, critical0, affecting mocker4.1.11 via root Vitest and Better Auth's optional Vitest peer. The production high-threshold audit exited0 but also reported moderate2 in metadata; it was not a zero-vulnerability receipt.

- [GHSA-qxg6-89mg-rqv8](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8), CVE-2026-112949: unauthenticated public mocker-plugin manual registration can inject developer-browser module source, CVSS4.7.
- [GHSA-xp26-3454-mjgp](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp), CVE-2026-112950: Windows backslash redirect traversal can bypass the public plugin file allowlist, CVSS5.9.

Both have a4.1.12 fix. Upstream disclosure was October16 and the patch release October15; reviewed global advisory publication was October21 after baseline CI completed12:35UTC. Exact historic npm feed ingestion timing is not established. These findings were not introduced by A2 dependency edits. Current project node/jsdom configurations do not register the affected public mocker WebSocket plugins; this static reachability distinction is not grounds to waive the mandatory audit gate or claim hosted/production safety. All original four Reset failures,38 pre-fix regression failures and A1's unexplained hydration timeout remain historical FAIL evidence.

### Exact command, unexpected result and stop

[Official registry metadata](<../.local/v6a-a2-vitest-patch-5a4acea5-c152-40b5-a5d6-9d2c4e0fa57c/registry-metadata.json>) was freshly fetched for Vitest and all seven coupled internal packages at4.1.12, with eight available SHA512 integrity records. The exact authorized command ran once from a credential/proxy/preload-clean parent and public registry, without installing a different package manager:

```text
pnpm --workspace-root add --save-dev --save-exact vitest@4.1.12
```

[Resolver result](<../.local/v6a-a2-vitest-patch-5a4acea5-c152-40b5-a5d6-9d2c4e0fa57c/resolver-result.json>) / [unaltered output](<../.local/v6a-a2-vitest-patch-5a4acea5-c152-40b5-a5d6-9d2c4e0fa57c/resolver.log>): exit0, eight packages added, but **the manifest and root lock importer declare `^4.1.12`, not the required exact `4.1.12`**. Exit0 is not acceptance. The update notice and pre-existing deprecation warnings were retained; no package-manager upgrade or broad update was performed.

Read-only inspection of installed pnpm11.7.0 explains this result: `getPinnedVersion` selects a patch default for `saveExact`, but `calcRange` first chooses the previous declaration's operator before the requested/default pinning. Thus the prior caret is preserved. No supported safe one-command bypass was established in this scope. The same command was not repeated; no dependency/integrity was edited manually, removed/re-added, overridden or forced to manufacture a pass.

An independent complete lock review found only the intended Vitest-related metadata changes:669 package records,669 snapshots and four importers retain their counts; settings and existing overrides are unchanged. All eight new SRIs/engine/peer maps match the registry metadata. Vitest and `@vitest/{expect,mocker,pretty-format,runner,snapshot,spy,utils}` lock resolutions are4.1.12. Better Auth1.7.7's optional peer lock context is4.1.12;1296 external graph edges have no missing target or old mocker edge. The residual `^4.1.11` text belongs only to the official optional browser-webdriverio peer range, not a mocker package/snapshot. No unrelated package version/metadata churn, new override, workspace/configuration modification, or Vite8.3.3/Next16.4.0/Playwright1.63.0/TypeScript5.9.3 upgrade was found.

The separate [installed metadata diagnostic](<../.local/v6a-a2-vitest-patch-5a4acea5-c152-40b5-a5d6-9d2c4e0fa57c/installed-diagnostic.json>) establishes a second limitation: root Vitest and all seven internals are installed at4.1.12, **but Better Auth's current physical optional-peer installation still resolves Vitest/mocker4.1.11**. The first read-only metadata verifier exited1 on that exact assertion; its source remains unchanged. A new diagnostic reports the actual paths/versions as FAIL/STOP, not a weakened passing check. Lockfile resolution is therefore not equivalent to a refreshed installed graph. Frozen installation might relink it, but this is unexecuted and not claimed as a fix.

### Actual gates and decision

| Check | This authorized patch attempt |
| --- | --- |
| Exact normal resolver command | Exit0; exact-pin acceptance **FAIL** (`^4.1.12`) |
| Lock graph/official metadata review | Intended eight4.1.12 records and peer-context changes only; no unrelated churn |
| Installed graph metadata assertion | **FAIL**, exit1: Better Auth's installed optional peer still4.1.11 |
| `pnpm install --frozen-lockfile` | **NOT RUN**: exact-pin/installed-graph stop held |
| `pnpm audit --prod --audit-level high` | **NOT RUN** after update; no new severity counts or clearance claimed |
| `pnpm audit --audit-level moderate` | **NOT RUN** after update; original moderate2 FAIL retained |
| Focused/full units, lint, types, build/post-build types, scoped formatter | **NOT RUN** after update; conditional gates not reached |
| A2 browser helper execution | **NOT RUN**: unchanged helper requires starting a local web server, prohibited in this authorization |
| Integration, migrations, no-drift generation, native/default/V4 E2E, new CI | **NOT RUN / NOT AUTHORIZED** |

This attempt changes only the two dependency files plus A2 evidence. The complete candidate inventory is seven paths: [PublicCatalog](<../apps/web/src/components/catalog/PublicCatalog.tsx>), [Catalog CSS](<../apps/web/src/components/catalog/catalog.module.css>), [Catalog units](<../tests/unit/catalog-discovery-ui.test.tsx>), [unchanged A2 helper](<../scripts/test-v6a-catalog-ui.mjs>), this ledger, [root manifest](<../package.json>) and [lockfile](<../pnpm-lock.yaml>). All four application/test/helper hashes in section10 remain unchanged. The current partial resolver result is preserved, not rolled back. The first evidence-only handoff whitespace check flagged one newly added empty EOF line; only that line was removed, with the failed command retained in the session receipt. This was not a compatibility-test retry or historical-document reformat. No assertions, deadlines, retries, audit thresholds or historical receipts were changed; no services or databases were started.

**NO-GO for resuming full A2 verification.** Exact root pinning, consistent installed peer linkage, frozen-install reproducibility, both security audits and database-free compatibility remain unverified. Request separate maintainer approval for an explicit one-line exact-manifest correction followed by normal lock regeneration (no manual integrity changes), or an independently reviewed supported resolver remedy. Do not automatically upgrade pnpm, remove/re-add dependencies, add overrides or restart the validation pipeline. Publication, database-writing tests, old-cluster recovery/cleanup and A3 still require separate explicit authorization. STOP after the report.

## 12. A2 exact Vitest pin and dependency verification (2026-10-22 UTC)

### Explicit correction authority and frozen synchronization

The maintainer separately authorized exactly the correction deferred in section11: root `vitest` declaration `^4.1.12` to **`4.1.12`**, normal lock reconciliation, frozen installation, unchanged audits and conditional database-free compatibility. No additional `pnpm add`, force/recovery/removal, package-manager upgrade, custom override, unrelated dependency declaration, test configuration or Catalog implementation change was made. Section11's failed acceptance and stale installed-peer findings remain intact historical receipts; this section records new observations rather than rewriting them.

Preflight verified `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`, the expected seven changed/new paths and empty index, Node24.19.0, pnpm11.7.0 and unchanged source/configuration. The fresh owner-exclusive [continuation preservation manifest](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/initial-state.json>) snapshots11 current source/configuration files and fingerprints22 prior-patch artifacts, all1890 retained PostgreSQL files and eight historical worktree states before modification.

The sole manual dependency edit was the newly authorized manifest literal. Commands ran from an OS-key-only, credential/proxy/preload-clean environment with private empty user/global npm configuration and the public registry:

```text
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

Both [installation commands](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/install-results.json>) exited **0**. Normal [frozen installation](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/frozen-install.log>) covered all four workspace projects, skipped resolution against the up-to-date lock, and synchronized the optional-peer installation without force or manual store edits. Its normal `+1 -9` package-link/pruning output is retained; no node_modules/store directory was manually deleted. Existing deprecation warnings remain in the lock-only log, not suppressed or treated as audit vulnerabilities.

### Actual lock and installed graph, not lockfile-only inference

The [complete lock comparison](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/lock-graph.json>) proves that relative to this continuation's snapshot, **only the root importer specifier changed**; all other parsed settings, overrides, four importers,669 package records and669 snapshots are identical. No integrity was edited manually. Relative to HEAD, the complete dependency diff remains the exact root pin plus the official eight-package4.1.11→4.1.12 security patch and Better Auth peer-context updates recorded in section11. Vite8.3.3, Next16.4.0, Playwright1.63.0 and TypeScript5.9.3 remain unchanged.

The [actual installed graph](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/installed-graph.json>) resolves physical manifests, not just declared ranges:

- Root Vitest and all seven `@vitest/{expect,mocker,pretty-format,runner,snapshot,spy,utils}` packages are exactly **4.1.12**.
- Better Auth1.7.7's physical optional Vitest peer and its mocker now both resolve **4.1.12**, replacing the prior observed4.1.11 linkage.
- Traversal from all four workspace roots covers **511 reachable installed manifests /1331 declared dependency, optional and peer edges**, with zero missing required dependencies and zero reachable old mocker paths. Unreferenced store directories are not arbitrary-import/runtime certification and were not manually removed.
- An independent read-only reviewer repeated the installed traversal and complete YAML comparison, confirmed the same versions/counts and found no blocking defect, unrelated churn or scope violation.

One private metadata-verifier attempt failed after the successful frozen install: `resolve.paths('punycode')` returns null for Node's builtin name, falsely reporting the npm package missing for tr46/uri-js. The [original stderr](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/installed-verify.stderr.log>), original verifier and exit1 in the installation receipt remain retained. A separately saved verifier queries `resolve.paths(name + '/package.json')`, preserving every assertion and checking the actual npm package paths. No installation was repeated and no dependency/test was changed to hide a failure. The corrected metadata check and independent review both pass; this was a verification-tool lookup error, not an application-test failure or a remaining version mismatch.

### Fresh security and database-free compatibility gates

JSON switches below change reporting only; thresholds, selection, exclusions and mandatory gate behavior are unchanged. Both [audit receipts](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/audit-results.json>) exited **0** after the graph verification:

| Command | Exit | Info | Low | Moderate | High | Critical | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pnpm audit --prod --audit-level high --json` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pnpm audit --audit-level moderate --json` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Raw [production audit](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/prod-audit.json>) and [full audit](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/full-audit.json>) explicitly show empty advisories and zero in all five metadata severity buckets (319 and669 reported total dependencies respectively). Thus neither original GHSA/CVE is currently reported on this synchronized graph. This is observed registry-audit evidence, not a timeless security guarantee or deletion of the earlier moderate2 FAIL receipt.

Only after both audits passed, the [new compatibility run](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/compatibility-results.json>) executed against Vitest4.1.12. Each row below exited0, with no test retries, skipped cases, altered assertions or deadline changes:

| Gate | Actual new result |
| --- | --- |
| Focused six-file Catalog unit selection | **159/159 PASS**, six files; failed0/skipped0/todo0 |
| `pnpm test` complete unit selection | **2112/2112 PASS**,72 files; failed0/skipped0/todo0 |
| `pnpm lint` | **PASS** |
| `pnpm typecheck` | **PASS** |
| `pnpm build` | **PASS** |
| Post-build `pnpm typecheck` | **PASS** |
| Scoped Prettier check | **PASS** |
| `node --check scripts/test-v6a-catalog-ui.mjs` | **PASS**, syntax only |
| `git diff --check` | **PASS** |

The precise focused command and formatting scope were:

```text
pnpm test tests/unit/catalog-discovery-ui.test.tsx tests/unit/catalog-discovery-query.test.ts tests/unit/catalog-contracts.test.ts tests/unit/catalog-http.test.ts tests/unit/catalog-service.test.ts tests/unit/catalog-projection.test.ts --reporter=default --reporter=json --outputFile=<owned>/focused-new.json
pnpm test --reporter=default --reporter=json --outputFile=<owned>/units-new.json
pnpm exec prettier --check package.json apps/web/src/components/catalog/PublicCatalog.tsx apps/web/src/components/catalog/catalog.module.css tests/unit/catalog-discovery-ui.test.tsx scripts/test-v6a-catalog-ui.mjs
```

`<owned>` is the absolute continuation preservation directory linked above, not a shared/historical report location. [Focused raw output](<../.local/v6a-a2-vitest-exact-c57600b1-09b7-4729-8ac4-09865316c51a/focused.log>) identifies `RUN v4.1.12`; counts are new observations, not carried forward from section11. Unit configuration retains its full unit-only include and original workers; no database URL, authentication credentials, provider configuration or web-server test process was supplied. The compatibility pipeline completed2026-10-22T09:10:23Z.

### Preservation, limits and recommendation

The complete source inventory remains the seven paths in section11: the four unchanged A2 application/test/helper files, this A2 ledger, root manifest and lockfile. Application/helper fingerprints from section10 remain byte-identical. Only the authorized exact pin, normal lock metadata and A2 evidence changed in this continuation. All older A1/A2 ledger bodies, original advisories, failed exact-pin/optional-peer attempts, original Reset failures,38 pre-fix regressions and A1's unexplained hydration timeout remain preserved; this tooling patch does not explain that timeout.

All1890 retained PostgreSQL files remain byte-identical to their preflight hashes. No old cluster was restarted, recovered, stopped, cleaned or reused, no stale PID was removed, no new cluster/database was created, and no unrelated service/worktree was modified. The prior host reboot still does not certify a graceful shutdown. Normal dependency synchronization was confined to this worktree; no destructive recovery or shared-store deletion was performed.

**NOT RUN / not authorized in this scope:** SQL integration, fresh/repeated migrations, generation/no-drift, production-native/default or V4-enabled E2E, the74-group A2 browser execution (requires a local web server), new candidate CI, browser-UI 200% zoom, screen-reader/manual/hosted acceptance, SMTP/provider activation, publication or deployment. The unchanged helper received syntax validation only; previous74/74,64 geometry and16 diagnostic browser results remain earlier source-bound receipts, not new post-patch browser executions. Local Windows checks do not claim Linux or PostgreSQL17 parity.

**GO for resuming full A2 verification, only after separate maintainer approval.** The Vitest pin, installed-peer synchronization, frozen reproducibility, security-audit and database-free compatibility blockers are cleared by the new evidence. This is not full A2 acceptance or authorization to write databases, recover/clean the old cluster, stage, commit, push, publish a PR, merge, deploy or start A3. STOP after the report.

## 13. A2 Library integration failure and recovery (2026-10-22 UTC)

### Recovery authority, identity and preserved original run

The maintainer reported that model quota exhaustion/HTTP429 interrupted the prior verification turn; the task was not completed. This recovery authorizes inspection, preservation, read-only source analysis and only ownership-verified cleanup if a current owned process remains. It does not authorize another test run, source/test/dependency changes, migration generation, a new database or recovery of either retained cluster.

Recovery verified `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`, exactly six tracked modifications plus the untracked A2 helper and an empty index. All11 source/configuration hashes matched the [original full-verification snapshot](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/initial-state.json>) before this evidence-only update; all eight historical worktree HEAD/branch/status/index states matched. The seven-file candidate and16 original run artifacts were copied into a fresh owner-private [recovery preservation directory](<../.local/v6a-a2-sql-recovery-39cc3023-5bc4-4e42-a1f3-7e8256851b74/recovery-preservation.json>), with original hashes/last-write times retained. No credential file was copied or disclosed.

### Original SQL execution: observed FAIL, incomplete capture

The original driver launched this command **once**, after fresh/repeated integration migrations passed:

```text
pnpm test:integration --reporter=default --reporter=json --outputFile=E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e\owned-postgres\integration-results.private.json
```

The unchanged integration configuration selected the complete suite, not a narrowed diagnostic. Its [original raw log](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/owned-postgres/integration-full.log>) identifies Vitest4.1.12 and UUID fixture run `1003d3f3-1d62-452a-9b89-6b82b18df45d`. The62-line surviving log establishes:

| Recorded file / case | Actual partial observation |
| --- | --- |
| [Library integration](<../tests/integration/library.test.ts>) |36 tests reported,35 passed / **1 failed**; file duration65549ms |
| [Pinned tiny RI cache case:1806–1918](<../tests/integration/library.test.ts#L1806-L1918>) | **FAIL**, reported12834ms: `replans a pinned tiny RI cache at20000 entries without erasing another owner or leaking settings` |
| Metadata concurrency |11 tests reported passed afterward, including all six V5D schedules |
| Full-suite final totals and exit code | **UNKNOWN / NOT CAPTURED**, not332/332 and not an established exit1 |

Thus47 tests have explicit completed file reports (46 passing/one failing), **not** a completed full-suite total. Generic later `community.service` and `database.health` error messages are not named failing-test reports and cannot be counted as additional test failures. The earlier generic `library.service` message is not a captured assertion or stack for the failed case and must not be substituted for it.

The JSON report, full-suite exit receipt and final integration summary do not exist; the original driver only writes its exit receipt after observing child exit. Job `pwsh-62` is unknown to the resumed harness, and no original integration/Vitest process remains. **Exact failed assertion, expected-versus-observed difference, SQLSTATE, stack trace and first failing operation are unavailable from the retained output.** The named test may have failed in preparation, SQL, an assertion or its `finally`;35 other passing Library cases contradict a file-wide setup failure but do not locate this error. Reproducibility is **UNKNOWN**. No suite or case was rerun.

The raw log's last write is2026-10-22T09:41:54.6876682Z, before the PostgreSQL worker termination recorded09:43:05Z. The Library failure was already printed and metadata tests passed afterward. Later termination can explain incomplete final reporting; it does **not** establish why the earlier Library case failed. The quota interruption and database termination must not be conflated into a proven SQL root cause.

### Current run resource state: inactive, no graceful cleanup claim

The current run is distinct from the protected older cluster. Its [original identity receipt](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/owned-postgres/identity.json>) and [parent independent target proof](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/parent-sql-targets.json>) establish the originally approved resource:

- PostgreSQL18.4, exact cached executable SHA256 still matching the original receipt.
- Physical identifier **7699422608590984208**, independently reread from its retained control file during recovery.
- Data directory `E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e\owned-postgres\data`.
- Recorded PID2472, birth2026-10-22T09:32:15.8783250Z / ticks639282583358783250, loopback127.0.0.1:65422, UUID owner marker and fresh synthetic role. Three separately named integration/default/enabled databases were verified empty/UTF8/owned before original writes.
- Original OS owner `CASTORICE\Admin` and exclusive owner-SID permissions were verified; recovery confirms the private root remains owner-controlled. No private database password, cookie or auth token is included in this ledger.

[Recovery facts](<../.local/v6a-a2-sql-recovery-39cc3023-5bc4-4e42-a1f3-7e8256851b74/recovery-facts.json>) show PID2472 absent, no process matching this run-owned directory and no65422 listener. The [PostgreSQL log](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/owned-postgres/postgres.log>) records IO worker16528 exception `0xC000013A` at09:43:05.624Z, termination/reinitialization, startup process10184 with the same exception at09:43:08.691Z, then shutdown due to startup-process failure. The retained control state is **4, not clean-shutdown state1**. A subsequent host boot is recorded12:04:58.5000000Z. The initiating cause/signal is unproven.

No agent-issued `pg_ctl stop` or completed PostgreSQL cleanup receipt is evidenced. **Do not claim verified graceful shutdown.** There is now no active owned target to stop safely, and no cleanup command remains running or queued. Recovery issued no stop/kill/start/recovery command, opened no SQL connection and deleted no file. Neither the stale PID nor retained data was altered. Current unrelated services listen on5432/PID6888 and3000/PID6908; their initial PIDs6588/6700 are gone following the wider runtime/host change. No agent terminated them, but runtime identity cannot be claimed unchanged across that interruption.

The separate older `dd5e.../owned-postgres` resource (historical physical ID7699270853787556536, old port57164) was not reused, recovered or confused with this run. All **1890 protected historical PostgreSQL file hashes still match**. Both retained clusters remain read-only evidence requiring new explicit authority for any recovery/removal.

### Read-only Library diagnosis: facts versus hypotheses

Read-only Git comparisons found **no difference** in Library server source, database schema/migrations, this integration case, auth/test-database fixtures, readiness/auth code or integration configuration between the working tree and HEAD, or between merged A1 `09b655a430bd3c4886b3950ed32584f72cfbc556` and HEAD. Current A2 edits do not directly change these paths. This locates the failure in an unchanged contract test during A2 verification; it does not prove a pre-existing defect, A2 regression, Vitest regression or environment-only cause.

The case checks a pinned backend's5s statement budget and auto plan mode, six tiny-owner warmups,20000 entries, direct SQL cascade, other-owner digests, settings/PID, prepared witness/definitions, rollback restoration and authenticated progress. [Assertions:1846–1903](<../tests/integration/library.test.ts#L1846-L1903>) describe the intended behavior, **not the actual missing assertion result**. The [finally:1904–1916](<../tests/integration/library.test.ts#L1904-L1916>) performs unguarded rollback/query/deallocation before release and can mask a primary error if cleanup itself throws; no such cleanup failure is established.

| Unproven hypothesis | Supporting evidence / counterevidence and uncertainty | Smallest distinguishing future diagnostic; authority |
| --- | --- | --- |
| SQL timeout, locking or RI-plan/performance sensitivity |20k cascade and5s budget, backend warmups and prior V3 history make this plausible. Scoped erasure/index and batch-replan migrations exist; ordinary20k deletion passed earlier.12834ms is total case time, not evidence of a particular5s query or30s test timeout. No SQLSTATE was captured. | Capture the original client error/SQLSTATE, stage durations and same backend PID/settings. **New disposable DB and explicit test authority required**; do not raise limits or weaken guards. |
| Fixture/order/backend-cache history | The case reuses this UUID run's DRAFT works and seeds500-row batches on a warmed backend. Conversely, fresh owner/sequential execution, ownership predicates, uniqueness and before-count checks constrain simple leakage/count errors. No failed batch is known. | First run original case once in a fresh fixture with durable output; only if necessary separately authorize the complete Library file to test prior-case history. A single pass would not explain this full-run FAIL. |
| Genuine privacy, rollback, settings or prepared-plan assertion failure | These contracts are explicitly asserted, so a mismatch could be serious. No differing row/count/digest/GUC or witness value was captured, and unchanged source provides no demonstrated new violation. | Preserve the first actual/expected difference using counts/settings names rather than private values; fresh DB and explicit diagnostic authority required. |
| Setup/auth/service error or cleanup masking | Account creation, service calls and cleanup awaits can throw; finally may overwrite a primary exception. No captured error identifies any of these stages, and the pinned erasure itself is direct SQL rather than the complete Better Auth deletion workflow. | Only under approved diagnostic instrumentation, capture primary and cleanup errors separately, sanitized status/cause, and backend release. No permanent fix is justified now. |
| Vitest Result-array comparison change | Raw Result-versus-array assertions exist. Against this theory, the installed4.1.11 and4.1.12 `@vitest/expect` matcher implementation hashes are **identical** (`b177ca97952f1d65d3d2691edbc31ab1af56ac36b3cf08d7f56ad0ca69f07a45`); postgres.js Result metadata is nonenumerable. Other framework effects are not exhaustively excluded. | Only if the captured failure points here, authorize a pure in-memory comparison/prototype diagnostic; no DB is needed for that narrow experiment. Do not downgrade the secured working tree. |
| Interruption/report loss | Missing footer/JSON/exit receipt and later abnormal PG termination support incomplete capture. The earlier named FAIL and subsequent metadata passes contradict treating the later interruption alone as the case's cause. | Durable reporter output plus independent child-exit and resource-event receipts on any separately authorized future run. No new run is authorized by this recovery. |

The erasure guard is [migration0009](<../packages/database/drizzle/0009_library_erasure_scope.sql>), with full scoped event index, invoker semantics and `DISCARD PLANS`; [migration0013](<../packages/database/drizzle/0013_library_event_batch_replan.sql>) additionally invalidates plans after multirow event insertion. No migration or timeout was changed. Missing PostgreSQL ERROR lines do not exclude a client SQL error or unknown session logging settings. No logging suppression is proved in the original startup/disk configuration. No cause is labeled harmless or established merely because the same contract passed elsewhere.

### Verified earlier gates versus halted gates

| Gate | Grounded status for this original run / matching final source |
| --- | --- |
| Exact Vitest4.1.12 pin, synchronized peer, frozen install, focused159/full2112, lint/types/build/post-build/format/syntax | Section12 source/dependency-bound **PASS retained**, not rerun during recovery |
| Fresh production/full audits | Original full-verification run reports exit0 and zero in every severity; no audit rerun during recovery |
| Fresh and repeated integration migrations | Both `pnpm db:migrate` receipts exit0;15 journal records and identical recorded repeat state |
| SQL integration | **FAIL observed / incomplete overall run**; Library35 pass/one fail, metadata11 pass; final totals/exit unknown |
| Migration generation / generation no-drift gate | **NOT RUN**, halted by required failure. Independent read-only inventory confirms all31 migration SQL/meta files still byte-identical; this is preservation, not generation acceptance. |
| E2E database migrations, production-native default, enabled V4 E2E | **NOT RUN**, dependent sequence halted; no native TLS/mail fixture started |
| New A2 browser helper | **74/74 PASS**,64 geometry (max bottom spread0px, overflow0), four Reset cases, retry0; final-source evidence before interruption |
| Additional real RSC causal probes | **16/16 PASS**, committed-filter rebind and page/pageSize draft preservation, retry0; two owned EN RSC cancellations retained, not a zero-all-network-failures claim |
| Browser resource cleanup | Saved independent PID/birth/port checks passed before interruption; existing Windows helper used exact forced tree termination, **not graceful** |
| New candidate CI, actual browser-UI 200% zoom, AT/manual/hosted acceptance | **NOT RUN / not claimed** |

Browser [full report](<../.local/v6a-a2-full-final-d1487886-3232-4b93-8712-531eb0a50f1e/BROWSER-REPORT.md>) and the existing raw receipts remain preserved. No earlier successful gate hides this required Library FAIL. Original Reset failures,38 pre-fix regressions, the moderate audit failure, caret-pin acceptance failure, stale installed optional peer and A1's unexplained hydration timeout retain their historical meaning.

**NO-GO for A2 commit, Draft PR publication or further full validation.** No Library fix is justified without actual failure details. Request separate approval for **one original single-case diagnostic on a NEW independently owned disposable database**, with unchanged migrations/assertions/5s SQL budget/deadlines/zero retries, durable verbose+JSON output and independent exit capture. Additional stage/cleanup instrumentation or a code correction would need separately scoped approval. Do not reuse or recover either retained cluster, automatically rerun the failed suite, alter dependencies, stage/commit/push/publish/merge/deploy or begin A3. STOP after the recovery report.

## 14. A2 isolated Library SQL diagnostic (2026-10-22 UTC)

### Separate single-case authority and unchanged candidate

The maintainer separately authorized **one execution of the existing failed case**, its required existing hooks and normal forward migrations, on one NEW independently verified disposable loopback cluster. This was not authority for a Library fix, instrumentation, assertion/fixture/timeout changes, a full-file/full-integration rerun, generation, E2E, dependencies or publication.

Preflight verified the existing A2 worktree/branch/HEAD4791c0373588aef9a6895049d2def67fc045a1c1, six tracked modifications plus the untracked helper, empty index and source fingerprints matching section13. The new [owner-private preservation manifest](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/initial-state.json>) snapshots11 source/configuration files, fingerprints all1890 older protected PG files and2300 files in the interrupted run's retained PG resource,31 recovery artifacts and eight historical worktree states. The [historical artifact guard](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/historical-artifacts-preflight.json>) also confirms the56/22/28 earlier security/failure artifacts,441 frozen copies and two historical generated-file pins unchanged.

[Read-only dependency verification](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/installed-graph.json>) again confirms exact Vitest4.1.12, all seven coupled internals and the physical Better Auth peer patched,669 lock packages/snapshots,511 reachable manifests/1331 edges, zero reachable old mocker paths and zero missing required dependencies. No installation, lock regeneration, audit or unrelated compatibility rerun occurred. Root/app active environment files and earlier test processes were absent; child environments used an OS-only allowlist plus this fresh test DSN, not operator/hosted credentials.

### Fresh database identity and migration/selection checkpoints

The [fresh resource identity](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/identity.json>) and independent parent OS/SQL proofs establish:

- PostgreSQL18.4, cached native executable SHA256 `becadfa646f4576467452ec94c513b1414e8bfeedc36f63e94d37c55219206ff`; official PostgreSQL controls, no embedded lifecycle or performance parameter changes.
- Physical/SQL system identifier **7699523223002988036**, distinct from both retained historical clusters.
- Sole listener **127.0.0.1:62364**, PID7464, exact birth2026-10-22T16:02:35.4733563Z / ticks639282817554733563, OS account `CASTORICE\Admin`, owner-SID-only data/root ACLs and UUID owner marker.
- Data directory `E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5\owned-postgres\data`.
- One new synthetic role and sole target `a2_library_92879e4a370945c59c36282cbad7856c_test`; UTF8/C, public-only/empty user relations and exact default catalog plus this DB were independently checked before migration. Credentials remain private and are not printed here.

The sole `pnpm db:migrate` invocation [exited0](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/migrate.exit.receipt.json>);15 journal rows/41 non-system tables were recorded. No migration generation, repeat migration, schema/index/trigger or SQL-budget change was made.

Installed4.1.12 [CLI help](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/vitest-help.stdout.log>) verified verbose/JSON reporters, outputFile, name regex and default retry0; list help verified JSON collection. Static inspection found one exact test literal. One [collection invocation](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/selector.json>) exited0 and [collected exactly one full name/file](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/collection.json>), with identical zero public-table counts before/after: collection did not run fixture hooks or write their data. Parent approval and an exclusive-create execution marker preceded the single actual test launch.

### Exact single execution and durable result

```text
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/library.test.ts -t "replans a pinned tiny RI cache at20000 entries without erasing another owner or leaking settings" --reporter=verbose --reporter=json --outputFile="E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5\owned-postgres\test-results.json"
```

[Independent actual child exit](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/exit.receipt.json>): pnpm child11592, parent Node10768, start **16:11:33.307Z**, end **16:11:53.976Z**, **exit0 / signal null**. This is the test command's exit, not the outer operational driver's or a logging pipeline's success. Separate complete stdout/stderr files were synced and the exit receipt saved before result parsing.

| Actual observation | Result |
| --- | --- |
| [Original selected case](<../tests/integration/library.test.ts#L1806-L1918>) | **1 executed /1 PASS /0 FAIL**, **8460.4522ms**, no retry |
| Other cases in this file |35 deliberately deselected by the approved name filter; their bodies were not executed |
| [Machine JSON](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/test-results.json>) | success true, one file passed, zero failed tests/suites; nested suite counts do not imply another file execution |
| [Verbose stdout](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/test.stdout.log>) |1 test passed/35 skipped, total19.06s, reported tests15.96s; exact fixture UUID retained |
| [Complete stderr](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/test.stderr.log>) | Empty,0 bytes |
| Actual first exception/assertion/stack/SQLSTATE | **None reported in this successful run**; failureMessages empty and file message empty |
| Existing setup/teardown hooks | Completed with no reported hook/global failure; individual hook timings were not exposed. No hook instrumentation was added. |

[Parent independent JSON/exit analysis](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/parent-result-analysis.json>) confirms the same counts and duration. No primary or cleanup exception was reported; there is no evidence of masking in this isolated execution. That does not recover the missing exception from the historical full run. The PostgreSQL log has no ERROR in the actual test interval, but retains one client-close LOG near child exit; this is not a zero-all-server-messages claim.

[Preparation notes](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/preparation-notes.json>) and child failed-preparation copies retain operational metadata issues: harness command-text self-match, exact-versus-truncated OS birth timestamp APIs, slash normalization, a READ ONLY PG18 locale lookup (`42704`,16:03:57Z) and a READ ONLY dynamic table identifier (`42P01`,16:08:45Z). Only new ignored preparation helpers were corrected. Both SQL errors precede the actual test; **neither is its exception or SQLSTATE**. No test source, assertion, fixture, deadline or configured five-second statement budget was changed, and the actual test was never repeated.

### Evidence-supported comparison, not a fix claim

The original section13 full-run Library **35 PASS/1 FAIL** remains historical FAIL, with unknown assertion/SQLSTATE/final full-suite count/exit. Its named case reported12834ms; this isolated case passed8460.4522ms. Neither duration identifies the original failing SQL operation. This successful run on the same source, PG18.4 and Vitest4.1.12 does not support declaring a deterministic fresh-case defect or security-patch regression; it also does not exclude order/state/performance/lifecycle effects.

Read-only source supplies plausible differences: the file creates a new owner before each case but only cleans accumulated fixture users/data in afterAll; the selected case may reuse earlier run-owned DRAFT works, reserves an existing pool backend, warms its RI path and fingerprints other fixture owners. An isolated fresh run lacks that preceding file history. These are **hypotheses, not a proven cause**. The case's original assertions passed here; no private-data leak, SQL timeout, application defect, Vitest regression or harmless-environment classification is established. The earlier runner interruption may explain report loss but still does not explain a Library failure printed before that later termination.

### Verified graceful shutdown of this new resource only

After the test exited and both its known command/parent processes were absent, parent and executor independently reverified exact OS birth/executable/owner marker/ACL/listener and read-only SQL plus physical identifier. The sole authorized shutdown was pinned `pg_ctl.exe -D <new owned data> stop -m fast -w -t 60`.

The [official cleanup receipt](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/cleanup.exit.receipt.json>) records actual child1812 **exit0 / signal null**,16:15:11.537Z–16:15:11.938Z; stdout says server stopped and stderr is empty. The [server log](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/owned-postgres/postgres.log>) records fast-shutdown request, shutdown checkpoint and system shut down at16:15:11.855Z. [Parent independent post-stop proof](<../.local/v6a-a2-library-single-8a91f7cf-fd43-4716-a28e-3febbdfda2a5/parent-cleanup.json>) confirms same physical ID, **clean state1**, PID7464 absent,62364 closed and new server PID file absent. This run therefore has actual graceful PostgreSQL shutdown evidence, unlike the older interrupted resources.

All new data/logs remain retained; no force-kill or deletion occurred. Unrelated5432/PID6888 and3000/PID6908 retained their recorded birth identities/listeners. No native web/mail fixture started. The test's ephemeral SMTP hook had no reported teardown failure and its worker exited; its individual SMTP port was not separately instrumented. A private stopped-resource manifest preserves1663 files/192052826 bytes (self excluded). Neither historical cluster, stale PID, ACL nor data directory was altered/reused/recovered.

**Diagnostic PASS; NO-GO for resuming full A2 verification or publication without further approval.** The original failure remains unexplained, not fixed. The smallest next history-sensitive proposal is one separately authorized execution of the **original Library file only**, on another fresh independently owned DB with unchanged assertions/limits/zero retries and durable verbose/JSON/exit capture; it is not authorization to run that file now or rerun the full integration suite. If existing reporting still cannot expose the first error, request narrowly scoped instrumentation separately. No additional test, code fix, migration generation, E2E, dependency change, staging/commit/push/PR/merge/deployment or A3 follows this receipt. STOP after the single-case report.

## 15. A2 complete Library file diagnostic (2026-10-23 UTC)

### Separate complete-file authority and preservation

The maintainer separately authorized **ONE complete execution of the original Library integration file**, with no name filter, on one NEW independently verified disposable PostgreSQL cluster. This was diagnostic authority only: no full integration suite, source/test/fixture/instrumentation change, dependency update, generation, E2E or publication.

Preflight verified `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`, the same six tracked modifications and untracked helper, empty index and exact source fingerprints from section14. The fresh [private preservation manifest](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/initial-state.json>) snapshots11 source/configuration files and captures all1890 older PG files,2300 interrupted-resource files,1700 files across the previous isolated-diagnostic root,31 recovery artifacts and eight historical worktree states. The previous isolated resource's1663-file stopped-data manifest still matches. Earlier security/FAIL archives and historical generated-file pins also match. No original test process or historical owned listener was active. Root/app active environment files were absent.

[Fresh installed-graph verification](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/installed-graph.json>) confirms Vitest **4.1.12**, its seven coupled internals and physical Better Auth peer,511 reachable manifests/1331 edges, zero old mocker paths/missing required dependencies and unchanged669 package/snapshot lock records. No install or lock regeneration occurred. Installed CLI4.1.12/Node24.19.0 help again verified verbose/JSON/outputFile/list syntax and default retry0. All existing candidate contents, including earlier ledger receipts, are preserved; this task appends this A2 section only.

### Fresh resource and normal migration/collection checkpoints

[Resource identity](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/identity.json>) and independent parent OS/SQL checks establish:

| Item | Actual new resource |
| --- | --- |
| PostgreSQL / executable |18.4; pinned native SHA256 `becadfa646f4576467452ec94c513b1414e8bfeedc36f63e94d37c55219206ff` |
| Physical/SQL cluster identifier | **7699650745057486304**, distinct from all three retained predecessors |
| Listener / postmaster | **127.0.0.1:61910 only**, PID12276, parent1456 |
| Exact process birth |2026-10-23T00:17:26.5161809Z / ticks639283114465161809 |
| OS ownership |`CASTORICE\Admin`, exclusive owner-SID ACLs, fresh UUID owner marker |
| Sole synthetic role / target |`a2_64d6cb069f044587a40a` / `a2_library_5e1a7340b40c4237812e18251cdab1fb_test` |
| Data directory |`E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13\owned-postgres\data` |

The fresh port was unused before official startup. SCRAM, UTF8/C and loopback-only/no Unix socket settings were verified. Parent independently checked exact executable/OS birth/ACL/marker/listener and SQL versus physical identity before target creation, then sole-target owner/UTF8/public-only/zero user relations before migrations. Child environments contained only allowlisted OS keys plus fresh synthetic test variables; no operator/hosted DSN or credentials were inherited or printed.

The one normal `pnpm db:migrate` invocation exited **0**, recording15 journal rows/41 non-system tables. No migration edits, repeat/generation, parameter tuning or manual index/trigger/fixture changes were introduced. Existing tests' own original fixture operations remained unchanged.

One no-name-filter [collection invocation](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/selector.json>) exited0 and selected **36 cases in ONE exact file**. All ordered collected names match the static source; the originally failed replan case is **#35 of36**. Before/after zero public-table counts were identical: collection did not run fixture hooks or write their data. A separate parent approval and exclusive-create `run.ONCE` marker gated the actual file execution.

### Exact command and complete observed result

```text
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/library.test.ts --reporter=verbose --reporter=json --outputFile="E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13\owned-postgres\library-results.json"
```

This command ran **ONCE**, with **no `-t` filter**, original sequential order, all original hooks/assertions/fixtures, unchanged30s test/60s hook budgets and five-second SQL statement budget, default retry0 and no additional diagnostic load. It did not execute any other integration file.

[Actual independent child receipt](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/exit.receipt.json>): pnpmPID9576, parent Node4432, **00:22:48.302Z–00:23:45.469Z, exit0 / signal null**. Separate stdout/stderr files were written as produced and synced; the actual child exit receipt was saved before parsing. An outer operational-driver exit was not substituted for this test exit.

| Observation | Actual result |
| --- | --- |
| Complete Library file | **36 collected /36 executed /36 PASS /0 FAIL /0 skipped or pending**, one file passed |
| Test order |All36 actual ordered titles match the collection/source order |
| [Previously failing replan case](<../tests/integration/library.test.ts#L1806-L1918>) | **PASS as #35**, after its normal34 predecessors; **9180.1463ms**, no failure messages |
| [Verbose stdout](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/library.stdout.log>) |All36 individual outcomes/durations retained; reported total55.35s/tests51.64s |
| [Complete separate stderr](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/library.stderr.log>) |Empty,0 bytes |
| [Machine JSON](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/library-results.json>) |success true, zero failed tests/suites, file message empty |
| First failed assertion/exception/expected-versus-actual/stack/SQLSTATE | **None reported for a failed test: all cases passed** |
| Hook/global/cleanup failure |None reported; individual hook timings were not separately exposed or instrumented |

[Parent independent result analysis](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/parent-result-analysis.json>) retains all36 ordered titles, outcomes and exact per-case durations. There is no reported primary failure or cleanup masking in this run; the original missing exception is still unknown.

The raw stdout retains one `library.service / Server operation failed` message adjacent to the **passing** [synthetic PROGRESS rejection/atomic rollback test:1665–1689](<../tests/integration/library.test.ts#L1665-L1689>). That existing test deliberately raises a synthetic trigger exception, expects503/SERVICE_UNAVAILABLE and verifies rollback/recovery. PostgreSQL raw ERRORs also include expected constraint/FK/unique/rollback negative-path probes. These messages are preserved, not suppressed and not relabeled as failing assertions when their cases passed. No diagnostic statement-timeout/deadlock/FATAL/PANIC signature was reported by the executor; this is not a zero-all-server-errors claim.

### Relation to prior evidence and remaining uncertainty

| Receipt | Preserved observation |
| --- | --- |
| Original full-integration attempt, section13 |Library **35 PASS/1 FAIL**, replan case approximately12834ms; original assertion/SQLSTATE/stack and final full-suite total/exit unavailable; historical **FAIL remains** |
| Isolated case, section14 | **1 PASS**,35 deselected,8460.4522ms, actualexit0, verified graceful stop |
| Current complete original Library file | **36/36 PASS**,0 skipped, #35 replan9180.1463ms, actualexit0 |

The named failure did **not** recur with all34 normal preceding Library cases running before it. This weakens a deterministic explanation based only on ordinary file-local predecessors, but does not prove that order/history can never matter. The same source, Vitest4.1.12 and PostgreSQL18.4 passed both authorized fresh diagnostics. No fix was made; no Vitest regression, SQL timeout, application defect, harmless environment cause or cross-file interaction is established. Random synthetic identities, backend/statistics/history, runtime/performance conditions or lifecycle differences remain unproven hypotheses. The original missing error cannot be reconstructed from these successful runs or their different durations.

This does **not** constitute a successful complete integration suite, PostgreSQL17/Linux parity, native/E2E acceptance, candidate CI or hosted/manual acceptance. No other test suite, build, unit, audit, migration generation or additional diagnostic was run.

### Official graceful stop and retained evidence

After the actual file process and its known parent/children had exited, executor and parent independently reverified PID/birth/executable/control-tool hash, UUID marker/owner ACL, sole loopback listener and read-only SQL/physical identifier. The only shutdown action targeted this newly owned data directory, using official `pg_ctl.exe -D <new data> stop -m fast -w -t 60`.

[Cleanup exit receipt](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/cleanup.exit.receipt.json>): actual pg_ctlPID13456 **exit0 / signal null**,00:26:11.923Z–00:26:12.860Z; stdout says server stopped and stderr is empty. The [server log](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/owned-postgres/postgres.log>) records fast shutdown, checkpoint and system shutdown at00:26:12.804Z. [Parent independent post-stop proof](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/parent-cleanup.json>) confirms the same physical ID, **clean state1**, PID12276 absent,61910 closed, new PID file absent and all data retained. Graceful shutdown is therefore actually evidenced.

Current unrelated5432/PID6820 and3000/PID6924 retained this task's preflight birth identities/listeners. No historical cluster, stale PID, ownership/ACL, shared manifest or data was started/recovered/changed/deleted. The new stopped-resource private manifest preserves1679 files/289739658 bytes (self excluded). No force-kill occurred. Existing synthetic SMTP hooks had no reported cleanup failure and the test worker exited; no standalone native web/mail resource was created. A later aggregate handoff guard returned a stopped-state predicate failure after all hash checks; its exact triggering term was not captured. Immediate independent reinspection still found the correct physical ID, clean state1, no recorded PID/listener and no new PID file. [Verification notes](<../.local/v6a-a2-library-file-ec4df417-613f-4986-a6d7-5bd2a7e19a13/verification-notes.json>) preserve that metadata failure separately; no test or lifecycle action was repeated, and final ownership checks use the PID/birth tuple rather than treating any reused PID as owned.

**Complete-file diagnostic PASS. Conditional GO recommendation for the next separately authorized controlled SQL verification, not A2 acceptance or publication.** The smallest next scope is one complete integration-suite verification on another fresh independently verified disposable cluster, with the same final source/budgets/zero retries, durable verbose/JSON output, independent exit receipts and verified cleanup. This is a recommendation only: **no such run is authorized or executed by this receipt**. Preserve the original FAIL and both later PASS receipts; do not call the historical failure fixed. Full A2 acceptance/commit/Draft PR publication remains **NO-GO** until remaining required gates and explicit maintainer approvals. STOP after this file-level report; no additional test, instrumentation, correction, staging/commit/push/PR/merge/deployment or A3 follows automatically.

## 16. A2 controlled full SQL integration verification (2026-10-23 UTC)

### Separate full-suite authority and preflight

The maintainer separately authorized **ONE complete normal SQL integration run**, normal forward migrations and verified cleanup on one NEW independently verified disposable loopback cluster. This was not authority for a code/test/fixture/dependency/migration change, another run, migration generation, native/V4 E2E or publication. This section records a new full-suite observation; it does not rewrite the incomplete historical failure in section13 or successful diagnostics in sections14–15.

Preflight verified `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`, the existing six tracked modifications plus untracked browser helper and an empty index. All11 source/configuration snapshots match the prior candidate. The [fresh owner-private preservation manifest](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/initial-state.json>) fingerprints1890 older PG files,2300 interrupted-resource files,1700 isolated-diagnostic files,1717 complete-file-diagnostic files and31 recovery artifacts. All four earlier resources were inactive and retained read-only, including stale PID files where present. Eight historical worktree HEAD/branch/status/index states, earlier56/22/28 security/failure artifacts,441 frozen receipts and historical generated-file pins match. Main/A1/historical worktrees were not modified.

[Dependency verification](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/installed-graph.json>) again establishes exact Vitest4.1.12, seven coupled internals/physical Better Auth peer patched,511 reachable manifests/1331 edges and zero old reachable mocker/missing required paths, with unchanged669 lock package/snapshot records. [Compatibility receipt association](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/compatibility-receipt-association.json>) verifies matching source/dependency hashes for the earlier159 focused/2112 full units, lint/types/build/post-build types and zero-severity production/full audit receipts. Those are retained matching-state results, **not new executions or fresh registry guarantees**. No install, build, unit or audit rerun occurred. Active root/app environment files and previous test processes were absent.

### Fresh cluster, sole target and normal forward migration

[New identity receipt](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/identity.json>) and independent parent OS/read-only SQL proofs establish:

| Item | Actual run-owned identity |
| --- | --- |
| PostgreSQL |18.4 on Windows; cached native binary SHA256 `becadfa646f4576467452ec94c513b1414e8bfeedc36f63e94d37c55219206ff` |
| Physical/SQL system identifier | **7699658894309833108**, distinct from all four predecessors |
| Sole listener / postmaster | **127.0.0.1:62980 only**, PID16944, parent16180 |
| Exact birth |2026-10-23T00:49:05.7968771Z / ticks639283133457968771 |
| OS/data ownership |`CASTORICE\Admin`, owner-SID-only ACLs and new UUID owner marker |
| Sole fresh test database |`a2_integration_eab44295121a4c1ca8254e0055aa663e_test` |
| Data directory |`E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7\owned-postgres\data` |

The unused port, exact executable/control-tool hashes, OS account, precise process birth/command, UUID marker, ACLs and physical/read-only SQL identity were independently verified before target creation. The sole target was verified fresh-role-owned, UTF8/C, public-only with zero user relations before migration. The server used SCRAM and no Unix socket, with no performance tuning. Test children received only allowlisted OS keys, private empty npm configuration and fresh process-scoped test DSNs; no hosted/operator/auth/provider/proxy/preload/CI environment was inherited or printed. No Neon, Vercel, Mailtrap, staging or production resource was used.

The one normal [migration invocation](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/migrate.exit.receipt.json>) was `pnpm db:migrate`, actual child5836 **exit0 / signal null**,00:54:00.629Z–00:54:04.768Z, recording **15 journal rows/41 non-system tables**. No repeat command, migration generation/edit or manual fixture/index/trigger change was introduced; the existing tests' own normal fixture operations remained unchanged.

### Unfiltered selection and durable independent execution

The [static selection inventory](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/full-selection-inventory.json>) records all34 original integration files. The package script remains `vitest run --config vitest.integration.config.ts`; original include/order configuration, fileParallelism:false,30s test/60s hook limits, five-second SQL statement budget and retry0 were preserved. No `-t`, positional file list, exclusion, shuffle, pool, timeout or retry override was supplied. No separate Vitest list/collection command or additional diagnostic ran.

Installed4.1.12 CLI help verified verbose/JSON/outputFile syntax. The fresh [standalone operational wrapper](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/full-sql-wrapper.mjs>) was inspected before execution. It verifies its own PID/exact birth/SID/executable/script identity, creates exclusive `run.ONCE` plus fsynced intent/launch records, streams stdout/stderr to separate private file descriptors and fsyncs the actual child exit plus independent completion receipt **before analysis**. Exit/error/SIGINT/SIGTERM handlers preserve best-effort interruption records without restarting or force-killing anything; OS hardkill/power-loss limitations are explicit. It requires no conversational turn to capture normal completion, installs no service/scheduled task and leaves no unowned process.

Exact command, run **ONCE** after parent approval:

```text
pnpm test:integration --reporter=verbose --reporter=json --outputFile="E:\TaleAtlas-v6a-catalog-filters\.local\v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7\owned-postgres\integration-results.json"
```

[Actual child receipt](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/exit.receipt.json>): pnpmPID17196, owned wrapper14472/exact birth639283137564839178, **00:55:58.976Z–01:04:11.327Z**, **exit0 / signal null / no spawn error**. This is492.351s independent child wall time, not a logging-pipeline result. The [completion receipt](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/completion.json>) proves logs synced/exit saved/analysis not yet performed; wrapper-exit records actual processExitCode0/childClosed/completionWritten. No interruption receipt was generated. An independent parent kernel wait observed this existing wrapper's natural exit without database polling or a replacement test execution.

### Complete runtime result and retained log limitations

| Actual runtime observation | Result |
| --- | --- |
| [Machine-readable complete result](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/integration-results.json>) | **34 files /332 executed /332 PASS /0 FAIL /0 skipped, pending or todo**, success true |
| Selection coverage |All34 actual file paths match the full static original inventory |
| Library / formerly failing case |Library36 cases passed; replan case **#35 PASS,13757.012ms**, no failure messages |
| V5D concurrency evidence |[Existing summary projection](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/v5d-projection.txt>) reports C01–C06 **PASS**, COMPLETE, no failure scope/category |
| [Verbose stdout](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/integration.stdout.log>) |Complete file/case outcomes and durations; reported total **490.09s**, tests361.29s/import111.25s |
| [Separate complete stderr](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/integration.stderr.log>) |One pnpm Vitest-command echo line only; no reported warning/error |
| First failing assertion/expected-versus-observed/stack/test SQLSTATE | **None: no test failed** |
| Hook/global/teardown failure |None reported; no separate hook instrumentation/timings were introduced |

[Parent independent result analysis](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/parent-result-analysis.json>) revalidates JSON plus actual exit/completion, all34 files/332 statuses and the original Library case. All individual file/case durations and raw details remain private. No primary or cleanup failure is reported in this run; that cannot reconstruct the historical missing exception.

Logs are not falsely characterized as error-free. The [private log classification](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/log-classification.private.json>) retains **six generic level50 operation ERROR messages**: library.service4, community.service1 and database.health1. They occur with passing negative-path rollback/redaction/readiness assertions. No stdout/stderr warning text, structured WARN or PostgreSQL WARNING/FATAL/PANIC was observed by that classifier. PostgreSQL retains **174 ERROR records**: unique22/check69/FK-RESTRICT19/synthetic5/other59. The broad other59 bucket is **not exhaustively explained or waived**; neither zero server errors nor blanket harmlessness is claimed. There were zero failing test assertions and no unhandled/hook failure reported.

### Historical comparison and scope of this PASS

| Receipt | Observation preserved |
| --- | --- |
| Original interrupted full attempt |Library **35 PASS/1 FAIL**, replan approximately12834ms; primary assertion/SQLSTATE/stack and final full-suite total/exit unknown; remains historical **FAIL** |
| Isolated case | **1 PASS**,8460.4522ms, exit0, clean shutdown |
| Complete Library file | **36/36 PASS**, replan9180.1463ms, exit0, clean shutdown |
| Current controlled full suite | **332/332 PASS across34 files**, replan13757.012ms, actualexit0, verified clean shutdown |

The full SQL gate now has a complete successful local observation on this unchanged patched candidate. **It does not explain, fix or erase the earlier failure.** In particular, a passing aggregate case duration13757.012ms versus the old failed12834ms cannot identify an original five-second SQL timeout. No environment-only, intermittent, Vitest-regression or application-defect classification is established. The missing historical error remains missing; all previous A1/A2 failures and security remediation receipts retain their original meaning. This Windows/PostgreSQL18.4 execution is not PostgreSQL17/Linux or actual candidate CI evidence.

### Verified official shutdown and preservation

Once the actual suite, wrapper and known descendants had exited, parent and executor independently reverified exact postmaster birth/executable/control-tool hash, OS/ACL/UUID owner marker, sole loopback listener and read-only SQL versus physical identifier. The only shutdown targeted this run's new data directory using official `pg_ctl.exe -D <new owned data> stop -m fast -w -t 60`.

[Official cleanup receipt](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/cleanup.exit.receipt.json>): actual pg_ctlPID9376 **exit0 / signal null**,01:07:46.421Z–01:07:47.427Z; stdout confirms server stopped and stderr is empty. The [server log](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/owned-postgres/postgres.log>) records fast shutdown, checkpoint and system shutdown at01:07:47.216Z. [Parent post-stop proof](<../.local/v6a-a2-full-sql-9692ff91-40bf-4c37-b6c8-23a547d655c7/parent-cleanup.json>) confirms same ID, **clean control state1**, original PID/birth tuple absent,62980 closed and new PID file absent. No PID-only identification, force-kill or manual stale-PID deletion was used.

Unrelated5432/PID6820 and3000/PID6924 retained their task-preflight birth identities/listeners. All four historical clusters, credentials/manifests, ACLs, files and stale PID evidence remained unchanged/read-only. The new stopped-resource manifest preserves1762 files/440084853 bytes, self excluded; all data/logs remain retained. Every relevant managed job completed and was collected; no test, wrapper, waiter or new database process remains active.

### Remaining gates and readiness recommendation

| Gate | Current grounded status |
| --- | --- |
| Patched dependencies / earlier unit/build/audit compatibility |Matching-state section12 receipts retained and hash-associated; not rerun here |
| Fresh integration migration / full SQL | **PASS15 / PASS332 across34 files**, this new run |
| Repeat integration migration |Earlier matching-state section13 PASS retained; not executed again in this authority |
| Migration generation and generated inventory/no-drift gate | **NOT RUN**; unchanged31-file hashes are preservation, not generation acceptance |
| Fresh E2E migrations / production-native default / test-only V4 native | **NOT RUN** against this patched candidate; no native run authorized here |
| A2 browser74/geometry64/causal16 |Prior matching-source post-patch PASS retained; no browser rerun here |
| Actual browser-UI 200% zoom / AT / manual / hosted acceptance | **NOT RUN / not claimed**, no certification or hosted behavior inferred |
| Candidate CI / commit / PR / deployment | **NOT RUN / not authorized** |

**GO recommendation for continuing the remaining A2 verification only after a new explicit scoped approval.** The SQL gate is locally PASS; the next scope should cover migration generation/inventory/no-drift and the remaining fresh-resource native/E2E gates, preserving all existing assertions and zero retries. This report does not authorize or execute them. Overall A2 acceptance/commit/Draft PR publication remains **NO-GO** until required gates and separate maintainer approvals are satisfied. STOP after this controlled full-SQL report: no additional diagnostic, rerun, code correction, generation, native/V4 E2E, staging/commit/push/PR/merge/deployment or A3 follows automatically.

## 17. A2 final remaining gates: migration and native E2E attempt (2026-10-23 UTC)

### Authority, exact state and preservation

The maintainer authorized one remaining validation sequence: bounded retained-log review, one generation/no-drift check, one NEW isolated E2E database with fresh/repeat migrations, and the canonical complete production-native default plus test-only V4-enabled suites. This was validation only, not implementation, retries, publication, hosted activation or A3 authority. **The generation/migration gates passed; the one native invocation failed during TLS preparation before either browser suite began.**

Preflight established `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD **4791c0373588aef9a6895049d2def67fc045a1c1**, the same seven-file candidate and empty index. Local main and read-only remote-main lookup both matched that approved baseline. Maintainer-reported main CI39599291927 SUCCESS remains baseline evidence, not current uncommitted-candidate CI. [New private preservation manifest](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/initial-state.json>) snapshots11 candidate/config files and protects1890 older PG files,2300 interrupted-resource files,1700 isolated-diagnostic files,1717 complete-file-diagnostic files,1799 full-SQL-run files and31 recovery artifacts. All five earlier owned PG listeners were inactive; eight historical worktree states and protected generated-file hashes matched. No earlier cluster/PID/ACL/manifest/evidence was restarted, recovered, rewritten or removed.

Exact Vitest4.1.12, its seven coupled internals and physical Better Auth peer, unchanged lock records and installed graph511 manifests/1331 edges were reverified; no old reachable mocker/missing required paths were found. Matching-source2112 full/159 focused units, build/static checks, browser74/geometry64/causal16 and source-bound zero-severity audit receipts were retained, not automatically rerun. The prior failed audits, exact-pin remediation and all A1/A2 failures remain historical evidence. No dependency update, install, audit suppression or fresh registry-vulnerability guarantee is claimed.

### Bounded read-only PostgreSQL error review

[Review receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/postgres-log-review.json>): **no release-blocking problem identified within the reviewed evidence**, not a blanket all-errors-harmless conclusion. The retained full integration run's174 ERRORs were originally unique22/check69/FK-RESTRICT19/synthetic5/other59. Existing negative-test source and corresponding runtime file windows corroborate the other59 as **metadata integrity/privacy guards49, community immutability3, invalid enums2, intentional NOWAIT user-lock probes2 and explicitly injected V5B rollback3**. This is family-level evidence, not exact per-backend attribution for every event. No timeout/deadlock/OOM/connection-slot-exhaustion/FATAL/PANIC or demonstrated privacy/authorization/post-test-cleanup regression was identified in the bounded review.

**155 LOG-level forcibly closed client connections remain causally unexplained**, including one before the suite and multiple file-boundary bursts. Pool/worker teardown is only a hypothesis: connection loss is not declared absent or universally harmless. The review introduced no SQL, tests, log/source changes or resource lifecycle action. With no identified release blocker, it permitted the authorized remaining gates to proceed, retaining these limitations. Sections13–16 are not retroactively rewritten.

### Generation and fresh/repeated E2E migrations

Before generation, all31 migration/metadata files plus relevant database source/configuration inputs were preserved as **47 exact snapshots**; Git showed no pre-existing migration changes. One offline `pnpm db:generate` ran with no database/operator environment. [Actual generation receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/generate.exit.receipt.json>) reports **exit0 / signal null**; [stdout](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/generate.stdout.log>) reports40 schema tables and “No schema changes, nothing to migrate”. [No-drift proof](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/generation-no-drift.json>) confirms **zero new migrations**, unchanged31-file inventory, all47 input/migration/metadata contents byte-identical, same seven Git paths and empty index. No generated file was accepted, deleted or reverted. An initial metadata-verification shell contained a stray unrecognized command; its exit1 is preserved in a [verification note](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/generation-verification-note.json>). Corrected read-only verification passed; **generation was not repeated**.

[Fresh E2E identity](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/identity.json>): PostgreSQL18.4 Windows, native SHA256 `becadfa646f4576467452ec94c513b1414e8bfeedc36f63e94d37c55219206ff`; system identifier **7699787984739895532**; **127.0.0.1:57738 only**; postmaster14648/parent14112; birth2026-10-23T09:10:03.3305497Z/ticks639283434033305497. Fresh marker/owner-SID-only ACLs, `CASTORICE\Admin`, executable/control-tool hashes and OS/read-only SQL versus physical identity were independently verified before sole-target creation. The only synthetic database was `a2_e2e_79cbc8389c0a48be9929385660864b35_test`; owner/UTF8/C/public-only/zero relations/exact four-database catalog were independently checked before migration. No previous, existing or hosted database was reused or accessed.

[Migration receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/migration-state.json>): normal `pnpm db:migrate` **ONCE fresh**, PID1064 **exit0/null**,09:18:15.546Z–09:18:21.710Z; the same normal command **ONCE repeat**, PID15908 **exit0/null**,09:18:21.983Z–09:18:25.018Z. Journal remains **15 rows**, identical history and schema fingerprint `0a845158721436f982b926e4fcc230fcf760947f4557c8449bd417ce9aa134df`; all31 migration-source hashes unchanged. No repeat generation, schema definition edit or history rewrite occurred.

### Sole canonical native invocation: pre-suite FAIL

The existing `pnpm test:e2e` script was reviewed: **any CLI arguments would select only a diagnostic default phase**, so none were added. Original configs/assertions/fixtures/TLS/deadlines were preserved. The process-scoped existing production-native mode was selected, CI unset/retry0, default V4 disabled and subsequent V4 opt-in child-test-only. Planned fresh endpoints were HTTPS57571, SMTP57572 and existing-config inbox HTTP1026, all verified unused. Artifacts were isolated in the new private nested `v5b-native-artifacts-1a612da3-20bd-47a5-833a-8479427d3c81` directory. No production rebuild, browser install, hosted flag or SMTP/source/config change was made.

Exact canonical command, run **ONCE**:

```text
pnpm test:e2e
```

[Independent actual child receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/exit.receipt.json>): pnpmchild7404, wrapper13136/birth639283444768547811, observer13236; **09:28:00.432Z–09:28:03.129Z (2.697s), exit1 / signal null / no spawn error**. Streaming stdout and separate stderr were fsynced; independent [completion receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/completion.json>) was saved before analysis. Outer wrapper also exited1; its status was not substituted for the child's. No test command was duplicated or retried.

The [complete captured stderr](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/native.stderr.log>) reports:

```text
Error: Unable to prepare isolated native production TLS
    at prepareNativeProductionTls (.../scripts/native-production-tls.ts:227:11)
    at async <anonymous> (.../scripts/test-e2e.ts:14:33)
Node.js v24.19.0
```

This is the first exposed **setup exception**, not a failed browser assertion. The existing TLS helper's catch masks its lower-level cause. No SQLSTATE, expected-versus-observed browser value or browser test stack exists for this attempt. No NATIVE SERVER MODE or PHASE BEGIN marker was emitted because TLS preparation occurs before them.

| Mandatory native phase | Actual observation |
| --- | --- |
| Default production-native, static inventory20 | **NOT RUN**, phase not begun, zero browser cases executed |
| Isolated test-only V4, static inventory8 | **NOT RUN**, phase not begun, zero browser cases executed |
| Browser test pass/fail/skip totals |No runner results produced; **not 0/0 PASS**, not20 or8 failing assertions |
| HTML reports/traces/screenshots |Not generated before setup failed; expected absence recorded, no historical report substituted |

[Existing-output-only phase projection](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/native-result.private.json>) preserves both NOT RUN statuses. Missing HTML is secondary to the pre-suite failure, not an additional browser run. No separate V4 attempt, corrective rerun, source/helper correction or further TLS reproduction/diagnostic followed the failure.

### Separate observer failure and TLS ownership limitation

The new passive operational observer performed no SQL/network probe or process termination. It recorded fresh TLS directory `E:\TaleAtlas-v6a-catalog-filters\.local\native-production-tls-694704c3-d675-4dcc-ad30-3409be875a4d`, creation09:28:02.3734976Z, guarded ACL hardening09:28:02.5301574Z–09:28:02.5716689Z. The canonical source first creates that sibling directory; therefore **no zero transient inherited-Windows-ACL window is claimed**. Parent `.local`, earlier TLS resources and canonical TLS settings were not changed.

A separate [observer failure receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/native-observer-failure.json>) records **access denied to `ca-cert.pem` at09:28:03.673Z**, observerexit1. Complete TLS-file ownership/hash verification did **not** finish; no TLS-resource PASS is claimed. The native helper's masked failure and the observer ACL/read failure have temporal proximity, but **their causal relationship and the underlying TLS failure remain UNKNOWN**. Do not label this an application defect, environment-only flake or harmless warning. The canonical catch attempts its own newly created-directory removal on failure; surviving TLS-file extent/ownership is not fully established. No key-byte read, ACL repair, deletion, bypass, new experiment or retry was attempted after the denial. Existing partial lifecycle/failure evidence remains retained.

### Verified PostgreSQL shutdown and process/listener cleanup

After the actual native child and observer had exited, executor and parent independently reverified exact PG PID/birth/executable/control-tool hashes, UUID/OS/private ACL, sole listener and read-only SQL versus physical identity. The only shutdown was official `pg_ctl.exe -D <this new owned data> stop -m fast -w -t 60`. [Actual cleanup receipt](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/cleanup.exit.receipt.json>): pg_ctlPID15196 **exit0/null**,09:33:57.128Z–09:33:57.285Z. [Server log](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/postgres.log#L14-L20>) shows fast shutdown, checkpoint and database shutdown at09:33:57.212Z. [Independent parent cleanup](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/parent-cleanup.json>) verifies same ID, **clean control state1**, original14648/birth tuple gone,57738 closed, new PID file absent and all PG data retained.

Original wrapper/child/observer tuples are gone, planned HTTPS57571/SMTP57572/inbox1026 listeners are closed. Source control flow failed before Playwright/web/mail/browser phases could start; no live native service was found and none was force-stopped. Current task baseline unrelated5432/PID6864 and3000/PID6872 retained their original birth identities/listeners (older tasks'6820/6924 values are historical, not current ownership evidence). No process-name-wide kill, stale-PID deletion, old cluster recovery/ACL modification or unrelated-service action occurred. **PG/process/listener cleanup is verified; TLS private-file ownership remains INCOMPLETE**, a separate retained evidence limitation, not concealed by PG shutdown success. The readable owned-postgres manifest covers1673 files/73569926 bytes, unreadable0/self excluded; the external failed TLS directory is explicitly excluded, not force-read or represented as completely retained/verified. The attempt ended before the observer's five-second native-process sample, so that short-lived descendant sampling is incomplete; original recorded process tuples and before/after listener states are retained.

### Final candidate inventory, retained gates and NO-GO

The candidate retains exactly these seven Git paths, with only this A2 receipt appended during this task and no staged files:

| Path | State |
| --- | --- |
| [PublicCatalog.tsx](<../apps/web/src/components/catalog/PublicCatalog.tsx>) |Existing tracked modification preserved |
| [catalog.module.css](<../apps/web/src/components/catalog/catalog.module.css>) |Existing tracked modification preserved |
| [catalog-discovery-ui.test.tsx](<../tests/unit/catalog-discovery-ui.test.tsx>) |Existing tracked modification preserved |
| [test-v6a-catalog-ui.mjs](<../scripts/test-v6a-catalog-ui.mjs>) |Existing untracked helper preserved |
| [V6_VALIDATION.md](<V6_VALIDATION.md>) |Existing receipts preserved; section17 appended only |
| [package.json](<../package.json>) |Existing security-remediation modification; exact Vitest4.1.12 retained |
| [pnpm-lock.yaml](<../pnpm-lock.yaml>) |Existing patched lock modification preserved; no dependency operation |

Current new observations are generation/no-drift **PASS**, fresh/repeat E2E migrations **PASS0/0**, native canonical command **FAIL1 before suites**, both browser suites **NOT RUN**, observer/TLS ownership verification **INCOMPLETE**, and PG cleanup **PASS0/state1**. Prior full SQL **332/332 across34 files/exit0**, all six V5D schedules, units/static/build/audit/browser receipts retain their actual matching-source scopes. The original Library35/1 FAIL remains unexplained; later isolated1 PASS, full-file36 PASS and full-suite332 PASS do not fix or erase it. All older native/auth/theme failures and failed audit/remediation receipts remain preserved.

Manual browser-UI 200% zoom, assistive-technology/accessibility certification, complete composed visual acceptance, hosted/public TLS or real SMTP, production/staging/hosted V4 activation and actual candidate CI remain **NOT RUN / not claimed**. No full V6A acceptance or PostgreSQL17/Linux parity is inferred from local PostgreSQL18.4 Windows evidence.

**NO-GO for A2 commit and Draft PR publication.** Required native gates were not executed because the sole canonical invocation failed in TLS setup; full TLS ownership evidence is also incomplete. The smallest proposed next scope is a **separately approved, narrowly bounded TLS-preparation/ACL diagnostic that exposes the masked lower-level error while preserving the original failure**; it is not permission to rerun E2E, repair permissions or change source now. STOP after this report. No additional diagnostic, correction, test, generation, staging/commit/push/PR/merge/deployment, hosted change or A3 follows without separate maintainer approval.

## 18. A2 controlled Windows TLS-only diagnostic (2026-10-23 UTC)

### Scope, Git state and original evidence

The maintainer separately authorized **ONE isolated TLS-preparation diagnostic**, fresh private disposable TLS resources, required OpenSSL generation through that path, sanitized instrumentation, read-only ACL observation, necessary verified resource shutdown and this append-only receipt. No tracked application/test/TLS-helper/configuration/dependency/migration modification, permanent harness correction, native E2E, SQL integration, hosted operation, publication or A3 was authorized.

Worktree remains `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`. The exact seven-path candidate in section17 remains, with empty index; **only this receipt was appended to tracked files**. Exact Vitest4.1.12, installed coupled graph and security patch remain unchanged. The original 916 ledger lines are retained literally; section17's native **FAIL1/default and V4 NOT RUN** is not rewritten or waived.

The preceding read-only investigation confirmed six original TLS files with owner SID1001, **protected, present, non-null EMPTY file DACLs (zero ACEs)**, while their directory had one owner FullControl grant. Five outputs were empty; the extension file was202 bytes; none was ReadOnly or a reparse point. Directory security did not establish usable file access. Historical private-key bytes were not read and no original ACL/file was repaired.

Original lifecycle timeline remains: TLS directory creation **09:28:02.3734976Z**; observer recursive ACL operation **09:28:02.5301574Z–09:28:02.5716689Z**; original native child closed **09:28:03.129Z, exit1/null**; separate observer CA-certificate AccessDenied recorded **09:28:03.673Z**. [Original lifecycle evidence](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/native-lifecycle.private.jsonl#L1-L4>). The observer's operation included recursive `/inheritance:r /grant:r <owner-full-control> /T`; directory-only verification did not prove every file retained an effective grant. Timing overlap and current empty DACLs do **not** establish the original first failing operation.

### Fresh owner-private diagnostic context; no PostgreSQL needed

New ignored private root: [diagnostic evidence](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/>), owner marker `d962a33f-334f-4b56-aaac-c22987d8755e`. Its ACL was established synchronously on the newly created **EMPTY** directory, owner-only effective FullControl, **without recursive `/T`**, before any sensitive material. Its new `.local` and subsequently created TLS directory/files inherited that owner grant. No historical/operator parent ACL was changed, and no concurrent ACL-hardening observer ran. HOME/USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP and empty npm configs were isolated inside this private root. [Pre-material ACL and actual Node R+ probe](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/pre-material-acl.json>) establishes non-null/nonempty owner DACLs, no foreign ACEs/reparse point, and successful read/write open-and-close without data I/O.

[The unchanged real database guard](<../tests/helpers/test-database.ts#L1-L17>) validates URL presence, a loopback host and `_test` suffix only; it neither connects nor executes SQL. The instrumented copy imported and invoked that real function with one fresh synthetic `127.0.0.1:62157` `_test` descriptor, whose unused port was independently checked by temporary bind/release. **No live database was claimed, no PostgreSQL cluster/database was created, and no SQL/network connection was attempted.** [Guard-scope decision](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/guard-scope-decision.json>).

### Temporary instrumentation fidelity and one actual invocation

Only the private diagnostic copy/harness was instrumented. Tracked [TLS helper](<../scripts/native-production-tls.ts>) SHA256 remains `2ac7b8e47048c578ffdbb5c49089c54c2b8946a482d92cc60cc43e26a4c52f85`; real guard SHA256 remains `dd3be4bc6284976218e93b6f50302333c5e0954636a0470e37926e8d16e026be`. Final private copy SHA256 is `59b226c50404406c23498d78ab3e9de6de9bc178219c4f9e72440efaed6726a2`; outer wrapper is `66353e8b2de899cc470f1a6acfd9e0396edaf06bdd1a954f0f27e16f1ff78780`.

[Independent parent GO gate](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/parent-go-gate.json>) verified exact original-plus-whitelisted-edit replay, all **five original OpenSSL argument arrays byte-identical and ordered**, unchanged chmod operations, real guard and path checks, P-256 algorithms/CA and leaf properties, **30000ms per-command budgets**, original generic public error and owned-directory failure cleanup, and no added success cleanup. The existing optional `cwd` argument was the new private diagnostic root, not the historical worktree TLS location. OpenSSL selection remained the first existing MSYS2 UCRT candidate, PE metadata **3.4.0**, SHA256 `f692b19a446f921b81200b62829ddb90338fd3d125d83eee1e11d38ffd5a3168`; no version/help/smoke or alternative-executable call was made.

Temporary instrumentation differences were explicit: serial read-only ACL metadata and actual Node R+ open/close probes between operations; fixed safe stage/role identifiers; inner stderr bounded to65536 bytes **in memory for allowlisted classification then discarded**, instead of original ignored stderr. Raw outer Node/tsx chunks were likewise classified/count-only and discarded before persistence. No raw messages/stacks/argv/transcripts, secrets, PEM material or SPKI pins were emitted. Primary-error memory capture and cleanup outcome were independent of nonthrowing failure telemetry; helper success was distinguished from any later verification failure. Independent safety review found and resolved these temporary-harness issues **before** the sole invocation; no permanent correction was implemented.

Invocation was the new private outer Node wrapper, spawning `node --import tsx <private tls-worker.mjs>` and calling the instrumented preparation function **once** with the fresh private cwd. Exclusive `run.ONCE` and `worker.ONCE` fences remain. WrapperPID **12168**, exact birth **639283634339204570**; workerPID **5500**, exact birth **639283634358684283**. Actual worker timing **14:43:55.860Z–14:44:22.667Z (26.807s)**, natural **exit0, signal null, spawnCode null**. [Independent exit receipt](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/exit.receipt.json>) and [fsynced completion](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/completion.json>) were durable **before analysis**. Outer wrapper independently closed **exit0**,14:44:22.673Z; no wrapper-only PASS substitution.

### Actual result: TLS preparation PASS

[Sanitized worker result](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/worker-result.json>): real guard/trust preflight, local validation, unique directory/modes, five exclusive output creations, extension writing, all generation/mode stages, leaf X509 parsing, SPKI derivation and final settings completed. **First primary error: null. Telemetry failures: none.**

| Original generation stage | Actual PID | Exit / signal / spawn code |
| --- | --- | --- |
| CA EC key generation |2068|0 / null / null|
| CA certificate generation |7116|0 / null / null|
| Leaf EC key generation |3592|0 / null / null|
| CSR generation |13112|0 / null / null|
| Leaf certificate signing |1116|0 / null / null|

All five classifications were `NONE`; final signing emitted61 stderr bytes that were classified/discarded, never persisted as a transcript. Outer child streams stored only safe byte-count/category records;143 stdout bytes were safe worker-protocol output, stderr0. No second preparation, additional OpenSSL command, retry or full runner was executed.

**All26 ACL/access snapshots passed**: matching owner, present/non-null nonempty DACL, one effective owner ACE, no foreign ACE, no reparse point, and successful Node R+ open/close without content I/O at observed boundaries. The observer only read metadata; no inherited file permissions were removed during generation. Final parent metadata independently confirms all seven material roles retain one owner read/write ACE and ordinary Archive attributes:

| Material role | Final bytes |
| --- | --- |
| CA key |246|
| CA certificate |676|
| Leaf key |246|
| Leaf certificate |708|
| CSR |362|
| Extensions |202|
| Serial |42|

**All14 certificate verification booleans passed** using Node crypto, with no extra OpenSSL subprocess: CA flag/self-issuance/self-signature; non-CA leaf, issuer and signature consistency; expected `localhost` and `127.0.0.1` identity; current CA/leaf validity; EC prime256v1 keys; leaf private/public match; derived SPKI matches returned settings. Only the newly generated leaf private key was read locally in memory for its public-key match, then its byte buffer zeroed; no key/certificate contents or pin were displayed, and no private-key content hash was collected for a manifest. These checks are not an HTTPS, STARTTLS, browser, hosted or production acceptance result.

### Cleanup, preservation and operational metadata notes

Original success semantics retained the new owner-private material under the fresh context's `.local/native-production-tls-341f72d2-1655-47bd-bf8b-f15c9ea849f7`. Cleanup status is **NOT_ATTEMPTED_SUCCESS_RETAINED**, not a claimed deletion. All five OpenSSL subprocesses returned naturally; original wrapper/worker PID+birth tuples are gone, no run-owned process remains, and the unused descriptor port62157 plus former native planned ports are closed. No web/SMTP/browser/PG service needed shutdown and no process-name-wide termination occurred. [Independent parent post-diagnostic proof](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/parent-post-diagnostic-proof.json>).

All six protected PG/native evidence sets and recovery hashes matched; eight historical worktree states and both preexisting generated-file pins matched. All47 migration/source inputs remain identical. The previous PG physical ID `7699787984739895532` remains clean control state1; no historical cluster was started, connected, recovered or stopped. Unrelated3000/PID6872 and5432/PID6864 listeners remained unchanged. Original TLS directory and six files retain exact owner/security descriptor, attributes, size, creation and last-write UTC metadata; **all six original empty DACLs remain untouched**, and no historical key bytes were read. Earlier audit failures/remediation, Catalog Reset failures, unexplained Library failure, A1 hydration timeout and original native TLS failure remain in their original evidence scopes.

Preparation-only metadata issues are preserved separately: an exclusive empty npm-config creation collided with parent-created private empty configs, which were ownership/emptiness-verified and reused without recreating the descriptor or any TLS material. Parent whitelist verification initially checked dependent edits in the wrong order, then wrongly assumed all edits occurred once although one declared five replacements; corrected read-only declared-count replay passed before GO. After the successful run, a metadata verifier compared ISO strings with PowerShell auto-parsed DateTime objects and exited1 with a false historical-TLS mismatch; role-by-role normalized UTC, SDDL, attributes and sizes all matched, and remaining read-only cleanup proof completed. [Preparation note](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/preparation-metadata-note.json>), [parent verifier note](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/parent-verification-note.json>), [post-verification note](<../.local/v6a-a2-tls-diagnostic-13589307-4c69-49ed-af3b-51f452bcd6e2/parent-postverify-note.json>). **None was a second TLS attempt, an ignored TLS failure, a historical mutation or a certificate/ACL repair.**

### Interpretation, proposed correction and remaining gates

The source-equivalent preparation **works in this fresh owner-private Windows environment without concurrent observer ACL mutation**, using the same selected binary/algorithms/properties/budgets. This supports the observer-interference/access-policy hypothesis and weakens a general claim that precreation or mode0600 inherently prevents OpenSSL output on this host. It does **not** conclusively identify the original first failing call or actor: original subprocess results and per-file ACL timing were lost, and this control also used a new cwd/private parent, isolated home/profile and instrumentation/observation timing. The original failure remains preserved and causally **supported but not proven**, not retrospectively fixed or harmless.

The smallest proposed permanent **test-harness** correction is to establish and verify owner-private effective access synchronously on a newly owned **empty TLS directory before sensitive files are created**, permit safe owner inheritance, then verify effective file grants. Make the observer read-only; never recursively strip inheritance from live/preexisting certificate/key files. Preserve test-database/TLS guards, algorithms, certificate properties, assertions and timeout/retry budgets. **This is a proposal only: no tracked helper or permanent observer correction was made.**

**NO-GO for an immediate native E2E rerun with the unchanged original harness.** The passing diagnostic justifies separately approving the minimal harness-security correction and its focused failure/redaction/Windows access verification, followed by a separately approved canonical native verification. Required default20 and isolated test-only V4 eight-case suites remain **NOT RUN**; no SQL, migration generation, Playwright, application server, SMTP fixture or hosted V4 activation was performed here. **A2 commit/Draft PR publication remains NO-GO. STOP after this receipt/report** pending separate approval for any permanent fix or native E2E. No staging/commit/push/PR/merge/deploy/hosted operation or A3 follows automatically.

## 19. A2 minimal run-owned TLS harness correction and focused verification (2026-10-23 UTC)

### Actual correction layer and preserved source

The maintainer separately authorized a narrowly scoped **run-owned ignored Windows TLS orchestration correction and ONE focused TLS-only verification**, not native E2E or a tracked TLS-helper/application fix. Worktree remains `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`, same seven A2 paths and empty index; exact Vitest4.1.12 and the coupled installed dependency graph remain unchanged. Only this receipt is appended to tracked files; all previous988 lines/receipts remain literally intact.

The unsafe ACL command was in **A: run-owned ignored orchestration**, specifically [historical observer SecureNewTls](<../.local/v6a-a2-final-native-115cb590-e5a2-47ee-b3b8-98db1d859fbe/owned-postgres/native-observer.ps1#L10>). Git tracked-path inventory is empty and ignore verification matches `.local`. It asynchronously ran recursive `/inheritance:r /grant:r <owner-full-control> /T` after observing TLS directory creation, while generation was active. The historical script/evidence is preserved, **not edited or relaunched**. It was not a tracked repository ACL initializer, external DSH configuration change or mutation in the production-native helper. The original six protected empty file DACLs and original masked native failure remain unchanged; causal responsibility for the first original exception remains unproven.

New correction root: [private run-owned harness](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/>), owner marker `a6195b9e-eff3-4454-8f0a-09021f6a8feb`. Its evidence/profile directories are owner-private before sensitive material. [Scope decision](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/parent-scope-decision.json>), [exact correction/inventory](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/harness-correction.json>) and [frozen code hashes](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/harness-freeze.json>) are retained independently of the session.

### Exact run-owned correction and bounded review

The fresh worker installs narrowly scoped mutable Node builtin wrappers, then synchronizes named builtin bindings **before importing the ACTUAL unchanged tracked helper**. This is worker-local orchestration memory, not a source rewrite, helper copy, global Node/DSH configuration or shared-system change. A metadata-only precheck proved all six required named/default builtin identities without importing/calling the TLS helper or executing OpenSSL. The actual worker invokes `prepareNativeProductionTls()` **once with DEFAULT arguments and the original A2 cwd**, unlike section18's instrumented private-copy/private-cwd control.

The mkdir boundary delegates the original recursive parent mkdir unchanged. Only after the original **exclusive nonrecursive UUID-child mkdir succeeds**, it claims that newly created direct child of the original worktree `.local`, records dev/ino/birth/current-run identity, and checks strict UUID/baseline exclusion, canonical ancestors, no reparse point, owner SID and emptiness. It refuses a second target **before creating it**. A synchronous initializer performs the only directory-only, **NONRECURSIVE/no `/T`** owner-private ACL setup while this target is still empty, positively verifies owner FullControl, OI/CI inheritance, non-null nonempty DACL and no foreign/deny ACE, and confirms the parent ACL did not change. A uniquely owned nonsensitive wx probe is opened read/write without data I/O, closed, identity-rechecked and removed; the directory is **empty again before the awaited mkdir resolves**. Sensitive writes and OpenSSL are fail-closed unless that exact claimed target is SECURITY_READY. No existing file inheritance is removed.

All subsequent TLS observation is **read-only**: role ACL/attributes/size plus actual Node R+ open/close probes, with handles closed before generation calls. There is no asynchronous ACL-writing watcher and no observer key-content hashing. Original fs operation arguments/results and five OpenSSL argument templates/options are preserved, including **stdio ignore, shell false, windowsHide true and30000ms budgets**. Because original inner stdio remains ignored, only actual status/signal/Node error information is claimed—not a reconstructed stderr transcript. Boundary/file-role/stage/error records are allowlisted; outer raw Node/tsx streams are classified/count-only in bounded memory and discarded. No PEM, pins, raw environment values, arbitrary path/error transcripts or authentication secrets are logged.

Failure telemetry cannot prevent original owned cleanup or overwrite its primary failure. Original helper cleanup keeps its exact recursive/force arguments, guarded by exact target identity and positive Windows owner-SID/nonreparse verification; an ACL-rights observation failure alone does not prevent the original removal attempt. The before-helper-ownership mkdir failure gap has independent same-identity empty/probe-only cleanup or fail-retain-on-ambiguity. No historical deletion/repair is allowed. Identity/path metadata checks are bounded safeguards for the trusted run-owned environment, not a claim of atomic isolation against hostile same-SID path replacement.

Changed executable artifacts are confined to this new ignored root: [child-boundary.mjs](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/child-boundary.mjs>), [secure-empty-dir.ps1](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/secure-empty-dir.ps1>), [read-only ACL observer](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/acl-metadata.ps1>), [worker](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/tls-worker.mjs>), [outer wrapper](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/tls-diagnostic-wrapper.mjs>) and [process proof](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/process-proof.ps1>), plus preparatory binding checks and private evidence. No tracked application/helper/test/configuration/fixture/dependency/migration file changed. Primary boundary SHA256 is `d849941f2df8e87db097f673567691fb2ea11ecacd9d137e4179890468584ddb`; outer wrapper SHA256 `64ed0c7124ef289e1b4ae0ac8a5230fd92c73b16bb60318f25634ea3a80f008d`. Independent bounded static review and syntax checks passed before the exclusive one-shot GO; no preparatory helper or OpenSSL attempt occurred.

### ONE actual focused verification: PASS

Invocation: private Node outer wrapper → `node --import tsx <private tls-worker.mjs>` → direct import of the tracked real helper → `prepareNativeProductionTls()` with no arguments, original A2 cwd. Exclusive `run.ONCE`/`worker.ONCE` and reviewed code hashes fence the invocation. Real helper SHA256 remains `2ac7b8e47048c578ffdbb5c49089c54c2b8946a482d92cc60cc43e26a4c52f85`; unchanged real guard SHA256 `dd3be4bc6284976218e93b6f50302333c5e0954636a0470e37926e8d16e026be`, verified both before execution and after actual child exit. No helper copy or source instrumentation was executed.

The real database guard performs URL validation only. One fresh synthetic loopback descriptor used `127.0.0.1:54386` and a unique `_test` name; temporary bind/release established an unused port. **No live database was claimed, no PostgreSQL cluster/database was created, and no SQL or database network connection occurred.** Profile/cache/temp/npm configuration context remained inside the fresh owner-private evidence root; no OpenSSL configuration/RANDFILE/system setting was changed. Selected existing primary MSYS2 UCRT OpenSSL remained PE metadata3.4.0/SHA256 `f692b19a446f921b81200b62829ddb90338fd3d125d83eee1e11d38ffd5a3168`; no version/help/smoke/fallback executable was run.

Actual wrapperPID **14548**, birth **639283765172463629**; actual workerPID **15292**, birth **639283765190479322**, parent14548. Worker timing **18:21:59.040Z–18:22:56.102Z (57.062s)**, natural **exit0, signal null, spawnCode null**. [Actual independent exit receipt](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/exit.receipt.json>) and [fsynced completion](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/completion.json>) were durable **before analysis**. Outer wrapper independently exited0; [post-exit analysis](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/analysis.receipt.json>) also confirms unchanged tracked helper/guard. There was exactly one invocation, zero retries and no extra OpenSSL command.

| Original OpenSSL stage | Actual PID | Exit / signal / spawn code |
| --- | --- | --- |
| CA EC key |5904|0 / null / null|
| CA certificate |11560|0 / null / null|
| Leaf EC key |13740|0 / null / null|
| CSR |10772|0 / null / null|
| Leaf signing |14708|0 / null / null|

[Worker result](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/worker-result.json>): helper SUCCESS, consistency/access/certificate checks PASS; **first primary error null, healthy telemetry**. Actual unchanged helper return proves its X509 parse/SPKI/final-settings path completed; these internal crypto operations are not falsely represented as separately intercepted stages. The five original algorithms/CA/leaf properties and chmod operations were not weakened.

The observed [single ACL initializer](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/boundary-002-acl-init.json>) confirms new empty directory only, nonrecursive/no `/T`, owner FullControl/inheritance, one ACE, zero foreign/deny ACEs, parent ACL unchanged. [Boundary-ready proof](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/boundary-006-ready.json>) confirms harmless probe closed/removed and target empty before mkdir returned. Security ready timestamp **1792779726139000000ns** precedes first TLS write **1792779729623000000ns**. **Initialization count1; ACL mutations after generation started0.**

**All50 read-only role/access snapshots passed.** All seven final material roles have matching owner, present/non-null DACL with **one effective owner read/write ACE**, zero foreign/deny ACEs, no reparse point, ordinary Archive attributes and successful actual Node R+ open/close without data I/O. Final sizes: CA key246, CA certificate676, leaf key246, leaf certificate708, CSR362, extensions202, serial42bytes. Probe absence after its intentional removal was checked phase-specifically, not confused with a missing required material file.

**All14 Node certificate booleans passed:** CA flag/self-issuance/self-signature; non-CA leaf, issuer/signature consistency; expected localhost/127.0.0.1 identity; current CA/leaf validity; EC prime256v1 keys; leaf private/public match; derived SPKI/settings consistency. Only the newly generated leaf key was read in memory for public-key matching and its byte buffer zeroed. No key/certificate contents or pins were displayed, no key bytes were hashed for a manifest, and no historical key contents were read.

### Cleanup and historical preservation

Successful material is retained privately at the actual worktree `.local/native-production-tls-069ac669-c32f-4bfd-92f8-cb3c766fa738`, owned exclusively by this new run. Cleanup status **NOT_ATTEMPTED_SUCCESS_RETAINED** preserves original success semantics, not a deletion claim. All five synchronous OpenSSL children and the original worker/wrapper exited naturally; exact PID+birth tuples are gone, no run-owned process/listener remains,54386 is closed, and no termination was needed. No PG/web/SMTP/browser service was started or stopped. [Independent cleanup/preservation proof](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/parent-cleanup-preservation.json>).

All six historical PG/native evidence sets, recovery hashes and113 nonsensitive files from the successful section18 diagnostic match. All eight historical worktree states and both generated-file hash pins match;47 migration/source inputs remain identical. Original TLS directory/six empty-DACL files retain exact SDDL, attributes, size and normalized UTC creation/write timestamps; all seven section18 material files likewise retain exact metadata. Neither historical set was repaired, recreated, deleted, read for key content or used for this verification. Prior clean PG physical ID7699787984739895532 remains state1; unrelated3000/PID6872 and5432/PID6864 listeners remain unchanged. Audit failures/remediation, Catalog Reset failures, unexplained Library failure, A1 hydration timeout, original native TLS FAIL1 and successful controlled diagnostic remain preserved within their original scopes.

### Interpretation and recommendation

The demonstrated unsafe run-owned behavior is eliminated in the corrected harness: initialization is synchronous on the verified new empty target, and observation no longer changes TLS ACLs. This focused run establishes **actual unchanged-helper execution at the original A2 cwd WITH harness-installed Windows ACL initialization**, not unassisted canonical execution, full E2E acceptance or conclusive reconstruction of the original masked cause. It strengthens the observer/access-policy hypothesis without claiming its exact first failing operation is proven. Metadata checks do not establish adversarial same-SID race immunity, PostgreSQL17/Linux parity, hosted TLS/SMTP or browser behavior.

**GO to request separately authorized canonical Native E2E verification using the reviewed corrected run-owned orchestration.** No native execution follows from this recommendation. Before that future launch, review the exact runner-only preload/transport so it preserves `pnpm test:e2e` with **no script-selection arguments**, the original20-case default and enabled V4 eight-case phases, unchanged guards/assertions/deadlines/retry0, and no preload leakage into Playwright/web/mail children. That transport and full canonical execution are **NOT RUN here**; [future approval boundary](<../.local/v6a-a2-tls-harness-792d0546-c79c-4cf0-aa50-6a309b728ab0/future-native-approval-boundary.md>). A separately approved native run also needs its own independently verified fresh PostgreSQL resources and normal migration/evidence/cleanup gates; no historical or current TLS/DB resource is to be silently reused.

Required default20 and test-only V4 eight-case suites remain **NOT RUN**. **A2 commit/Draft PR publication remains NO-GO** until required native gates and remaining approval criteria are actually satisfied. STOP after this receipt/report. No further TLS attempt, Playwright/native E2E, application/fixture/dependency/migration change, SQL integration, hosted access, V4 activation, staging/commit/push/PR/merge/deployment or A3 work is authorized automatically.

## 20. A2 final canonical Native E2E authorization — STOP at required PostgreSQL identity gate (2026-10-24 UTC)

### Authorized scope, source identity and actual outcome

The maintainer separately authorized ONE complete canonical `pnpm test:e2e` production-native run, **conditional on strict runner-only preload safety, independently owned fresh PostgreSQL and fresh/repeated migrations passing first**. This is validation only. Worktree remains `E:\TaleAtlas-v6a-catalog-filters`, branch `fix/v6a-catalog-filters`, HEAD `4791c0373588aef9a6895049d2def67fc045a1c1`; both local and observed remote main matched that baseline. Same seven A2 candidate paths, empty index and exact Vitest4.1.12 are preserved. Only this receipt is appended to tracked files; all preceding1048 lines are an exact unchanged prefix.

**NO-GO: required PostgreSQL initial OS-identity gate failed. Canonical E2E was never invoked.** Official initdb and pg_ctl start exited0, but the guard observed a server parent-PID mismatch and bootstrap exited1. Dependent database creation, migrations, TLS preparation and both browser phases stopped. No retry, source fix, assertion/timeout change, development fallback or failed-guard waiver followed. Successful later **cleanup-only ownership verification does not change the initial gate FAIL into PASS**.

All already completed matching gates were reused, not rerun: units2112/2112, focused159/159, SQL332/332, Catalog74/74, geometry64/64, generation/no-drift/fresh-repeat prior migrations, audits0, lint/typecheck/build/frozen installation. Current metadata confirms the same12 native/config inputs, existing production build ID `CkGwXiF8exeSsIdU-6fjd`, exact installed dependency graph and installed matching browser cache. No tests, audit, build, generation, dependency installation/upgrade or browser launch was performed to obtain that identity proof.

New independently owner-private run root: [canonical validation evidence](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/>), OWNER `18b03d02-8212-4d86-af0c-d2ff8704ec80`. [Canonical code freeze](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/canonical-freeze.json>) binds18 code/PG-preparation entries before cluster creation; [pre-E2E stop decision](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/pre-e2e-stop.json>) records actual NOT RUN boundaries.

### Mandatory runner-only preload/transport review: PASS before cluster creation

The section19 frozen installer was reviewed and copied **byte-identically into the NEW run root**, never executed through the old focused worker. Core SHA256 remains `d849941f2df8e87db097f673567691fb2ea11ecacd9d137e4179890468584ddb`; initializer `37c4ae9f02efe156be09f65731b9211e38618a57f660ed2b8473d0e44fa3581c`; read-only ACL observer `04adf21cbefd873adbc79cc4b65eae201e3c064fff0b8f4b218c160635eb207c`. Existing helper SHA256 `2ac7b8e47048c578ffdbb5c49089c54c2b8946a482d92cc60cc43e26a4c52f85` and real DB-guard SHA256 `dd3be4bc6284976218e93b6f50302333c5e0954636a0470e37926e8d16e026be` remain unchanged. Historical unsafe observer and all retained TLS artifacts were preserved and never relaunched or repaired.

A new ignored [runner bootstrap](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/runner-bootstrap.mjs>) supplies the canonical transport; SHA256 `08a45ba37b00511d0838cbc089437778a7a2f4769486f85d04763cf3997d13b1`. Static imports are Node-core only. The transport bootstrap also loads as a **no-op in the hash-bound PNPM carrier**, but imports/installs the ACL boundary **only in the actual main-thread native runner** after exact entry-realpath/cwd/zero-script-args/OWNER/private nonce/current-SID/nonreparse/source/hash checks. Loader workers return before boundary import; unknown main entries fail closed. This is not the claim that every bootstrap load occurs only in the runner.

Only child-local `NODE_OPTIONS` receives the owned import token. Before entry/module/helper evaluation, the runner restores the approved original **byte-exact value AND presence** and removes only the two owned controls. Baseline NODE_OPTIONS was absent; no legitimate approved option was erased or replaced. The source's optional memory handling remains intact; no heap opt-in was added. Original helper's intended trust setup remains unchanged: runner startup rejects preseed TLS values; source alone supplies fresh certificate directory/CA/SPKI to the intended Playwright/web/STARTTLS consumers. No NODE_EXTRA_CA_CERTS disablement, reject-unauthorized0, global ignoreHTTPS shortcut or source/configuration patch was used.

Actual boundary hooks remain process-local fs/promises mkdir/writeFile/chmod/readFile/rm and child_process.spawnSync, restricted by exact new UUID ownership/security guards; unrelated FS operations delegate unchanged. They do not hook assertions, authentication, network behavior, application logic or module resolution. Shared builtin bindings are synchronized before helper import. Runner-only phase spawn observation is separately synchronized for its named import; it checks exact original production config arguments, zero filters, original options/environment object identities, absent owned preload/controls, original Node options, phase V4 flag and intended CA/directory/SPKI booleans, then delegates unchanged. No ACL preload is passed to Playwright workers, Next.js, mail, OpenSSL or unrelated descendants. The old asynchronous recursive ACL observer is absent.

Reviewed [canonical supervisor](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/canonical-launcher.mjs>) SHA256 `43b0c9f85d4f932b6da83a3cdbfe4c18b3a6e6473d181fd20e675a8d99a7c2f9` would execute exactly Node→Corepack PNPM argv `[<existing pnpm.js>, "test:e2e"]`, assert the unchanged repository script, use production mode/CI unset/retry0 and no script CLI arguments, retain independent child/phase exits, and stream original stdout/stderr privately before durable-close analysis/sanitized copies. The separately reviewed new OS observer is strictly read-only with final native-port closure evidence; it contains no ACL operation or termination. **Neither canonical supervisor nor actual runtime branch was executed.**

Two **metadata-only, pre-entry exit** proofs were completed without evaluating the native entry/helper or installing the boundary. Direct `pnpm exec node --import tsx scripts/test-e2e.ts` proved carrier16352→runner3916. A new private package's `scope-proof` lifecycle script (`cd /d A2 && node --import tsx scripts/test-e2e.ts`) exercised PNPM's normal script-shell route, proving **carrier15380→CMD9516→runner12804** with live PID/birth/current-owner chain. [Shell-route proof](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/script-shell-metadata-summary.json>) and [pre-entry proof](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/script-shell-metadata-proof.json>) record actual A2 cwd/entry, zero script arguments, exact option restoration, controls absent,22 source hashes matching, helper/boundary/entry not evaluated, TLSops0 and E2Einvocations0. No `pnpm test:e2e` was used for metadata proof. Existing installed Corepack code cache3524 files matched before/after; network/downloads/installation were disabled, while profiles/npm configs/TEMP stayed private. Matching installed browser-cache metadata was read only; no browser was launched or downloaded.

Independent bounded code reviews passed for the strict transport and conditional PG lifecycle. A preparation-only PowerShell comparison grouping error in an ad-hoc metadata freeze verifier was preserved and investigated against identical actual TLS names; a corrected read-only comparison passed before authorization. It was not a TLS, PG lifecycle or E2E retry. Actual executable transport/code hashes were re-frozen after the separate shell-route proof and necessary diagnostics/cleanup-evidence fixes, before PG creation.

### One fresh cluster initialization, then required startup identity FAIL

Only after transport PASS and frozen hashes, the parent independently verified current OWNER/SID, physical/no-reparse root and PG preparation paths, sole-owner FullControl/non-null DACL **before invoking bootstrap or its first output/ONCE writes**. Cached official native postgres/initdb/pg_ctl metadata and three safe version CLIs established **PostgreSQL18.4 Windows**, not PG17/Linux parity. New PG-preparation [frozen helpers](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/frozen.json>) SHA256 `61de8baccfbd2b96afe5d588f99bba56c3914883663e67d2ee2d229b770cc00a`; [independent prewrite ACL proof](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/parent-pg-prewrite-acl.json>). Actual migration-command/config/workspace/lock and47 source inputs were bound unchanged separately; no migration/config/schema edits occurred.

ONE official initialization/start used new data UUID `bf77af57-ab4f-4c98-b593-d905376bf125` below this private root, fresh generated private role/password, UTF8/no-locale/scram and exclusively bound/rechecked high loopback port **54363**. No operator or hosted DSN/credentials were inherited. Fresh physical cluster ID **7700018932485641388** differs from all six protected historical IDs. `initdb` exited0. Official `pg_ctl -D <exact NEW data> -l <private log> -o "-h 127.0.0.1 -p 54363 -c unix_socket_directories= -c password_encryption=scram-sha-256" -w -t 60 start` exited **0/null**, PID **9488**, timing **00:06:12.345Z–00:06:12.729Z**. Server log independently records readiness.

The next required initial OS proof exited **1** at `os-proof.ps1:86`, fixed guard **SERVER_CREATION_PARENT**: its recorded pg_ctl start PID was9488, whereas actual new PostgreSQL serverPID **4636**, birth **639283971724355876** / **00:06:12.4355876Z**, had observed OS parentPID **12664**. [First OS guard failure](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/os-first-guard-failure.json>) and [first bootstrap stack](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/first-guard-failure.json>) preserve the exact condition and source locations. [Start child receipt](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/pgctl-start.exit.json>) is independent of wrapper interpretation. Parent bootstrap exit was **1**. The failed initial gate was not edited, waived, retried or replaced; initial accepted identity/target authorization were never issued.

This establishes a concrete observed process-parent mismatch, **not its underlying Windows process-launch cause**, and does not establish an application, migration, TLS or test defect. No unsupported intermediary-process explanation was accepted as proof. Source parentage assumption and actual launch chain require separate future review/authorization before any new attempt.

| Required stage | Actual result |
| --- | --- |
| Runner-only transport safety | PASS static + metadata-only scope proof |
| New official initdb | Exit0 |
| New official pg_ctl start | Exit0 / signal null |
| Required initial OS identity | **FAIL1 SERVER_CREATION_PARENT** |
| Bootstrap supervisor | **Exit1** |
| Fresh synthetic `_test` database | **NOT CREATED** |
| Fresh migration / applied count | **NOT RUN / none** |
| Repeat migration / fingerprint check | **NOT RUN** |
| Canonical `pnpm test:e2e` invocation | **0; NOT INVOKED** |
| Canonical TLS/OpenSSL preparation | **NOT RUN** |
| Full default production-native suite | **NOT RUN; not collected/executed** |
| Full test-only V4 suite | **NOT RUN; not collected/executed** |
| Native/Playwright phase child exit | **No such child was launched** |

The historical20/8 test inventories are not reported as current collected totals or as skipped/passing cases. Section19's five OpenSSL/14 certificate/50 ACL checks remain a preserved **prior focused PASS**, not a new canonical result. No HTTPS, mail, browser or Playwright fixture was started; no real/native TLS material directory was created by this authorization.

### Independent cleanup-only identity and clean shutdown: PASS

After failure, a separate parent cleanup-only investigation proved the exact newly created resource without pretending the original parentage guard passed: same private data UUID/owner/nonreparse paths, matching postgres executable SHA256 `becadfa646f4576467452ec94c513b1414e8bfeedc36f63e94d37c55219206ff`, exact `-D` argument, PID4636/exact birth within the recorded launch window, sole127.0.0.1:54363 listener and same new physical control ID. A read-only exact-PID/birth/SID x64 PEB CurrentDirectory query proved **actual OS CWD equals the NEW data directory**, without environment-block access or process writes. Separate read-only SQL on that freshly verified cluster matched systemID/role/host/port/data/version; non-template database catalog contained **ONLY postgres**, confirming no synthetic target was created. [OS ownership](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/parent-emergency-os-ownership.json>), [CWD](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/parent-emergency-cwd.json>) and [read-only SQL](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/parent-emergency-sql-readonly.json>) proofs are explicitly labeled cleanup-only, not original acceptance.

A separately hash-bound/reviewed cleanup-only supervisor rechecked live SQL and exact OS PID/birth/SID/executable/hash/data/physical-ID/listener, then invoked **ONLY** official `pg_ctl -D <exact NEW data> -m fast -w -t60 stop`, once. Actual stop childPID **16036**, **exit0/signal null**, cleanup supervisor exit0. No process-name-wide termination, historical action, forced kill, recovery, deletion or validation retry occurred. [Actual stop receipt](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/owned-postgres/parent-emergency-stop.exit.json>).

Independent post-stop proof confirms unchanged physical ID **7700018932485641388**, clean control state **1**, original PID+birth absent,54363 closed, postmaster.pid absent and database-system-shut-down log entry. All data/logs/private evidence are retained. Native fixture port1026 is free, no owned test/preload context remains, parent NODE_OPTIONS remains absent, and unrelated3000/PID6872 and5432/PID6864 listeners were untouched. [Final cleanup/preservation](<../.local/v6a-a2-canonical-native-82bcdb63-f3a7-4c03-ad0c-c81eb4ae9632/parent-final-cleanup-preservation.json>).

New server log contains normal startup/checkpoint and requested-fast-shutdown records, including a logical-replication-launcher exit1 during that shutdown sequence; this is not a browser/test result. No ERROR/FATAL/PANIC entry appears in the observed13-line log. Historical original Library failure, masked native TLS failure and prior155 forced-client LOG uncertainties remain preserved/unexplained within their prior scope; this idle fresh cluster did not reproduce or resolve them.

### Preservation, review boundary and recommendation

All six protected historical PG/native evidence sets, recovery files,113 nonsensitive successful-diagnostic hashes and123 corrected-harness evidence hashes match. All eight historical worktree states and two generated-file pins match. Original TLS directory/six empty-DACL files, seven successful diagnostic material files and section19's focused directory/seven files retain exact owner/DACL/attributes/size/normalized UTC timestamps; none were repaired, deleted or read for key/certificate contents. Prior focused harness/source hashes and actual migration-command/config/source bindings remain unchanged. The old observer was not invoked, no raw PEM/key/SPKI/cookie/secret DSN was published, no dependency/source/config/fixture modification or hosted connection occurred.

The final seven-path identity and empty index are preserved; only this append changes tracked bytes in this authorization. **The conditional full read-only pre-commit candidate review was NOT performed because mandatory local E2E gates did not pass.** No certificate, private harness, PostgreSQL data or generated report is staged, and the browser helper remains untracked/unstaged. No publication-readiness claim follows from scope preservation alone.

**NO-GO for a scoped A2 commit and Draft PR. STOP.** Required default and V4 production-native phases remain NOT RUN. Review the preserved new startup parentage failure and propose any necessary private-orchestration correction separately; neither a new cluster/run, failed-guard relaxation, fallback nor E2E retry is automatic. Browser-UI200% zoom, assistive-technology certification, PG17/Linux parity, hosted SMTP/TLS acceptance, hosted V4 activation and GitHub candidate CI PASS remain unverified. No staging, commit, push, PR creation, merge, deployment, CI workflow change, A3 work or other implementation is authorized by this report.

## V6A Batch A3 — My Requests information hierarchy (V6A-04)

**Local candidate receipt — 2026-10-24.** Baseline `e42fb9212e0a34008a6ca1a24cfd80129d4164f4`, branch `fix/v6a-my-requests`. Implementation only; no staging, commit, push, PR, deployment or hosted operation. Completed-batch CI/deployment/validation investigations were not reopened.

### Exact five-file scope

- [Requests page](<../apps/web/src/app/[locale]/requests/page.tsx>): semantic header with existing localized edit-suggestions and Request a Story links in original keyboard order; independently named owned/followed sections; page-local message/pagination classes.
- [Request styles](<../apps/web/src/components/requests/request.module.css>): all new rules opt in through `.myRequests`; header/action wrapping, local heading line heights, section/card/list/message/pagination spacing and narrow-screen wrapping. Shared forms, notices, detail views and globals retain their existing rules.
- [My Requests page units](<../tests/unit/my-requests-page.test.tsx>): 49 new controlled async server-page cases with the actual page/cards/actions; no jsdom pixel-geometry assertion.
- [Request browser spec](<../tests/e2e/requests.spec.ts>): two separately bounded EN/VI layout cases for 375/768/1280/1440px and light/dark, empty and populated. An in-file fixture factory reuses original real SMTP verification, cookie sign-in, scoped proxy contexts and guarded cleanup. Four synthetic requests per locale; no large pagination fixture.
- This ledger: append-only A3 results and limitations; historical prefix preserved.

No backend/API, auth policy, schema/migration, dependency/lockfile, workflow, browser configuration or Vercel changes. No Request Form redesign, provider activation or hosted V4 activation.

### Actual bounded local results

| Command / gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, exit 0; lockfile unchanged |
| New and directly related request units | 89/89 PASS across 4 files, exit 0; includes 49 new cases |
| `pnpm test` | 2161/2161 PASS across 73 files, exit 0 |
| `pnpm typecheck` | PASS, exit 0; includes browser-spec compilation |
| `pnpm lint` | PASS, exit 0 |
| `pnpm build` | PASS, exit 0; optimized production build completed |
| A3 browser layout/native E2E | **NOT RUN** |
| SQL integration/migration execution/fresh audits | **NOT RUN in this bounded A3 local pass**; no new PASS inferred |

Focused command: `pnpm exec vitest run tests/unit/my-requests-page.test.tsx tests/unit/request-ui.test.ts tests/unit/request-return.test.ts tests/unit/request-review-history.test.tsx`.

Focused and full unit runs completed once; full units/typecheck/lint/build each completed one successful pass. No assertions, timeouts, workers or retries were relaxed. Independent read-only review found no blocking candidate findings. Static token comparison confirms the original browser lifecycle helper/assertion span, real signup body and guarded cleanup body are unchanged; original 360s scenario deadline and zero retries are preserved. This is static preservation proof, not browser acceptance.

### Privacy, pagination and evidence boundary

Session guards, force-dynamic/noindex metadata, data services, 20-row pages, `Number(value)` normalization/bounds and independent `page`/`followedPage` URLs are unchanged. Both-locale DOM tests cover default/invalid/bounded/out-of-range pages, retention of the other page parameter, separate error/empty states and no list reads after absent/failed session. Owned lists exclude private notes/evidence/history; nullable followed summaries never fall back to private data and keep existing unfollow. Mocked-service units do not independently prove real authorization or SQL isolation.

The authored browser cases measure actual boxes and text fragments after font readiness, containment/spacing, overflow, long-title wrapping, actual Tab order, theme selection, redacted summaries and persisted unfollow behavior. **They have not executed locally.** No already-working approved disposable browser/database environment was supplied for this isolated worktree, and no ambient database URL was present. No service bootstrap or Windows Observer/TLS/ACL/PostgreSQL provenance investigation was attempted. No Playwright execution, screenshots, real-browser geometry or real-session A3 PASS is claimed. Browser runtime/deadline sufficiency remains unverified until independent execution.

Actual 200% browser-UI zoom, rendered contrast and assistive-technology combinations remain unverified. No WCAG certification or hosted SMTP/TLS/runtime/production acceptance is claimed. Hosted V4 is not enabled by this work.

**Decision:** GO for one separately authorized scoped local A3 commit based on passing bounded local gates. This does not authorize committing now, publishing, merging, deployment, or waiving independent Linux browser/SQL/security CI and any claimed manual acceptance. Unexecuted checks remain NOT RUN.

## V6A Batch A4 — Progressive Request a Story form (V6A-06)

**Local implementation receipt — 2026-10-24.** Baseline `f919c78b8c5a090dcc3dd1201079e02376e9b614`, branch `fix/v6a-progressive-request-form`. Exact approved six-file scope; no staging, commit, push, PR, merge, deployment or hosted operations. Earlier-batch CI/results and Windows infrastructure were not revisited.

### Scope and implemented behavior

- [NewRequestForm](<../apps/web/src/components/requests/NewRequestForm.tsx>): native details/summary with always-visible required title/format, valid UNKNOWN, existing disclaimer, error summary and submit outside optional details. Both create/edit start collapsed for blank/whitespace-only optional data or title-only prefill, expanded for any populated optional value. All ten optional controls remain mounted and enabled when collapsed; normal user toggle state survives rerenders/errors. No draft storage, new route or wizard.
- [Request styles](<../apps/web/src/components/requests/request.module.css>): new rules exclusively under `.progressiveForm`; grouped basic/optional controls, responsive fields, full-width multiline controls, long-label wrapping and inherited theme colors. The pre-existing stylesheet prefix is byte-identical; unrelated request screens/forms/cards/actions retain their rules.
- [Request dictionary](<../apps/web/src/lib/request-i18n.ts>): additive flat EN/VI strings for grouping, hints and field errors, preserving existing field labels/options. Notes are described as excluded from public request summaries, not as visible only to their owner.
- [Request UI units](<../tests/unit/request-ui.test.ts>): original 22 cases/assertions retained; 41 progressive cases and one HTTP-500 sanitization case added, 64 total. Cover both locales/create-edit initialization, collapsed FormData/POST/PATCH retention, disclosure state, schema/native-invalid reveal, localized error associations, IDs, retained inputs/retry keys and existing private-summary boundaries.
- [Request browser spec](<../tests/e2e/requests.spec.ts>): adapt original optional editing to open the disclosure, retaining prior assertions/deadlines/retries; add two EN/VI cases, one verified synthetic actor and one real create/edit pair per locale. Authored keyboard/native-invalid/schema/draft/payload and 375/768/1280/1440px light/dark create/edit geometry coverage. These cases were not executed locally.
- This ledger: A4-only append; historical content remains byte-identical.

### Accessible validation and preserved contracts

Stable React IDs connect labels, relevant help and localized field errors. Native invalid capture opens optional details synchronously before native focus without preventing the invalid event, setting custom validity or disabling constraints. Schema failures reveal optional fields before single-field focus; multi-field errors have focusable summary links. Global payload/transport/conflict/server failures remain sanitized and visible outside the disclosure. No raw backend response or diagnostic text is rendered.

Static token comparisons confirm unchanged optional field names/limits, trimming/blank omission/alternative-title parsing, UTF-8 12000-byte condition, UUID/retry and revision payload construction, POST/PATCH endpoint/method/headers/body, sanitized HTTP mappings and success navigation. The shared schema, authenticated route wrappers, dependencies/lockfile and test configurations match their baseline hashes. Actual units verify controlled UI/payload behavior; they do not independently prove real authentication, SQL isolation or browser keyboard behavior.

### Observed bounded local verification

| Gate | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, exit 0; frozen graph unchanged |
| Focused request form and related units | 82/82 PASS across 3 files, exit 0; includes all 64 request-UI cases |
| `pnpm test` | 2203/2203 PASS across 73 files, exit 0 |
| `pnpm typecheck` | PASS, exit 0; includes browser-spec compilation |
| `pnpm lint` | PASS, exit 0 |
| `pnpm build` | PASS, exit 0; optimized production build completed |
| Local browser/native E2E | **NOT RUN** |
| Local SQL integration/migrations/fresh audits | **NOT RUN in this bounded local pass**; no new PASS inferred |

Focused command: `pnpm exec vitest run tests/unit/request-ui.test.ts tests/unit/request-return.test.ts tests/unit/request-review-history.test.tsx`.

Frozen install, focused run and each full gate completed once successfully. No assertions, workers, timeouts or retry policies were weakened; no successful full gate was repeated. Independent read-only source review found no blocking candidate findings. No API/auth/service/schema/migration, dependency, CI workflow, Vercel or global-style changes. No hosted SMTP work or V4 activation.

### NOT RUN boundaries and decision

No approved already-working disposable browser/database environment was supplied, and ambient database URLs were absent. No browser/service bootstrap, Windows Observer, PostgreSQL provenance, ACL, TLS or historical harness investigation was attempted. New real-session browser tests remain for independent GitHub Linux CI after separately authorized publication. Authored coverage and jsdom validity/invalid-event checks do not establish actual browser focus timing, keyboard traversal, layout geometry or theme rendering. Browser case runtime/deadline sufficiency is unverified.

Actual 200% browser-UI zoom, rendered contrast, assistive technology, hosted SMTP/TLS/runtime and production behavior remain unverified. No WCAG certification, CI PASS, real database/privacy acceptance or application deployment is claimed. Existing mandatory CI/security/integration/browser gates are not waived.

**Decision:** GO for one separately authorized scoped local A4 commit based on this bounded local evidence. No commit is authorized by this receipt itself; no publication, merge, deployment or hosted activation. Browser/manual and other unexecuted checks remain NOT RUN.

## V6A Batch A5 — V6A-07 honest empty/error states (local implementation)

- Worktree: `E:\TaleAtlas-v6a-empty-error-states`.
- Branch: `fix/v6a-honest-empty-error-states`.
- Exact approved main baseline and unchanged HEAD: `96762d9d64179173f154d71adc94434ea58f68f5`.
- Evidence applies to this uncommitted A5 working-tree change, not to a published commit, GitHub CI or a deployed system. No earlier-batch revalidation or diagnostic-history review was performed.

### Exact approved changed-file inventory (11)

```text
apps/web/src/app/[locale]/works/page.tsx
apps/web/src/components/catalog/PublicCatalog.tsx
apps/web/src/components/catalog/query.ts
apps/web/src/app/[locale]/library/page.tsx
apps/web/src/components/library/copy.ts
tests/unit/catalog-discovery-ui.test.tsx
tests/unit/library-pages.test.tsx
tests/unit/public-catalog-page-states.test.tsx (new)
tests/e2e/advanced-discovery.spec.ts
tests/e2e/library-pagination.spec.ts
docs/V6_VALIDATION.md (this append only)
```

### Implemented behavior and contract limits

- Successful catalog zero without restrictive criteria: approved EN/VI no-published-works copy, with one localized request action using the existing guarded route. Zero matches with search/format/genre/original-language/release-status criteria: approved no-match copy and native Browse All Works, preserving the existing unique Clear Filters action. Blank search and page/page-size alone are not restrictive. Nonblank searches retain their existing request prompt and prefill; no duplicate request action is added. Blank-query filtered results do not acquire a new request CTA.
- Existing nonzero-total catalog empty-page recovery, query invalid notices, form GET behavior, pagination limits and locale behavior remain intact. The entire catalog query module prefix before its copy object is byte unchanged: no parser, schema or URL-builder modification.
- Private library: zero matches with status or any defined favorite (including false) are filtered empty; unfiltered zero is genuine current-library empty; nonzero total with no requested-page items is empty-page with native first-page recovery preserving status/favorite/sort. Sorting/page alone are not restrictive. The existing owner-scoped result total is used; no runtime/service count query was added.
- Primary catalog/library load failure is an explicit null failure branch, not a fabricated empty DTO, zero count or empty array. Approved sanitized EN/VI load messages have native GET retries using existing validated-query URL builders. Invalid catalog requests retain the existing fallback notice; retry uses the same validated/defaulted query that was sent to the service, rather than replaying invalid raw parameters. Secondary request-summary failure remains isolated from successful catalog cards/counts.
- Unresolved library guard access remains before private parsing/read, with approved neutral access-unconfirmed copy, verified-account guidance and a native retry to the existing safe local destination. No assertion of definite sign-out or backend outage. Guard/service/auth/verification contracts and redirects are unchanged.
- Empty sections are ordinary named semantic content, not alerts. Actual failures are sanitized alerts; existing loading/status semantics and generic error boundary are untouched. Existing CSS, focus/theme and wrapping patterns are reused; no new style, dependency, shared abstraction or route. No invented records/ratings/statistics or private diagnostic values.
- Browser coverage is additive to existing real fixtures/accounts: catalog EN/VI filtered-zero and nonzero empty-page recovery; fresh verified-owner library empty before the existing seed, favorite=false and sort-only distinctions, nonzero empty-page recovery and locale-preserving links. Existing assertions, mutation/privacy projections, deadlines/retries and guarded cleanup remain. Shared public data is not assumed globally empty. Responsive/theme/focus checks are authored, not observed runtime results.

### Actual bounded local validation

| Check | Actual outcome |
| --- | --- |
| Node / pnpm | 24.19.0 / 11.7.0 |
| Frozen installation | PASS; exact lockfile reused, dependency manifests/lockfile unchanged |
| Initial focused three-file unit run | 195 passed, 2 failed, 197 total; two English list copy checks compared raw HTML substrings rather than rendered alert text |
| Focused correction | Same approved messages retained; those checks now assert semantic alert text, preserving private-read denial and raw-error non-disclosure assertions. Only the affected library-page unit file rerun: 59 passed, 0 failed |
| Final focused coverage inside actual full run | PASS: 197 passed, 0 failed across the three A5-focused files |
| Full unit suite, one execution | FAIL: 2295 passed, 4 failed, 0 pending, 2299 total across 74 files |
| Isolate only current failed files, unchanged settings | FAIL: 43 passed, 5 failed across 2 files; no consumer/config/assertion/deadline/retry change |
| Typecheck | PASS; `pnpm typecheck`, exit 0, one execution |
| Lint | PASS; `pnpm lint`, exit 0, one execution |
| Production build | PASS; `pnpm build`, exit 0, one execution, explicit production/compile-only loopback environment |
| Scope and preservation checks | PASS; exactly 11 approved paths, catalog parser/URL prefix byte unchanged, all original browser lines preserved in order, historical ledger byte prefix exact, no staged changes |
| Independent read-only scope/contract review | NoBlock; source review only, not test or browser certification |
| Native browser / responsive / real auth / real SSR database outage | NOT RUN; no approved functioning disposable native environment available. No Windows/PG/TLS/ACL restart or hosted fault injection attempted |

Executed commands (result/log receipts remain ignored locally, not published):

```text
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/catalog-discovery-ui.test.tsx tests/unit/library-pages.test.tsx tests/unit/public-catalog-page-states.test.tsx --reporter=json --outputFile=.local/v6a-a5-focused-unit.json
pnpm exec vitest run tests/unit/library-pages.test.tsx --reporter=json --outputFile=.local/v6a-a5-library-fixed-unit.json
pnpm test --reporter=json --outputFile=.local/v6a-a5-full-unit.json
pnpm exec vitest run tests/unit/library-entry-revision-scope-ui.test.tsx tests/unit/library-personal-ui.test.tsx --reporter=json --outputFile=.local/v6a-a5-failed-files-isolation.json
pnpm typecheck
pnpm lint
pnpm build
```

The production build uses explicit production mode and compile-only synthetic loopback configuration; it does not start a DB/SMTP/TLS service, prove a backend connection or constitute browser/production acceptance. No raw errors/stacks, screenshots, traces, credentials or private payloads are published here. Existing generic boundary behavior is not replaced, and browser API interception is not presented as proof of an SSR database outage.

### Remaining blocker and decision

The actual full suite failed in these unchanged files, outside the authorized A5 edit inventory:

```text
tests/unit/library-entry-revision-scope-ui.test.tsx
tests/unit/library-personal-ui.test.tsx
```

The full-run failed identities cover EN sibling revision fencing, EN/VI all-nine personal-rating mapping, and EN nullable rating/empty-note clearing. The isolated run additionally failed VI sibling fencing; its clearing failure was VI rather than EN. Causes remain unconfirmed. Untouched source does not prove that a failure is pre-existing, unrelated or harmless. These files and their controls were not changed, no assertions were skipped/weakened, and no timeout/retry was altered. No further unit/config attempts or out-of-scope fixes were made.

**NO-GO for an A5 commit while the full-unit gate remains failed.** Maintainer assessment/separate authorization is needed before expanding investigation or changing these consumers. Browser coverage remains NOT RUN for independent Linux execution only after separately approved publication. No commit, staging, push, PR, merge, deployment, hosted service operation, V4 activation or cleanup occurred. All historical ledger content is preserved before this append.

## V6A Batch A6 — V6A-08 session/header stability (local implementation)

- Worktree: `E:\TaleAtlas-v6a-session-header-stability`.
- Branch: `fix/v6a-session-header-stability`.
- Exact main parent baseline and unchanged HEAD: `1f0df17743a75881146c9793a87cf364f6ebebc3`.
- Evidence applies to the uncommitted A6 working-tree source, not a published commit, GitHub CI, browser acceptance or a deployment. No earlier-batch CI/history, baseline-install or infrastructure investigation was repeated.

### Exact changed-file inventory (5)

```text
apps/web/src/components/shell.tsx
apps/web/src/app/globals.css
tests/unit/ui.test.tsx
tests/e2e/foundation.spec.ts
docs/V6_VALIDATION.md (this append only)
```

### Regression-led evidence, not an observed runtime incident

Before any Shell/style change, only the newly added EN/VI header regression group ran against the exact baseline. It returned 34 expected failures, 0 passes; 23 existing tests were excluded by the explicit test-name filter, not skipped or weakened in source. Functional checks preceded new-wrapper structure checks: pending null/error null snapshots exposed the same-locale Sign-in link; retained cached-admin refetch/error snapshots exposed Settings. Other new cases also specify the neutral SSR/stable-wrapper/retry contract. This is mocked source/DOM evidence, not proof of an actual browser flash, persistent race, live account switch or measured layout shift.

After the presentation-only change, the entire approved UI unit file passed: 57 tests, 0 failed, 0 pending (34 new A6 cases and all 23 existing cases). Existing auth-form navigation ownership, Settings behavior and locale/path/query/hash/Suspense/hydration assertions remain intact. Canonical AST checks verified all original expect-call sequences in both edited test files remain in order (114 pre-existing unit call nodes; 46 browser call nodes; these are call-node counts, not distinct test counts).

### Implemented session presentation matrix

| SDK/presentation state | Header behavior |
| --- | --- |
| SSR / first hydration / incomplete snapshot | Neutral localized checking text, no account-dependent links; no server-session seeding |
| `isPending` or explicit `isRefetching`, including retained cached data | Same neutral noninteractive status, no Sign-in/Settings/Library/My Requests/Admin; branding/Browse/native locale navigation/content remain available |
| Lookup error after pending has completed | Existing sanitized localized session-error copy and a native SDK retry button; neither anonymous assumption nor cached privilege navigation |
| Successful resolved null session | Existing localized Sign-in link |
| Successful resolved session | Existing Settings/Library/My Requests; Admin only for the unchanged existing admin role condition |
| Resolved unverified-session fixture | Remains authenticated for presentation under existing semantics; server verification/authorization remains authoritative |

The installed, locked Better Auth 1.7.7 session atom exposes a first-class `isRefetching` flag, independently of `isPending` when cached data exists. Its error paths may retain cached data. The header now considers those flags/error before using data. It does not infer freshness from timers, alter SDK options/return values or add a provider, custom session cache, polling, redirects, custom authentication transports or navigation effects.

The existing hydration snapshot pattern is reused so SSR and initial hydration stay neutral even when a client hook snapshot already contains cached account data. Existing Providers, Preferences, locale anchor/router helpers and locale Suspense implementations are byte unchanged. Their native locale/query/hash behavior, document-language effect and original navigation order are preserved.

### EN/VI, retry and accessibility

Existing dictionary loading/sessionError/retry strings are reused without dictionary edits. Pending content is noninteractive; errors are sanitized notices with no raw exception text. No name, email, session token or account identifier is rendered in header status. The account/status wrapper remains the same DOM span across transitions.

Normal/background checking uses aria-live off to avoid repeating checking announcements; an explicit user retry announces checking politely. Real errors retain alert semantics. Retry invokes only the existing SDK refetch() with no extra arguments. A synchronous ref lock plus a local in-flight presentation flag prevent duplicate activation, including same-tick clicks. The native button remains mounted/focusable while busy, with aria-disabled and an activation guard instead of disabling away its focus; busy/failure focus and node identity are covered by both locales. Rejected refetch promises are handled without rendering raw errors or inventing another authenticated state. On success, ordinary resolved links replace recovery controls; no automatic focus move is introduced.

Conservative suppression can remove an account link that was focused when a background check begins; retaining it as a valid privilege link would contradict the unresolved-state requirement. There is no programmatic focus jump. Busy retry stability is unit-tested, while actual browser focus behavior across all transitions remains NOT RUN.

### Concrete layout need and evidence boundary

The prior account area was a single link inside a fixed 104px desktop header. It now contains localized multiline checking/error text and an optional retry control. Header-only CSS changes make 104px a minimum instead of a clipping fixed height, allow nav wrapping, and use a shrinking relative 18ch account grid slot with zero minimum inline size, max100%, readable wrapping and a 44px minimum block/control target. Existing mobile minimum/header padding remains; retry hover movement/transition is suppressed only in the header. No non-header CSS rule or broad typography/theme/layout change was made.

Observed unit evidence proves stable wrapper identity, preserved DOM navigation order, neutral SSR/hydration and retry focus while busy/failure. These tests do NOT measure browser geometry. No mathematically zero layout-shift claim is made. Vietnamese wrapping, 200% zoom, pixel bounds, light/dark rendering and conservative-refetch visual movement require an independently executed browser environment.

### Browser regression source — AUTHORED / NOT RUN

The existing foundation scenarios are extended without new accounts, fabricated cookies/session JSON, new infrastructure, altered deadlines/retries or weakened lifecycle assertions. Anonymous EN/VI and the original verified reader's fresh Settings reload hold the real same-origin client GET session request, assert neutral header/public controls, then release the actual request and check the real resolved navigation. The EN anonymous path additionally aborts one client session lookup, checks safe recovery, initiates the real SDK retry and checks busy focus before releasing the real response. That is a client-transport fault scenario, not an SSR/database-outage test.

The route hold is released and the targeted handler removed in finally; pending continuations are drained. Header suppression selectors target exact same-locale account paths, deliberately allowing the native other-locale Settings link to remain usable. Existing registration, captured email verification, sign-in, account identity, logout, protected-route denial, themes, health and metadata assertions remain. Authored 375/768 viewport/focus/order/overflow and safe runtime/hydration error-name checks are not execution evidence.

### Actual bounded local validation

| Check | Actual outcome |
| --- | --- |
| Node / pnpm | 24.19.0 / 11.7.0 |
| Frozen installation | PASS, one execution; dependency manifests/lockfile unchanged |
| Mocked baseline A6 regression group | RED: 34 failed, 0 passed; 23 nonmatching existing tests filtered out; Shell/style/auth source still exact baseline |
| Complete UI file after implementation | GREEN: 57 passed, 0 failed, 0 pending |
| Full unit suite | PASS: 2333 passed, 0 failed, 0 pending, 74 files; one normal full-suite execution |
| Typecheck | PASS, exit 0, one execution |
| Lint | PASS, exit 0, one execution |
| Production build | PASS, exit 0, one execution; production mode with compile-only synthetic loopback configuration |
| Read-only source review / preservation | NoBlock; auth/SDK configuration/Settings/dictionaries/server and test budgets unchanged; original assertions preserved; header-only styling |
| Native browser E2E / visual layout / real auth / SSR outage | NOT RUN; no existing approved functioning disposable environment was supplied or started |
| Actual runtime authentication flash | NOT REPRODUCED; no browser execution authorized through a functioning environment |

Executed commands (receipts/logs remain ignored locally, not published):

```text
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/ui.test.tsx -t "A6 header session presentation" --reporter=json --outputFile=.local/v6a-a6-red.json
pnpm exec vitest run tests/unit/ui.test.tsx --reporter=json --outputFile=.local/v6a-a6-green-ui.json
pnpm test --reporter=json --outputFile=.local/v6a-a6-full-unit.json
pnpm typecheck
pnpm lint
pnpm build
```

The build used explicit production mode and synthetic compile-only loopback DB/SMTP configuration. No database, SMTP, TLS, browser or other service was started, and the build is not backend connectivity or native acceptance evidence. No additional unit investigations/reruns, timeout/retry increases, Windows E2E/PG/TLS/ACL/WSL/Docker setup, hosted operations or private diagnostic publication occurred.

### Decision and remaining limitations

**GO for one scoped local A6 commit only after separate maintainer authorization.** Local required gates passed and the approved five-file implementation is ready for review. This is NOT publication, merge, browser/visual acceptance or deployment authorization. Native browser/layout validation remains NOT RUN, and a real-world flash has not been reproduced or claimed fixed. Independent Linux/native coverage is reserved for separately approved publication. No source outside the approved inventory, auth contract/provider/cache/role policy, SDK, endpoint, dictionary, dependency, schema, workflow, hosted/Vercel/V4 setting or prior worktree was modified. No staging, commit, push, PR, merge, deployment, cleanup or A7 work occurred. All historical ledger bytes precede this append unchanged.


## V6A A7 — Bounded design consistency implementation (2026-10-26 UTC)

- Maintainer-authorized V6A-09 only, in branch `fix/v6a-design-consistency`, worktree `E:\TaleAtlas-v6a-design-consistency`.
- Exact baseline/unchanged HEAD: `5289b4d4f2f49e4f8f45cff608a3a1e30273e11e`. Results below apply to the uncommitted nine-file A7 patch, not a new commit or GitHub CI result.
- Inventory: `apps/web/src/app/globals.css`; `apps/web/src/components/catalog/catalog.module.css`; `apps/web/src/components/library/library.module.css`; `apps/web/src/app/[locale]/library/page.tsx`; `apps/web/src/app/[locale]/requests/new/page.tsx`; `apps/web/src/components/catalog/Discovery.tsx`; new `tests/unit/design-consistency.test.ts`; `tests/e2e/foundation.spec.ts`; this ledger (append only).

### Five corrections and preserved contracts

1. Enabled global primary hover explicitly retains `--green` / `--green-ink`. Catalog native/button-link foregrounds use `--green-ink`; a scoped enabled hover rule wins over the generic button hover. Existing palette, secondary/danger/disabled/focus rules are unchanged.
2. Opt-in `.page-title` reuses utility-heading proportions: `clamp(1.75rem, 4vw, 2.25rem)`, line height 1.25, normal flowing margins and safe wrapping. Only the three Library branch h1s, Request a Story h1 and Discovery h1 opt in. Semantic h1s, localized expressions, Vietnamese serif fallback and unrelated display headings remain unchanged.
3. Library Apply uses the existing `button primary` classes. The native GET action, input names/defaults, serialization, reset/navigation/pagination and submit semantics remain unchanged.
4. Exactly two Library card/widget borders use `--line` instead of undefined `--border` fallback. No new surface, shadow, radius or layout rule.
5. Discovery imports/reuses the Catalog container. Work cards, ordering, dates/citations, navigation, pagination, localized labels and honest empty-state expressions remain unchanged.

### Actual local validation

Node 24.19.0; pnpm 11.7.0. No new dependencies or changes to dependency manifests/lockfile.

| Check | Observed outcome |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, one run; dependency contracts unchanged |
| `pnpm exec vitest run tests/unit/design-consistency.test.ts` before production edits | Expected RED: 12 failed / 16 passed on untouched baseline, establishing the missing contracts |
| Same focused command after corrections | PASS: 28 passed / 0 failed / 0 pending |
| `pnpm test` (full unit suite, one run) | PASS: 2,361 passed / 0 failed / 0 pending, 75 files |
| `pnpm typecheck` | PASS, one run; includes authored browser-test source |
| `pnpm lint` | PASS, one run |
| `pnpm build` | PASS, one production-mode run with synthetic compile-only loopback configuration; no hosted services contacted or provisioned |
| `git diff --check` / scoped formatting | PASS |
| Source preservation / read-only independent review | PASS / NoBlock: exact presentation-only TSX changes, two Library border substitutions, original 100 browser expect-call AST nodes retained in order |

Static tests protect semantic color pairs and specificity, unchanged palette/focus/reduced-motion declarations, opt-in headings and EN/VI/state expressions, native GET controls and Discovery reuse/data render contracts. These are CSS/source contracts, not pixel geometry, physical glyph/font rendering, backend authorization proof or WCAG contrast certification.

### Browser and visual evidence limitations

- Native browser / authored public-page check: **NOT RUN**. No ambient `TEST_DATABASE_URL` or owned local database receipt exists in this worktree; no disposable infrastructure, SMTP, TLS or browser services were started for A7.
- One bounded public foundation case is authored: eight public document navigations, EN/VI, light/dark via existing theme controls, primary normal/settled-hover/focus color pairs and Discovery utility headings/container alignment. It waits for actual CSS transitions rather than timed sleeps; per-document main bounds avoid cross-document scrollbar assumptions. No new authenticated lifecycle, screenshots, viewport matrix, setup/retry/worker/timeout changes or weakened existing assertions.
- Actual primary-hover pixels, computed browser geometry/colors, EN/VI glyph readability and private-page visual rendering: **NOT RUN** locally. The new browser assertions are compiled, not executed or claimed passing.
- Comprehensive keyboard, zoom, responsive breakpoints, system-theme/reduced-motion exercise and manual contrast evaluation remain **NOT RUN / A8 scope**. No accessibility or contrast certification claimed.

### Scope and decision

Existing functional/server/authentication/session/privacy logic and dictionaries are untouched. No API/schema, CI, infrastructure, hosted SMTP/V4, Vercel configuration or deployment changes. Existing branches/worktrees were preserved. The index is empty and no A7 commit, push, PR or merge was performed.

Recommendation: **GO for separate authorization of one scoped A7 commit**, based on the local gates and read-only review. Independent Linux browser/required CI confirmation remains pending future publication authorization; no staging/production acceptance is inferred. Stop after this implementation and validation record.


## V6A A8 — Evidence-first accessibility/responsive infrastructure (2026-10-26 UTC)

- Maintainer-authorized V6A-10 evidence-first phase only, branch `test/v6a-accessibility-responsive-evidence`, worktree `E:\TaleAtlas-v6a-accessibility-responsive`.
- Exact baseline/unchanged HEAD: `45986e937ae17420c434834ca3ae3ae1222227cb`. Receipts apply to the uncommitted five-file test/documentation patch, not a new commit, GitHub CI result or completed accessibility acceptance.
- Exact inventory: new `tests/e2e/accessibility-responsive.spec.ts`; new `tests/helpers/accessibility-evidence.ts`; new `tests/unit/accessibility-evidence.test.ts`; new `docs/V6A_ACCESSIBILITY_EVIDENCE.md`; this ledger (append only).
- Existing application/CSS, server/authentication/privacy/data behavior, dependencies, old tests, Playwright configuration, mandatory workflows, budgets, workers and retry policies are untouched. No source fix is authorized or performed.

### Authored evidence, not browser results

- 14 additive bounded browser cases: Home/Catalog profiles A–D (375 VI dark; 768 EN dark; 1280 EN light; 1440 VI light, all height900), narrow/desktop Discovery+Login samplers and genuine-owner Library/Requests/New Request/Settings samplers, System light→dark→light and reduced-motion checks.
- Existing genuine synthetic-account verification and exact-owned cleanup are reused, with no fabricated sessions, protected-route bypass, valid request mutation or duplicated long authenticated lifecycle. Catalog status locators remain main-scoped.
- Checks cover bounded document/essential-control/card geometry, label text fragments and meaningful associations, peer overlap excluding nested elements, actual Tab/skip/focus and native disclosure/error-summary interactions. Contrast uses applicable thresholds and conservative real-backdrop/group-opacity sampling; unsupported/complex samples are manual-review candidates, not fake PASS.
- The pure helper validates finite bounded sRGB/alpha/geometry inputs, unrounded contrast arithmetic and exact allowlisted observation records. No raw/private text, identities, URLs, response bodies, DOM/HTML, cookies, tokens or unrestricted exception messages are accepted in records. NOT_RUN cannot contain measurements; NOT_VERIFIED requires a fixed explanation. No logging, network, storage or public reporting side effects.
- New browser failures use fixed codes without arbitrary causes; no new screenshots, attachments, uploaders, reporters or diagnostic workflow. Existing confidential artifacts stay private under the unchanged native wrapper.

### Actual local validation

Node 24.19.0; pnpm 11.7.0. Successful full gates were not repeated.

| Check | Observed outcome |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, one prerequisite installation; manifests/lock unchanged |
| `pnpm exec vitest run tests/unit/accessibility-evidence.test.ts` | PASS: 55 passed / 0 failed / 0 pending |
| `pnpm exec tsc --noEmit -p tsconfig.tests.json` | PASS: focused test/helper type validation |
| Static TypeScript/browser-source discovery and policy inspection | PASS: 14 source-defined cases; unchanged complete native config includes the new spec; no config loaded or browser started for discovery |
| `pnpm test` | PASS: 2,416 passed / 0 failed / 0 pending, 76 files, one full run |
| `pnpm typecheck` | PASS, one full run |
| `pnpm lint` | PASS, one run |
| `pnpm build` | PASS, one production-mode build using synthetic compile-only loopback settings; no app/browser/SMTP/database service started or hosted environment used |
| Scoped formatting / `git diff --check` | PASS |
| Independent read-only math/privacy and browser-source review | NoBlock; no actual scoped implementation defect established |

The three new TypeScript file hashes were frozen before the full sequence and checked unchanged afterward. Unit/math/schema checks and successful compilation do not constitute app accessibility, physical glyph, browser geometry, AT announcement, actual contrast or backend authorization proof.

### Explicit limitations and classification

- A8 browser matrix: **AUTHORED — NOT RUN locally**. No configured ambient TEST_DATABASE_URL or owned local database receipt exists; no new disposable or Windows infrastructure was created.
- **GENUINE 200% BROWSER ZOOM: NOT RUN.** The evidence document requires fixed physical window/OS scaling, browser-chrome100% baseline, displayed200% verification, repeated interactions, CSS viewport metrics and restore100%. Viewport resizing, CSS/font zoom, DPR and pinch overrides are not substitutes.
- Human screen reader, actual VI diacritics/glyph quality, clipped focus, full visual/tab-order and manual critical-contrast review: **NOT RUN**. Full A8 acceptance remains incomplete.
- Header forced pending/error, Library loading/server-error observation and complex/unreliable compositing: **NOT VERIFIED**; no states or passing measurements were fabricated.
- Parser supports a restricted RGB/RGBA subset; unsupported valid aliases/exponents require manual handling. Initial reload before keyboard traversal is an unobserved portability risk; a demonstrated restoration issue must be classified as test setup, not an app defect. Measurement caps similarly do not prove a layout defect.
- No independently confirmed P0/P1 application/browser defect was found in this non-browser implementation phase. Future failures require pinned source/profile/symptom and application-defect, test/fixture-defect, measurement-limitation or inconclusive classification before any separately approved source change.

### Decision and stop boundary

**GO for separate authorization of one scoped A8 commit and Draft PR for ordinary Linux native CI**, based on the actual local gates and source reviews. This does not complete A8 manual acceptance or authorize publication, merge or deployment. Existing confidentiality/CI/Vercel behavior is preserved. No commit, staging, push, PR, diagnostic, hosted SMTP/V4/database operation, merge, deployment, A9 work or previous-worktree cleanup occurred. Stop after implementation and validation.

## V6A A10 — Source-pinned evidence reconciliation (2026-10-27 UTC)

### A10.1 Scope, chronology and independent decisions

- Audited application/main source: [`0eef3e50020f5035fc9789a499863e6aa9fe7fe3`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/0eef3e50020f5035fc9789a499863e6aa9fe7fe3), the merge of A9 PR #24; tree `0766976388f2a194401748f513140eda6818cba9`.
- Authority remains [V6A-01 through V6A-12](<V6A_UI_STABILIZATION.md>). This is a documentation-only, append-only reconciliation, not another implementation, test execution, diagnostic, visual acceptance or hosted operation.
- Every earlier line retains its receipt-time meaning, including historical headings containing "Current", local NOT RUN entries, failed attempts and original proposed inventories. New independent evidence below does not retrospectively change those outcomes or explain previously inconclusive causes.
- A10 authorization covers only this ledger and [accessibility evidence](<V6A_ACCESSIBILITY_EVIDENCE.md>). This append is an uncommitted documentation candidate; the source CI cited below is not a new CI receipt for this documentation append.

| Independent decision | Status at the pinned source | Boundary |
| --- | --- | --- |
| Code and automated CI readiness | **PASS** | All five required jobs and the required executed steps below succeeded |
| V6A evidence completeness | **INCOMPLETE** | This reconciliation still needs review/publication; current visual, manual and hosted receipts remain incomplete |
| Accessibility acceptance | **INCOMPLETE** | Automated coverage is not manual acceptance or WCAG certification |
| V6A-05 hosted SMTP/account acceptance | **NOT VERIFIED** | Synthetic native SMTP does not establish hosted delivery or account acceptance |
| Deployment/promotion | **NOT AUTHORIZED** | No deployment, promotion, variable change or infrastructure operation is authorized |
| Overall V6A closure | **NO-GO** | No milestone completion or release acceptance is declared |

### A10.2 Final merged A1–A9 inventory

Changed-file counts and high-level inventories are the actual final merged PR inventories, not the earlier proposed lists. The inventory links identify the exact paths. Each final Push/PR pair below was verified successful with all five mandatory jobs; job names are not test counts. Shared manual and hosted limitations remain governed by A10.5–A10.8.

| Batch / contract | PR and exact merge commit | Final changed files and high-level inventory | Final verified Push / PR CI | Current bounded outcome and limitation |
| --- | --- | --- | --- | --- |
| A1 / V6A-01, V6A-02 | [#16](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/16); `4791c0373588aef9a6895049d2def67fc045a1c1` | [9 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/16/files): Library loading/page/CSS and dictionary; three unit files; presentation harness; ledger | [39596536004](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39596536004) / [39596540836](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/39596540836) | Merged; code/CI PASS. Native intermediate loading observation and manual review remain incomplete |
| A2 / V6A-03 | [#17](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/17); `e42fb9212e0a34008a6ca1a24cfd80129d4164f4` | [12 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/17/files): Catalog component/CSS; two unit files and presentation harness; ledger; six dependency/lock/workspace/glob-adapter files | [40089241378](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40089241378) / [40089244373](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40089244373) | Merged; code/CI PASS. Historical images and failures are not current-source manual approval |
| A3 / V6A-04 | [#18](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/18); `f919c78b8c5a090dcc3dd1201079e02376e9b614` | [5 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/18/files): My Requests page/CSS; browser and unit coverage; ledger | [40115302451](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40115302451) / [40115311055](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40115311055) | Merged; code/CI PASS. Human visual acceptance remains separate |
| A4 / V6A-06 | [#19](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/19); `96762d9d64179173f154d71adc94434ea58f68f5` | [8 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/19/files): progressive request form/CSS/i18n; three browser files; form units; ledger | [40174662703](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40174662703) / [40174664556](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40174664556) | Merged; code/CI PASS. Earlier legacy compatibility failures remain historical |
| A5 / V6A-07 | [#20](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/20); `1f0df17743a75881146c9793a87cf364f6ebebc3` | [11 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/20/files): Library/Works pages and honest Catalog/Library state/copy logic; two browser files; three unit files; ledger | [40184425469](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40184425469) / [40184506905](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40184506905) | Merged; code/CI PASS. Earlier local unit failures were not retrospectively explained by Linux success |
| A6 / V6A-08 | [#21](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/21); `5289b4d4f2f49e4f8f45cff608a3a1e30273e11e` | [6 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/21/files): Shell/CSS; two browser files; UI units; ledger | [40247016997](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40247016997) / [40247020606](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40247020606) | Merged; code/CI PASS. Covered presentation/error transitions do not retrospectively reproduce the original live flash |
| A7 / V6A-09 | [#22](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/22); `45986e937ae17420c434834ca3ae3ae1222227cb` | [9 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/22/files): two pages, Discovery and scoped/shared style consistency; browser and source-contract tests; ledger | [40253547206](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40253547206) / [40253686280](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40253686280) | Merged; code/CI PASS. Static style checks are not manual rendered contrast or glyph review |
| A8 / V6A-10 | [#23](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/23); `ed78cfe61d782cef079d2d3f3a41ce72bb9aa447` | [8 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/23/files): two browser files; two helpers; two unit files; two evidence documents | [40396805319](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40396805319) / [40396813331](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40396813331) | Merged; supported automated assertions PASS. Manual accessibility acceptance remains incomplete |
| A9 / V6A-11 | [#24](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/24); `0eef3e50020f5035fc9789a499863e6aa9fe7fe3` | [2 files](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/24/files): existing Catalog and Library native browser scenarios only | [40440138459](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40440138459) / [40440232007](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40440232007) | Merged; same-URL reset assertions PASS under native CI. Not a newly established application defect or manual visual approval |

A1 addressed hardcoded bilingual loading, inherited form direction and stale committed selections. A2 addressed Catalog alignment/help layout and uncontrolled-filter/reset behavior. A3 improved adjacent heading/actions and owner/followed grouping. A4 separated optional details with native disclosure and reveal-before-invalid-focus behavior. A5 distinguished empty, filtered-zero, out-of-range, unavailable and unresolved-access states. A6 corrected data-only header presentation of unresolved/error/cached sessions without changing authorization policy. A7 applied bounded semantic style/container consistency. A8 added evidence contracts and corrected measurement/fixture defects; A9 added the missing same-bare-URL reset regression.

A2 also included reviewed security maintenance: Vitest 4.1.12, Next/eslint 16.4.1, Zod 4.6.6, undici 7.30.1, nodemailer 10.1.4 and smtp-server 3.19.24, scoped dependency overrides/lockfiles, and the narrow glob adapter retarget. The full V6A history is therefore **not exclusively UI/CSS**. These reviewed changes are not hosted infrastructure changes or evidence of hosted acceptance.

### A10.3 Exact successful post-merge CI execution

[Run 40441344619](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619), attempt **1**, event **push**, exact head `0eef3e50020f5035fc9789a499863e6aa9fe7fe3`, used [the mandatory workflow](<../.github/workflows/ci.yml>) and completed successfully on 2026-10-27 UTC. Actual job/step metadata and existing allowlisted aggregate receipts were checked; this is not an inference from a workflow-level green badge. The required steps below completed with success, not skipped. No test or audit was rerun for A10.

| Requirement / actual command or phase | Run job and step number | Verified existing outcome |
| --- | --- | --- |
| Frozen install: `pnpm install --frozen-lockfile` | [Quality foundations 121982172607](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121982172607), step 6; also native/audit preparation | PASS |
| TypeScript: `pnpm typecheck` | Foundations steps 7 and 16 | PASS before and after build |
| Lint: `pnpm lint` | Foundations step 8 | PASS |
| Full units: `pnpm test` | Foundations step 9 | PASS; no total transplanted from a historical local receipt |
| Migration application and repeat: `pnpm db:migrate` twice | Foundations steps 10 and 11 | PASS; disposable PostgreSQL 17 fixture |
| Generation: `pnpm db:generate`; tracked drift: `git diff --exit-code -- packages/database/drizzle` | Foundations steps 12 and 13 | PASS; existing generator receipt reports no schema changes |
| Complete SQL integration selection: `pnpm test:integration` with private reporters/output | Foundations step 14, displayed as `Run set +x` | PASS; fixed receipts `INTEGRATION PASS` and `INTEGRATION_EXIT 0` |
| Production build: `pnpm build` | Foundations step 15; native jobs also build | PASS |
| Complete original/legacy native selection, production HTTPS | [Legacy 121984296826](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121984296826), step 14 | PASS; fixed receipt `LEGACY PASS` |
| Enabled V4 native selection | [V4 121984296793](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121984296793), step 14 | PASS; fixed receipt `V4 PASS` |
| Production audit: `pnpm audit --prod --audit-level high` | [Audits 121984296732](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121984296732), step 6 | PASS; existing output reports no known vulnerabilities |
| Full dependency audit: `pnpm audit --audit-level moderate` | Audits step 7 | PASS; existing output reports no known vulnerabilities |
| Require every mandatory dependency to succeed | [Verify 121987833176](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121987833176), step 2 | PASS; checks, legacy, enabled V4 and audits each recorded success |

The historical job labels "Native original 17" and "Native enabled V4 8" are labels, not newly extracted test totals. Private native output exposes aggregate phase results, not a new public per-cell measurement report. Existing TLS/SMTP, account, database, privacy, worker, retry and timeout boundaries remain in force. Local synthetic mail and owned HTTPS do not establish hosted provider delivery or deployment readiness.

The merged [Catalog additions](<../tests/e2e/advanced-discovery.spec.ts#L311-L361>) and [Library additions](<../tests/e2e/library-pagination.spec.ts#L213-L297>) remain in their existing scenarios selected by the unchanged native configuration. Each adds EN/VI dirty-controls-at-bare-URL checks followed by localized Reset focus/Enter and genuine default/result/locale postconditions, with no intervening test-driven reload/navigation. The Library checks retain actor/source-scoped ownership and hidden-metadata exclusion. They have now executed within the successful complete legacy selection; this is distinct from human visual acceptance.

### A10.4 Source and migration integrity; retained failures

The read-only comparison from roadmap baseline `55ec938228338960f2612206bcf8ca47f3e5d5d0` to `0eef3e50020f5035fc9789a499863e6aa9fe7fe3` found **no database package changes**. Fifteen committed migrations numbered 0000–0014 and their snapshots/journal are unchanged. Authentication and session policy and the required CI workflows are unchanged across that range. Existing generation output in foundations and both native jobs reported no schema changes, and their drift checks succeeded. No migration was generated or applied by A10; these are source comparisons and earlier CI receipts, not a new database operation.

The prior A1 hydration timeout, A2 Reset/security/SQL/unit/orchestration failures, A4 legacy compatibility failures, A5 local unit failures and A6 matcher uncertainty remain recorded with their original scopes. Later successful Linux CI neither erases them nor proves an unexplained local failure harmless, preexisting or Windows-only.

The [executed A8 attribution run 40293536041](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40293536041) tested application source `061529828cf09dc00fd0e9291a256b74267bfcf1` and reported **36 passed / 3 failed**. Its G05 observations were Request a Story input/button pairs with a conclusively excluded closed-details endpoint; they did not demonstrate obstruction between genuinely rendered controls. The genuine foundation flow observed signup/signin HTTP 200, at least one session-transport HTTP 429 during the initial failing attempt, and retry signup HTTP 429. This supported a fixture isolation correction; it did not identify every prior bucket contributor or prove the last session request caused every UI error.

[Correction recorded on PR #23](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/23#issuecomment-6426695254): closed-details rendered eligibility preserves first summaries, open/nested behavior, visible-peer detection, one-pixel tolerance, bounds and caps; 25 geometry regressions were added. Foundation uses one fresh stable synthetic context identity per actor/attempt, not per-request rotation, limiter resets, fabricated sessions or changed application rate limits. Final corrective head `ed786afdc36221a2ea68ea113f6cb63a5e0ea56a` subsequently passed Linux CI. The final PR inventory is eight files; the earlier five-file implementation receipt above remains historically correct for that earlier phase.

The earlier [40288321788 diagnostic](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40288321788) stopped at reporting/instrumentation safety before Playwright and is not a browser-execution failure count. Original A8-O04 attribution remains inconclusive; passing later assertions is not retrospective proof of its original cause. No A8 investigation was reopened, and no current source correction is supported by this documentation reconciliation.

### A10.5 Screenshot existence, relevance and privacy

Historical material is not globally absent. The previous read-only audit confirmed file-name availability at the exact retained A1/A2 locations referenced by their historical receipts, without opening images or raw artifacts. Those private host-specific locations are deliberately not repeated here. The historical presentation harnesses used synthetic props/adapters: their images are not proof of genuine SQL/authentication, hosted behavior or current full-shell/System acceptance. Individual historical inspection claims retain only their recorded scope.

| Safe evidence category | Established historical material | Current-source content/privacy review |
| --- | --- | --- |
| Library | 64 A1 PNG names; historical ledger records two visually inspected examples | **NOT VERIFIED** for the full collection at the current source |
| Catalog | 72 A2 final PNG names, 22 baseline/functional names, and a separately retained Reset image; historical inspected examples remain historical | **NOT VERIFIED** for the full collection at the current source |
| Home | Authored/executed automated checks, but no qualifying current-source reviewed screenshot manifest identified in the audited documents/PRs | **NOT VERIFIED** |
| My Requests and Request a Story | Automated state/layout/form checks are not a screenshot acceptance record | **NOT VERIFIED** |
| Login and Settings | Automated checks do not supply a current privacy-approved visual signoff | **NOT VERIFIED** |
| Loading, error, focus, System and zoom states | Some historical capture references or authored checks exist; no complete source-pinned current review mapping established | **NOT VERIFIED**, or **NOT RUN** for unperformed manual checks |

The exact main run has zero uploaded artifacts. This preserves confidentiality; it does not prove that no runner-local image was generated. File-name inventory alone proves neither image content, current-source relevance, visual acceptance nor permission to publish. No image was created, opened for new acceptance, uploaded or committed by this documentation task.

A missing-review checklist must tie safe case ID, source SHA, page category, width/height, locale, explicit/resolved theme, motion, genuine zoom setting, relevant state, reviewer/time, privacy decision and actual verdict to existing evidence. Account-bearing images, including synthetic authenticated accounts, private Library/Request content, verification links, cookies/tokens, raw HTML/traces/bodies and credential/environment values must remain private. Public documentation may carry allowlisted aggregate outcomes and approved references only. Anonymous public-page images require separate content/privacy review before any publication; there is no screenshot-publication authorization here.

### A10.6 Accessibility reconciliation and acceptance boundary

The formerly authored 14 A8 cases subsequently executed within successful native Linux CI. Supported bounded responsive viewport, representative keyboard/focus, native disclosure/invalid-form, locale/theme/System and reduced-motion assertions are **AUTOMATED PASS** within their actual authored scope. They do not establish every page/state/profile combination, manual contrast, human announcements or genuine 200% browser zoom. See the appended current-source reconciliation in [accessibility evidence](<V6A_ACCESSIBILITY_EVIDENCE.md>).

**STILL NOT RUN:** genuine browser-chrome 200% zoom; human screen-reader review; Vietnamese physical glyph/wrapping inspection; manual visible-focus/clipping/tab-order assessment; manual rendered critical-control contrast.

**STILL NOT VERIFIED:** applicable unsupported complex compositing; actual intermediate Library route-loading fallback during navigation and direct refresh; any other browser or visual state lacking directly reviewed evidence. Rendered SSR/hydration loading-unit coverage is not proof that a native intermediate fallback was observed. Header pending/error coverage is a different state and must not be silently conflated with Library loading.

The roadmap explicitly requires genuine zoom, EN/VI usability, coherent visible focus/tab order and manually evaluated critical contrast. Human AT is an explicit A8 follow-up, not a claim that every screen reader or full WCAG certification is required or achieved. Unsupported samples remain bounded measurement limitations; only a documented applicability judgment can make a particular nonessential case NOT APPLICABLE. Lack of tooling, time or permission cannot produce PASS or NOT APPLICABLE.

Future manual work requires separate approval and an existing approved disposable headed environment. Reuse the compact supported profiles without a needless all-axis Cartesian matrix, preserve required breakpoint coverage, use actual System controls/reduced-motion settings, and verify browser chrome 100% → 200% → 100% with physical window/OS scaling and actual viewport metrics recorded. CSS/font enlargement, DPR or pinch overrides are not substitutes. Missing or unreproducible states remain honest NOT RUN/NOT VERIFIED outcomes; do not manufacture a fallback or new backend outage. No manual/browser work is performed here.

### A10.7 Hosted SMTP/account gate — future checklist only

V6A-05 remains an unresolved **P0 acceptance requirement / NOT VERIFIED**. The historical ledger records signup HTTP 200, a sanitized `auth.mail` failure and zero observed sandbox messages at that time, followed by Preview SMTP variable updates. It contains no source/deployment-pinned successful hosted registration, delivery, verification, login and logout receipt. Ordinary Linux native E2E uses synthetic SMTP and does **not** close this hosted requirement or establish the generic failure's root cause.

A separately authorized operator receipt must record:

1. Exact deployed Preview source SHA, deployment identity and observation time; distinguish that deployment from the audited repository source.
2. Confirmed Preview branch/environment variable **scope**, without publishing any values. Any variable change or redeployment needs its own authorization.
3. One permitted genuine synthetic registration; no verification or throttling bypass.
4. Observed sandbox verification-mail delivery associated privately with that permitted actor.
5. Genuine link verification, with no public verification URL/token or raw message content.
6. Genuine login and logout and the observed outcome.
7. Safe evidence of secure-cookie, role and CSRF protections where applicable, without exposing cookies, headers or session material.

This is only the missing future receipt definition. No Vercel or Mailtrap access, registration, email send, variable edit, provider troubleshooting or Preview deployment is performed or authorized by A10 documentation work. An ignored/canceled deployment record is not a successful hosted application or SMTP receipt.

### A10.8 Remaining closure register and stop decision

| Requirement / priority | Current evidence and status | Blocks full V6A closure? | Smallest remaining action / separate approval |
| --- | --- | --- | --- |
| P0: current release-evidence reconciliation | Source-pinned append prepared; broader evidence **INCOMPLETE**, documentation not yet reviewed/published | Yes | Review this two-file documentation candidate; commit/Draft PR/publication require separate approval |
| P0: V6A-05 hosted account/SMTP acceptance | Historical failure and later variable edits; current outcome **NOT VERIFIED** | Yes | Obtain an existing valid operator receipt or separately authorize the bounded A10.7 flow; no automatic redeploy |
| V6A-10 genuine browser 200% zoom | **NOT RUN** | Yes | Separately approve the defined real browser-chrome procedure |
| V6A-10 VI text, clipping, critical contrast, focus/tab order | Human visual/manual assessment **NOT RUN** | Yes | Separately approve bounded current-source manual review, retaining failures and actual metrics |
| A8 screen-reader spot checks | **NOT RUN** | Yes, for full A8 manual acceptance | Separately approve the documented bounded AT follow-up; no certification inferred from automation |
| Current-source screenshot/privacy review | Historical collections exist; current manifest/review **NOT VERIFIED** | Yes, for claiming V6A-12 visual evidence complete | Reconcile existing material first; capture only missing evidence after separate approval; no account-bearing publication |
| Native intermediate Library loading, refresh/navigation | **NOT VERIFIED** | Yes, before claiming V6A-01's native transition observation complete | Safely observe the real state under separate approval or retain the limitation; no fake success/outage framework |
| Applicable unsupported compositing | **NOT VERIFIED** | Conditional: critical applicable controls require manual adjudication | Manual fallback or documented applicability decision under separate review approval |
| Required automated gates and unchanged migration scope | **PASS** at the pinned source | No remaining automated blocker identified | Preserve receipts; do not repeat successful suites merely for this append |
| Deployment/promotion | **NOT AUTHORIZED** | Independent operational authorization gate | Explicit future maintainer authorization; no deployment action follows from CI or documentation approval |

**Final decision: Code/CI PASS; evidence and accessibility INCOMPLETE; hosted SMTP NOT VERIFIED; deployment/promotion NOT AUTHORIZED; overall full V6A closure remains NO-GO.** This is not a new application-defect finding. No application/test/configuration/dependency/schema/workflow correction is proposed. A separately authorized documentation commit and Draft PR may follow local documentation validation, but no commit, push, PR, merge, tests, screenshots, hosted verification, deployment or A1–A9 reimplementation is performed here.

## V6B B1 — Pure identity contracts and privacy projection (2026-10-27 UTC)

### Scope and source pin

- Maintainer-authorized B1 only, branch `feat/v6b-b1-profile-contracts`, unchanged HEAD `1cc6ddd9191488c4b00ef8db9d885eafba6b3e0c`. The exact merged baseline was fetched and verified before creating the isolated worktree; stale local main was not used as its starting point. Earlier branches/worktrees remain preserved.
- [Baseline main CI 40459306889](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40459306889) is the maintainer-verified predecessor receipt, not a CI result for this uncommitted B1 candidate. No B1 commit or GitHub execution is claimed.
- Deferred manual/external acceptance no longer automatically blocks unrelated authorized coding. It does not become PASS or public rollout permission. The twelve entries in [the centralized backlog](<DEFERRED_MANUAL_VERIFICATION.md>) are byte-identical to the baseline; no hosted-profile item was added because no hosted B1 feature exists.

| Exact authorized file | Observed change |
| --- | --- |
| [Reader-profile contracts](<../apps/web/src/features/reader-profile/contracts.ts>) | New pure strict validators and provisional caller-supplied policy factory |
| [Reader-profile projection](<../apps/web/src/features/reader-profile/projection.ts>) | New pure owner/public allowlists and fail-closed decision model |
| [Contract unit tests](<../tests/unit/reader-profile-contracts.test.ts>) | New fixed synthetic validation, Unicode and strict-input cases |
| [Projection unit tests](<../tests/unit/reader-profile-projection.test.ts>) | New fixed caller-fact, privacy-canary and output-isolation cases |
| [B1 contract specification](<V6B_PROFILE_CONTRACT.md>) | New provisional scope, privacy, compatibility and B2 decisions |
| This validation ledger | Append-only actual B1 evidence; every earlier byte remains an unchanged prefix |

### Implemented contracts and limits

- No automatic enrollment/backfill. Create defaults to PRIVATE; public intent is a separate literal PUBLISH command with affirmative acknowledgment and expected revision. Edit accepts only a nonempty presentation/interests patch; hide is a distinct command model. No command executes state transitions or reserves a handle.
- Required policy input supplies validated exact reserved handles and literal prefixes, copied independently of caller-owned arrays. Tests do not establish a permanent production reserved-name, retention, reuse or rename policy.
- Raw ASCII handles are validated before lowercase canonicalization, length 3–24; strict end checks reject terminal line separators. Display names are required/nonunique NFC text, 1–80 UTF-16 units/320 UTF-8 bytes; optional plain biography is bounded at 500 units/2,000 bytes. Raw and post-normalization bounds are explicit, including invalid surrogates and prohibited control/bidi rejection. Literal markup/URL-like text is not rendered or fetched.
- At most five explicit unique genre slugs match the existing text taxonomy format; database existence is deliberately not inferred. Revisions are noncoerced positive integers through 2,147,483,647. Canonical account IDs remain opaque exact strings, never UUID-parsed or normalized; only the separately modeled future public profile identifier uses UUID syntax.
- Strict command/snapshot inputs reject unknown fields and unsafe plain-data shapes. Pure projection descriptor-picks only known snapshot fields, leaves unrelated private accessors unread, constructs fresh output objects/arrays and never falls back to auth name/image or Library-derived interests.
- PUBLIC DTO fields are only public identifier, handle, explicit display name, optional biography and selected interests. OWNER adds visibility/revision, not account/session/Library data. Exact ownership is case-sensitive; admin/moderator roles do not override it. Private-nonowner, absent, removed, invalid and blocked public views expose no profile; unavailable session infrastructure is represented without inspecting the profile as anonymous.
- Caller-supplied viewer/block facts are not authenticated sessions or database-qualified authorization. Conservative block denial is not an irreversible platform blocking policy; anonymous public access still permits logout/alternate-account circumvention. B2 must implement and test real authority, uniqueness, lifecycle, visibility/races and deletion.

### Actual focused attempts and scoped corrections

The failures below are retained, not converted into PASS by later success. Raw test output stays private; fixed counts/categories are recorded here.

| Attempt, in order | Observed result | Correction or boundary |
| --- | --- | --- |
| Initial two-file focused run | Exit 1; 65 tests completed, then worker heap exhaustion; not a complete passing receipt | Parameterized title data included rich Zod schema objects, including a schema occupying a string-placeholder position. Replaced schema-bearing title rows with scalar command/field labels; no heap, timeout, worker or retry setting changed. Allocation internals were not separately instrumented |
| First completed focused run | 297 PASS / 2 FAIL | Tests exposed code-point string length checks where UTF-16 units were required, and a normalization-growth fixture expectation. Inspected installed Zod behavior; replaced text limits with explicit `value.length` checks before and after NFC |
| Next focused run | 303 PASS / 1 FAIL | A trailing U+0344 after x partly recomposed to U+1E8D, so that fixture did not actually exceed the limit. Used leading U+0344 and asserted actual 80→81 / 500→501 NFC lengths. Also corrected parameterization to pass complete invalid interest arrays, and added five strict terminal-line-separator cases; no assertion threshold weakened |
| Final focused run | **304 PASS / 0 FAIL / 0 pending**, two files | 239 contract cases and 65 projection cases passed on the corrected candidate |

The final focused TypeScript command executed only after the final focused tests passed. Earlier unsuccessful focused runs did not reach that compilation step. All corrections remained inside the two authorized contract/test files; no infrastructure troubleshooting or deferred-verification attempt was used to force green results.

### Actual final local validation

Node 24.19.0; pnpm 11.7.0. Four TypeScript files and the new specification were formatted and their hashes frozen before the full sequence. Full gates ran once on that final code; the only subsequent authored change is this evidence append, and the five frozen file hashes remain unchanged.

| Executed check | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, one fresh-worktree prerequisite; dependency manifests/lock unchanged |
| `pnpm exec vitest run tests/unit/reader-profile-contracts.test.ts tests/unit/reader-profile-projection.test.ts` with private JSON receipt | Final PASS: 304 / 0 failed / 0 pending, two files; unsuccessful attempts preserved above |
| `pnpm exec tsc --noEmit -p tsconfig.tests.json` | PASS on the final focused candidate |
| `pnpm test` complete unit selection with private JSON receipt | PASS: **2,745 / 0 failed / 0 pending**, 79 files; one full run, 08:01:46–08:04:25 UTC |
| `pnpm typecheck` | PASS once, 08:04:26–08:05:30 UTC |
| `pnpm lint` | PASS once, 08:05:30–08:05:57 UTC |
| `pnpm build` | PASS once, 08:05:57–08:06:57 UTC; synthetic production compile-only HTTPS/loopback settings, database and SMTP deliberately nonservice ports; no service or hosted connection provisioned |
| Scoped Prettier checks | PASS for four new TypeScript files and the new specification; historical ledger not reformatted |
| Pure-import/source inspection and documentation link/privacy checks | PASS; no runtime environment, database, HTTP, session, logger, media or network dependency introduced; deferred backlog unchanged |
| Independent read-only privacy/contracts review and scoped correction re-review | NoBlock; no remaining concrete source/privacy finding; reviews themselves did not execute tests |

SQL integration, native browser E2E, new dependency audits and hosted/manual verification were **NOT RUN locally for B1**. No SQL table, migration, API, server mutation service, UI, follow/feed/reaction/notification, public list, runtime flag or V4 activation exists in this change. Existing mandatory workflows and prior tests are unchanged; their future ordinary CI remains required after separately authorized publication. Pure tests and a compile-only build do not constitute authenticated end-to-end, database, hosted or accessibility acceptance.

### Remaining policy decisions and stop boundary

The [B1 specification](<V6B_PROFILE_CONTRACT.md>) retains required maintainer decisions before B2: exact reserved/impersonation policy; handle rename and reuse; reservation retention/account erasure; profile hide versus content deletion; bidirectional blocking/anonymous limits; public abuse/takedown responsibility; feature gates and budgets; and public activation requirements. No B1 unit test approves an irreversible database or retention policy.

**GO for separate authorization of one scoped B1 commit and Draft PR**, based on the actual local gates, unchanged tested source and independent review. The index remains empty and all six approved files are uncommitted. This does not authorize publication, persistence, manual/hosted testing, rollout, merge or deployment, and does not declare full V6A or V6B acceptance. Stop after implementation and reporting; no deferred check, new infrastructure, provider access, database operation or publication was performed.

## V6B B2a — Profile persistence candidate (2026-10-27 UTC)

### Authority, isolation and exact scope

Maintainer-authorized persistence and SQL-test authoring only, from exact merged B1 main `52ab0bea8420bee571e5571068e43612cb8542ef`, tree `551253af857bde2a6c5ab14e2e3b00901bba7335`, isolated branch `feat/v6b-b2a-profile-persistence`. Required remote main and a clean initial worktree/index were verified before creation; stale local main and previous worktrees were preserved. The maintainer-verified [post-merge predecessor CI 40479224205](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40479224205) is not a CI receipt for this uncommitted candidate.

The approved lifecycle in [contract section 8](<V6B_PROFILE_CONTRACT.md#8-explicitly-approved-b2a-persistence-policy-2026-10-27>) was checked against B1 and existing erasure safeguards before forward generation: no policy conflict requiring a stop was found. This is static compatibility review, not SQL certification. Historical B1 text remains an unchanged prefix; approval now resolves initial account-lifetime handle retention, not all B2b policy.

| Authorized changed file | Actual change |
| --- | --- |
| [Profile constants/types](<../packages/database/src/reader-profile-types.ts>) | New stored-state and B1-compatible bounds |
| [Profile schema](<../packages/database/src/reader-profile-schema.ts>) | New minimal three-table cohort |
| [Database exports](<../packages/database/src/index.ts>) | Export new schema/types |
| [Database client](<../packages/database/src/client.ts>) | Register cohort only; existing connection/TLS/deadline options unchanged |
| [Drizzle configuration](<../packages/database/drizzle.config.ts>) | Add the reviewed schema path |
| [Forward 0015](<../packages/database/drizzle/0015_reader_profiles.sql>) | Generated additive DDL plus reviewed lifecycle/erasure triggers |
| [0015 snapshot](<../packages/database/drizzle/meta/0015_snapshot.json>) | Generated next snapshot; 40 existing table definitions preserved, three added |
| [Migration journal](<../packages/database/drizzle/meta/_journal.json>) | One 0015 entry; first 15 historical entries unchanged |
| [Migration tests](<../tests/integration/reader-profile-migration.test.ts>) | New owned-child-database fresh/repeat migration and exact inventory/legacy preservation cases |
| [Persistence tests](<../tests/integration/reader-profile.test.ts>) | New SQL integrity, canonical input, uniqueness, slot, block and removal-race cases |
| [Erasure tests](<../tests/integration/reader-profile-erasure.test.ts>) | New bounded cached-plan/rollback/cascade/removal/reclaim designs |
| [Existing V4 migration regression](<../tests/integration/community-migration.test.ts>) | Necessary additive inventory updates only; V4 teardown and original legacy assertions retained |
| [Existing authentication regression](<../tests/integration/authentication.test.ts>) | Add cohort witnesses to the existing real email-confirmed deletion flow, no new registration lifecycle |
| [Profile contract](<V6B_PROFILE_CONTRACT.md>) | Append approved B2a policy without rewriting B1 history |
| This validation ledger | Append actual results, failures and missing SQL gates |

Exactly 15 changed paths. Optional package-manifest scoped exports were omitted because no new scoped consumer requires them; dependency manifests/lock/workspace files remain baseline-identical. No extra helper, infrastructure runner, route, service, UI, environment variable or workflow was added.

### Defined schema and erasure design — not PostgreSQL-verified

- `reader_profiles`: canonical TEXT account owner primary key/FK with account CASCADE; generated separate UUID public ID and globally unique canonical lowercase ASCII handle; PRIVATE/ACTIVE/revision-1 defaults; explicit visibility/state/positive integer checks; nullable, bounded NFC/trim canonical presentation fields. ACTIVE requires a nonempty display name; REMOVED requires PRIVATE and NULL display name/biography. Display names are nonunique. No account name/email/image copy or automatic enrollment/backfill.
- `reader_profile_interests`: owner/slot primary key, slots 1–5, unique owner/genre pair, profile CASCADE and canonical text taxonomy FK with RESTRICT. Owner/genre indexes support scoped erasure and taxonomy references. No Library-derived interest or cached Work metadata.
- `reader_blocks`: directed account pair primary key, no self-edge, account CASCADE in both directions, reverse index. No profile enrollment prerequisite, follow/feed data or inferred relationship.
- Forward DDL defines 20 named PK/unique/check/FK constraints, eight indexes and four new fixed-search-path SECURITY INVOKER functions/triggers. Identity immutability and direct live-account profile-delete rejection retain claims; root-account deletion is designed to permit the native cascade. Removal deletes only that owner's interests; interest writes lock an ACTIVE parent. No historical redirects, claim table or post-account tombstone exists.
- The additive root replan follows the existing RI/SPI cached-plan safeguard without changing frozen functions, settings, statistics, privileges or rows. DISCARD PLANS has backend-wide nontransactional plan-cache effects even on rollback; it is not itself data erasure, a concurrency guarantee or performance proof.
- B1 contracts/projections, existing authentication policy, V3 Library and V4 behavior remain unchanged. B2b must supply verified authority, explicit publication execution, coherent public/block predicates, budgets and actual OCC. PUBLIC updates are legal storage states, not an authenticated command or public activation.

### Missing mandatory SQL evidence — NOT RUN, not PASS

The current Windows worktree has no fresh owned database receipt or native PostgreSQL CLI on PATH. The existing installed helper's Windows stop path forcibly kills the process tree and removes its data directory; [repository testing guidance](<TESTING.md#current-v5-status-and-phase-1-verification-boundary>) forbids using the incompatible Windows helper, reusing historical clusters or inventing a new lifecycle. No replacement runner, WSL/Docker/service installation, historical database, hosted credentials or persistent user database was used. This is a missing approved local execution environment, not an observed SQL application failure or a waived gate.

| Required actual database evidence | Current result |
| --- | --- |
| Fresh migrations through 0015 and repeat migration execution | **NOT RUN** — no approved owned SQL lifecycle |
| Focused three-suite persistence/migration/erasure execution, 13 new authored SQL cases | **NOT RUN** — test compilation is not SQL execution |
| Exact live table/index/FK/check/trigger catalog and constraint rejection results | **NOT RUN** — generated definitions/metadata inspected only |
| Native uniqueness/claim races, both interest-removal orderings and invalid-transaction rollback | **NOT RUN** |
| Root cascades, bounded cached-plan deletion, handle release, unrelated V3 preservation and real Better Auth deletion augmentation | **NOT RUN** — no actual account-erasure proof for this candidate |
| Existing full SQL integration regressions including V3/V4 and legacy migration assertions | **NOT RUN** |

The migration suite is designed to use the official existing Drizzle migrator on a UUID-owned child UTF8 `_test` database within the approved loopback cluster. It requires permission to create/drop that owned child database; target and owner checks precede cleanup, without FORCE or other-session termination. Its forward-DDL rollback test does not tear down shared legacy tables. This source design has not run locally and does not replace the missing cluster workflow or prove compatibility by itself.

### Observed corrections and actual non-SQL gates

Initial focused test/schema TypeScript compilation **FAILED** with TS2307 because the root test workspace did not directly own the Drizzle migrator dependency. Corrected only the new migration test to resolve the official migrator from its existing database workspace dependency, with a narrow typed signature. No dependency, application migration API or custom migration engine was introduced. Export-resolution metadata check and final focused compilation then passed. The failed receipt is retained, not retrospectively marked PASS.

Static review also corrected a credential-bearing URL equality assertion to boolean-only comparison before any SQL execution; no credential value was exposed. Test-source review moved permitted internal LF/CRLF/tab biographies into valid cases while retaining prohibited-control cases, corrected the raw/post-NFC explanation, and added revision boundaries and controlled real-lock race designs. These are pre-execution source corrections, not invented SQL failure/pass receipts. No timeout, retry, assertion threshold or test-isolation safeguard was relaxed.

Node 24.19.0; pnpm 11.7.0. Fourteen authored/generated files were hash-frozen before the full sequence; all stayed unchanged. Only this evidence append followed the successful gates.

| Executed local check | Actual observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS once as fresh-worktree prerequisite, dependencies unchanged |
| Official migrator resolution from its owning workspace | PASS, module/export metadata only; no migration call or SQL |
| `pnpm exec tsc --noEmit -p tsconfig.tests.json` | Final PASS after the retained TS2307 failure; covers new test/schema typing only |
| `pnpm test` complete unit selection with private JSON receipt | PASS: **2,745 / 0 failed / 0 pending**, 79 files; once, 10:46:11–10:49:15 UTC. Integration specs were not executed by this command |
| `pnpm typecheck` | PASS once, 10:49:15–10:50:16 UTC |
| `pnpm lint` | PASS once, 10:50:16–10:50:45 UTC |
| `pnpm build` | PASS once, 10:50:45–10:51:49 UTC; production-shaped compile-only synthetic HTTPS/loopback database and SMTP port-1 settings, no service provisioned or hosted connection |
| Reviewed Drizzle generation with `--name reader_profiles` | PASS offline; created only 0015 SQL/snapshot and the journal entry |
| `pnpm --filter @taleatlas/database generate` no-drift check | PASS once, 10:51:49–10:51:52 UTC: no schema changes; frozen hashes unchanged. This does not validate SQL syntax/functions or fresh/repeat execution |
| `pnpm audit --prod --audit-level high` | PASS once, 10:51:52–10:51:54 UTC; zero info/low/moderate/high/critical vulnerabilities |
| `pnpm audit --audit-level moderate` | PASS once, 10:51:54–10:51:56 UTC; zero info/low/moderate/high/critical vulnerabilities |
| Scoped Prettier, diff check, appended-policy Markdown/link/privacy checks | PASS; historical documents not reformatted |
| Independent policy/schema/privacy review and correction re-review | NoBlock **STATIC ONLY**; no PostgreSQL syntax/cascade/concurrency/performance certification |

Migrations/snapshots 0000–0014 are byte-identical to the baseline. All 40 old snapshot table definitions and old enum/schema/sequence/role/policy/view metadata remain unchanged; 0015 links to the old snapshot and adds three tables. The historical ledger's **275,130 bytes / 1,673 lines** remain an identical prefix, SHA-256 `b7effe1c88dcf78d34e8402d2c624175cb4098f92f4dc6653e252bc970566888`. The B1 contract prefix and the twelve centralized [deferred checks](<DEFERRED_MANUAL_VERIFICATION.md>) remain unchanged; no speculative hosted-profile entry was added.

### Decision and remaining B2b fence

**NO-GO for a separately authorized B2a commit and Draft PR at this point: mandatory real PostgreSQL migration/integrity/erasure/regression gates are missing.** Other observed automation is green, but cannot substitute for SQL proof. Stop for maintainer direction on an approved disposable SQL execution environment; do not defer this automated validation gap into the hosted/manual backlog or publish automatically.

B2b still needs exact reserved/impersonation policy, abuse/takedown responsibility, signed verified-session and owner-only commands, Origin/body fences, affirmative publication, coherent bidirectional-block/public qualification, restoration semantics if offered, safe OCC/overflow/races, rate/mutation budgets and budget-key erasure, feature gates and activation decisions. Root SQL cascades are distinct from the surrounding non-globally-atomic existing authentication workflow.

The index is empty and all 15 source changes are uncommitted. No API/server profile HTTP service/UI, follow/feed, Library sharing, new runtime activation, hosted/manual check, V4 enablement, provider/deployment operation, commit, push, PR or merge was performed. Earlier worktrees remain preserved. This candidate is not full V6B acceptance or public profile functionality.
