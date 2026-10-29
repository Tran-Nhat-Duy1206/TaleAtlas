import "server-only";
import { randomUUID } from "node:crypto";
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
// Match the migration's full body, including surrounding newlines. Removing
// whitespace from SQL source would also alter identity-bearing string literals.
const erasureBody = `
BEGIN
  DELETE FROM public.rate_limits WHERE key IN ('reader-profile.attempt:' || OLD.id, 'reader-profile.write:' || OLD.id, 'reader-profile.withdraw:' || OLD.id);
  RETURN OLD;
END;
`;

async function ready(tx: ReaderProfileAuthorityTransaction): Promise<void> {
  const rows = await tx.execute<{
    storage_ready: boolean;
    erasure_ready: boolean;
  }>(sql`
    /* reader_profile_budget_readiness */
    select (
      (select count(*) = 4 from pg_catalog.pg_attribute a
       where a.attrelid = pg_catalog.to_regclass('public.rate_limits')
         and a.attnum > 0 and not a.attisdropped and a.attnotnull
         and (a.attname, a.atttypid) in (
           ('id', pg_catalog.to_regtype('pg_catalog.text')),
           ('key', pg_catalog.to_regtype('pg_catalog.text')),
           ('count', pg_catalog.to_regtype('pg_catalog.int4')),
           ('last_request', pg_catalog.to_regtype('pg_catalog.int8'))))
      and exists (select 1 from pg_catalog.pg_index i
        join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attname = 'id'
        where i.indrelid = pg_catalog.to_regclass('public.rate_limits')
          and i.indisprimary and i.indisunique and i.indisvalid and i.indisready
          and i.indnkeyatts = 1 and i.indkey[0] = a.attnum
          and i.indpred is null and i.indexprs is null)
      and exists (select 1 from pg_catalog.pg_index i
        join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attname = 'key'
        where i.indrelid = pg_catalog.to_regclass('public.rate_limits')
          and i.indisunique and i.indisvalid and i.indisready
          and i.indnkeyatts = 1 and i.indkey[0] = a.attnum
          and i.indpred is null and i.indexprs is null)
    ) as storage_ready,
    exists (select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_language l on l.oid = p.prolang
      where t.tgrelid = pg_catalog.to_regclass('public.users')
        and t.tgname = ${"reader_profile_user_erasure_budgets"}
        and t.tgtype = 11 and not t.tgisinternal
        and t.tgenabled in (${"O"}, ${"A"})
        and t.tgqual is null and t.tgnargs = 0 and t.tgconstraint = 0
        and not t.tgdeferrable and not t.tginitdeferred
        and p.oid = pg_catalog.to_regprocedure('public.reader_profile_user_erasure_budgets()')
        and not p.prosecdef and p.prorettype = pg_catalog.to_regtype('pg_catalog.trigger')
        and p.pronargs = 0 and p.prokind = ${"f"} and l.lanname = ${"plpgsql"}
        and pg_catalog.array_length(p.proconfig, 1) = 1
        and pg_catalog.regexp_replace(p.proconfig[1], '\\s', '', 'g') = ${"search_path=pg_catalog,public"}
        and p.prosrc = ${erasureBody}
    ) as erasure_ready
  `);
  if (
    rows.length !== 1 ||
    rows[0]?.storage_ready !== true ||
    rows[0]?.erasure_ready !== true
  )
    throw unavailable();
}

type Counter = {
  id: string;
  key: string;
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
      const selected =
        attemptClass === "withdrawal"
          ? [{ key: `reader-profile.withdraw:${accountId}`, cap: 10 }]
          : [
              { key: `reader-profile.attempt:${accountId}`, cap: 20 },
              ...(attemptClass === "content"
                ? [{ key: `reader-profile.write:${accountId}`, cap: 5 }]
                : []),
            ];
      const locked: { row: Counter; cap: number; owned: boolean }[] = [];
      for (const { key, cap } of selected) {
        const shellId = randomUUID();
        const inserted = await tx.execute<{ id: string }>(sql`
          /* reader_profile_budget_insert */
          insert into public.rate_limits (id, key, count, last_request)
          values (${shellId}, ${key}, 0, 0) on conflict (key) do nothing returning id
        `);
        if (
          inserted.length > 1 ||
          (inserted.length === 1 && inserted[0]?.id !== shellId)
        )
          throw unavailable();
        const rows = await tx.execute<Counter>(sql`
          /* reader_profile_budget_lock */
          select id, key, count, last_request from public.rate_limits
          where key = ${key} for update
        `);
        const row = rows[0];
        if (
          rows.length !== 1 ||
          !row ||
          typeof row.id !== "string" ||
          row.id.length === 0 ||
          row.key !== key
        )
          throw unavailable();
        locked.push({
          row,
          cap,
          owned: inserted.length === 1 && row.id === shellId,
        });
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
        const updated = await tx.execute<{ id: string }>(sql`
          /* reader_profile_budget_update */
          update public.rate_limits set count = ${count}, last_request = ${lastRequest}
          where key = ${row.key} and id = ${row.id} returning id
        `);
        if (updated.length !== 1 || updated[0]?.id !== row.id)
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
