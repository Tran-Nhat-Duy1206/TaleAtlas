# V6 — Validation and Decision Ledger

**Initialization status (historical):** INITIALIZED / PLANNING ONLY — 2026-10-20
**Planning baseline (historical):** main 55ec938228338960f2612206bcf8ca47f3e5d5d0
**Current A1 state:** FINAL LOCAL PRE-COMMIT CHECKS PASS — see §7. Changes remain uncommitted/unstaged; candidate CI, full V6A and hosted acceptance are not asserted.
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
| Vercel Preview and branch | OBSERVED | §staging§ Preview deployment built and owner reported it ran; do not equate this with broad application acceptance. |
| Database readiness | OBSERVED (transient then OK) | Owner saw §{"status":"unavailable","database":"unavailable"}§, then after reloads §{"status":"ok","database":"ok"}§. Cold Neon start/2s probe is a hypothesis, not confirmed root cause. |
| Migration state | OPERATOR REPORTED | 15 applied migrations through 0014; 40 app tables and restricted runtime role reported; do not rerun migrations or expose credentials. |
| SMTP verification | **BLOCKED / UNVERIFIED** | Sign-up POST showed 200, but sanitized §auth.mail§ level 50 error and Mailtrap 0 messages at that time. Preview SMTP variables were later updated. No successful end-to-end verification is yet recorded. |
| Catalog results | OBSERVED | 0 published Works on shown staging catalog; not by itself a bug or proof ingestion broken. |
| Library loading locale | **OBSERVED DEFECT** | English route showed literal "Loading / Đang tải…"; source hardcodes it in §apps/web/src/app/[locale]/library/loading.tsx§. |
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

Existing source/CI acceptance for V0–V5 remains governed by its original append-only records. Do not rewrite old run outcomes or transplant historical test totals as V6 proof. New development must preserve required GitHub §verify§ and all prior test suites. Updates to this ledger must be evidence-backed in the implementing PR.

See [V6_PLAN.md](V6_PLAN.md) and [V6A_UI_STABILIZATION.md](V6A_UI_STABILIZATION.md).

## 6. V6A Batch A1 — uncommitted local candidate (2026-10-20 UTC)

This entry supersedes the initialization-only state for **A1 only**. The earlier matrix, milestone rows, operator observations and failures retain their receipt-time meaning. No V6A-03 or later implementation, whole-V6A acceptance, publication or deployment is claimed.

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

This is the current **local pre-commit** receipt. §6 retains its earlier source-bound results, NOT RUN states and failed attempts; those are not silently rewritten as passes. The maintainer subsequently authorized the full local gates on fresh owned loopback databases and explicitly confirmed unchanged, isolated test-only V4 fixtures. No operator/hosted V4 setting was enabled.

### Candidate and complete diff review

- Existing worktree/branch/base remain `E:\TaleAtlas-v6a-loading-library`, `fix/v6a-loading-library`, `86030bf3926646e4e2490b0883ff224d1e40adbd`; index empty. The same nine files remain the candidate: four product files, four test/helper files and this ledger. All nine initial versions were copied and hash-verified into a fresh ignored review directory before corrections. No worktree was recreated or historical change discarded.
- Complete tracked diffs plus both untracked files were reviewed. The four product files and three unit files retain the exact hashes recorded in §6: selected-locale status text/central copy, filter-only row CSS, validated filter-state form key/native Reset, and focused regression coverage. No new product change was needed in this review.
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
| Focused four-file unit selection from §6 | **PASS: 110/110, 4 files** | Both loading locales, SSR/hydration/rebinding/native GET, auth/privacy denial units and EntryControls/library interactions. |
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

The final helper hash is `43feb1bf333fbcecfbbb6f7f1a64bea41167f7e3a4a04aab0a793aa445679d81`; the former `8d24…` in §6 correctly identifies its earlier version. All four product and three unit-file hashes still match the initial candidate. Initial versions, all failure receipts and new evidence are retained; no staging/commit/push/PR/merge/deployment occurred.

### Prior 15-second timeout: investigation and classification

The [original failure](<../.local/v6a-a1-ui-482a76ca-d7d2-4085-a48e-f64e41704db0/evidence/failure.json>) remains **FAIL**: the pending hydration marker did not appear within15000ms at EN/empty/1440/light after EN flow/keyboard groups and12 geometry groups had completed. Its tracked browser-error list was empty. The preserved [development log](<../.local/v6a-a1-ui-482a76ca-d7d2-4085-a48e-f64e41704db0/.next/dev/logs/next-development.log>) shows startup/route compilation, browser activity through+03:34 and no recorded server/client error; the owner readiness and earlier hydration/navigation cases had already succeeded. It was therefore not a failure of the initial startup-readiness gate.

**Classification: unresolved fixture/client-readiness or environmental timing, not a demonstrated A1 language/filter regression.** The old run did not capture the failed DOM/probe state, request timing or resource/scheduler profile, so the exact cause cannot be established or an intermittent product issue categorically excluded. Failure-only diagnostics were added later and cannot retroactively explain it. The later §6 pass, this review's74-group pass and complete native production passes establish later successes only. The safety fixes in this review address separate lifecycle/import-boundary findings, **not** that timeout. No timeout increase, automatic retry or weakened assertion was used. Retain the timing issue as an explicit PR-review risk rather than claim it resolved.

### Cleanup, limitations and decision

Owned postmaster identity was reverified before official `pg_ctl -D <exact-owned-data-directory> -m fast -w stop`; cleanup completed00:41:09. Subsequent read-only checks confirmed no listeners on the owned SQL58435/native60023/mail1025/inbox1026 ports and no owned PostgreSQL process. Only run-created resources were stopped; database files/logs/reports/snapshots remain preserved. There was no global or process-name-wide shutdown, no termination of unverified PIDs, no unrelated cluster operation and no shared-manifest overwrite. The browser helper reported successful owned-child teardown.

Final00:50:27 preservation checks passed: main exact/clean; all six historical worktree HEAD/status/index states preserved;512 protected source entries/eight historical fingerprints/four optional performance files/two acknowledged generated-file modifications unchanged. All nine initial candidate snapshots still match their captured hashes. Only this ledger and the scoped browser-helper safety corrections changed during this review; the four product and three unit files are unchanged. Candidate inventory remains seven tracked modifications plus two untracked additions, index empty; no schema/dependency/global CSS/workflow/server-service change.

- **NOT RUN:** actual browser-UI 200% zoom, screen reader/manual composed contrast, broad low-end performance, clean Linux/PG17 execution of this candidate, candidate GitHub CI or hosted staging/production acceptance. Existing full native scenarios are not a WCAG certification or a hosted SMTP delivery result. Earlier operator SMTP observations remain unverified; no SMTP product/infrastructure change was made.
- Existing lazy-placeholder LCP advisories remain non-fatal observations, not an A1 performance fix.
- **Recommendation: GO for a scoped A1 commit and review PR, only after explicit maintainer approval.** All applicable local gates above passed and no release-blocking A1 product defect was identified. This is not authority to stage/publish now, not merge/deploy approval, not whole-V6A acceptance, and not permission to start A2. Mandatory real PR/main CI, including Linux/PostgreSQL17, still governs merge acceptance; the historical timeout and manual-validation limits must remain disclosed.
