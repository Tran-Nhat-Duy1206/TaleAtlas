# V6 — Validation and Decision Ledger

**Status:** INITIALIZED / PLANNING ONLY — 2026-10-20
**Baseline:** main 55ec938228338960f2612206bcf8ca47f3e5d5d0
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

## 3. Proposed V6A implementation test matrix

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

## 4. Milestone state

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
