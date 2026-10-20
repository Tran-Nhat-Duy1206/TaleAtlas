# V6E–V6F — Explainable Recommendations and Performance-Safe Motion

**Status:** PROPOSED / NOT IMPLEMENTED. No AI provider, ranking experiment, user profiling, analytics SDK or new motion dependency is authorized.

## Part I. V6E — Recommendation design

### 1. First useful recommendation system

Start **non-AI-first** and explainable. Candidate suggestions may be generated from **published public Work metadata** (explicit genre overlap, format and verified curated relationships) and **genres selected by the reader for discovery**. Never imply that "popular", "trending" or "read by people like you" is known without measured authorized data.

Phased experiences:
1. **Cold start:** editorially curated public lists, recently added verified catalog entries, controlled genre exploration and optional onboarding interests; honest no-results behavior.
2. **Preferences-based discovery:** derive a score from opt-in declared genres/format/language preferences and Work facts, with a short "Because you selected X" explanation.
3. **Safe feedback:** Not interested, Already read and optional explicit preference changes; preserve user control and minimize persisted signals.
4. **Later, only with approval:** evaluate personal reading-history-based ranking, but separate **private on-user's-behalf personalization** from public/social exposure. Private V3 data must never become public metadata, aggregate scores or another user's recommendations.

No algorithm should mistake missing metadata for negative quality. Avoid boosting titles due to ingestion frequency or privileges. Do not recommend hidden/draft Works or use private V4 reports.

### 2. Security and privacy contract

- Recommendation inputs default to public curated metadata and explicit preferences only.
- Private library notes, status, ratings, favorites, sessions and history remain V3 owner-only. Any new use requires separately documented lawful purpose, explicit user control, isolated computation, data retention/deletion analysis and access tests—not assumed permission.
- User recommendations should be computed or retrieved with session/owner constraints; never reuse personalized caches across users.
- Recommendation results are not evidence about user behavior; no cross-user activity attribution or fake popularity.
- Limit per-response count; stable cursor/paging; explain why each card appears and allow "show less like this" control if implemented.

### 3. Acceptance and measurement

Define offline deterministic scoring fixtures first, then real published-data behavior. Verify source attribution, absence of draft/private Works, missing-data paths, bilingual explanations, cold-start, repeatability, input tampering, authorization, and bounded query latency. Measure rather than invent CTR/retention gains. No analytics SDK or invasive tracking without approval.

Open choices: opt-in model; retention and account erasure; what preferences are private; filters vs ranking precedence; diversity/freshness; how to evaluate relevance with small catalogs; whether post/review data is eligible (default NO).

## Part II. V6F — Motion and accessibility

### 4. Principle

Motion should communicate state, not compete with reading. Use simple CSS-first transitions where practical. Reserve heavier libraries for proven interaction requirements; protect slow devices, battery and low-bandwidth connections.

| Surface | Initial proposal | Guardrail |
| --- | --- | --- |
| Buttons/cards | Subtle hover/focus and tap feedback | CSS opacity/transform; no hover-only essential information |
| Tabs/navigation | Short selection transitions | No full-page blocking or hydration-dependent navigation |
| Loading | Quiet skeleton or spinner with clear status | Accessible loading copy; no indefinite visual promise |
| Feed list | Optional entry transition for a small newly loaded batch | No animation of hundreds of off-screen cards |
| Spoilers/reactions | Brief state acknowledgment | Screen-reader updates and reduced-motion equivalent |
| Background | Static branded composition | Avoid permanent large parallax/particles/3D as default |

Initial motion duration target ~150–250ms for simple UI feedback (proposal, not measured acceptance). Favor transform/opacity, avoid layout thrash and scroll-jacking. Honor prefers-reduced-motion; limit or disable nonessential motion, keep keyboard focus visible and avoid flashing effects.

### 5. Performance guardrails

- Observe INP, LCP and CLS on real target devices; verify at 375/768/1280/1440px, 200% zoom, light/dark, EN/VI and reduced motion.
- Respect the free-tier infrastructure budget. Virtualize or paginate long feed lists carefully while retaining focus/scroll restoration and accessibility.
- Lazy-load appropriate image assets with explicit dimensions, placeholder/rights policy and safe remote-host configuration; no unlicensed covers.
- Avoid animating large backgrounds, box shadows or expensive filters on every feed item; avoid excessive client hydration.
- Test an entry-level/CPU-throttled mobile configuration as well as desktop; if measured regressions exceed agreed thresholds, remove or simplify motion.
- Automated Lighthouse or synthetic numbers alone do not certify inclusive UX or actual hosted capacity.

### 6. Scope and decisions

Recommendations and motion need explicit milestone approval and reviewable acceptance evidence. V6A may fix a broken loading state but should not quietly add a broad animation framework. No user telemetry, personalization based on private events, external AI calls, paid monitoring, new image-host permissions or public release is authorized by this planning document.

See [V6_PLAN.md](V6_PLAN.md), [V6_SOCIAL_PRODUCT.md](V6_SOCIAL_PRODUCT.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [V3_DOMAIN.md](V3_DOMAIN.md) and [V6_VALIDATION.md](V6_VALIDATION.md).
