# V6 Social Product — Profiles, Follow and Newsfeed (Proposal)

**Status:** DESIGN PROPOSAL ONLY. V6B and V6D are not implemented, approved for hosted activation, or accepted.
**Baseline:** V3 private library, V4 Work-scoped community source (hosted flag off), V5 published catalog.

## 1. Product experience

The primary destination should evolve into a **Home Feed**. A separate **Explore** catalog stays prominent for title lookup and genre discovery; **Library** remains a private personal workspace. A proposed navigation model is Home / Explore / Library / Notifications / Profile, with stable behavior for anonymous users and accessible desktop/mobile navigation.

Proposed feed tabs:
- **For You:** initially deterministic editorial/newly published Work items and explicitly public community content; no black-box AI or fabricated engagement.
- **Following:** public content from accounts the viewer actively follows, with a meaningful empty state if there are no follows.

A Feed is not merely an unbounded query over all private library mutations. Work record updates are not evidence a person read or liked a title. Avoid presenting synthetic or staged data as real trends.

## 2. V6B — Profile contract

Candidate profile fields: display name, unique human-readable handle with reserved-name policy, optional biography, avatar, optional banner, selected favorite genres, optional public Work lists and pinned entries. A profile owner can edit presentation fields and view their own private account settings; public visitors see **only** fields explicitly made public.

Required privacy decisions before implementation:
- Profiles default to minimal visibility; select whether discoverability, profile sections and public lists are opt-in or opt-out only with specific approval and tests.
- Existing V3 private rating, notes, progress, status, session and history are **not** published or used as a public signal by default. An optional future public list is a separate reviewed projection, not an automatic V3 table exposure.
- Respect unpublished/hidden Work identities; owner profile must not reveal private catalog metadata through follow/feed snapshots.
- Handle change, account deletion, erasure, blocking, impersonation and unique identifier conflicts need explicit contracts. Preserve canonical user UUID and Work UUID as authority, not mutable handles.
- Avatar/banner require an approved upload/media/storage/rights and content moderation plan; no direct arbitrary-URL proxy or assumption that object storage is free.

Profile acceptance: owner-only edits and settings; visitor-safe projection; EN/VI forms; username collision and reserved-name handling; blocked/private visibility; deletion/privacy regression coverage.

## 3. V6D — Proposed feed MVP

Minimum post forms to evaluate: text discussion with optional published Work link; a public review pointer backed by V4 review only after hosted V4 acceptance; curated Work discovery cards. Implementing a generic global post model is new work: do not mislabel V4 Work discussions as an existing home feed.

Core prospective interactions:
- Create/edit/delete own post with conflict handling, per-user rate and size limits, bounded media policy (start text-only).
- Follow/unfollow, chronological Following feed, and a clear For You ordering policy; cursor pagination with a stable tie-breaker; bounded page sizes and loading/error/empty states.
- Likes/reactions with idempotency and aggregate privacy/integrity checks; replies/comments with ownership and moderation; save/bookmark independently private.
- Explicit spoiler labels and click-to-reveal, report/block/mute, hide/remove moderation, notifications with safe opt-in/out and bounded retention.
- Avoid frictionless resharing of private library events, bot spam, unreviewed metadata and unlicensed images. No unrestricted algorithms, trending scores or "popular" counts without measured provenance.

Start by producing data/permission contracts and threat models, then UI prototypes using fixtures, then separately authorized backend and hosted gates. No staged V4 enablement is implied.

## 4. Safety and governance

Required before any hosted public interactions:
- Review V4 release-status blocking conditions, actual Postgres permissions, auth/session/CSRF, TLS/proxy, verified email delivery, moderation roles and operator workflows.
- Public/owner/admin/blocked-account access matrix. Report evidence and reporter identity stay private; staff powers cannot read private libraries.
- Anti-spam budgets, report-abuse protection, takedown and appeals handling, safe links/content sanitization, spoiler consent, notification privacy and account deletion.
- Content/cover rights, data retention and backups/restore limits must be documented truthfully; do not claim full operational erasure of snapshots/logs without evidence.
- Accessibility and bilingual copy must apply to composer, cards, moderation and notifications—not just landing pages.

## 5. Product slices and dependency map

| Slice | Suggested dependency | Acceptance signal |
| --- | --- | --- |
| Navigation shell and profile mock | V6A UI stability | Responsive, accessible and no hidden/public data confusion |
| Owner profile edits / public projection | approved V6B persistence and privacy model | Owner/visitor/anonymous/blocked test matrix |
| Follow and privacy graph | approved identity and relationship contract | Race-safe follow/unfollow and privacy filtering |
| Moderated post primitives | separate V4 hosted approval, rate/abuse controls | Actual SQL, negative permission tests, E2E |
| Following feed | safe published content plus approved follow graph | Stable pagination, no private-leak tests |
| For You feed | explicit public/editorial ordering and source attribution | Explanations and honest empty state |
| Notifications | approved event/retention/delivery policy | Respect visibility, user opt-out and abuse controls |

## 6. Open design decisions — approval required

Exact default profile visibility; public handle policy; whether avatars are uploaded; which V3 fields may be explicitly shared (if any); post types and media scope; editing/deletion retention; reaction count visibility; block/mute precedence; feed ranking signals and anti-abuse thresholds; moderation staffing and appeals; notification transport; hosted rollout gates.

Decisions must be documented before schema/API design. Public social UX must not silently weaken V3 or V4 constraints.

## 7. Non-goals for this proposal

No implementation, V4 activation, live user-data migration, chat, livestream, short-form videos, monetization, public activity derived from private reading, ranking based on fake numbers, or public deployment.

See [V6_PLAN.md](V6_PLAN.md), [V3_DOMAIN.md](V3_DOMAIN.md), [V4_RELEASE_STATUS.md](V4_RELEASE_STATUS.md), and [V6_VALIDATION.md](V6_VALIDATION.md).
