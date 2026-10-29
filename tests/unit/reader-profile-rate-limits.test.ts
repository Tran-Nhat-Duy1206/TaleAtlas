import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
// Resolve the web package's existing dependency, not a new root dependency.
const { PgDialect } = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
)("drizzle-orm/pg-core") as {
  PgDialect: new () => {
    sqlToQuery(query: unknown): { sql: string; params: unknown[] };
  };
};
import { chargeReaderProfileAttempt } from "../../apps/web/src/server/reader-profile/rate-limits";
import {
  requireReaderProfilePrincipal,
  type ReaderProfilePrincipal,
} from "../../apps/web/src/server/reader-profile/authority";

// Synthetic UNIT storage/authority inputs only. Real PostgreSQL/authentication,
// lock waits, trigger semantics and erasure remain integration-test authority.
const mocks = vi.hoisted(() => ({ database: vi.fn(), session: vi.fn() }));
vi.mock("../../apps/web/src/server/database", () => ({
  getDatabase: mocks.database,
}));
vi.mock("../../apps/web/src/server/session", () => ({
  requireSession: mocks.session,
}));
const dialect = new PgDialect();
const account = " Case:Opaque-UNIT-account ";
const session = "UNIT-session";
const key = (kind = "attempt") => `reader-profile.${kind}:${account}`;
type Row = {
  id: string;
  key: string;
  count: number;
  last_request: string | number;
};
let store: Map<string, Row>;
let tags: string[];
let queries: { sql: string; params: unknown[] }[];
let at: unknown;
let readiness: boolean[];
let currentCalls: number;
let expireOnCurrent: number;
let failure: string | undefined;
let commitFailure: boolean;
let committed: number;
let onQuery:
  | ((tag: string, params: unknown[]) => unknown[] | undefined)
  | undefined;
let transaction: ReturnType<typeof vi.fn>;

async function principal() {
  return requireReaderProfilePrincipal(new Headers());
}
function seed(kind: string, count: number, anchor: string | number = "100000") {
  store.set(key(kind), {
    id: `existing-${kind}`,
    key: key(kind),
    count,
    last_request: anchor,
  });
}
async function execute(query: unknown) {
  const compiled = dialect.sqlToQuery(query);
  const tag = /\/\* (reader_profile_[a-z_]+) \*\//.exec(compiled.sql)?.[1];
  if (!tag) throw new Error("Unknown synthetic UNIT SQL");
  tags.push(tag);
  queries.push(compiled);
  const overridden = onQuery?.(tag, compiled.params);
  if (overridden !== undefined) return overridden;
  if (failure === tag)
    throw new Error("UNIT-private-foreign-SQL-params-marker");
  if (tag === "reader_profile_authority_user")
    return [{ id: account, verified: true }];
  if (tag === "reader_profile_authority_session") return [{ id: session }];
  if (tag === "reader_profile_authority_current")
    return ++currentCalls === expireOnCurrent ? [] : [{ id: session }];
  if (tag === "reader_profile_budget_readiness") {
    const ready = readiness.length > 1 ? readiness.shift() : readiness[0];
    return [{ storage_ready: ready, erasure_ready: ready }];
  }
  const params = compiled.params;
  if (tag === "reader_profile_budget_insert") {
    const id = params[0] as string;
    const budgetKey = params[1] as string;
    if (store.has(budgetKey)) return [];
    store.set(budgetKey, { id, key: budgetKey, count: 0, last_request: "0" });
    return [{ id }];
  }
  if (tag === "reader_profile_budget_lock") {
    const row = store.get(params[0] as string);
    return row ? [{ ...row }] : [];
  }
  if (tag === "reader_profile_budget_clock") return [{ at }];
  if (tag === "reader_profile_budget_update") {
    const row = store.get(params[2] as string);
    if (!row || row.id !== params[3]) return [];
    row.count = params[0] as number;
    row.last_request = params[1] as number;
    return [{ id: row.id }];
  }
  throw new Error("Unhandled synthetic UNIT SQL");
}
beforeEach(() => {
  vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", "true");
  vi.stubEnv("V6B_PROFILE_PUBLIC_ENABLED", "false");
  store = new Map();
  tags = [];
  queries = [];
  at = "100000";
  readiness = [true];
  currentCalls = 0;
  expireOnCurrent = -1;
  failure = undefined;
  commitFailure = false;
  committed = 0;
  onQuery = undefined;
  mocks.session.mockReset().mockResolvedValue({
    user: { id: account, emailVerified: true },
    session: { id: session, userId: account },
  });
  transaction = vi.fn(
    async (run: (tx: { execute: typeof execute }) => Promise<unknown>) => {
      const snapshot = new Map([...store].map(([k, row]) => [k, { ...row }]));
      try {
        const value = await run({ execute });
        if (commitFailure) throw new Error("UNIT-private-uncertain-commit");
        committed++;
        return value;
      } catch (error) {
        store = snapshot;
        throw error;
      }
    },
  );
  mocks.database.mockReset().mockReturnValue({ transaction });
});
afterEach(() => vi.unstubAllEnvs());

describe("reader profile budgets (synthetic UNIT only)", () => {
  it.each([
    ["ordinary", "attempt", 20],
    ["content", "write", 5],
    ["withdrawal", "withdraw", 10],
  ] as const)(
    "enforces %s cap and commits saturated denials",
    async (attemptClass, kind, cap) => {
      for (let n = 1; n <= cap; n++)
        await chargeReaderProfileAttempt(await principal(), attemptClass);
      expect(store.get(key(kind))?.count).toBe(cap);
      for (let n = 0; n < 3; n++)
        await expect(
          chargeReaderProfileAttempt(await principal(), attemptClass),
        ).rejects.toMatchObject({
          code: "RATE_LIMITED",
          status: 429,
          retryAfterSeconds: 60,
        });
      expect(store.get(key(kind))?.count).toBe(cap + 1);
      expect(committed).toBe(cap + 3);
      expect([...store.keys()]).toEqual(
        attemptClass === "content" ? [key(), key("write")] : [key(kind)],
      );
    },
  );
  it("shares the attempt budget across ordinary/content; denied content still updates both", async () => {
    seed("attempt", 20);
    seed("write", 1);
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(store.get(key())?.count).toBe(21);
    expect(store.get(key("write"))?.count).toBe(2);
    expect(committed).toBe(1);
  });
  it("withdrawal remains independent of exhausted ordinary/content budgets", async () => {
    seed("attempt", 21);
    seed("write", 6);
    await chargeReaderProfileAttempt(await principal(), "withdrawal");
    expect(store.get(key("withdraw"))?.count).toBe(1);
    expect(store.get(key())?.count).toBe(21);
    expect(store.get(key("write"))?.count).toBe(6);
  });
  it.each([
    ["159999", 429, 1],
    ["160000", 200, undefined],
    ["160001", 200, undefined],
  ] as const)(
    "resets at exact window equality: %s",
    async (clock, status, retry) => {
      seed("attempt", 20);
      at = clock;
      const result = chargeReaderProfileAttempt(await principal());
      if (status === 429)
        await expect(result).rejects.toMatchObject({
          status,
          retryAfterSeconds: retry,
        });
      else await result;
      expect(store.get(key())?.count).toBe(status === 429 ? 21 : 1);
      expect(store.get(key())?.last_request).toBe(
        status === 429 ? 100000 : Number(clock),
      );
    },
  );
  it("uses the largest rounded remaining window for multiple denied budgets", async () => {
    seed("attempt", 20, "100000");
    seed("write", 5, "110001");
    at = "120002";
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ retryAfterSeconds: 50 });
  });
  it("memoizes the identical promise before await, including successful terminal state", async () => {
    const p = await principal();
    const first = chargeReaderProfileAttempt(p, "content");
    expect(chargeReaderProfileAttempt(p, "content")).toBe(first);
    await first;
    expect(chargeReaderProfileAttempt(p, "content")).toBe(first);
    await expect(
      chargeReaderProfileAttempt(p, "withdrawal"),
    ).rejects.toMatchObject({ status: 503 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(store.get(key())?.count).toBe(1);
  });
  it.each(["reader_profile_budget_lock", "reader_profile_budget_update"])(
    "memoizes rejection without automatic retry: %s",
    async (tag) => {
      const p = await principal();
      failure = tag;
      const first = chargeReaderProfileAttempt(p);
      await expect(first).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "SERVICE_UNAVAILABLE",
      });
      failure = undefined;
      expect(chargeReaderProfileAttempt(p)).toBe(first);
      await expect(
        chargeReaderProfileAttempt(p, "content"),
      ).rejects.toMatchObject({ status: 503 });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(store.size).toBe(0);
    },
  );
  it("memoizes a committed denial and does not count it twice", async () => {
    seed("attempt", 20);
    const p = await principal();
    const first = chargeReaderProfileAttempt(p);
    await expect(first).rejects.toMatchObject({ status: 429 });
    expect(chargeReaderProfileAttempt(p)).toBe(first);
    expect(store.get(key())?.count).toBe(21);
    expect(committed).toBe(1);
  });
  it("maps uncertain commit to closed 503 without retry or foreign cause", async () => {
    commitFailure = true;
    const p = await principal();
    const first = chargeReaderProfileAttempt(p);
    await expect(first).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
    await expect(first).rejects.not.toHaveProperty("cause");
    expect(chargeReaderProfileAttempt(p)).toBe(first);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("uncertain denial commit produces 503, never a premature 429", async () => {
    seed("attempt", 20);
    commitFailure = true;
    await expect(
      chargeReaderProfileAttempt(await principal()),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(committed).toBe(0);
  });
  it("deadlock errors are sanitized without automatic retry", async () => {
    onQuery = (tag) => {
      if (tag === "reader_profile_budget_lock")
        throw Object.assign(new Error("UNIT-private-deadlock-detail"), {
          code: "40P01",
        });
      return undefined;
    };
    const p = await principal();
    const result = chargeReaderProfileAttempt(p);
    await expect(result).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "SERVICE_UNAVAILABLE",
    });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(chargeReaderProfileAttempt(p)).toBe(result);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("gate-off performs no DB/session I/O", async () => {
    vi.stubEnv("V6B_PROFILE_OWNER_ENABLED", "false");
    await expect(
      chargeReaderProfileAttempt({} as ReaderProfilePrincipal),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(tags).toEqual([]);
  });
  it.each([null, undefined, "forged", 1, true, {}])(
    "denies forged/primitive capability %j at root fence",
    async (p) => {
      await expect(
        chargeReaderProfileAttempt(p as ReaderProfilePrincipal),
      ).rejects.toMatchObject({ status: 401 });
      expect(tags).toEqual([]);
      expect(store.size).toBe(0);
    },
  );
  it("unknown class fails 503 before database", async () => {
    await expect(
      chargeReaderProfileAttempt(await principal(), "unknown" as "ordinary"),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each([
    [-1, "100000"],
    [0, "0"],
    [22, "100000"],
    [1.5, "100000"],
    [1, "-1"],
    [1, "9007199254740992"],
    [1, "100001"],
    [1, "NaN"],
    [1, ""],
  ])(
    "rejects corrupt stored count/anchor (%s/%s) without fallback",
    async (count, anchor) => {
      seed("attempt", count as number, anchor);
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_update");
      expect(committed).toBe(0);
    },
  );
  it.each(["-1", "9007199254740992", "1.5", "", null, Infinity])(
    "rejects impossible DB clock %s",
    async (clock) => {
      at = clock;
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 503 });
      expect(store.size).toBe(0);
    },
  );
  it("validates all selected rows before any update", async () => {
    seed("attempt", 2);
    seed("write", -1);
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ status: 503 });
    expect(tags).not.toContain("reader_profile_budget_update");
    expect(store.get(key())?.count).toBe(2);
  });
  it.each([[false], [true, false]])(
    "fails missing/wrong/disabled metadata before mutation or after waits: %j",
    async (...values) => {
      readiness = [...values];
      await expect(
        chargeReaderProfileAttempt(await principal(), "content"),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_update");
      expect(store.size).toBe(0);
      if (values.length === 1)
        expect(tags).not.toContain("reader_profile_budget_insert");
    },
  );
  it.each(["reader_profile_budget_lock", "reader_profile_budget_update"])(
    "fails closed and rolls back when selected row is missing at %s",
    async (missing) => {
      onQuery = (tag) => (tag === missing ? [] : undefined);
      await expect(
        chargeReaderProfileAttempt(await principal(), "content"),
      ).rejects.toMatchObject({ status: 503 });
      expect(store.size).toBe(0);
      expect(committed).toBe(0);
    },
  );
  it("an insert conflict cannot legitimize somebody else's persisted zero shell", async () => {
    onQuery = (tag) => {
      if (tag === "reader_profile_budget_insert") seed("attempt", 0, "0");
      return undefined;
    };
    await expect(
      chargeReaderProfileAttempt(await principal()),
    ).rejects.toMatchObject({ status: 503 });
    expect(tags).not.toContain("reader_profile_budget_update");
  });
  it("takes a fresh DB clock after a simulated external counter acquisition delay", async () => {
    seed("attempt", 20);
    onQuery = (tag) => {
      if (tag === "reader_profile_budget_lock") at = "160000";
      return undefined;
    };
    await chargeReaderProfileAttempt(await principal());
    expect(store.get(key())?.count).toBe(1);
    expect(store.get(key())?.last_request).toBe(160000);
  });
  it("retains existing arbitrary row IDs and uses unrelated UUIDs for new shells", async () => {
    seed("attempt", 1);
    await chargeReaderProfileAttempt(await principal(), "content");
    expect(store.get(key())?.id).toBe("existing-attempt");
    expect(store.get(key("write"))?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.get(key("write"))?.id).not.toContain(account);
  });
  it.each(["storage_ready", "erasure_ready"])(
    "rejects individually invalid readiness %s",
    async (field) => {
      onQuery = (tag) =>
        tag === "reader_profile_budget_readiness"
          ? [{ storage_ready: true, erasure_ready: true, [field]: false }]
          : undefined;
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_insert");
    },
  );
  it("post-wait expiry rolls back shells and never writes counters", async () => {
    expireOnCurrent = 2;
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ status: 401 });
    expect(store.size).toBe(0);
    expect(tags).not.toContain("reader_profile_budget_update");
  });
  it("locks all selected rows in fixed order before fresh auth and DB clock", async () => {
    await chargeReaderProfileAttempt(await principal(), "content");
    const locks = queries.filter((q) =>
      q.sql.includes("reader_profile_budget_lock"),
    );
    expect(locks.map((q) => q.params[0])).toEqual([key(), key("write")]);
    const lastLock = tags.lastIndexOf("reader_profile_budget_lock");
    expect(
      tags.lastIndexOf("reader_profile_authority_current"),
    ).toBeGreaterThan(lastLock);
    expect(tags.indexOf("reader_profile_budget_clock")).toBeGreaterThan(
      tags.lastIndexOf("reader_profile_authority_current"),
    );
    expect(tags.indexOf("reader_profile_budget_update")).toBeGreaterThan(
      tags.indexOf("reader_profile_budget_clock"),
    );
  });
  it("checks exact erasure function and strict trigger/index/storage metadata, with values parameterized", async () => {
    await chargeReaderProfileAttempt(await principal());
    const query = queries.find((q) =>
      q.sql.includes("reader_profile_budget_readiness"),
    )!;
    for (const clause of [
      "t.tgtype = 11",
      "not t.tgisinternal",
      "t.tgqual is null",
      "t.tgnargs = 0",
      "t.tgconstraint = 0",
      "not t.tgdeferrable",
      "not p.prosecdef",
      "p.prosrc",
      "p.proconfig",
      "i.indisvalid",
      "i.indisready",
      "i.indpred is null",
      "i.indexprs is null",
      "a.attnotnull",
    ])
      expect(query.sql).toContain(clause);
    expect(query.params).toContain("reader_profile_user_erasure_budgets");
    expect(query.params).toContain("search_path=pg_catalog,public");
    expect(query.sql).toContain("p.prosrc = $");
    expect(query.sql).not.toContain("regexp_replace(p.prosrc");
    expect(query.params).toContain(
      "\nBEGIN\n  DELETE FROM public.rate_limits WHERE key IN ('reader-profile.attempt:' || OLD.id, 'reader-profile.write:' || OLD.id, 'reader-profile.withdraw:' || OLD.id);\n  RETURN OLD;\nEND;\n",
    );
    expect(query.sql).not.toContain(account);
    expect(
      queries.find((q) => q.sql.includes("reader_profile_budget_clock"))?.sql,
    ).toContain("clock_timestamp()");
  });
});
