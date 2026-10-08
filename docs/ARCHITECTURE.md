# Architecture

**V0 IN PROGRESS — verification pending.** Next.js 16 is the sole web/application runtime, with React UI and server-only identity/mail/database boundaries. PostgreSQL persistence is shared through Drizzle. This is a modular monolith, not separate frontend/backend services.

```text
Browser -> apps/web (Next routes / components / server modules)
                      |-> Better Auth 1.7.7 -> Drizzle -> PostgreSQL
                      |-> SMTP (verification/reset/deletion email)
packages/database -> typed schema, client, explicit migration tooling
```

Only two workspace packages exist: `apps/web` and `packages/database`. Web `src/server` owns environment validation, auth, sessions, mail and sanitized logging; `src/lib` contains branding/i18n/client helpers; components and app routes compose the UI. Database schema/client are not imported into browser bundles. Secrets remain server-side.

English/Vietnamese and next-themes are presentation concerns; auth/persistence stay authoritative on the server. Session/role guards must run at each protected server entry point, not merely hide UI.

Planned domains are catalog, library/progress, communities and provider integration, initially modules inside this monolith. A canonical work is distinct from a user's private library entry. Future bounded jobs would persist intent/lease/retry state and reconcile ambiguous external outcomes; no worker/scheduler/provider execution is claimed today.

Deployment uses one web runtime and PostgreSQL/SMTP, explicit pre-deploy migrations, a pooled runtime DB URL and direct migration URL. Do not initialize DDL during requests or startup. Operational readiness, durable jobs and production recovery require separate verified implementation.
