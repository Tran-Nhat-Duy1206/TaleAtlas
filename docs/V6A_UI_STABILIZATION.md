# V6A — UI/UX Stabilization and Hosted Account Verification

**Status:** PROPOSED / NOT IMPLEMENTED
**Baseline:** main 55ec938228338960f2612206bcf8ca47f3e5d5d0; user-observed protected Vercel Preview on branch `staging`, not public Production acceptance.
**Objective:** Remove observed UI defects and confirm reliable hosted email verification without weakening existing functional, privacy or security contracts.

## A. Evidence and triage rules

The owner observed these English desktop pages in an authenticated staging session: `/en/works`, `/en/library`, `/en/requests`, and `/en/requests/new`, plus a library loading state. Screenshots show behavior but do not by themselves prove all device sizes, browsers, server faults, or root causes. Sensitive screenshots, cookies and verification links must not be checked into the public repository.

| ID | Priority | Observation / investigation target | Code to inspect first |
| --- | --- | --- | --- |
| V6A-01 | P0 | `Loading / Đang tải…` appears together on an English route | `apps/web/src/app/[locale]/library/loading.tsx`; locale dictionaries; route loading conventions |
| V6A-02 | P0 | Library controls stack or drift toward the right with excessive empty space | `apps/web/src/components/library/library.module.css`; `apps/web/src/app/[locale]/library/page.tsx`; global form rule |
| V6A-03 | P0 | Catalog filter fields have uneven vertical alignment; long original-language help dominates a row | `apps/web/src/components/catalog/catalog.module.css`; `PublicCatalog.tsx` |
| V6A-04 | P0 | My Requests headings/links are visually crowded and appear to overlap | `apps/web/src/components/requests/request.module.css`; `apps/web/src/app/[locale]/requests/page.tsx` |
| V6A-05 | P0 | Hosted sign-up shows verify-email page, but a POST emitted `auth.mail` Error (level 50) and Mailtrap showed zero messages at the time | `apps/web/src/server/auth.ts`, mail configuration and sanitized Vercel request logs |
| V6A-06 | P1 | Request form is dense and difficult to scan | `apps/web/src/components/requests/NewRequestForm.tsx` and `request.module.css` |
| V6A-07 | P1 | Empty catalog and library states are unhelpful | `PublicCatalog.tsx`, Library page and copy |
| V6A-08 | P1 | Session/loading header can show Sign in before final signed-in state; investigate flicker/race | `apps/web/src/components/shell.tsx`; session/hydration |
| V6A-09 | P1 | Inconsistent typography, spacing and content density across routes | `apps/web/src/app/globals.css`; scoped CSS modules |
| V6A-10 | P1 | Responsive, keyboard, zoom, EN/VI and theme behavior lacks observed hosted evidence | affected pages and tests |
| V6A-11 | P0 gate | Regression coverage must be additive for each correction | existing Playwright, unit and integration suites |
| V6A-12 | P0 gate | CI/hosted acceptance must be complete before declaring done | existing workflows and [V6_VALIDATION.md](V6_VALIDATION.md) |

Existing source contains `form { display: flex; flex-direction: column; gap: 20px; }` in `globals.css`; CSS modules must safely override this for their own filter layouts. `loading.tsx` currently hardcodes the bilingual string. These are review starting points, **not** authorization to perform broad/global CSS rewrites.

**Important non-bug:** `0 works found` is an honest result if there are no published Works in the isolated staging database. Do not fabricate publications, popularity or covers to make the layout appear populated. The previous readiness endpoint returned `unavailable` transiently and later `ok` after reloads; a database connection failure is not established from the UI screenshots.

## B. Task contracts and acceptance

### V6A-01 — Locale-correct loading state (P0)
- Replace any simultaneous EN/VI hardcoded loading copy with the single selected route locale, preserving server-rendered accessibility and correct `lang` where supported.
- Respect Next.js loading-component constraints. Do not use fragile user-controlled pathname parsing or leak request/session state as a shortcut.
- Acceptance: English URL renders **Loading…** alone; Vietnamese URL renders **Đang tải…** alone, including direct refresh and navigation transitions. No bilingual concatenation. Accessible `role=status`; avoid flash of wrong language.
- Check any other route-specific loading fallbacks and centralized translations.

### V6A-02 — Library layout and controls (P0)
- Scope form layout fixes to Library; align status, favorite, sort and actions as a coherent desktop group. Use responsive wrapping/stacking at narrower widths.
- Preserve server GET query, default selection, filters, authorization, history privacy and existing UI semantics.
- Acceptance: no isolated controls at far right, unintended giant whitespace from form layout, clipping or horizontal overflow at 375/768/1280/1440px; empty state remains understandable; query behavior unchanged.

### V6A-03 — Catalog filtering and helper information (P0)
- Give title search, format, genre, original-language and release-status controls predictable alignment and adequate widths; actions belong to the form.
- Shorten or relocate original-language help without discarding exact-tag/case-sensitivity rules, label associations or screen-reader descriptions; tooltip-only explanations must have an accessible alternative.
- Acceptance: fields and search actions remain usable at target breakpoints, long copy does not vertically displace peer inputs, all existing V5C query validation, URLs and filter semantics are preserved.

### V6A-04 — My Requests information hierarchy (P0)
- Separate heading, edit-suggestions link and New Request CTA; visually group owned and followed requests; provide usable list/empty/pagination spacing.
- Acceptance: no overlapping/concatenated-looking text in EN or VI, keyboard order is logical, empty and populated states remain distinct, pagination and sign-in protections unchanged.
- Prefer local styles, not a global heading rule that risks all existing pages.

### V6A-05 — Hosted SMTP and account acceptance (P0; separate operations track)
- Current **observed failure**: at sign-up time, HTTP 200 did not imply an email was delivered. Sanitized server operation `auth.mail` logged level 50 / `Server operation failed`, and Mailtrap Sandbox showed 0 messages.
- SMTP-related Vercel Preview variables were subsequently edited; whether the currently running Preview contains the corrected values, and whether the full email flow now passes, is **UNVERIFIED**. Do not claim a root cause from a generic sanitized log.
- First check the current deployment SHA/time and correct Preview branch variable scope; if variables changed, obtain separately approved Preview deployment and test exactly one bounded synthetic flow. Compare dashboard counts and sanitized logs.
- Investigate STARTTLS/port 587, sender, provider sandbox authentication and runtime connectivity privately if the failure persists. Never publish a password, full URL, callback/verification token, raw request headers or real user email.
- Acceptance: one synthetic registration receives sandbox verification mail; link successfully verifies the account; login/logout works; existing secure-cookie, role and CSRF checks still pass. Do not bypass email verification to pass the test.

### V6A-06 — Progressive Request a Story form (P1)
- Keep title and format clearly required and all other fields optional. Group basic information and an expandable More details section (alternative titles, language, year, source, evidence and private notes).
- Preserve input constraints, data shape, disclaimer, idempotent submission keys, error visibility and existing server-side validation.
- Acceptance: desktop/mobile field labels are unambiguous; expanded content is keyboard accessible; invalid values are explained without deleting the draft; submission and revision behavior remain unchanged.

### V6A-07 — Honest empty/error states (P1)
- Make catalog-empty, filtered-no-match, private-library-empty and backend-unavailable states clearly distinguishable.
- Offer appropriate safe navigation/action (Browse, Clear filters, Request a story, Retry). Do not assume private library entries exist.
- Acceptance: no invented stories/ratings/statistics; private data remains protected; deterministic tests assert each state separately.

### V6A-08 — Session and header stability (P1)
- Reproduce the observed potential loading/signed-out/signed-in visual transition before changing auth behavior.
- Render an accessible pending state and stable header without incorrectly promising authentication while session is unresolved.
- Acceptance: no persistent auth flash, broken locale navigation or wrong-account links; anonymous/session-error/signed-in states retain correct server authorization.

### V6A-09 — Design system consistency (P1)
- Audit typography, headings, line height, controls, border contrast, spacing and empty/loading/error components; keep TaleAtlas branding, meaningful content hierarchy and EN/VI readability.
- Acceptance: agreed visual checklist on all scoped pages; no broad stylesheet regression. Do not add decorative motion here unless it is inexpensive and reduced-motion-aware.

### V6A-10 — Accessibility and responsive evidence (P1)
- Exercise target widths 375, 768, 1280, 1440px, 200% browser zoom, keyboard/focus, English/Vietnamese, light/dark/system and reduced-motion setting.
- Acceptance: labels and instructions remain connected, no horizontal clipping or overlapped text, focus visible and tab order coherent, contrast evaluated manually on critical controls. Automated tooling is not certification.

### V6A-11 — Test additions (P0 gate)
- Add exact regressions for the hardcoded locale loading string and representative Catalog/Library/Requests filter and empty states, account error handling and core navigation.
- Use isolated deterministic fixtures and real authorization boundaries; do not water down prior assertions, hardcode fake success, modify historical baselines, or skip failing suites.

### V6A-12 — Release and evidence gate (P0 gate)
- Document root cause, changed files, UI screenshots free of sensitive content, tested breakpoints and command/CI evidence, with failed attempts and known limitations.
- Run the actual repository-required install/lint/types/unit/SQL integration/build/E2E/audit jobs. Migration diff should remain empty for UI-only work.
- Submit code as a separately reviewed PR; do not merge to `main`, push `staging`, redeploy, promote, or alter infrastructure without specific approval.

## C. Work packaging for an agent

Recommended first implementation batch: V6A-01/02/03/04 (local CSS/layout and localization, with tests). Parallel isolated operations investigation: V6A-05. Second UI pass: V6A-06/07/08/09/10. Exit: V6A-11/12. Agents must provide a file/change inventory and request approval before any hosted operation. DSH task columns or board changes are not implied by this document.

## D. Out of scope

No social profile/feed API, recommendation engine, live scraping/provider, new migration, public posting, V4 flag change, production release, billing, mass data import or staged-data deletion in V6A. V6A is not an excuse to refactor unrelated pages or replace V3 privacy guarantees.

## E. References

[Design system](DESIGN_SYSTEM.md) · [V3 private library](V3_DOMAIN.md) · [V4 hosted boundary](V4_RELEASE_STATUS.md) · [V5C discovery](V5C_DISCOVERY.md) · [Operations](OPERATIONS.md) · [Evidence ledger](V6_VALIDATION.md).
