# V1 catalog — local acceptance verified

V0 remains frozen at `8e00ae4` / `v0-local-verified`. Its 57-unit / 6-integration / 3-browser acceptance ledger is unchanged in `VALIDATION.md`. **V1 mandatory local gates passed; hosted acceptance is unverified. Do not merge or advance to V2.**

## Implemented

- Real PostgreSQL-backed global Works, multilingual original/primary/alternate titles, distinct creators/roles, optional editions and publication metadata, bilingual genres, identifiers, relations, source citations and cover-rights records.
- UUID identity and database-enforced immutable slugs; equal titles and creator names do not imply equal entities. Edition publication medium is separate from story format. Unknown counts/dates are not fabricated.
- Local normalized title/alias search, simple-language FTS and `pg_trgm` indexes, bounded filters and pagination. Public queries exclude drafts/hidden works and unpublished relation targets.
- EN/VI browse/detail and actual admin create/edit/visibility forms. Administrative collections use strict, validated JSON fields, not inactive placeholder controls. Original local illustration is explicitly not official cover art; approved local raster images require attribution and a rights statement. No remote image proxy or paid transformation.
- Backend administrator checks, configured exact Origin, bounded JSON, independent atomic write throttling, optimistic revisions and transactional, application-append-only history snapshots (not cryptographic tamper-proof storage). Global metadata is not owned by the submitting account; account deletion nulls the audit FK while retaining the opaque actor snapshot.
- No provider is activated; no chapter reader, scraping, production sample catalog or default administrator was added.

## Observed passing gates

- Full workspace/test TypeScript check; Web ESLint clean after moving cover rendering to unoptimized local `next/image`.
- **82 unit tests in 10 files** (all original 80, including V0 regressions, plus redirect-race and canonical-title projection regression tests).
- **20 real PostgreSQL integration tests in 3 files** (6 V0 + 14 catalog cases): actual SMTP-verified/signed-cookie actors, multilingual/accent/Đ search, same-language optional editions, equal-name identities, unpublished target privacy, source/rights input validation, create/update uniqueness rollback including source/audit rows, concurrent revision conflict, immediate role downgrade, real HTTP Origin/content/body checks, actual enum/check/FK/uniqueness enforcement, preserved original/alias history, pagination/filter/deduplication and applied index existence, actor deletion retention. Only UUID-scoped synthetic fixtures on guarded loopback `_test` databases are used and cleaned up.
- Applied `0000`, reviewed catalog `0001`, then forward attribution constraint `0002` on fresh UTF8 PostgreSQL 18.4. Repeat migrate succeeded; generation reported no schema changes. Applied migrations were not rewritten. `0002` strengthens approved-cover attribution and does not alter auth tables.
- Final production build passed after navigation, workspace transpilation and inspected mobile-filter CSS/copy corrections. Production local runtime smoke passed health/readiness, EN/VI SSR/catalog API, real theme hydration, nonexistent detail404, robots/sitemap, compact mobile filters (<450px), no overflow and zero browser runtime errors. Separate `v1-*` screenshots were inspected; V0 images were preserved. This does not prove populated production catalog, production SMTP or public HTTPS cookies.
- Production dependency audit reported no known vulnerabilities.

## Failures found and remediated

1. Root HTTP tests imported Zod without declaring it: added the actual root development dependency; aligned direct ORM versions.
2. Repository stripped punctuation from every identifier namespace, incorrectly collapsing distinct custom namespaces. Now only contract-defined known-provider aliases are canonicalized; actual custom-namespace preservation and uniqueness/rollback tests pass.
3. Timestamp fixture expected a noncanonical ISO precision; corrected its equivalent UTC fixture representation.
4. Audit events initially retained collection counts, not asserted values. Events now retain complete after-values and source references within a bounded payload; real tests prove earlier original titles/aliases survive later edits.
5. Approved covers lacked a database attribution invariant even though the UI/contracts required it. Added/applied forward `0002`; actual SQL rejects an approved cover with no credit.
6. Playwright could not load shared TypeScript package exports using its default launcher. The test command now explicitly loads the existing `tsx` runtime.
7. Cold Turbopack development produced repeated refresh/navigation resets with held application source, clearing forms. Browser trace confirmed repeated Fast Refresh events. Development now uses supported webpack and explicitly transpiles the database workspace package; three V0 browser regressions subsequently passed. The underlying framework defect has not been independently proven. Occasional development destination-stream diagnostics remain observed.
8. Cold first-time auth/settings compilation exceeded a 15-second browser URL assertion despite a real successful signup response. The catalog test now explicitly asserts real signup/signin HTTP success and allows bounded cold-route navigation. Full catalog lifecycle verification is still pending, not asserted passed.

## Historical navigation/hydration investigation

- Retained traces showed a settings navigation followed by an immediate refresh Flight and late/unresolved client chunks. Removed the unconditional `router.refresh()` immediately after login/logout `router.replace()`; one navigation now owns the transition. A regression unit test asserts exactly one replacement and no refresh. **82 unit tests now pass** (all original 80 plus navigation-race and canonical-title projection regressions).
- Instrumented the browser fixture with timestamped document, script/API completion, request failure and page-error events; paths omit query strings/tokens. Next incoming-request logging is disabled because verification/reset callback URLs can contain credentials.
- The first fresh run after removing the competing refresh passed all three V0 browser regressions and reached the hydrated administrative editor. Its catalog failure was now an exact-label lookup for the format select, not navigation: the implicit label included option text. Added explicit localized accessible labels to format/visibility/release selects rather than weakening the exact-label assertion.
- The next run reached real create, bilingual public search/detail and the optional-metadata assertions, then exposed a real retitle UX bug: the basic canonical title was duplicated in advanced title JSON, so changing the basic title conflicted with the old canonical entry and no PATCH was sent. The admin DTO-to-input projection now excludes that separately edited canonical entry while retaining originals/translations/aliases; a new regression test covers preservation. The subsequent real browser run successfully passed retitle and 409/no-overwrite conflict assertions, then exhausted the overall 180-second scenario deadline while verifying its second account. Increased only that multi-route scenario's overall budget to 300 seconds; individual assertions and actual-response checks remain bounded, with no retry used as a cure. The complete suite is being rerun.
- A subsequent cold development run still exceeded the admin-new-page URL assertion. Trace inspection showed the real server request and new-route client asset compilation completing near the UI deadline; this is not evidence of a missing backend response or unauthorized route. The browser case now separately prepares this development-only route with a real authenticated server GET and still exercises the actual client link and normal 15-second UI assertions. Full lifecycle and final cold/production runtime evidence remain required; preparation is not a claim of production latency or a cure for an unresolved hydration defect.

## Final local acceptance evidence

Final held-source Chromium rerun completed **4/4 passing in5.6 minutes**, no retries, on owned loopback3010 against a fresh migrated UTF8 PostgreSQL18.4 database. All82 unit tests,20 PostgreSQL integrations,full workspace/test TypeScript,lint,production build,production runtime smoke and production dependency audit passed. The final TypeScript/lint/20-SQL rerun also passed after the test-port/callback extraction changes.

The runtime reset interrupted managed services/reruns; those killed runs were not passes. One rerun found connection-refused to an expired disposable DB, so a fresh helper and unchanged reviewed migrations were used. Port3000 was later occupied by an unrelated process; it was not killed or reused. `E2E_PORT` selects a validated loopback-only owned port, all contexts/Origin/callback expectations follow the configured exact origin, and SMTP remains real synthetic capture. Initial fixed-port callback regex failures were corrected, not waived. Production screenshot inspection also exposed generic column-form CSS turning flex bases into enormous heights; catalog filters now explicitly control row/mobile layout and smoke bounds the mobile form to<450px. The corrected image was inspected with no overflow.

GitHub authentication is now available and official remote main/feature were verified at preserved V0 SHA8e00ae4 before V1 publication. StoryNest/Eiren statuses remain clean at their recorded original SHAs. Repository commit/push/PR recording follows below; no hosted deployment or CI execution is inferred.

## Earlier successful browser verification

`pwsh-26` completed **4/4 Chromium tests passing**, no retries: the complete actual catalog administrator lifecycle and all three foundation regressions. This includes real SMTP verification and signed-cookie actors, EN/VI actual navigation/search/detail, mobile controls, optional metadata, create/retitle with stable identifiers, stale-revision409/no overwrite and reload, reader/moderator/anonymous denial, hiding/removal/detail404 and UUID-scoped cleanup. The fixture now asserts no captured runtime/React hydration error on its primary page and cannot produce an asynchronous response-handler rejection during teardown. The catalog lifecycle also passed in the preceding run; that preceding full suite still failed a cold foundation route and is not represented as all-green.

Development entry retention now avoids repeated inactive-route recompilation during multi-page workflows (five minutes/32 pages; not database/data caching and not production behavior). At that intermediate checkpoint, final checks were still running; the final outcomes are recorded above. Standard Node NO_COLOR, Next LCP and client-rendered script warnings and an occasional development destination-stream diagnostic remain observed; no claim of clean framework logs or exhaustive browser coverage.

## Earlier browser outcome (not accepted)

The historical complete run (`pwsh-16`) had **2 passing / 2 failing browser tests**. Catalog signup/signin progressed with real successful responses, but navigation from the admin list to its new-entry page did not complete within the assertion budget. The V0 account test also stalled with SSR “Checking your session…” and an unhydrated theme control; its trace contained no captured page error. Earlier runs passed all three V0 cases, but that does not replace the latest regression failure. At that historical point, the catalog lifecycle had not yet reached a passing end-to-end result. Do not attribute every failure to timeout or claim the underlying hydration/navigation issue is resolved.

## Repository publication and limits

- Mandatory local browser/backend/static/build/runtime gates passed as recorded above.
- Product/operations/architecture/security documentation and reference cleanliness reviewed.
- Verified implementation commit **`10b1c1d565a8c15dcdb63cbbe46163f4817c1685`**, branch **`feat/v1-global-catalog`**, published tag **`v1-local-verified`**. The official remote feature SHA matches; `main` remains preserved V0 `8e00ae47a7a58bb0b6fef31b341eb988d177d779`.
- **[PR #1](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/pull/1)** opened into main, verified OPEN with no merge commit. GitHub Quality gates jobs were observed IN_PROGRESS at publication, not green certification. Never merge automatically; V2 remains on hold.
- Broader performance/load, exhaustive accessibility, every individual constraint and hosted behavior have not been verified. Index existence is proven; production-scale query-plan/latency claims are not made.

## GitHub CI follow-up — verified green

The initial published Quality gates runs failed, not passed. Observed [run37890807928](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37890807928) failed at `pnpm install --frozen-lockfile` with `ERR_PNPM_IGNORED_BUILDS: @embedded-postgres/linux-x64@18.4.0-beta.17`; earlier local Windows passes did not prove Ubuntu install compatibility.

Reviewed the exact locked npm tarball without running scripts: package postinstall is `node scripts/hydrate-symlinks.js`. The complete script reads bundled `native/pg-symlinks.json` and recreates relative shared-library symlinks; all14 manifest entries remain under `native/lib`, with no traversal/absolute targets. No network, child process or PostgreSQL startup is in this lifecycle script. The tarball SHA512 matches lockfile integrity `jVw/MdDtIX/vICH/DKIe6/mHpiCggdx6QVyza4vt/NbcZFsL0KhwglF6F1Koqx3gRBZ9XtN+vi63EsqSyqOSxA==`. This is a bounded lifecycle review, not certification of bundled native binaries or all future releases.

Added only exact `@embedded-postgres/linux-x64` to `allowBuilds`; Windows entry and dependency versions/integrity remain unchanged. Global build-script protection remains enabled. A newly exported tracked tree with no node_modules passed `pnpm install --frozen-lockfile` using pnpm11.7.0 on Windows (523 packages, existing download store reused), and the working checkout frozen install passed. Lockfile and dependency versions did not change. TypeScript/lint and82 unit tests passed. Fresh isolated PostgreSQL18.4 migrations and20 real integration tests passed; all4 Playwright cases passed without retries in4.1 minutes on loopback3010; production build passed. Actual Ubuntu success was then independently verified from the GitHub runs below; local passes were not substituted for hosted CI. PR remains unmerged and V2 remains on hold.

### Observed GitHub results

Fix commit **`7e489d6dbc75fa7c943b411451283ebb9f4b5c29`** was pushed to `feat/v1-global-catalog`. Both Quality gates runs completed SUCCESS:

- [Pull-request run37892315925](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37892315925): completed2026-10-09T06:15:19Z; verify3m4s.
- [Push run37892312127](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/37892312127): completed2026-10-09T06:15:49Z; verify3m37s.

Actual logs show Linux `postinstall$ node scripts/hydrate-symlinks.js`, successful frozen install, TypeScript/lint,82 unit tests, explicit migrations,20 PostgreSQL17-service integration tests,production build,Chromium install,all4 actual browser cases (1.6m PR /1.9m push; no flaky/retry reported),and no known production audit vulnerabilities. All executed required gate steps succeeded; failure-only artifact upload was correctly skipped, not a waived test. No further CI root-cause fix was required.

At that tested SHA, PR#1 was OPEN, CLEAN and MERGEABLE with both verify checks SUCCESS and no merge commit. Ready for review and technically eligible for merge after maintainer approval; **not merged by the agent**. Workflow annotations about action-runtime Node20 deprecation/forced Node24 and the upcoming ubuntu-latest image migration remain informational maintenance limitations. Success covers these observed runners/versions, not every architecture, exhaustive security/a11y/load or a future dependency version.

Hosted Neon, Vercel, real SMTP delivery and public HTTPS/proxy behavior remain unverified. GitHub source publication/PR and completed Ubuntu CI are verified; this is not hosted production acceptance. Local success is not a hosted-production acceptance claim.
