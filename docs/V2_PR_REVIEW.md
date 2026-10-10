# V2 PR #2 scope review

## Requirement baseline and traceability

The recorded pre-follow-up V2D requirement in the [roadmap at verified2500c5d](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/blob/2500c5da2adebc35c15204c2028b8f534ca8887b/docs/ROADMAP.md#L20) is: administrator candidate comparison/approval/link/reject, a separate verified edit-suggestion workflow, Recently Added, evidence-backed release discovery and full acceptance. The [original product vision](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/blob/2500c5da2adebc35c15204c2028b8f534ca8887b/docs/PRODUCT_VISION.md#L7) also names remote provider discovery as a V2 ambition.

That recorded D requirement does **not** enumerate editable metadata fields. The detailed original field-level specification was requested during this review but no text/file/link was supplied before the instruction to continue. This comparison therefore distinguishes the recorded workflow requirement from the actual contract and the broader V1 catalog model; it does not invent an original field list or certify full original-spec conformance. A maintainer must reconcile any separate original specification and accept or prioritize the gaps below.

## V2D workflow comparison

| Recorded requirement | Implemented and accepted | Remaining boundary |
| --- | --- | --- |
| Candidate comparison/approval/link/reject | Admin-only private candidate comparison, manual attested PUBLISHED Work input, exact current published Work link, reasoned reject/needs-information and private history | No automatic candidate-to-verified-fact copying, fuzzy merge or publication |
| Separate verified edit-suggestion workflow | Verified owner submits cited, private proposals; admin compares current/proposed/citation and explicitly approves/rejects against the exact current base revision | Limited scalar correction subset, not all metadata fields or collection operations |
| Recently Added | First explicitly attested publication audit, current published visibility, EN/VI rendering | Not draft creation, remote discovery or a release-day inference |
| Evidence-backed releases | Separate admin-cited exact Gregorian-day records and current published-only feed | No user release correction/retraction workflow or external-provider event retrieval |
| Full acceptance | Mandatory local and actual CI checks passed for implemented A–D scope | Tests do not establish unsupported fields, provider permission, live integration or hosted production acceptance |

## Suggest an Edit: exact contract versus catalog breadth

Authoritative implementation: [strict patch/review/merge contracts](<../apps/web/src/features/catalog/edit-suggestions.ts>), [browser form](<../apps/web/src/components/catalog/EditSuggestionForm.tsx>), [transactional service](<../apps/web/src/server/catalog/edit-suggestions.ts>) and [V1 catalog contracts](<../apps/web/src/features/catalog/contracts.ts>). Source inspection covers these bounded surfaces; no complete architecture/knowledge-graph audit is claimed.

| Correction type | Suggest an Edit support | Remaining work or intentional restriction |
| --- | --- | --- |
| Canonical primary title | `primaryTitle`, nonempty bounded replacement | Does not edit localized PRIMARY/ORIGINAL/ALIAS rows or every locale's display title |
| Primary-title/original language | `primaryTitleLanguage`, `originalLanguage` validated language tags | No localized title-row editing or collection-language reconciliation UI |
| Release status | `releaseStatus` enum replacement, including UNKNOWN | Not an exact date or evidence of external releases |
| Publication year/label | `publicationYear` integer1–9999 and nonempty `publicationLabel` | No exact date inferred from a year; no null/unset deletion |
| Alternate/localized/original titles and aliases | Unsupported | Stable row-ID add/update/remove operations, per-row evidence and multilingual comparison/tests |
| Creators/authors/credit roles/order | Unsupported | Explicit creator/credit identity and relationship operations; never merge equal names automatically |
| Descriptions/synopses | Unsupported | Language-scoped operations, source/rights constraints, body limits and safe review rendering |
| Genres | Unsupported | Explicit membership changes and reviewed taxonomy behavior |
| Format/country | Unsupported | Extend scalar contracts, evidence/review controls and EN/VI UI/tests |
| Editions, edition dates, ISBN | Unsupported | Edition-scoped identity, calendar/identifier validation, evidence and collection preservation |
| Work identifiers/provider references | Unsupported | Namespaced identity/uniqueness and duplicate-conflict handling; provider references do not authorize fetching |
| Work relations | Unsupported | Explicit relation changes/current visibility and target-identity review; no fuzzy identity merge |
| Cover assets, credits and rights | Unsupported | Separate verified permission/asset/rights handling; no arbitrary image fetch or unlicensed transfer |
| Exact release facts/retraction | Unsupported by suggestions | Existing separate admin command records immutable cited dates; correction/retraction semantics need a separately designed workflow |
| Existing source or field-evidence records | No arbitrary source/history patch | Citation accompanies the supported correction; V1 approval preserves unchanged field evidence. Corroboration/retraction/history editing is not implemented |
| Visibility, Work UUID/slug, role/owner/state authority | Not allowed | Keep stable identity and trusted administrator authority; not a promised user patch expansion |
| Clearing/removing a value or collection row | Unsupported | Design explicit unset/delete intent and preservation/audit rules. UNKNOWN status or `und` language are supported values, not null deletion |

The strict API accepts **one or more of the same six scalar keys** and rejects unknown keys/null/collection operations. The browser selects **one field per suggestion**. Administrator approval applies the complete proposal; partial-field approval, changing a submitted patch/citation, owner amendment/withdrawal, reopening/review-request states and automatic stale-base rebasing are absent. A fresh proposal at a current published revision is possible; it is not a linked resubmission/version history for an existing suggestion.

Owner/key/canonical-hash idempotency is delivery identity, not bibliographic equality. Submit/reject never change catalog. Approval requires explicit metadata/publication attestations and exact published base revision, uses the V1 writer atomically and preserves unrelated children/evidence/UUID/slug. Existing administrator Work editing and release recording do not imply those fields can be proposed through the verified-user workflow.

## Ordered remaining work

1. **Product reconciliation:** obtain any detailed original V2D field list; record explicit acceptance/defer decisions per correction type. Passing the limited workflow does not close broader metadata-correction requirements.
2. **Schema/contract design:** choose the next supported subset; define explicit scalar unset and stable-ID collection operations, proposal/review states, provenance/corroboration/retraction and rights rules. Applied migrations stay immutable; any necessary schema changes must be new forward migrations.
3. **Transactional application:** extend canonical hashing/idempotency, bounds, exact-base locking, child/evidence preservation and audit/history atomically; retain role/owner isolation and the shared mutation budget. Define any future partial review/reopening separately, not as implicit automatic rebasing.
4. **EN/VI UX:** add bounded editors and current/proposed/evidence comparisons for each agreed type, explicit review decisions and honest unsupported/rights messaging. Multi-field browser editing is separate future work even though the six-field API supports combinations.
5. **Acceptance:** add pure/UI/real SQL/native browser cases for each extension, including authority-before-body, privacy, stale/current visibility, concurrency, duplicate identities, preservation/deletion, rollback and permitted-media constraints; run all existing gates/regressions and actual final-head CI.

## Manual/offline ingestion is not live provider discovery

Current C processing normalizes only submitted human request input into private revision-bound **unverified** candidates. Open Library/MangaDex-shaped synthetic JSON decoders perform no HTTP, creator lookup or image transfer. D publication is a separate human-authorized command; neither processing nor test fixtures discover or verify live external metadata.

Live search/retrieval, scheduled/automatic network execution and licensed media/chapter ingestion are not implemented or accepted. All providers remain disabled/PENDING with storage permission false and absent optional live retrieval methods. Before enabling an adapter, independently verify intended-use/storage/media permissions, credentials/terms/rate/contact requirements and implement fixed-host bounded transport/caching/timeout/retry controls with separate integration acceptance. Citation URLs are informational and never fetched. No provider, paid infrastructure, deploy or merge is enabled by this review.

## Evidence and maintainer decision

At verified2500c5d, both [PR CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38038909381) and [push CI](https://github.com/Tran-Nhat-Duy1206/TaleAtlas/actions/runs/38038907095) passed326 units/83 real SQL/all nine Chromium cases together with zero retries and all mandatory install/type/lint/migration/no-drift/build/production-and-whole-tree-audit gates. The [V2 ledger](<V2_VALIDATION.md>) retains every historical failure/receipt; this review appends qualification rather than rewriting those observations. The documentation follow-up must receive its own final-head checks before completion is reported.

PR #2 is a candidate for **maintainer merge of the documented implemented scope**, not a claim that all original correction types or live provider ambitions are delivered. Maintainers must accept/prioritize the deferred feature gaps and reconcile any separate detailed specification. Mergeability, final-head CI and required reviews are checked separately; no automatic merge occurs. Production SMTP/TLS/proxy/Neon/Vercel/migrations remain unverified and require operator credentials plus separate hosted acceptance.
