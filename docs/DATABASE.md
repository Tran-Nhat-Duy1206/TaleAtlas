# Database

V0 schema is implemented; isolated UTF-8 PostgreSQL 18.4 migration and integration constraints were exercised locally. This is not production certification. PostgreSQL with Drizzle schema in `packages/database/src/schema.ts` and explicit tooling in `packages/database/drizzle.config.ts`.

Current identity schema:

| Table | Purpose / important constraints |
| --- | --- |
| `users` | Text ID; unique email; email-verification state; name/image; enum role (`user`, `moderator`, `admin`); read-only reserved preferred locale (default `en`); timestamps |
| `sessions` | Unique token; expiry; user FK with cascade; optional IP/user-agent; indexed user ID |
| `accounts` | Better Auth credentials/provider fields; user cascade; unique provider/account pair |
| `verifications` | Expiring verification values; indexed identifier; sensitive security material |
| `rate_limits` | Unique key, count and last-request timestamp for database-backed auth limits |

Passwords and credential/session representations are controlled by Better Auth. Session tokens remain raw sensitive Better Auth values; verification identifiers are configured hashed. Do not describe every credential column as encrypted or hashed. Restrict DB access/backups accordingly. Roles are server-owned, not editable sign-up fields.

Runtime uses `DATABASE_URL` (Neon pooled in deployment); migration configuration prefers `DATABASE_URL_DIRECT`, falling back to `DATABASE_URL`. Supply variables explicitly to CLI commands. Review `pnpm db:generate` output before `pnpm db:migrate`; never rewrite an applied migration. Neither operation belongs in app startup.

**Planned, not current:** works/external IDs/localized titles, contributors/genres, user-library uniqueness, reading sessions/progress and stable work-based threads/reactions. Private notes and user overrides will not enter shared catalog/search tables. Add these only with constraints, forward migrations, isolated cold/upgrade fixtures and query-plan tests.
