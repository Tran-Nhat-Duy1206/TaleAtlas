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
const key = (kind = "ordinary") => `${account}\u0000${kind}`;
type Row = {
  user_id: string;
  kind: string;
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
const canonicalChecks = () => [
  {
    name: "reader_profile_rate_limits_kind_check",
    expression:
      "(kind = ANY (ARRAY['ordinary'::text, 'content'::text, 'withdrawal'::text]))",
  },
  {
    name: "reader_profile_rate_limits_count_check",
    expression:
      "((count >= 0) AND (count <= 21) AND ((kind <> 'content'::text) OR (count <= 6)) AND ((kind <> 'withdrawal'::text) OR (count <= 11)))",
  },
  {
    name: "reader_profile_rate_limits_last_request_check",
    expression:
      "((last_request >= 0) AND (last_request <= '9007199254740991'::bigint))",
  },
];

async function principal() {
  return requireReaderProfilePrincipal(new Headers());
}
function seed(kind: string, count: number, anchor: string | number = "100000") {
  store.set(key(kind), {
    user_id: account,
    kind,
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
    return [
      { storage_ready: ready, erasure_ready: ready, checks: canonicalChecks() },
    ];
  }
  const params = compiled.params;
  if (tag === "reader_profile_budget_insert") {
    const user_id = params[0] as string;
    const kind = params[1] as string;
    if (store.has(key(kind))) return [];
    store.set(key(kind), { user_id, kind, count: 0, last_request: "0" });
    return [{ user_id, kind }];
  }
  if (tag === "reader_profile_budget_lock") {
    const row = store.get(key(params[1] as string));
    return row ? [{ ...row }] : [];
  }
  if (tag === "reader_profile_budget_clock") return [{ at }];
  if (tag === "reader_profile_budget_update") {
    const row = store.get(key(params[3] as string));
    if (!row || row.user_id !== params[2]) return [];
    row.count = params[0] as number;
    row.last_request = params[1] as number;
    return [{ user_id: row.user_id, kind: row.kind }];
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
    ["ordinary", "ordinary", 20],
    ["content", "content", 5],
    ["withdrawal", "withdrawal", 10],
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
        attemptClass === "content" ? [key(), key("content")] : [key(kind)],
      );
    },
  );
  it("shares the attempt budget across ordinary/content; denied content still updates both", async () => {
    seed("ordinary", 20);
    seed("content", 1);
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(store.get(key())?.count).toBe(21);
    expect(store.get(key("content"))?.count).toBe(2);
    expect(committed).toBe(1);
  });
  it("withdrawal remains independent of exhausted ordinary/content budgets", async () => {
    seed("ordinary", 21);
    seed("content", 6);
    await chargeReaderProfileAttempt(await principal(), "withdrawal");
    expect(store.get(key("withdrawal"))?.count).toBe(1);
    expect(store.get(key())?.count).toBe(21);
    expect(store.get(key("content"))?.count).toBe(6);
  });
  it.each([
    ["159999", 429, 1],
    ["160000", 200, undefined],
    ["160001", 200, undefined],
  ] as const)(
    "resets at exact window equality: %s",
    async (clock, status, retry) => {
      seed("ordinary", 20);
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
    seed("ordinary", 20, "100000");
    seed("content", 5, "110001");
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
    seed("ordinary", 20);
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
    seed("ordinary", 20);
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
      seed("ordinary", count as number, anchor);
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
    seed("ordinary", 2);
    seed("content", -1);
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
      if (tag === "reader_profile_budget_insert") seed("ordinary", 0, "0");
      return undefined;
    };
    await expect(
      chargeReaderProfileAttempt(await principal()),
    ).rejects.toMatchObject({ status: 503 });
    expect(tags).not.toContain("reader_profile_budget_update");
  });
  it("takes a fresh DB clock after a simulated external counter acquisition delay", async () => {
    seed("ordinary", 20);
    onQuery = (tag) => {
      if (tag === "reader_profile_budget_lock") at = "160000";
      return undefined;
    };
    await chargeReaderProfileAttempt(await principal());
    expect(store.get(key())?.count).toBe(1);
    expect(store.get(key())?.last_request).toBe(160000);
  });
  it("preserves the unchanged opaque owner and composite bucket identity without keys or replacement UUIDs", async () => {
    seed("ordinary", 1);
    await chargeReaderProfileAttempt(await principal(), "content");
    expect(store.get(key())?.user_id).toBe(account);
    expect(store.get(key("content"))?.user_id).toBe(account);
    expect(store.get(key("content"))?.kind).toBe("content");
    expect(Object.keys(store.get(key("content"))!).sort()).toEqual([
      "count",
      "kind",
      "last_request",
      "user_id",
    ]);
    for (const q of queries) {
      expect(q.sql).not.toMatch(/\b(?:public\.)?rate_limits\b/);
      expect(q.params).not.toContain(`reader-profile.attempt:${account}`);
    }
    const insert = queries.find((q) =>
      q.sql.includes("reader_profile_budget_insert"),
    )!;
    expect(insert.params).toEqual([account, "ordinary"]);
    expect(insert.sql).toContain("on conflict (user_id, kind) do nothing");
  });
  it.each(["storage_ready", "erasure_ready"])(
    "rejects individually invalid readiness %s",
    async (field) => {
      onQuery = (tag) =>
        tag === "reader_profile_budget_readiness"
          ? [
              {
                storage_ready: true,
                erasure_ready: true,
                checks: canonicalChecks(),
                [field]: false,
              },
            ]
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
    expect(locks.map((q) => q.params)).toEqual([
      [account, "ordinary"],
      [account, "content"],
    ]);
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
  it.each([
    "missing",
    "duplicate",
    "wrong-kind",
    "literal-space",
    "wide-content",
    "wide-withdrawal",
    "negative-count",
    "unsafe-anchor",
    "extra-condition",
    "not-array",
  ])(
    "fails closed on missing or tampered CHECK metadata: %s",
    async (variant) => {
      const checks = canonicalChecks();
      if (variant === "missing") checks.pop();
      if (variant === "duplicate") checks[2] = { ...checks[0]! };
      if (variant === "wrong-kind")
        checks[0]!.expression = checks[0]!.expression.replace(
          "'content'",
          "'write'",
        );
      if (variant === "literal-space")
        checks[0]!.expression = checks[0]!.expression.replace(
          "'content'",
          "'con tent'",
        );
      if (variant === "wide-content")
        checks[1]!.expression = checks[1]!.expression.replace(
          "count <= 6",
          "count <= 21",
        );
      if (variant === "wide-withdrawal")
        checks[1]!.expression = checks[1]!.expression.replace(
          "count <= 11",
          "count <= 21",
        );
      if (variant === "negative-count")
        checks[1]!.expression = checks[1]!.expression.replace(
          "count >= 0",
          "count >= -1",
        );
      if (variant === "unsafe-anchor")
        checks[2]!.expression = checks[2]!.expression.replace(
          "9007199254740991",
          "9007199254740992",
        );
      if (variant === "extra-condition") checks[0]!.expression += " OR true";
      onQuery = (tag) =>
        tag === "reader_profile_budget_readiness"
          ? [
              {
                storage_ready: true,
                erasure_ready: true,
                checks: variant === "not-array" ? {} : checks,
              },
            ]
          : undefined;
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_insert");
      expect(committed).toBe(0);
    },
  );
  it("accepts harmless CHECK formatting only outside quoted literals", async () => {
    const checks = canonicalChecks().map((c) => ({
      ...c,
      expression: c.expression.replace(/ AND /g, "\n  AND\t"),
    }));
    onQuery = (tag) =>
      tag === "reader_profile_budget_readiness"
        ? [{ storage_ready: true, erasure_ready: true, checks }]
        : undefined;
    await chargeReaderProfileAttempt(await principal(), "content");
    expect(store.get(key())?.count).toBe(1);
    expect(store.get(key("content"))?.count).toBe(1);
  });
  it("rechecks exact CHECK definitions after quota waits rather than caching readiness", async () => {
    let calls = 0;
    onQuery = (tag) => {
      if (tag !== "reader_profile_budget_readiness") return undefined;
      const checks = canonicalChecks();
      if (++calls === 2)
        checks[0]!.expression = checks[0]!.expression.replace(
          "'content'",
          "'con tent'",
        );
      return [{ storage_ready: true, erasure_ready: true, checks }];
    };
    await expect(
      chargeReaderProfileAttempt(await principal(), "content"),
    ).rejects.toMatchObject({ status: 503 });
    expect(tags).toContain("reader_profile_budget_lock");
    expect(tags).not.toContain("reader_profile_budget_update");
    expect(store.size).toBe(0);
  });
  it.each([
    ["content", 7],
    ["withdrawal", 12],
  ] as const)(
    "rejects an over-saturated persisted %s counter",
    async (kind, count) => {
      seed(kind, count);
      await expect(
        chargeReaderProfileAttempt(await principal(), kind),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_update");
    },
  );
  it.each(["user_id", "kind"])(
    "rejects mismatched selected composite identity %s",
    async (field) => {
      onQuery = (tag) =>
        tag === "reader_profile_budget_lock"
          ? [
              {
                user_id: account,
                kind: "ordinary",
                count: 1,
                last_request: "100000",
                [field]: "foreign",
              },
            ]
          : undefined;
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 503 });
      expect(tags).not.toContain("reader_profile_budget_update");
      expect(committed).toBe(0);
    },
  );
  it("does not use application clock or shared authentication row pruning to reset its active counter", async () => {
    seed("ordinary", 20);
    at = "159999";
    const sharedAuthenticationRows = new Map([["synthetic-auth-key", 100000]]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(9007199254740991);
    try {
      sharedAuthenticationRows.clear();
      await expect(
        chargeReaderProfileAttempt(await principal()),
      ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 1 });
      expect(store.get(key())?.count).toBe(21);
      expect(store.get(key())?.last_request).toBe(100000);
      expect(clock).not.toHaveBeenCalled();
      expect(
        queries.every((q) => !/\b(?:public\.)?rate_limits\b/.test(q.sql)),
      ).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
  it("checks exact composite storage, validated cascade FK, active internal triggers and CHECK metadata", async () => {
    await chargeReaderProfileAttempt(await principal());
    const query = queries.find((q) =>
      q.sql.includes("reader_profile_budget_readiness"),
    )!;
    for (const clause of [
      "public.reader_profile_rate_limits",
      "reader_profile_rate_limits_pkey",
      "reader_profile_rate_limits_user_fk",
      "p.conkey=ARRAY[x.owner_column,x.kind_column]",
      "i.indisvalid",
      "i.indisready",
      "i.indimmediate",
      "i.indnkeyatts=2",
      "i.indkey[0]=x.owner_column",
      "i.indkey[1]=x.kind_column",
      "i.indpred is null",
      "i.indexprs is null",
      "a.attnotnull",
      "f.convalidated",
      "not f.condeferrable",
      "f.confdeltype='c'",
      "f.confrelid=x.owner_relation",
      "f.confkey=ARRAY[x.referenced_column]",
      "t.tgenabled in ('O','A')",
      "session_replication_role",
      "t.tgconstraint=f.oid",
      "RI_FKey_cascade_del",
      "RI_FKey_noaction_upd",
      "RI_FKey_check_ins",
      "RI_FKey_check_upd",
      "c.convalidated",
      "pg_catalog.pg_get_expr(c.conbin,c.conrelid,false)",
    ])
      expect(query.sql).toContain(clause);
    expect(query.sql).not.toContain("reader_profile_user_erasure_budgets");
    expect(query.sql).not.toContain("p.prosrc");
    expect(query.sql).not.toContain(account);
    expect(
      queries.find((q) => q.sql.includes("reader_profile_budget_clock"))?.sql,
    ).toContain("clock_timestamp()");
  });
});
