import "server-only";
import { sql } from "drizzle-orm";
import { ReaderProfileFoundationError } from "../../features/reader-profile/http-contracts";
import { isReaderProfileOwnerEnabled } from "./availability";
import type {
  ReaderProfileAuthorityTransaction,
  ReaderProfilePrincipal,
} from "./authority";

export type ReaderProfileAttemptClass = "ordinary" | "content" | "withdrawal";
type Charge = {
  attemptClass: ReaderProfileAttemptClass;
  result: Promise<void>;
};
const charges = new WeakMap<ReaderProfilePrincipal, Charge>();
const unavailable = () =>
  new ReaderProfileFoundationError("SERVICE_UNAVAILABLE");
// PostgreSQL deparses validated checks. Compact only outside quoted tokens:
// removing whitespace inside a literal could accept a different bucket name.
function compactCheck(expression: string): string {
  let result = "";
  let quote = "";
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i]!;
    if (quote) {
      result += char;
      if (char === quote) {
        if (expression[i + 1] === quote) result += expression[++i];
        else quote = "";
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (!/\s/u.test(char)) result += char;
  }
  return quote ? "" : result;
}
const checkDefinitions: readonly (readonly [string, readonly string[]])[] = [
  [
    "reader_profile_rate_limits_kind_check",
    [
      "(kind = ANY (ARRAY['ordinary'::text, 'content'::text, 'withdrawal'::text]))",
    ],
  ],
  [
    "reader_profile_rate_limits_count_check",
    [
      "((count >= 0) AND (count <= 21) AND ((kind <> 'content'::text) OR (count <= 6)) AND ((kind <> 'withdrawal'::text) OR (count <= 11)))",
    ],
  ],
  [
    "reader_profile_rate_limits_last_request_check",
    [
      "((last_request >= 0) AND (last_request <= '9007199254740991'::bigint))",
      "((last_request >= 0) AND (last_request <= 9007199254740991))",
    ],
  ],
];
const checkExpressions = new Map<string, readonly string[]>(
  checkDefinitions.map(([name, expressions]) => [
    name,
    expressions.map(compactCheck),
  ]),
);
function validChecks(checks: unknown): boolean {
  if (!Array.isArray(checks) || checks.length !== checkExpressions.size)
    return false;
  const seen = new Set<string>();
  for (const check of checks) {
    if (
      !check ||
      typeof check.name !== "string" ||
      typeof check.expression !== "string" ||
      seen.has(check.name) ||
      !checkExpressions
        .get(check.name)
        ?.includes(compactCheck(check.expression))
    )
      return false;
    seen.add(check.name);
  }
  return true;
}

async function ready(tx: ReaderProfileAuthorityTransaction): Promise<void> {
  const rows = await tx.execute<{
    storage_ready: boolean;
    erasure_ready: boolean;
    checks: unknown;
  }>(sql`
    /* reader_profile_budget_readiness */
    with target as (
      select pg_catalog.to_regclass('public.reader_profile_rate_limits') as relation,
             pg_catalog.to_regclass('public.users') as owner_relation
    ), attributes as (
      select x.*,
        (select attnum from pg_catalog.pg_attribute where attrelid=x.relation and attname='user_id' and not attisdropped) as owner_column,
        (select attnum from pg_catalog.pg_attribute where attrelid=x.relation and attname='kind' and not attisdropped) as kind_column,
        (select attnum from pg_catalog.pg_attribute where attrelid=x.owner_relation and attname='id' and not attisdropped) as referenced_column
      from target x
    )
    select (
      exists (select 1 from pg_catalog.pg_class r where r.oid=x.relation and r.relkind='r' and r.relpersistence='p')
      and (select count(*)=4 from pg_catalog.pg_attribute a where a.attrelid=x.relation and a.attnum>0 and not a.attisdropped)
      and (select count(*)=4 from pg_catalog.pg_attribute a
        where a.attrelid=x.relation and a.attnum>0 and not a.attisdropped and a.attnotnull
          and (a.attname,a.atttypid) in (
            ('user_id',pg_catalog.to_regtype('pg_catalog.text')),
            ('kind',pg_catalog.to_regtype('pg_catalog.text')),
            ('count',pg_catalog.to_regtype('pg_catalog.int4')),
            ('last_request',pg_catalog.to_regtype('pg_catalog.int8'))))
      and exists (select 1 from pg_catalog.pg_constraint p join pg_catalog.pg_index i on i.indexrelid=p.conindid
        where p.conrelid=x.relation and p.conname='reader_profile_rate_limits_pkey' and p.contype='p'
          and p.convalidated and not p.condeferrable and not p.condeferred
          and p.conkey=ARRAY[x.owner_column,x.kind_column]::smallint[]
          and i.indrelid=x.relation and i.indisprimary and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
          and i.indnkeyatts=2 and i.indnatts=2 and i.indkey[0]=x.owner_column and i.indkey[1]=x.kind_column
          and i.indpred is null and i.indexprs is null)
      and (select count(*)=3 and bool_and(c.convalidated and c.conislocal and not c.connoinherit and not c.condeferrable)
        from pg_catalog.pg_constraint c where c.conrelid=x.relation and c.contype='c')
    ) as storage_ready,
    exists (select 1 from pg_catalog.pg_constraint f
      where f.conrelid=x.relation and f.contype='f' and f.conname='reader_profile_rate_limits_user_fk'
        and f.confrelid=x.owner_relation and f.conkey=ARRAY[x.owner_column]::smallint[]
        and f.confkey=ARRAY[x.referenced_column]::smallint[]
        and f.confdeltype='c' and f.confupdtype='a' and f.confmatchtype='s'
        and f.convalidated and not f.condeferrable and not f.condeferred
        and (select count(*)=4 and bool_and(t.tgisinternal and t.tgenabled in ('O','A')
          and (pg_catalog.current_setting('session_replication_role') in ('origin','local') or t.tgenabled='A')
          and not t.tgdeferrable and not t.tginitdeferred and t.tgqual is null
          and n.nspname='pg_catalog' and (
            (t.tgrelid=x.owner_relation and t.tgtype=9 and p.proname='RI_FKey_cascade_del') or
            (t.tgrelid=x.owner_relation and t.tgtype=17 and p.proname='RI_FKey_noaction_upd') or
            (t.tgrelid=x.relation and t.tgtype=5 and p.proname='RI_FKey_check_ins') or
            (t.tgrelid=x.relation and t.tgtype=17 and p.proname='RI_FKey_check_upd')))
          from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
          join pg_catalog.pg_namespace n on n.oid=p.pronamespace where t.tgconstraint=f.oid)
    ) as erasure_ready,
    (select coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'expression',pg_catalog.pg_get_expr(c.conbin,c.conrelid,false)) order by c.conname),'[]'::jsonb)
      from pg_catalog.pg_constraint c where c.conrelid=x.relation and c.contype='c') as checks
    from attributes x
  `);
  if (
    rows.length !== 1 ||
    rows[0]?.storage_ready !== true ||
    rows[0]?.erasure_ready !== true ||
    !validChecks(rows[0]?.checks)
  )
    throw unavailable();
}

type Counter = {
  user_id: string;
  kind: ReaderProfileAttemptClass;
  count: number;
  last_request: string | number;
};
function safeInteger(value: unknown): number {
  // bigint columns/clock arrive as decimal text with postgres-js; never coerce
  // blanks, exponent notation, fractions, negatives or unsafe integer values.
  if (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value))
    throw unavailable();
  if (typeof value !== "string" && typeof value !== "number")
    throw unavailable();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw unavailable();
  return number;
}

async function run(
  principal: ReaderProfilePrincipal,
  attemptClass: ReaderProfileAttemptClass,
): Promise<void> {
  if (!isReaderProfileOwnerEnabled())
    throw new ReaderProfileFoundationError("PROFILE_UNAVAILABLE");
  let retry: number;
  try {
    const { getDatabase } = await import("../database");
    const { lockReaderProfilePrincipal, assertReaderProfilePrincipalCurrent } =
      await import("./authority");
    retry = await getDatabase().transaction(async (tx) => {
      const accountId = await lockReaderProfilePrincipal(tx, principal);
      if (typeof accountId !== "string" || accountId.length === 0)
        throw unavailable();
      await ready(tx);
      const selected: { kind: ReaderProfileAttemptClass; cap: number }[] =
        attemptClass === "withdrawal"
          ? [{ kind: "withdrawal", cap: 10 }]
          : [
              { kind: "ordinary", cap: 20 },
              ...(attemptClass === "content"
                ? [{ kind: "content" as const, cap: 5 }]
                : []),
            ];
      const locked: { row: Counter; cap: number; owned: boolean }[] = [];
      for (const { kind, cap } of selected) {
        const inserted = await tx.execute<{
          user_id: string;
          kind: string;
        }>(sql`
          /* reader_profile_budget_insert */
          insert into public.reader_profile_rate_limits (user_id, kind, count, last_request)
          values (${accountId}, ${kind}, 0, 0) on conflict (user_id, kind) do nothing returning user_id, kind
        `);
        if (
          inserted.length > 1 ||
          (inserted.length === 1 &&
            (inserted[0]?.user_id !== accountId || inserted[0]?.kind !== kind))
        )
          throw unavailable();
        const rows = await tx.execute<Counter>(sql`
          /* reader_profile_budget_lock */
          select user_id, kind, count, last_request from public.reader_profile_rate_limits
          where user_id = ${accountId} and kind = ${kind} for update
        `);
        const row = rows[0];
        if (
          rows.length !== 1 ||
          !row ||
          row.user_id !== accountId ||
          row.kind !== kind
        )
          throw unavailable();
        locked.push({ row, cap, owned: inserted.length === 1 });
      }
      // All potentially waiting counter acquisitions precede the fresh authority
      // and clock checks. This is a linearization point, not delivery authority.
      await ready(tx);
      if (
        (await assertReaderProfilePrincipalCurrent(tx, principal)) !== accountId
      )
        throw unavailable();
      const clock = await tx.execute<{ at: string }>(sql`
        /* reader_profile_budget_clock */
        select floor(extract(epoch from clock_timestamp()) * 1000)::text as at
      `);
      if (clock.length !== 1) throw unavailable();
      const at = safeInteger(clock[0]?.at);
      const updates = locked.map(({ row, cap, owned }) => {
        const anchor = safeInteger(row.last_request);
        if (
          !Number.isInteger(row.count) ||
          row.count < 0 ||
          row.count > cap + 1 ||
          anchor > at
        )
          throw unavailable();
        const shell = owned && row.count === 0 && anchor === 0;
        if (row.count === 0 && !shell) throw unavailable();
        const reset = shell || at - anchor >= 60_000;
        const count = reset ? 1 : Math.min(row.count + 1, cap + 1);
        const lastRequest = reset ? at : anchor;
        return {
          row,
          count,
          lastRequest,
          retry:
            count > cap ? Math.ceil((60_000 - (at - lastRequest)) / 1000) : 0,
        };
      });
      for (const { row, count, lastRequest } of updates) {
        const updated = await tx.execute<{ user_id: string; kind: string }>(sql`
          /* reader_profile_budget_update */
          update public.reader_profile_rate_limits set count = ${count}, last_request = ${lastRequest}
          where user_id = ${row.user_id} and kind = ${row.kind} returning user_id, kind
        `);
        if (
          updated.length !== 1 ||
          updated[0]?.user_id !== row.user_id ||
          updated[0]?.kind !== row.kind
        )
          throw unavailable();
      }
      const seconds = Math.max(0, ...updates.map((update) => update.retry));
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 60)
        throw unavailable();
      return seconds;
    });
  } catch (error) {
    if (
      error instanceof ReaderProfileFoundationError &&
      (error.code === "PROFILE_UNAVAILABLE" ||
        error.code === "AUTHENTICATION_REQUIRED" ||
        error.code === "ACCESS_DENIED" ||
        error.code === "SERVICE_UNAVAILABLE")
    )
      throw new ReaderProfileFoundationError(error.code);
    // No retries, foreign cause, logging, raw SQL, identity or provider details.
    throw unavailable();
  }
  // Denials must commit their counters, never throw 429 inside the transaction.
  if (retry > 0) throw new ReaderProfileFoundationError("RATE_LIMITED", retry);
}

/** One terminal charge per genuine capability; never accepts a caller transaction. */
export function chargeReaderProfileAttempt(
  principal: ReaderProfilePrincipal,
  attemptClass: ReaderProfileAttemptClass = "ordinary",
): Promise<void> {
  if (!isReaderProfileOwnerEnabled())
    return Promise.reject(
      new ReaderProfileFoundationError("PROFILE_UNAVAILABLE"),
    );
  if (
    attemptClass !== "ordinary" &&
    attemptClass !== "content" &&
    attemptClass !== "withdrawal"
  )
    return Promise.reject(unavailable());
  if (
    (typeof principal !== "object" || principal === null) &&
    typeof principal !== "function"
  )
    return Promise.reject(
      new ReaderProfileFoundationError("AUTHENTICATION_REQUIRED"),
    );
  const previous = charges.get(principal);
  if (previous)
    return previous.attemptClass === attemptClass
      ? previous.result
      : Promise.reject(unavailable());
  // Publish before any async work, including lazy module imports. Both success
  // and rejection remain memoized; switching class cannot recharge a capability.
  const result = Promise.resolve().then(() => run(principal, attemptClass));
  charges.set(principal, { attemptClass, result });
  return result;
}
