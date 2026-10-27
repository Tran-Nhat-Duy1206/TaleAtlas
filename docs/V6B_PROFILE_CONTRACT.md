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
