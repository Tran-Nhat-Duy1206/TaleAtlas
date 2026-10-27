# V6A-10 — Accessibility and responsive evidence

## Baseline, scope and acceptance boundary

- Application/source baseline: `45986e937ae17420c434834ca3ae3ae1222227cb`.
- Evidence-first branch: `test/v6a-accessibility-responsive-evidence`; isolated worktree: `E:\TaleAtlas-v6a-accessibility-responsive`.
- Authority: [V6A-10](V6A_UI_STABILIZATION.md#v6a-10--accessibility-and-responsive-evidence-p1).
- Only this document, the append-only validation ledger, the new browser spec, its pure helper and its unit tests are in scope. No application, CSS, existing test, configuration, dependency, authentication or server behavior is modified.
- This phase prepares measurement and reporting contracts. It does **not** complete A8 acceptance or certify accessibility. Authored cases are not executed evidence.

## Compact page/profile matrix

Baseline browser contexts use the existing Desktop Chrome fixture at its default 100% browser zoom; the viewport matrix does not prove genuine zoom accessibility. All explicit profiles have height **900 CSS pixels**, without device-scale, pinch, CSS zoom or font-size overrides.

| Profile | Width | Application locale | Explicit theme |
| ------- | ----: | ------------------ | -------------- |
| A       |   375 | VI                 | Dark           |
| B       |   768 | EN                 | Dark           |
| C       |  1280 | EN                 | Light          |
| D       |  1440 | VI                 | Light          |

| Page/flow                             | Profiles                          | Newly authored evidence scope                                                                                                                                            |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home/shared navigation                | A–D                               | Native initial Tab, visible skip link, bypass toward main, focus, horizontal bounds and representative contrast                                                          |
| Catalog                               | A–D                               | Main-scoped status, filters/labels, bounded geometry, real UUID nonmatch GET and honest recovery/empty structure                                                         |
| Recently Added and Releases           | A, C                              | Localized headings, containers/cards, bounded wrapping/geometry and representative color samples                                                                         |
| Login                                 | A, C                              | Existing localized labels, visible controls, geometry and bounded color samples                                                                                          |
| Library, My Requests, Request a Story | A, C                              | One real synthetic owner per flow; private empty/recovery structure, native Library GET, descriptions, real invalid-form summary and native disclosure keyboard behavior |
| Settings                              | A, C                              | Real owner page, labels/control geometry; VI owner also exercises System resolution                                                                                      |
| System theme                          | EN Home; VI Settings              | Actual preference control; emulated OS light → dark → light and reload persistence                                                                                       |
| Reduced motion                        | EN Home, isolated page preference | Runtime media preference, non-smooth scrolling and suppressed transitions; static transforms are not automatically failures                                              |

The source defines **14 cases**: eight Home/Catalog cases, two public route samplers, two genuine-owner samplers, one Home System case and one reduced-motion case. This is representative axis coverage, not every page × state × locale × theme × width permutation. Add an opposing profile only after a demonstrated interaction requires investigation.

## Existing coverage reused, not reimplemented

Inspection of the current baseline's existing browser source establishes these authored contracts:

- Foundation: header geometry/focus, account presentation states, theme persistence, public primary color pairs and utility-heading/container checks.
- Requests: EN/VI, all four target widths, light/dark, empty/populated geometry, wrapping, native disclosure, validation/error focus and retained drafts.
- Library: genuine owner/privacy workflows, empty versus filtered-zero versus out-of-range recovery, and narrow-screen controls.
- Catalog/discovery: actual SQL-owned records, native filter/pagination/locale navigation and honest no-match recovery. Existing text-font enlargement is explicitly **not** genuine browser zoom.

The maintainer reports that baseline main's mandatory CI passed. This is **previously verified existing-CI evidence as reported by the maintainer**, not a new A8 execution or a reviewed set of per-cell measurements. No historical CI artifacts or diagnostics were queried. Existing tests, assertions, fixtures, deadlines, workers and retry policies remain unchanged.

## Newly authored measurement definitions

### Geometry, labels and keyboard

- Use actual document/body scroll extents and the current document's client width; allow at most one CSS pixel of horizontal rounding tolerance.
- Validate finite bounded rectangles. Classify essential-control bounds and sampled container/card geometry relative to the current document, not another document's scrollbar-dependent absolute coordinates.
- Check peer controls rather than treating legitimate parent/child nesting, native text-input scrolling or decorative/off-screen content as an overlap defect.
- Label/description checks return booleans for connected nonempty associations; no label text, input values or HTML is retained in measurements.
- Real keyboard Tab/Enter/Space events exercise skip navigation, representative visible focus and native disclosure. Fragment navigation need not make `main` the active element; the next Tab must bypass the header and reach main content.
- Invalid Request a Story submission uses the real client/native validation path, not a fabricated response. Error-summary field links and descriptions are checked without creating a valid request or extending an authenticated lifecycle.
- Numeric geometry and computed focus styles are not proof of physical glyph bounds, complete clipping freedom, visual tab-order quality or screen-reader announcements.
- Sampling is explicit: at most 128 essential elements, eight direct-section roots and eight article/settings-card boxes, with bounded label text-node/fragment checks. Reaching a measurement cap is a measurement limitation, not an application defect. Peer checks ignore ancestor containment and intersections no larger than the one-pixel edge tolerance.
- Initial keyboard cases reload after choosing a theme. Reload is not a universal focus/scroll-reset guarantee; if native restoration is observed, classify that as a test-setup defect and verify with fresh `about:blank` then real target navigation in the same context, not an application fix. This portability risk has not been reproduced locally.

### Colors and contrast

The pure helper accepts bounded sRGB hex and supported RGB/RGBA forms, validates channels and alpha, composites colors, computes linearized sRGB luminance, and classifies **unrounded** ratios. Unsupported color spaces and malformed/unbounded values are rejected with fixed errors, never echoed. This is a deliberately restricted parser: comma-form RGB/RGBA aliases and exponent notation are not supported; encountering them requires manual review, not a false contrast verdict.

Applicable thresholds are 4.5:1 for normal text, 3:1 for qualifying large text (24 CSS pixels, or approximately 18.667 CSS pixels at bold weight), and 3:1 for an applicable essential non-text focus indicator. Disabled controls and decorative borders are not blanket failures.

Browser sampling is conservative: use an actual opaque ancestor/body backdrop and handle the supported solid primary-hover group opacity as group compositing, not foreground alpha alone. Images, filters, complex/unknown ancestor compositing, unsupported colors and uncertain applicability remain **NOT VERIFIED / manual review required**, never automatic PASS. Samples are bounded and private; a passing test is not an assertion that every control, state or pixel was measured. Antialiased text-edge pixels are not substituted for semantic foreground/background colors.

### System and reduced motion

Choose System through the actual footer preference control, emulate light → dark → light, and verify both resolved class/palette and persistence. Emulation is evidence of the web preference behavior, not every operating system's native integration.

Use a page-scoped `reducedMotion: "reduce"` preference and restore/dispose it afterward. Check actual computed scrolling/transition behavior. Do not demand removal of every instantaneous transform or alter existing configuration globally.

## Privacy and reporting contracts

- The helper has no logging, network, storage, DOM collection or public-reporting side effects.
- Observation records have exact allowlisted keys, static case/state/profile enums, an authoritative caller-supplied source SHA, bounded finite numbers, fixed outcomes and fixed failure codes. Unknown keys, accessors, symbols, custom prototypes, unsupported categories, unsafe/unbounded values and inconsistent unexecuted receipts are rejected.
- Projection reconstructs a new record; it does not serialize the original input. `NOT_RUN` has no measurement values. `NOT_VERIFIED` requires a fixed explanatory reason. A valid record is not itself proof that a measurement occurred.
- Browser assertions introduce only fixed titles/codes and boolean/numeric checks. New test errors are sanitized without retaining arbitrary causes. Genuine setup and cleanup also remain within this boundary.
- No account identities, emails, notes, field contents, URL queries/hashes, response bodies, cookies, credentials, tokens, certificates, unrestricted exception strings, DOM/HTML or raw accessibility snapshots enter the observation schema.
- There are no new screenshots, attachments, uploads, reporters or diagnostic channels. Existing traces, HTML reports and fixture navigation attachments remain private under the existing wrapper's confidentiality protections.
- Detailed measurements are private. Ordinary Linux CI publishes aggregate native PASS/FAIL, not a downloadable numerical matrix. Richer diagnostic execution/public evidence projection requires separate explicit authorization; no workflow is changed here.

## Genuine 200% browser zoom — manual procedure

**GENUINE 200% BROWSER ZOOM: NOT RUN.** No approved interactive headed session is assumed or created.

1. Use an already-approved headed browser connected only to the approved disposable native test environment. Fix physical window dimensions and OS scaling; record browser/platform versions and relevant accessibility settings without host/account identifiers.
2. Set browser zoom to **100% using browser chrome**. Record the displayed value, outer window dimensions, CSS viewport dimensions and DPR. DPR alone is not proof of zoom.
3. Set zoom to **200% using browser chrome** and verify the displayed browser zoom value; keep the physical window and OS scaling fixed.
4. Repeat selected skip/navigation, Catalog controls, private form/disclosure, recovery and focus checks in EN/VI and representative themes. Horizontal scrolling, hidden essential controls, overlap or obscured focus must be described as observable symptoms, not assumed from a smaller CSS viewport.
5. Record resulting CSS viewport metrics and case outcomes with privacy-safe IDs. Keep any browser-chrome capture or account-bearing image private; do not upload raw browser artifacts.
6. Restore **100% through browser chrome** and verify restoration.
7. If no approved interactive environment exists, keep this row NOT RUN. Do not create Windows/WSL/Docker/PostgreSQL/TLS infrastructure or weaken acceptance.

Viewport resizing, CSS `zoom`, font enlargement, DPR overrides, CDP pinch scaling and page-directed keyboard shortcuts without confirmed browser-chrome zoom are **not equivalent evidence**.

## Human review still required

- A real screen reader: accessible names/descriptions, skip destination/reading position, meaningful tab order, repeated validation and status announcements, disclosure behavior and focus continuity during async state changes.
- Vietnamese diacritics, actual fallback glyphs, line wrapping and clipped focus at narrow widths and true zoom. Computed font-family and DOM rectangles do not prove glyph quality.
- Critical rendered text/control/focus contrast, uncertain compositing and state applicability.
- Forced header pending/error and Library loading/server-error observations where safely and reproducibly supported by the existing fixture. These are not newly fabricated or inferred by pausing an entire document.

Record application locale separately from browser/AT locale; native browser validation wording may follow the latter. Unavailable tools or sessions remain NOT RUN rather than receiving fabricated measurements.

## Implementation receipts and evidence status

Local receipts were independently obtained on **2026-10-26 UTC**, Node 24.19.0 / pnpm 11.7.0, for this uncommitted A8 test/documentation patch on the stated baseline. The three new TypeScript file hashes were frozen before the full gate sequence and remained unchanged. No result below is a new GitHub CI or production acceptance claim. Math/privacy and browser-source read-only reviews returned NoBlock; runtime cautions above remain unverified.

Outcome vocabulary: **PASS** means the stated check actually executed successfully; **FAIL** means an executed check failed and still requires application/fixture/measurement/inconclusive classification; **NOT RUN** means no execution and no measured values; **NOT VERIFIED** means insufficient coverage, unsupported measurement or a manual-review requirement. There were no observed local validation failures. Authored browser cases do not receive PASS merely because they typecheck.

| Evidence                                                          | Status                    | Meaning                                                                                                    |
| ----------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Existing baseline mandatory CI                                    | PASS, maintainer-reported | Existing source coverage only; no A8 numeric artifacts independently reviewed                              |
| New helper unit contracts                                         | PASS: 55 / 0              | Independently executed helper arithmetic/privacy contracts, not browser evidence                           |
| New browser spec syntax/type/static discovery                     | PASS                      | Focused test-configuration TypeScript and static 14-case discovery; no browser execution                   |
| Frozen install / full units / typecheck / lint / production build | PASS                      | One frozen install; full units 2,416 passed / 0 failed, 76 files; one typecheck, lint and production build |
| New A8 real-browser matrix                                        | AUTHORED — NOT RUN        | No approved functioning local disposable browser environment identified                                    |
| Real computed browser geometry/contrast/focus observations        | NOT RUN                   | No invented numeric results                                                                                |
| Genuine browser-chrome 200% zoom                                  | NOT RUN                   | Manual procedure above; viewport matrix is not a substitute                                                |
| Human AT / Vietnamese glyph / clipped focus / manual contrast     | NOT RUN                   | Required follow-up evidence                                                                                |
| Header fault-state and complex-compositing claims                 | NOT VERIFIED              | Explicit coverage/measurement limitations, not confirmed defects                                           |

No independently confirmed P0/P1 browser defect exists from this implementation-only phase. Future failures must be classified as confirmed application defect, test/fixture defect, measurement limitation or inconclusive, with pinned source, profile and a fixed observable failure category. No source fix is authorized here. A source fix requires separate evidence-supported scope approval.

## Follow-up boundary

After separate publication authorization, the additive spec is discovered by the unchanged ordinary Linux native suite; no special workflow is needed. Preserve its database/SMTP/TLS guards and all required jobs. Do not rerun historical workflows or start a diagnostic automatically. Tests/docs infrastructure readiness and eligibility for a scoped commit are distinct from full A8/manual acceptance, merge or deployment readiness.

## A10 current-source accessibility reconciliation — 2026-10-27 UTC

### Source pin and historical boundary

This append reconciles the supplied current-source/CI receipts against the historical evidence above; it does not rewrite their time scope or claim a new local execution. Current source is exact main [`0eef3e50020f5035fc9789a499863e6aa9fe7fe3`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/0eef3e50020f5035fc9789a499863e6aa9fe7fe3), with [PR #24](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/24) (A9) merged. The original local **AUTHORED — NOT RUN** browser rows remain valid for that earlier phase; later CI execution is recorded separately below.

- Current main CI: [run 40441344619](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619), attempt `1`; all five required CI results and their actual steps **PASS**.
- Legacy [CI job 121984296826](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40441344619/job/121984296826), step `14`, actually completed the real production HTTPS / native guarded SMTP suite. Its whole source-configured base includes the 14 previously authored A8 browser cases: these were **later executed by that passing complete legacy CI suite**, not merely discovered or typechecked.
- Current A9 source adds two body blocks with four EN/VI observations; these are **not new A8 cases** and do not increase the historical 14-case A8 count.
- [PR #23](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/23)'s final scope was eight files at feature head [`ed786afdc36221a2ea68ea113f6cb63a5e0ea56a`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/ed786afdc36221a2ea68ea113f6cb63a5e0ea56a): corrected closed-`details` geometry, foundation-stable per-actor IP behavior, and 25 new geometry unit tests. The [corrective comment](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/23#issuecomment-6426695254) records that correction. The original five-file phase described above remains historically valid, not overwritten by the final scope.
- The full batch/CI and migration-history reconciliation is in the [validation ledger](<V6_VALIDATION.md>), under “V6A A10 — Source-pinned evidence reconciliation (2026-10-27 UTC)”. No migration or source change is implied here.

Current source references, evaluated at the pinned SHA: [browser spec](<../tests/e2e/accessibility-responsive.spec.ts>), [DOM geometry sampler](<../tests/helpers/accessibility-geometry.ts>) and [pure evidence contracts](<../tests/helpers/accessibility-evidence.ts>). This documentation-only append does not introduce tests, helper changes or fresh execution receipts.

### What the current automated PASS supports

| Evidence axis | Supported claim | Boundary |
| --- | --- | --- |
| Responsive profiles | Bounded-viewport assertions at 375/VI/dark, 768/EN/dark, 1280/EN/light and 1440/VI/light PASS within the actual assertions | Representative route/profile selection, not every Cartesian combination or per-pixel measurement |
| Keyboard and forms | Representative keyboard focus, skip/disclosure interaction and real invalid-form checks PASS within the actual assertions | Not complete manual tab-order, visual focus/clipping or announcement review |
| Locale and theme | Asserted EN/VI, light/dark and actual System preference-control behavior PASS | No universal locale/theme/state certification; OS preference emulation is not every native OS integration |
| Reduced motion | Asserted runtime preference and bounded scrolling/transition checks PASS | Not every animation or visual state reviewed |
| Geometry and conservative contrast contracts | Bounded geometry and applicable supported contrast assertions passed; unsupported/inapplicable samples retain their authored classifications | Not manual rendered contrast, physical glyph inspection or every control/state/pixel |
| Public CI reporting | Wrapper reports aggregate native PASS/FAIL | Not an individually published numerical observation matrix |

A headless width change is **not** genuine browser-chrome 200% zoom evidence. Successful assertions do not silently convert unsupported samples or unreviewed visual states into PASS. These are source-pinned automated results, not a fresh local browser review by this reconciliation author.

### Remaining acceptance matrix

The [roadmap authority](<V6A_UI_STABILIZATION.md#v6a-10--accessibility-and-responsive-evidence-p1>) still requires literal 200% browser zoom, EN/VI readability, visible focus/coherent tab order and manual critical-control contrast. Human AT is an explicit existing A8 follow-up above; this is not a claim to certify every WCAG or AT/browser combination.

| Remaining evidence | Current status | Required distinction |
| --- | --- | --- |
| True browser-chrome 200% zoom | **STILL NOT RUN** | Verify actual browser UI zoom; responsive width, CSS zoom, DPR, pinch and font enlargement are not substitutes |
| Human assistive-technology review | **STILL NOT RUN** | Real screen-reader names, reading position, announcements, disclosure and focus continuity; distinguish application locale from AT/browser locale |
| VI physical glyphs and wrapping | **STILL NOT RUN** | Human review of actual diacritics, fallback glyphs and rendered wrapping, including true zoom |
| Manual visible-focus clipping and tab order | **STILL NOT RUN** | Numeric bounds and computed styles alone cannot prove perceptual visibility or coherent traversal |
| Manual critical rendered contrast | **STILL NOT RUN** | Review actual important text/control/focus states and applicability |
| Applicable complex composites, unsupported colors, images and filters | **STILL NOT VERIFIED** | Unsupported measurement remains manual-review work, not an automatic contrast verdict |
| Actual intermediate Library route Loading on navigation and refresh | **STILL NOT VERIFIED** | SSR/hydration unit coverage is not proof of the native rendered intermediate interval |
| Other browser visual states without review | **STILL NOT VERIFIED** | Neither source assertions nor historical receipts imply reviewed rendering |
| Hosted V6A-05 P0 | **NOT VERIFIED** | Native guarded SMTP evidence does not close hosted acceptance |
| Deployment | **NOT AUTHORIZED** | Automated PASS is not permission to deploy or perform hosted operations |

A nonessential item may become NOT APPLICABLE only through a documented applicability judgment. Missing tools, permissions or review time do not establish non-applicability. Applicable mandatory work remains open.

### Screenshot inventory and privacy limits

Historical documentation records A1 Library's 64 PNG names, A2 Catalog's 72 final / 22 baseline images, and separate Reset image metadata, with their old roots verified at that time. These are historical inventory receipts, not a current-source screenshot acceptance set.

- This reconciliation has **not opened the images**, verified their privacy, or verified a collection at the current source SHA. No private roots, accounts, emails, raw HTML, tokens, queried URLs or project environment values are reproduced here.
- For Home, My Requests, New Request, Login and Settings, no qualifying **current-source, privacy-approved review manifest was found in the scoped documents/PRs**. Status is **NOT VERIFIED**; this is not a claim of global absence.
- The current CI run has **zero uploaded artifacts**. That does not prove nothing was captured locally on the runner, and is not a reason or authorization to upload raw images.
- Existing local historical receipts remain historical. Inventory existence, filename counts and aggregate CI PASS do not silently certify visual review or privacy approval.

### Proposed follow-up — separate approval required

No manual execution or capture is authorized by this proposal. Only after separate approval, conduct a private headed review in an **existing approved disposable environment**, without new infrastructure:

1. Verify browser chrome at 100% → 200% → restored 100%, fixing the physical window and OS scaling; record relevant physical-window/CSS-viewport/DPR metrics and the actual UI zoom verification. Do not fake zoom with CSS, DPR, pinch or viewport resizing.
2. Exercise real System and reduced-motion settings; review representative EN/VI reading, focus, disclosure, invalid-form and recovery states. Record application locale separately from screen-reader/AT/browser locale.
3. Keep all private-account images private, **including synthetic-account images**; synthetic content is not publication permission. Public anonymous images require content/privacy review before any publication.
4. Limit any public manifest to static case ID, source SHA, page category, profile, actual review time and outcomes. Do not publish host paths, users, query strings, tokens or account-bearing captures.
5. Record manual cases as **NOT RUN until actually executed**; record unsupported or inconclusive observations honestly and obtain separate scope approval before fixes or new tests.

Only documentation validation and read-only evidence inspection are performed for this append. No application tests, installs, type/lint/build gates, SQL operations, browser sessions, screenshot captures/uploads, hosted acceptance checks, CI/workflow executions, dependency changes, commits, pushes, PRs, merges or deployments are performed. No source assets or helpers are added.

### Decision

**GO only for a future separately authorized documentation commit**, subject to local validation of the exact append-only prefix and two-document scope. **NO-GO for whole-V6A closure**: full V6A/evidence/accessibility acceptance remains **INCOMPLETE**, manual evidence remains open, hosted V6A-05 P0 is not verified, and deployment is not authorized.
