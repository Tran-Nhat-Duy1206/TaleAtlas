# V5C — Advanced Story Discovery

Implementation candidate based on merged main `844e53fc9d8e286a5ca7e223104a64b27eb31499`. V5A/V5B and their post-merge CI are complete; this milestone does not reopen them. V5C local verification is recorded separately below. No publication, PR, new migration, index, dependency or hosted operation is implied.

## Delivered scope

- A native public genre selector using actual EN/VI taxonomy names and existing slug values.
- Optional exact recorded-original-language and release-status filters, composed with existing query, format and single-genre criteria using AND.
- Native GET URLs, pagination preservation, explicit invalid-query/default-results notice, and honest empty-page recovery.
- Existing search ranking, card/title localization, curated related-Work and genre navigation, public projections and metadata writers remain unchanged.

No popularity/statistics, personal recommendations, AI, providers/imports, covers, feeds, multi-genre syntax, new sort mode or automatic related-card panel is added. Country and creator filtering remain deferred.

## Read contracts and API

GET `/api/catalog/works` retains `{items,total,page,pageSize}`. Existing `q` (max200), pageSize1–50/default20, offset<=10000, format, genre and locale EN/VI remain supported. New optional scalar keys:

- `originalLanguage`: exact stored tag, max63, `^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$`, with no surrounding whitespace or normalization. This separately named read validator supports the existing database grammar; it does not broaden the narrower metadata-write validators.
- `releaseStatus`: existing `UNKNOWN`, `ANNOUNCED`, `ONGOING`, `COMPLETED`, `HIATUS` or `CANCELLED` enum value.

Absent means no restriction. `und` is a recorded tag, not NULL. `vi`, `VI` and `vi-VN` are distinct. The interface locale, display-title language and edition language do not imply an original language. A valid unmatched tag or genre returns genuine zero matches; malformed tags/statuses return400. No translations or missing facts are inferred.

Repeated scalar API parameters are rejected before number coercion; unknown API keys remain invalid. The administrator list uses the same parser only AFTER its existing role guard. Its authority and visibility semantics are unchanged. API responses remain dynamic/no-store with sanitized failures.

The SSR page ignores unknown page keys, omits blank form values and rejects arrays for known fields. An invalid known parameter causes the existing whole-query default fallback, now with an explicit localized notice. It is not presented as a successful application of invalid filters or as zero matches.

## Public taxonomy and overflow

Options contain only slug/nameEn/nameVi and are selected through membership in currently PUBLISHED Works, before enumeration. They are independent of the active search, other filters and current result page. No proposal target, draft-only/orphan taxonomy, private evidence, actor or facet count is projected.

The query reads at most201 rows. Up to200 returns the complete list. More than200 returns `items:[]` and `overflow:true`, never a truncated apparently complete selector. The UI disables choices, explains capacity unavailability and retains the active genre in a hidden form field. No paginated chooser is authorized: encountering a real overflow requires a new design/approval decision. Synthetic201-row tests exercise this safety boundary and do not establish a live catalog overflow.

A well-formed selected slug missing from public options remains as an escaped selected-slug fallback, without an extra hidden-label lookup. Option/database failure propagates as unavailable, not an empty catalog. The initial SSR uses a server-only read; no extra public options endpoint is introduced.

## Ordering, snapshots and navigation

The two equality predicates share the existing count/ID predicate. Genre stays an EXISTS condition, so multiple children do not duplicate Works. Ranking remains exact normalized title before simple full-text before fuzzy, with the existing UUID tie-break. Empty query keeps existing UUID order. Accent folding is lookup assistance, never identity equivalence or automatic translation.

Public count, IDs, aggregate children and SSR genre options share one read-only REPEATABLE READ transaction. Related targets retain their existing statement-qualified visibility/title selection. An in-flight response may return an earlier public snapshot, not newly private child data; subsequent requests observe committed changes. OFFSET navigation is deterministic on unchanged data, NOT an immutable snapshot across changing requests.

Applying the native form resets page1 and retains pageSize. Page links preserve all five filters. Clear keeps the existing bare locale catalog URL and returns pageSize to20. A positive-total empty page offers a filtered first-page link rather than an impossible page fraction. Locale navigation keeps submitted machine values/search/hash after hydration; it does not translate tags/slugs or preserve unsent edits. Existing shell pre-hydration limitations and bare canonical URLs are unchanged. Missing-story request prefill remains only query/format.

## Privacy, accessibility and compatibility

Public reads do not use private libraries/notes/ratings/history, unapproved suggestions, reports or staff evidence. No new egress, auth policy, V4 activation, mutation privilege or quota is added. UNKNOWN cover handling and title fallback are unchanged.

Controls retain native semantics, associated labels, focus, helper associations and44px targets. Both locales use centralized copy and real enum/taxonomy labels. Responsive tests cover the expanded public form, not merely the older editor. Text-resize/browser-emulation evidence must not be called a complete manual accessibility audit.

## Verification and performance

Local V5C verification is complete. These are local results; database-backed verification used isolated, ownership-verified PostgreSQL 18.4, not production data.

| Gate | Local result |
| --- | --- |
| ESLint | PASS |
| Typecheck | PASS |
| Production build | PASS |
| Unit tests | 2023/2023 PASS |
| Integration tests | 326/326 PASS |
| Main performance benchmark | 31/31 PASS |
| Controlled concurrency diagnostic | 9/9 PASS |
| Focused Advanced Discovery Playwright, production runtime | 1/1 PASS |
| Standard Playwright, production runtime | 20/20 PASS |
| V4-enabled community Playwright, production runtime | 8/8 PASS |

Focused contract/URL and UI tests, real SQL/filter/privacy/snapshot/overflow cases and the native public discovery scenario are additive; existing assertions, limits, retries and mandatory suites are preserved.

The optional main performance benchmark and separate controlled concurrency diagnostic were executed locally; their results and retained evidence remain valid local verification history. All four optional performance/diagnostic files (the benchmark and diagnostic tests and their two configurations) are excluded from the proposed 16-file V5C commit. The main benchmark is separate from ordinary integration tests and requires a locally prepared, gitignored historical-baseline artifact; it is NOT independently executable from a fresh checkout of the resulting commit. Its preparation obtains the actual baseline repository source from the approved main commit into a new ignored artifact, rewriting relative imports only. Baseline and candidate use the same database/dependencies and synthetic dataset. It must not swap live source files or touch another worktree.

The additional controlled concurrency diagnostic and its evidence are retained locally. No reproducible candidate slowdown was demonstrated; no production SLO or statistical equivalence was established.

Measurements compare legacy baseline/candidate result equality and timings, new filter/SSR overhead, actual plans/buffers and more-than-pool concurrent reads. Existing pool10 and5000ms statement timeout remain unchanged. Results are local observations, not hosted acceptance. Any new index needs separate review and migration approval.

All local SQL runs must use freshly created ownership-verified loopback test databases. Verification data directories and prior artifacts are retained, with only graceful shutdown of newly owned processes. No historical cluster, artifact or Quarantine cleanup is performed.

PostgreSQL 17 CI has NOT been verified for this V5C candidate. Production deployment data and the real published-backed genre count have NOT been verified. The 200-genre overflow limitation remains a documented MVP constraint; the synthetic overflow coverage does not establish deployment size.

Same-head new V5C CI requires separately authorized publication; no old PR9 rerun is needed.
