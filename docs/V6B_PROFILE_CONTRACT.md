# V6B B1 — Provisional Reader Profile Contracts

**Source baseline:** `1cc6ddd9191488c4b00ef8db9d885eafba6b3e0c`. **Scope:** pure validation, privacy projection and deterministic unit tests only. No persistence, HTTP authorization, profile UI or public capability is implemented by B1. Actual validation outcomes belong in the append-only [validation ledger](V6_VALIDATION.md), not prospective PASS claims here.

The maintainer permits separately authorized coding while V6A manual/hosted acceptance is deferred. This changes coding order, not release acceptance: [the centralized deferred backlog](DEFERRED_MANUAL_VERIFICATION.md) remains unchanged and is the only current manual/external queue. Full V6A acceptance is still incomplete. Creating these contracts authorizes no public activation, hosted test or deployment.

## 1. Authority and source compatibility

- [V6 roadmap](V6_PLAN.md), [social proposal](V6_SOCIAL_PRODUCT.md), [V3 privacy](V3_DOMAIN.md), [V4 release boundary](V4_RELEASE_STATUS.md) and [security contract](SECURITY.md) remain controlling references.
- Canonical account IDs are opaque **SQL text**, as implemented in [the authentication schema](../packages/database/src/schema.ts#L24-L47). B1 preserves their exact string values: no UUID parsing, trimming, case conversion or identity replacement. A new profile identifier is a separate concept, not a reclassification of account identity.
- Existing genre identity is a lowercase **text slug**, not a UUID: [genre schema](../packages/database/src/catalog-schema.ts#L237-L265). B1 checks compatible slug syntax only; it cannot prove that a slug exists in the database.
- Existing [session helpers](../apps/web/src/server/session.ts) and [authentication configuration](../apps/web/src/server/auth.ts) are unchanged. The future server must establish signed, verified, persisted authority; passing a pure input schema does not authenticate anyone.
- Existing V4 author-name behavior is not changed or connected to these profiles. Never use authentication name/image as a reader-profile fallback.

## 2. Provisional contract defaults

These defaults are approved for isolated B1 contracts/tests, **not** irreversible B2 storage, retention or rollout policy.

| Input                         | B1 rule                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enrollment                    | Explicit create input only; no automatic enrollment, account backfill or side effect                                                              |
| Initial visibility            | PRIVATE; creation cannot publish                                                                                                                  |
| Handle                        | ASCII letter first, then letters/digits/underscore; 3–24 units; ASCII uppercase input canonicalizes to lowercase only after raw syntax validation |
| Reserved handles              | A required, explicit policy supplies exact handles and literal prefixes; no hardcoded permanent reserved-name set                                 |
| Display name                  | Required, nonunique, single-line Unicode text; NFC and trim; 1–80 UTF-16 units and at most 320 UTF-8 bytes                                        |
| Biography                     | Optional plain multiline text; NFC and trim; at most 500 UTF-16 units and 2,000 UTF-8 bytes                                                       |
| Interests                     | At most five explicitly supplied, nonduplicate genre slugs; lowercase alphanumeric segments separated by single hyphens, maximum 100 units        |
| Revision                      | Integer 1–2,147,483,647, without numeric coercion; expected revision modeled on future mutations                                                  |
| New public profile identifier | Caller-supplied UUID syntax for a future generated profile identifier; B1 generates neither an identifier nor a record                            |
| Account identifier            | Nonempty opaque string, preserved exactly; not a UUID contract                                                                                    |

Text limits apply both to the raw input before normalization and to the normalized result. Oversized whitespace/decomposed input cannot evade limits by shrinking during trimming/NFC. Normalization growth must also satisfy the output bounds. Invalid surrogate sequences, prohibited controls and bidi controls are rejected before normalization. Single-line names exclude line separators; biographies permit ordinary tab/CR/LF but not prohibited controls.

UTF-16 units are not grapheme counts. Valid Unicode under the approved UTF-16 ceilings also fits the more generous approved byte ceilings; both checks remain explicit. Independent byte-bound edge tests may use the same pure bounded-text validator with tighter synthetic byte ceilings, rather than claiming an impossible production-limit example.

Plain text may contain literal markup-like or URL-like characters; B1 does not parse HTML, create links, render content or fetch anything. A later UI must render escaped text, not reinterpret biography strings as HTML or automatically linkify them. No avatar/banner, arbitrary image URL, upload or media field is accepted.

Unknown fields are rejected in command contracts. Account/role/session/Library authority cannot be injected through extra fields. Plain-data guards reject accessor/prototype/cycle inputs before normal validation reads them; they are defensive checks for plain data, not a sandbox for hostile JavaScript Proxy behavior.

## 3. Command models, not executed lifecycle transitions

The [pure contract factory](../apps/web/src/features/reader-profile/contracts.ts) requires a reserved-handle policy. It snapshots validated policy values so later caller mutation does not silently change that contract instance. Exact reservations and prefixes are literal, reviewable configuration—not regular expressions or implicit staff privileges. An empty explicit policy reserves nothing; it is not a recommended production policy.

- **Create:** handle, explicit display name, optional biography, explicit interests (empty by default), PRIVATE visibility. No existing account value is inferred.
- **Edit:** expected revision plus a nonempty patch of presentation fields/interests. A nullable biography patch models clearing; a stored snapshot omits a cleared optional biography. No handle-rename, actor, role or visibility mutation is smuggled into an edit.
- **Publish:** separate `PUBLISH` intent, expected revision and literal affirmative publication acknowledgment. Missing, false or coerced acknowledgment cannot publish.
- **Hide:** separate `HIDE` intent plus expected revision. This models a later visibility operation, not account/profile erasure.
- **Snapshot:** explicit owner account ID, new public identifier, presentation fields, selected interests, visibility, revision and ACTIVE/REMOVED state. It is an internal projection input, not a client enrollment/update payload.

No command executes a write, changes state, reserves a unique handle or compares against a stored revision. B2 must enforce global uniqueness, OCC, overflow handling, transaction/session fences and real lifecycle semantics. Omission of rename/delete commands in B1 does not approve permanent immutability or a retention policy.

## 4. Owner and public projection boundary

[The pure projector](../apps/web/src/features/reader-profile/projection.ts) consumes a candidate snapshot and explicit caller-supplied viewer/block facts. These facts are **not authenticated or queried by B1**. Never wire arbitrary client-supplied projection facts directly to a future HTTP endpoint.

| Result              | Allowed data                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OWNER               | Explicit public identifier, handle, display name, optional biography, selected interests, visibility and revision |
| PUBLIC              | Explicit public identifier, handle, display name, optional biography and selected interests only                  |
| UNAVAILABLE         | Fixed decision only; no underlying profile or private/blocked/removed reason                                      |
| SESSION_UNAVAILABLE | Fixed infrastructure decision only; no underlying profile                                                         |

Owner access requires exact account-ID equality, not a role assertion. An administrator/moderator viewing another account receives only the ordinary visitor result; role does not create an owner override. A private profile is available to its own active owner only. Anonymous/authenticated visitors receive a public DTO only for an eligible ACTIVE/PUBLIC snapshot with no supplied block denial. Absent, removed, invalid, private-nonowner and blocked views return no profile. Unknown/malformed decision inputs fail closed. A declared unavailable session infrastructure state is handled without reading the profile as if the viewer were anonymous.

Blocked-in-either-direction facts are modeled conservatively as denial, not as an approved persistent platform blocking policy. Contradictory self-block inputs must not manufacture access. Public anonymous readability also means a blocked person could log out or use another account; blocking cannot promise confidentiality, global revocation or erasure of previously delivered content. These limitations require the B2 policy decision below.

The projector constructs an allowlisted fresh DTO, not a spread of a database/user object. Extra source-only private fields are not a new public contract; they are ignored without reading their accessors. Known projection fields must be valid data. Missing display name/interests never triggers an authentication-name fallback or inference from Library activity. DTO arrays are copied, and changing an output cannot mutate the input or another result.

## 5. Library and account isolation

Neither public nor owner profile DTO includes authentication email/account ID/role/name/image, sessions, verification metadata, account timestamps, private notes/ratings/favorites, progress/history, collections, Library entries/counts, hidden Work metadata or inferred interests. Internal owner identity exists only to evaluate the pure owner comparison; it is not returned as profile metadata.

There is no database, session, cookie, HTTP, runtime environment, cache, sitemap, directory, SEO, remote media or network dependency in these modules. Nothing observes Library mutations or emits a public activity/feed event. An explicitly selected taxonomy interest is not a derived reading preference. V3/V4 services and their public/private behavior remain unchanged.

Projection unit tests can demonstrate serialization boundaries for synthetic facts; they do not establish SQL query qualification, current account eligibility, real authentication, race safety, deletion or a no-leak HTTP response. Those require separately authorized B2 integration and later native tests.

## 6. Abuse and unresolved B2 decisions

Reserved exact handles and prefixes are explicit policy inputs. Tests use synthetic policies to exercise that mechanism, not a permanently accepted staff/brand list. ASCII handles reduce Unicode-case ambiguity; they do not eliminate lookalikes, deceptive display names or impersonation. No official badge or moderator privilege is derived from presentation text. Existing Work-content reports are not automatically profile reports or a takedown mechanism.

The maintainer must approve, before B2 schema/API commitments:

1. Exact reserved handles/prefixes, impersonation handling and abuse/takedown responsibility.
2. Whether handles can be renamed and whether deleted handles can be reused.
3. Reservation retention, its personal-data implications and account-erasure treatment; a hash is not automatically anonymity.
4. Profile hiding versus content removal versus account deletion, including any retained claims and owner-facing disclosure.
5. Bidirectional blocking scope, anonymous-viewer limitation and interactions with future follows.
6. Feature gates and rate-limit budgets, including exact identity-bearing budget cleanup and concurrency rules.
7. Public activation, discoverability and required operational/acceptance decisions.

No claim-only tombstone, reuse/quarantine duration, global block graph, public moderation role or gate/budget is implemented by B1. Existing account deletion is not globally atomic: preserve the distinction between root SQL cascades and the surrounding authentication workflow, as documented in [V3](V3_DOMAIN.md).

## 7. Future integration and rollout fence

B2 must establish persisted verified sessions, owner-only commands, strict Origin/body fences, once-charged bounded budgets, coherent public qualification, taxonomy membership, race-safe uniqueness/OCC/block handling, deletion/rollback tests and safe errors. Read-only pure facts are not substitutes for those checks. No existing user ID type, V3 data, historical migration or V4 behavior may be changed incidentally.

Future owner/public gates may be designed after approval, but B1 adds no runtime variable or activated route. No profile UI, follow/unfollow, counts, feed, reactions, notifications, public Library list, posting, V4 enablement, media storage, hosted account flow or deployment is included.

Do not add a hosted-profile backlog entry merely for B1: no hosted V6B functionality exists. The existing twelve [deferred entries](DEFERRED_MANUAL_VERIFICATION.md) remain unchanged. Human/hosted acceptance stays unperformed and does not block unrelated separately authorized coding. Full V6A/V6B acceptance, public rollout, publication and release authorization are separate decisions; B1 alone grants none of them.

## 8. Explicitly approved B2a persistence policy (2026-10-27)

This section records the subsequent maintainer adoption of the B2a policy. Sections 1–7 remain the historical B1 description, including decisions that were unresolved then. This approval governs the isolated persistence candidate based on `52ab0bea8420bee571e5571068e43612cb8542ef`, not HTTP authorization, profile UI, public activation or deployment. Implementation is not proof of successful SQL execution; consult the actual [validation evidence](V6_VALIDATION.md).

### Approved lifecycle and relational model

1. Enrollment remains explicit: no registration/sign-in hook, account backfill or migration data copy. New rows default to PRIVATE/ACTIVE/revision 1; a trigger rejects initial PUBLIC visibility. PUBLIC is a legal storage state, but the separate affirmative publication command and current actor authority remain B2b work.
2. Canonical account identity remains opaque SQL text. Each account can own at most one profile; each profile has a separate generated UUID public identifier and one globally unique lowercase ASCII handle (3–24). Display names are not unique. No account email/name/image is copied into presentation fields.
3. Handle renaming is unsupported. The minimal owner-bound profile row holds the claim; user ID, public ID and handle are immutable. Ordinary profile-row deletion is rejected while its root account exists. There is no separate claim table, redirect history, tombstone or indefinite reservation.
4. Hiding means ACTIVE/PRIVATE. It retains the same presentation data, selected interests, public ID and handle; future public reads must exclude it.
5. Profile-content removal means REMOVED/PRIVATE, SQL NULL display name and biography, and automatic deletion of all selected interests in the same transaction. The row retains its owner-bound identity/claim and revision metadata while the account exists, but is not publicly eligible. No erased presentation history is introduced. An attempted interest insert/update must lock and observe an ACTIVE parent, not rely on a racy cross-table CHECK.
6. Account deletion cascades the profile, interests and both incoming/outgoing account-bound block edges. The profile-row delete guard permits this root cascade after the parent is gone. No handle reservation survives deletion of the owning account; another account may subsequently claim the released handle with its own generated public ID. There are no historical redirects. A failed/rolled-back root transaction must restore this cohort together with its other row effects.
7. Blocks are directed account-to-account edges independent of profile enrollment. A composite primary key forbids duplicate edges; a check forbids self-blocking; opposite directions are distinct. Future authenticated public qualification must conservatively deny blocks in either direction. Anonymous or alternate-account viewing cannot be made confidential by those edges; deletion of delivered data is not promised.
8. There is no automatic Library/activity/notes/ratings/progress sharing or derived preference. Interests are five explicit ordered slots at most, unique per profile by existing canonical genre slug, with real profile/taxonomy foreign keys. A genre UUID is not substituted for the taxonomy's text identity.
9. Reserved handles and impersonation safeguards remain explicit validated application policy. B2a adds no hardcoded reserved namespace, public claim endpoint, mutation budget, runtime flag, administrator ownership bypass or public activation.

The [Drizzle schema](../packages/database/src/reader-profile-schema.ts) and [forward 0015 migration](../packages/database/drizzle/0015_reader_profiles.sql) add exactly `reader_profiles`, `reader_profile_interests` and `reader_blocks`. Indexes support owner/handle uniqueness, bounded slots, selected-genre references and reverse block/erasure lookup, not a directory. Existing migrations 0000–0014 and existing user, session, Library, community and metadata structures are not rewritten.

### Stored text and concurrency boundary

Stored presentation text must already be NFC, ECMAScript-trim canonical and within the B1 UTF-16/UTF-8 limits. SQL counts supplementary characters as two UTF-16 units, not one PostgreSQL character, and rejects prohibited control/bidi values. PostgreSQL UTF8 excludes invalid scalar encodings; it cannot reconstruct an unpaired JavaScript surrogate after an upstream encoder replaced it. B1 input validation must continue rejecting those original inputs before encoding. Empty ACTIVE biography is allowed; REMOVED biography is NULL.

State-dependent SQL checks prevent retained presentation fields on REMOVED rows. Triggered interest cleanup and an ACTIVE-parent row lock are designed to serialize interest insertion against removal. All new trigger functions are SECURITY INVOKER with fixed search path and qualified table names. A new cohort-scoped root erasure replan follows the existing backend-cached RI-plan approach; it changes no rows, settings or privileges, and DISCARD PLANS itself is not rolled back. None of these design statements substitutes for real PostgreSQL cascade/concurrency/performance results.

Revision checks enforce positive 32-bit range, not a completed OCC protocol. B2b must compare expected revision and increment safely with real session/row fences. B2a neither creates a restore endpoint nor finalizes owner-facing restoration UX. B1 rejects a removed nullable database row as unavailable; no B1 DTO is widened to expose removed content.

### Still required before B2b and public activation

The approved account-lifetime claim/erasure rules above resolve that persistence decision for the initial version; they do not approve arbitrary future retention. Exact reserved names/prefixes and impersonation treatment, abuse/takedown responsibility, publication acknowledgment execution, current verified-session authority, Origin/body guards, rate/mutation budgets and budget-key erasure, coherent block/public queries, OCC/race handling, restoration behavior if offered, feature gates and public activation remain separately scoped decisions.

Root-account SQL cascades are atomic within their transaction; the surrounding existing Better Auth deletion workflow is not globally atomic. The narrow [real-auth deletion regression](../tests/integration/authentication.test.ts) is designed to verify this new cohort through the existing email-confirmed flow without rewriting authentication policy. No email/token/session details belong in public profile data or publication evidence.

No database is migrated on a hosted service. No HTTP handler, profile server service, middleware, user interface, follows/feed, V4 activation, environment-variable activation or hosted/manual acceptance is included. The twelve [deferred checks](DEFERRED_MANUAL_VERIFICATION.md) remain unchanged; absent SQL evidence is an automated validation gap, not a new hosted-backlog item or a PASS.
