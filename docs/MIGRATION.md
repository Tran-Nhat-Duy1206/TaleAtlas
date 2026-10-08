# Migration policy

V0 identity schema/migration is implemented and locally exercised; no StoryNest/Eiren data import is implemented. Reference repositories remain read-only inputs, not production migration sources.

## Schema evolution

Drizzle schema lives in `packages/database/src/schema.ts`; migration output belongs under that package's `drizzle` directory. `pnpm db:generate` generates SQL for review; `pnpm db:migrate` applies reviewed SQL explicitly. Configuration prefers `DATABASE_URL_DIRECT` and falls back to `DATABASE_URL`; export CLI variables deliberately. Never migrate at startup.

Do not edit an applied SQL migration or journal entry. Prefer additive forward-compatible changes; bound data backfills and separate them from request handling. Test cold installation and prior-version upgrade with synthetic fixture preservation. Inspect constraints/indexes and target DB before execution. Back up before destructive operations and prove restore independently; a code rollback is not automatically a data rollback.

## Future legacy import

A separately approved importer would read exports without modifying reference repositories, map stable canonical work IDs independently of normalized titles, distinguish private library entries from public provider metadata, preserve intentional rereads and record duplicates/conflicts. Never copy StoryNest admin seeds/JWTs/password defaults, reference private feeds, or user notes into global search. Auth-account migration requires a dedicated credential/security design; do not pretend incompatible password/session formats transfer automatically.

Dry-run counts, deterministic mapping, resumability/idempotency, conflict reports, consent/privacy review and isolated acceptance fixtures are required before any real-data import.
