# Architecture

V0 foundation is implemented and locally exercised; final evidence lives in VALIDATION. Next.js 16 is the sole web/application runtime, with React UI and server-only identity/mail/database boundaries. PostgreSQL persistence is shared through Drizzle. This is a modular monolith, not separate frontend/backend services.

```text
Browser -> apps/web (Next routes / components / server modules)
                      |-> Better Auth 1.7.7 -> Drizzle -> PostgreSQL
                      |-> SMTP (verification/reset/deletion email)
packages/database -> typed schema, client, explicit migration tooling
```

Only two workspace packages exist: `apps/web` and `packages/database`. Web `src/server` owns environment validation, auth, sessions, mail and sanitized logging; `src/lib` contains branding/i18n/client helpers; components and app routes compose the UI. Database schema/client are not imported into browser bundles. Secrets remain server-side.

English/Vietnamese core pages and next-themes are presentation concerns; auth/persistence stay authoritative on the server. Transactional emails are English-only; database preferredLocale is read-only/reserved with default en. Locale-scoped root layouts own HTML language/providers/shell; native locale/account links cross document boundaries rather than assuming shared root-layout client navigation. Session/role guards must run at each protected server entry point, not merely hide UI.

V1 catalog is implemented as `features/catalog/contracts`, `server/catalog/{service,repository,projection,errors}`, actual Node API routes, public/admin locale pages and catalog components. Server service authorization precedes privileged parsing; repository transactions enforce revision/child/source/audit atomicity; public projection filters private metadata and unpublished relation targets. Batch child loads and PostgreSQL FTS/trigram indexes support bounded local search. Database schema remains separately modular; pure `catalog-types` constants can cross into presentation, never the connection/auth/database runtime.

Catalog local acceptance gates passed (`V1_VALIDATION.md`); hosted acceptance is unverified. Same-locale client links are kept; auth transitions have one router replacement rather than an immediately competing refresh. Development uses supported webpack and explicit workspace-package transpilation; production uses `next build`. Development compilation latency is not a production performance claim.

Planned domains remain library/progress, communities and provider integration. A global work is distinct from a user's private library entry. Future bounded jobs would persist intent/lease/retry state and reconcile ambiguous external outcomes; no worker/scheduler/provider execution is claimed today. V2 is on hold.

Deployment uses one web runtime and PostgreSQL/SMTP, explicit pre-deploy migrations, a pooled runtime DB URL and direct migration URL. Do not initialize DDL during requests or startup. Liveness `/api/health` and bounded DB/schema readiness `/api/ready` are implemented; durable jobs and production recovery remain planned/unverified.
