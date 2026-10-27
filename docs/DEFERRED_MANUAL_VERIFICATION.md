# Deferred Manual and External Verification

**Policy:** Implement approved code and complete safely available automated validation first. This is the single current manual/external verification backlog for TaleAtlas, not only V6A.

**Initial evidence baseline:** [`841cc7a1fe0967cd2d8554893eae0a962d847fa0`](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/commit/841cc7a1fe0967cd2d8554893eae0a962d847fa0), 2026-10-27 UTC. V6A A1–A9 and A10 documentation are merged; required automated CI is maintainer-verified green in [run 40453021484](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/40453021484). No new execution is claimed by creating this file.

## Workflow and status rules

1. Implement only the separately authorized coding batch; run its available automated checks and correct confirmed implementation/test defects.
2. Update an existing verification ID below when its scope matches. Create a new ID only for genuinely distinct manual/external work. Other validation documents remain historical evidence, not additional live deferred queues.
3. Record missing credentials, provider access, infrastructure or human inspection without repeated provider investigations or permission troubleshooting during normal coding. Do not repeatedly request Vercel, Mailtrap, screenshots or browser review.
4. Report code/automated readiness separately from end-to-end acceptance. Pending external/manual checks do not automatically block unrelated, separately authorized coding. They still prevent unsupported acceptance or release claims.
5. Execute this backlog only when the maintainer explicitly authorizes the final manual acceptance phase and its exact environment/scope. Deployments, provider/variable changes, email sends and production operations require explicit authorization; a checklist is not permission.
6. On completion, record source/deployment, environment, date, safe reviewer/case reference and observed outcome. Preserve failed attempts and earlier receipts; do not silently turn historical FAIL or NOT RUN into PASS. Reassess affected entries when source/configuration changes invalidate their evidence.

**Allowed current statuses:** **NOT RUN** (the scoped check has not been performed), **NOT VERIFIED** (evidence is incomplete or insufficient), **FAIL** (an executed check failed), **PASS** (the scoped check executed successfully with a referenced receipt). Authorization is a separate field: NOT AUTHORIZED is not a test result. Check a box only after an evidenced PASS; a future procedure is not a result.

**Never defer an observed automated failure:** required GitHub CI, unit tests, SQL integration, native browser E2E, typecheck, lint, production build, security audits and migration safety remain mandatory. Handle confirmed regressions/security issues through the ordinary scoped correction workflow; do not relabel them as manual gaps, weaken assertions, add success-masking navigation or mark them PASS to continue. Stop an affected unsafe flow and escalate confirmed security issues appropriately.

**Privacy and cleanup:** Publish only safe case IDs, source/deployment references, profiles and aggregate outcomes. Never publish account identities, addresses, private Library/Request content, verification links, credentials, cookies/tokens, raw HTML/responses/traces, secret variable values or host-specific private paths. Keep authenticated images private even for synthetic accounts. Request explicit exact-owned cleanup permission; never purge shared inboxes, other users' records or databases. No protection bypass, synthetic session fabrication, rate-limit reset or unapproved retries.

**Current acceptance decision:** Code/CI readiness at the baseline is separate from full V6A acceptance. Hosted/manual evidence remains incomplete; **full V6A acceptance remains NO-GO**, not a NO-GO for separately authorized coding. Deployment/promotion remains **NOT AUTHORIZED**. This does not prevent planning or implementing the next separately authorized coding batch. Production release item DMV-005 is a future operational gate, not a newly invented V6A implementation requirement.

**Historical references:** [V6A contracts](<V6A_UI_STABILIZATION.md>), [validation and A10 reconciliation](<V6_VALIDATION.md>), [accessibility evidence](<V6A_ACCESSIBILITY_EVIDENCE.md>) and [testing boundaries](<TESTING.md>). Existing receipts remain unchanged. The latest read-only hosted preflight did not establish safe provider metadata access; no hosted acceptance flow was executed.

## Checklist index

- [ ] DMV-001 — Staging Preview deployment identity, configuration freshness and readiness — **NOT VERIFIED**
- [ ] DMV-002 — Hosted Mailtrap Sandbox delivery checkpoint — **NOT VERIFIED**
- [ ] DMV-003 — Genuine Preview registration → verification → login → logout — **NOT RUN**
- [ ] DMV-004 — Protected Preview access and applicable authentication/security checks — **NOT VERIFIED**
- [ ] DMV-005 — Production deployment and post-deployment smoke — **NOT RUN; NOT AUTHORIZED**
- [ ] DMV-006 — Genuine browser-chrome 200% zoom — **NOT RUN**
- [ ] DMV-007 — Human screen-reader spot checks — **NOT RUN**
- [ ] DMV-008 — Vietnamese glyphs, wrapping and clipping — **NOT RUN**
- [ ] DMV-009 — Visible focus, tab order and manual rendered contrast — **NOT RUN**
- [ ] DMV-010 — Current-source screenshot and visual review — **NOT VERIFIED**
- [ ] DMV-011 — Intermediate Library loading on refresh/navigation — **NOT VERIFIED**
- [ ] DMV-012 — Unsupported visual/compositing observations — **NOT VERIFIED**

## DMV-001 — Staging Preview deployment readiness

- **Feature/system area:** Vercel staging Preview; V6A-05 preflight.
- **Expected behavior:** The intended protected Preview resolves unambiguously to an approved deployment with known source/configuration and READY status.
- **Environment needed:** Authorized metadata-only Vercel access or a redacted operator receipt; no secret-value access.
- **Preconditions:** Maintainer has explicitly scheduled hosted acceptance. Identify the approved project and `staging` target privately; do not assume main is deployed.
- **Exact steps:** (1) Record deployment identity, source SHA, creation time and readiness. (2) Confirm branch/environment association and protection enabled. (3) Confirm relevant variable names, Preview/branch scope and update times without fetching values. (4) Establish whether that deployment includes those updates. (5) Privately confirm credentials route to Mailtrap Email Testing/Sandbox rather than real-recipient delivery before permitting DMV-002/003.
- **Expected successful result:** A source/deployment-pinned, protected, READY Preview with applicable configuration and Sandbox safety confirmed.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** Baseline above; [V6A-05](<V6A_UI_STABILIZATION.md>); [A10 hosted checklist](<V6_VALIDATION.md>). The earlier bounded preflight could not verify provider metadata safely.
- **Known limitation:** Current deployment identity, source/configuration freshness and provider scope are not established. Historical protection observations are not current confirmation.
- **Action if verification fails:** Record the exact missing/failed condition and stop hosted testing. Request a bounded operator decision only in the authorized acceptance phase; variable changes or a new deployment require separate approval. Do not retry permission discovery during unrelated coding.

## DMV-002 — Hosted Sandbox mail delivery

- **Feature/system area:** Hosted SMTP transport; V6A-05 P0 acceptance.
- **Expected behavior:** The approved Preview's real registration operation delivers verification mail to the approved Mailtrap Sandbox only.
- **Environment needed:** DMV-001-approved Preview and read access to the permitted Sandbox inbox; no real-recipient delivery environment.
- **Preconditions:** Explicit permission for one synthetic registration/email flow and private identity handling; DMV-001 passed. This is the delivery checkpoint of DMV-003, not a second registration or resend exercise.
- **Exact steps:** (1) Record a private before-observation for the permitted case. (2) Observe the single registration initiated under DMV-003. (3) Check for its matching verification message within the agreed observation window. (4) Record delivery outcome/time and safe case reference without exporting the message body, address or link.
- **Expected successful result:** The genuine verification message is received in the approved Sandbox, with no real-recipient delivery.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** [Historical SMTP failure and A10.7](<V6_VALIDATION.md>); [V6A-05](<V6A_UI_STABILIZATION.md>). Historical HTTP 200, sanitized `auth.mail` failure and zero messages remain historical; later variable edits have no successful pinned delivery receipt.
- **Known limitation:** Native Linux synthetic SMTP success is not hosted provider acceptance. Current failure is not established merely because current evidence is missing.
- **Action if verification fails:** Record FAIL if an executed delivery check fails; stop the flow. No automatic resend, SMTP connectivity probing, variable edits or redeploy. Obtain separate scoped correction approval. Mailbox cleanup must affect only the permitted message and require approval.

## DMV-003 — Genuine hosted account lifecycle

- **Feature/system area:** Preview registration, verification, login and logout; V6A-05.
- **Expected behavior:** One real synthetic account completes the normal verified-email lifecycle without bypassing authorization or email verification.
- **Environment needed:** Approved protected Preview, isolated browser session and the Sandbox from DMV-001/002.
- **Preconditions:** Explicit one-flow authorization, DMV-001 PASS, protection access granted normally, and a private unique case identity. Share this account/message with DMV-002 and DMV-004; do not create additional accounts for those entries.
- **Exact steps:** (1) Pin the approved deployed source and register once through the ordinary UI. (2) Confirm DMV-002 delivery. (3) Follow the genuine message link privately and observe verification. (4) Perform explicit login and confirm expected nonprivileged account access. (5) Log out and confirm protected application access is denied. (6) Close the isolated session and record exact-owned cleanup needs privately.
- **Expected successful result:** Registration → Sandbox mail → genuine verification → login → logout all succeed on the same pinned Preview/account.
- **Current status:** **NOT RUN** for this bounded current-source/deployment-pinned acceptance flow.
- **Related evidence:** [A10.7 operator receipt definition](<V6_VALIDATION.md>). Earlier partial signup activity is not a successful complete lifecycle receipt.
- **Known limitation:** A registration HTTP 200 alone proves neither mail delivery nor verification/login/logout. Main and Preview source may differ until DMV-001 establishes them.
- **Action if verification fails:** Preserve the step/outcome and stop; request a scoped correction, not a fake session or verification bypass. Account deletion or additional verification mail is outside the single-flow permission unless explicitly approved; retain a private cleanup obligation until authorized.

## DMV-004 — Preview protection and authentication/security

- **Feature/system area:** Deployment protection, cookies, role/access boundaries, CSRF/Origin and logout.
- **Expected behavior:** Preview access stays protected and the application retains its applicable security controls throughout the permitted account flow.
- **Environment needed:** Approved protected Preview, authorized operator access and the same isolated account/session as DMV-003.
- **Preconditions:** Explicit approval for the bounded checks, DMV-001 metadata/protection confirmation, and an agreed safe negative-check scope. No protection bypass, role changes or credential disclosure.
- **Exact steps:** (1) Observe the protection challenge in an unauthenticated private session without bypassing it. (2) Enter through normal permitted protection access. (3) During DMV-003, inspect applicable Secure/HttpOnly/SameSite flags privately without recording cookie values. (4) Check expected role/protected-route access and only the approved CSRF/Origin denial cases. (5) Confirm logout denies application access; retain safe Boolean outcomes only.
- **Expected successful result:** Protection remains enabled; applicable cookie, role/access, CSRF/Origin and logout controls behave correctly without exposing session material.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** [Hosted observations and acceptance requirements](<V6_VALIDATION.md>); [testing boundaries](<TESTING.md>). Historical Vercel Authentication observations and synthetic security CI are scoped evidence, not current hosted confirmation.
- **Known limitation:** Some checks require explicit negative-request permission; do not silently expand one registration flow into a broad security audit.
- **Action if verification fails:** Stop the affected unsafe flow, record FAIL for the observed security check and immediately request the ordinary scoped security/correction decision. Do not defer a confirmed security regression as a mere missing manual receipt or disable protection to proceed.

## DMV-005 — Future production release and smoke

- **Feature/system area:** Production deployment, promotion and post-deployment smoke.
- **Expected behavior:** Only an explicitly approved release reaches production, with source-pinned health and essential smoke evidence.
- **Environment needed:** Separately approved production project, release identity, operator permissions, safe smoke data and rollback/runbook ownership.
- **Preconditions:** **NOT AUTHORIZED.** A future release decision must explicitly approve deployment/promotion, exact source, smoke scope, any account/email operations and rollback actions; satisfy its required gates first.
- **Exact steps:** Only after that approval: (1) Reconcile the approved release with its required CI/acceptance receipts. (2) Execute only the authorized deployment/promotion procedure. (3) Confirm deployed SHA/readiness and approved health checks. (4) Execute the agreed minimal public/authentication smoke and observe its safe operational outcomes. (5) Record results and approved cleanup/rollback disposition.
- **Expected successful result:** The exact approved release is healthy and the defined production smoke passes without unauthorized mutations or disclosure.
- **Current status:** **NOT RUN**. **Authorization: NOT AUTHORIZED.**
- **Related evidence:** [V6A release boundary](<V6A_UI_STABILIZATION.md>); [A10 decisions](<V6_VALIDATION.md>). Green CI and merged documentation are not release permission.
- **Known limitation:** Production release is a future operational decision, not an action implied by this backlog or a prerequisite for unrelated coding.
- **Action if verification fails:** Stop promotion/further mutations, notify the maintainer and follow only the separately approved incident/rollback procedure. Never initiate an unapproved deployment or rollback to make the checklist green.

## DMV-006 — Genuine browser-chrome 200% zoom

- **Feature/system area:** V6A-10 accessibility and reflow.
- **Expected behavior:** Scoped pages and essential controls remain usable at genuine browser UI 200% zoom.
- **Environment needed:** Approved headed browser/OS, current approved source, representative public pages and disposable owner access where needed.
- **Preconditions:** Explicit manual-phase permission; fixed physical window/OS scaling; record browser/version, locale, source and starting viewport.
- **Exact steps:** (1) Set and observe browser chrome 100%. (2) Set and visually confirm browser chrome 200%, leaving the physical window/OS scale fixed. (3) Record actual CSS viewport/DPR and repeat representative reading, filter, disclosure and keyboard/focus interactions on scoped pages in EN/VI. (4) Check horizontal clipping/overlap and usable essential actions. (5) Restore browser chrome 100% and record the result.
- **Expected successful result:** Genuine 200% zoom is directly confirmed and covered interactions remain readable and usable, with any failure tied to its profile/state.
- **Current status:** **NOT RUN**.
- **Related evidence:** [A8 zoom procedure and A10 reconciliation](<V6A_ACCESSIBILITY_EVIDENCE.md>); [V6A-10](<V6A_UI_STABILIZATION.md>).
- **Known limitation:** Four viewport widths, CSS/font zoom, DPR or pinch overrides are not evidence of browser-chrome zoom. No WCAG certification is inferred.
- **Action if verification fails:** Record the exact page/profile/observable failure as FAIL and seek a bounded source/test correction. Do not substitute emulated zoom, weaken geometry assertions or claim missing observations passed.

## DMV-007 — Human screen-reader spot checks

- **Feature/system area:** Accessible reading, labels, state announcements and navigation continuity.
- **Expected behavior:** Representative scoped flows expose meaningful names/instructions and coherent reading/focus/announcement behavior to a human using assistive technology.
- **Environment needed:** Approved headed browser plus a named screen-reader/OS combination and a human reviewer.
- **Preconditions:** Manual-phase approval; approved source; record application locale separately from browser/AT language. Reuse permitted synthetic access rather than adding an account lifecycle.
- **Exact steps:** (1) Read representative Home/Catalog content and labels in EN/VI. (2) Traverse approved owner pages, native disclosure and invalid-form feedback. (3) Observe names, descriptions, headings, reading position, state announcements and focus continuity. (4) Record the actual browser/AT/locale scope and any unsupported combination without extrapolation.
- **Expected successful result:** The exercised flows are understandable and navigable, with directly observed announcement/focus outcomes recorded.
- **Current status:** **NOT RUN**.
- **Related evidence:** [A8 human AT follow-up](<V6A_ACCESSIBILITY_EVIDENCE.md>); [V6A acceptance scope](<V6A_UI_STABILIZATION.md>).
- **Known limitation:** Automated label associations do not prove announcements; one spot-check does not certify all screen readers or WCAG conformance.
- **Action if verification fails:** Record FAIL with safe expected/observed behavior and exact combination; request a scoped correction. Keep unsupported/unobserved combinations distinct from executed failures.

## DMV-008 — Vietnamese glyphs, wrapping and clipping

- **Feature/system area:** Vietnamese typography and responsive readability.
- **Expected behavior:** Diacritics, fallback fonts and wrapping remain legible without clipped text or essential content at the covered profiles.
- **Environment needed:** Human review of an approved current-source headed browser and its actual fonts/rendering.
- **Preconditions:** Manual-phase approval; use representative 375/768/1280/1440px profiles and applicable themes; use DMV-006's actual zoom observations rather than repeating its procedure.
- **Exact steps:** (1) Inspect VI Home, Catalog, Library, My Requests, Request a Story, Login and Settings in approved applicable states. (2) Check diacritics/fallback glyphs, labels, helper/error text and long wrapping. (3) Check narrow/desktop and recorded real-zoom states for clipping/overlap. (4) Record case/profile/source and the actual visual outcome.
- **Expected successful result:** All reviewed Vietnamese text is legible, wraps coherently and does not obscure essential content or actions.
- **Current status:** **NOT RUN**.
- **Related evidence:** [A8 VI/manual limits](<V6A_ACCESSIBILITY_EVIDENCE.md>); [V6A-09/10](<V6A_UI_STABILIZATION.md>).
- **Known limitation:** Numeric rectangles and successful English cases cannot establish Vietnamese physical glyph quality or every font/platform.
- **Action if verification fails:** Record FAIL for the exercised case, retain a privacy-safe reference and request only the supported typography/layout correction; do not begin a broad redesign.

## DMV-009 — Visible focus, tab order and rendered contrast

- **Feature/system area:** Human keyboard/perceptual accessibility of critical text and controls.
- **Expected behavior:** Focus remains visible/unclipped, tab order is coherent and critical rendered contrast meets the applicable documented threshold.
- **Environment needed:** Approved headed browser, human reviewer and an appropriate rendered-contrast inspection method.
- **Preconditions:** Manual-phase approval; approved source and compact EN/VI breakpoint/theme/System profiles; genuine zoom results shared from DMV-006. Reuse the same review session as DMV-008/010 where useful.
- **Exact steps:** (1) Traverse skip links, navigation, filters, disclosure and invalid-form feedback using keyboard only. (2) Inspect focus visibility/clipping and logical forward/backward traversal. (3) Inspect important text, controls and focus states against their actual backdrop, including applicable disabled/decorative distinctions. (4) Record threshold/method/outcome and route unsupported complex samples to DMV-012 instead of inventing a numeric PASS.
- **Expected successful result:** Covered focus/tab interactions are perceptually usable and applicable critical rendered-contrast checks pass with a recorded method.
- **Current status:** **NOT RUN**.
- **Related evidence:** [V6A-10 manual critical contrast requirement](<V6A_UI_STABILIZATION.md>); [A8 measurement boundaries](<V6A_ACCESSIBILITY_EVIDENCE.md>).
- **Known limitation:** Automated focus assertions or supported color calculations do not replace human visibility/contrast review; no accessibility certification is claimed.
- **Action if verification fails:** Record the specific FAIL and request a bounded correction, preserving thresholds and automated assertions. Do not classify confirmed poor contrast/clipped focus as a tool limitation merely to continue.

## DMV-010 — Current-source screenshot and visual review

- **Feature/system area:** Privacy-safe visual evidence for scoped UI and states.
- **Expected behavior:** Reviewed evidence maps honestly to its source/profile/state and is safe for its permitted audience.
- **Environment needed:** Human review of retained evidence and, only if separately approved and missing, current-source capture in an approved disposable environment.
- **Preconditions:** Explicit content/privacy review permission; no screenshot publication implied. Reuse DMV-006–009 observations instead of creating duplicate test matrices.
- **Exact steps:** (1) Reconcile retained Library/Catalog evidence to its actual source and historical review scope. (2) Build a private manifest of safe case ID, source, page category, profile/state, reviewer/time and content/privacy verdict. (3) Cover Home, Catalog, Library, My Requests, Request a Story, Login and Settings, target breakpoints/locales/themes and relevant empty/loading/error/focus states; mark unavailable cells honestly. (4) Capture only genuinely missing material with separate permission. (5) Propose publication only for individually approved anonymous public-page material; keep account-bearing content private even when synthetic.
- **Expected successful result:** Qualifying current-source visual review is documented, with explicit coverage limits and a privacy decision for every proposed public reference.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** [Historical A1/A2 screenshot inventory](<V6_VALIDATION.md>); [A8/A10 privacy limits](<V6A_ACCESSIBILITY_EVIDENCE.md>). Historical 64 Library / 72 final Catalog PNG-name inventories and limited inspected examples are not blanket current-source approval.
- **Known limitation:** Existence, filename counts, an authored screenshot call or green CI do not establish captured content, review or publication permission. No images were created or reviewed by this backlog task.
- **Action if verification fails:** Reject unsafe/unreviewed publication; record the failed privacy/visual criterion and obtain scoped correction or missing review permission. Never commit raw account images, traces or private manifests to make evidence appear complete.

## DMV-011 — Real intermediate Library loading

- **Feature/system area:** V6A-01 native Library loading locale and transition behavior.
- **Expected behavior:** When a real intermediate fallback renders during refresh/navigation, it shows only the active locale with accessible status and no wrong-language flash.
- **Environment needed:** Approved current-source native headed environment and permitted owner session.
- **Preconditions:** Manual-phase permission and an existing safe way to observe the genuine transition; no new infrastructure, fake responses, fabricated sessions or artificial backend outage.
- **Exact steps:** (1) Pin source and locale. (2) Observe a real direct refresh to Library and genuine navigation into Library. (3) If the fallback appears, inspect single-locale copy/status and transition continuity in EN/VI. (4) Record whether each interval was actually observed; if too fast or absent, retain NOT VERIFIED instead of inferring success from the final page.
- **Expected successful result:** Genuine refresh/navigation intervals are directly observed with the correct locale and accessible transition behavior.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** [V6A-01 acceptance](<V6A_UI_STABILIZATION.md>); [A10 loading limitation](<V6_VALIDATION.md>); [A8 boundaries](<V6A_ACCESSIBILITY_EVIDENCE.md>).
- **Known limitation:** SSR/hydration unit results or eventual page success do not prove an intermediate native interval rendered. Merely freezing an entire document is not fallback evidence.
- **Action if verification fails:** Record FAIL only for an observed incorrect transition and request a scoped correction. If the interval cannot safely be observed, keep NOT VERIFIED and continue unrelated authorized coding; do not launch another diagnostic framework.

## DMV-012 — Unsupported visual/compositing observations

- **Feature/system area:** Applicable complex backgrounds, group opacity, images, filters and unsupported color/compositing samples.
- **Expected behavior:** Applicable critical visual samples receive a valid human assessment; unsupported automation is not silently counted as PASS.
- **Environment needed:** Approved headed rendering, human reviewer and a suitable rendered inspection method.
- **Preconditions:** Manual-phase approval; identify actual unsupported samples during DMV-009/010 and retain their source/profile/applicability. Do not invent a product defect from parser limits.
- **Exact steps:** (1) Identify the real control/state/backdrop and why the automatic sample was unsupported. (2) Determine critical versus genuinely nonessential applicability. (3) Apply an appropriate manual/rendered method where applicable and record its outcome/limits. (4) Document any maintainer-approved nonessential scope exclusion without labeling an unexecuted check PASS.
- **Expected successful result:** Each applicable critical sample has a direct reviewed result; exclusions and unresolved cases remain explicit, not hidden automatic successes.
- **Current status:** **NOT VERIFIED**.
- **Related evidence:** [A8 compositing and parser limits](<V6A_ACCESSIBILITY_EVIDENCE.md>); [A10 gap register](<V6_VALIDATION.md>).
- **Known limitation:** Supported numeric helper tests are not proof for unsupported rendering. Nonessential applicability decisions do not waive mandatory critical-control review; the allowed current-status vocabulary remains unchanged.
- **Action if verification fails:** Record an observed visual failure as FAIL and request the smallest supported correction. If the method remains insufficient, retain NOT VERIFIED with the limit; do not weaken a threshold or add a fake passing measurement.
