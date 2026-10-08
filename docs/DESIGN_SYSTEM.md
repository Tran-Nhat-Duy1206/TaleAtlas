# Design system

V0 presentation local acceptance is complete: 3/3 development browser tests passed in two consecutive runs and final post-font/navigation/bounded-source production build/smoke passed with zero browser page errors. Historical mobile navigation/reload failures were addressed by native locale/account links across root-layout documents and bounded Tailwind source scanning, not waived. Vietnamese accents render correctly in the corrected font; 390px mobile overflow checks passed. Development `destination stream errored` diagnostics during interrupted navigation/prefetch remain known, not claimed resolved; none observed in production smoke. Comprehensive accessibility and hosted verification remain separate. A calm reading-oriented shell with reusable React components, Tailwind styling, English/Vietnamese copy and next-themes light/dark/system preference. Theme and locale are presentation preferences, never authority signals.

Rules:

- Central branding in `apps/web/src/lib/branding.ts`: **TaleAtlas** and mandatory tagline **Discover Stories. Find Your People.**, shared logo glyph/accent. Reuse navigation, form controls, loading/error/empty states and spacing; no duplicated page-specific theme engines.
- Semantic headings/landmarks, keyboard-operable controls, visible focus, persistent labels and accessible error associations.
- Responsive layouts, readable type/line length, adequate contrast in both themes and reduced-motion support where animation is introduced.
- Distinguish a missing feature from an empty real result. No mock books, fake charts or fabricated reading counts in V0.
- Translate application copy through centralized dictionaries; product/server status values must not depend on translated labels. Known limitation: transactional emails are English-only; database preferredLocale remains read-only/default en. Interface Vietnamese support does not imply translated email or synchronized profile locale.
- Secret input values, verification links and tokens never enter client diagnostics.

Future catalog/library cards, progress and discussion components are planned. Validate contrast, focus, mobile reflow, theme hydration and both locales with browser checks before declaring conformance.
