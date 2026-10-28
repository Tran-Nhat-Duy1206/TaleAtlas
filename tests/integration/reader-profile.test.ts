import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";

// Pure PostgreSQL identities, not signed-in actors. GraphMCP coverage UNKNOWN;
// source fallback: test-database, database/client and existing integration fixtures.
const sql = createDatabase(requireTestDatabase()).client;
type Reader = Pick<typeof sql, "unsafe">;
const handle = () => `r${randomUUID().replaceAll("-", "").slice(0, 23)}`;
const opaque = () => `reader-fixture|${randomUUID()}`;
async function user(tx: Reader, id = opaque()) {
  await tx.unsafe(
    "insert into users(id,name,email) values($1,'Synthetic profile fixture',$2)",
    [id, `${randomUUID()}@invalid`],
  );
  return id;
}
async function profile(tx: Reader, id: string, claim = handle()) {
  const [row] = await tx.unsafe(
    "insert into reader_profiles(user_id,handle,display_name) values($1,$2,'Synthetic Reader') returning *",
    [id, claim],
  );
  if (!row) throw new Error("Synthetic profile missing");
  return row;
}
async function code(operation: PromiseLike<unknown>, expected: string) {
  let actual: unknown;
  try {
    await operation;
  } catch (error) {
    actual = (error as { code?: string }).code;
  }
  // Do not print driver messages, SQL parameters or private fixture values.
  expect(actual).toBe(expected);
}
async function rollback(
  run: (tx: Parameters<Parameters<typeof sql.begin>[1]>[0]) => Promise<void>,
) {
  requireTestDatabase();
  const stop = new Error("Owned fixture rollback");
  try {
    await sql.begin(async (tx) => {
      await run(tx);
      throw stop;
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
}
async function rejected(
  tx: Reader,
  statement: string,
  values: (string | number | null)[],
  expected = "23514",
) {
  await tx.unsafe("savepoint invalid_fixture");
  try {
    await code(tx.unsafe(statement, values), expected);
  } finally {
    await tx.unsafe("rollback to savepoint invalid_fixture");
    await tx.unsafe("release savepoint invalid_fixture");
  }
}
afterAll(async () => {
  await sql.end();
});

describe("reader profile persistence (guarded real SQL)", () => {
  it("does not backfill accounts and generates private active identities with immutable claims", async () => {
    await rollback(async (tx) => {
      const a = await user(tx),
        b = await user(tx);
      expect(
        await tx`select user_id from reader_profiles where user_id=any(${[a, b]}::text[])`,
      ).toHaveLength(0);
      const p = await profile(tx, a);
      expect(p).toMatchObject({
        user_id: a,
        visibility: "PRIVATE",
        state: "ACTIVE",
        revision: 1,
        biography: null,
      });
      expect(p.public_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(p.created_at).toBeInstanceOf(Date);
      expect(p.updated_at).toBeInstanceOf(Date);
      await rejected(
        tx,
        "insert into reader_profiles(user_id,handle,display_name) values($1,$2,'Synthetic')",
        [b, p.handle],
        "23505",
      );
      await rejected(
        tx,
        "insert into reader_profiles(user_id,handle,display_name) values($1,$2,'Synthetic')",
        [a, handle()],
        "23505",
      );
      await rejected(
        tx,
        "insert into reader_profiles(user_id,handle,display_name,public_id) values($1,$2,'Synthetic',$3)",
        [b, handle(), p.public_id],
        "23505",
      );
      await rejected(
        tx,
        "insert into reader_profiles(user_id,handle,display_name) values($1,$2,'Synthetic')",
        [opaque(), handle()],
        "23503",
      );
      await rejected(
        tx,
        "insert into reader_profiles(user_id,handle,display_name,visibility) values($1,$2,'Synthetic','PUBLIC')",
        [b, handle()],
      );
      for (const [column, value] of [
        ["handle", handle()],
        ["user_id", b],
        ["public_id", randomUUID()],
      ])
        await rejected(
          tx,
          `update reader_profiles set ${column}=$2 where user_id=$1`,
          [a, value!],
        );
      await rejected(tx, "delete from reader_profiles where user_id=$1", [a]);
      await tx`update reader_profiles set visibility='PUBLIC',revision=7 where user_id=${a}`;
      expect(
        await tx`select handle,public_id,revision,visibility from reader_profiles where user_id=${a}`,
      ).toEqual([
        {
          handle: p.handle,
          public_id: p.public_id,
          revision: 7,
          visibility: "PUBLIC",
        },
      ]);
    });
  });

  it("rejects noncanonical handles including a trailing newline and enforces 3..24 ASCII characters", async () => {
    await rollback(async (tx) => {
      const a = await user(tx);
      for (const invalid of [
        "ab",
        "a".repeat(25),
        "Uppercase",
        "a-b",
        "1abc",
        "_abc",
        "abc\n",
        "abc ",
        "éabc",
      ])
        await rejected(
          tx,
          "insert into reader_profiles(user_id,handle,display_name) values($1,$2,'Synthetic')",
          [a, invalid],
        );
      await profile(tx, a, "r_1");
      const b = await user(tx);
      expect((await profile(tx, b)).handle).toHaveLength(24);
    });
  });

  it("enforces canonical NFC display/bio UTF-16 boundaries, clears biography and rejects raw noncanonical text", async () => {
    await rollback(async (tx) => {
      const a = await user(tx);
      await profile(tx, a);
      for (const value of [
        "a".repeat(80),
        "😀".repeat(40),
        "é".repeat(80),
        "\u0308\u0301".normalize("NFC"),
      ]) {
        await tx`update reader_profiles set display_name=${value} where user_id=${a}`;
        expect(
          (
            await tx`select display_name from reader_profiles where user_id=${a}`
          )[0]!.display_name,
        ).toBe(value);
      }
      // U+0344 grows to two code units on NFC normalization. B1 checks both raw
      // and normalized bounds; raw SQL must reject the non-NFC spelling itself.
      const growth = "\u0344".repeat(41);
      expect(growth.normalize("NFC").length).toBe(82);
      for (const value of [
        null,
        "",
        " ",
        " padded",
        "padded ",
        "a".repeat(81),
        "😀".repeat(41),
        "e\u0301",
        growth,
        growth.normalize("NFC"),
        "a\nb",
        "a\tb",
        "a\u007fb",
        "a\u0085b",
        "a\u202eb",
        "a\u2066b",
      ])
        await rejected(
          tx,
          "update reader_profiles set display_name=$2 where user_id=$1",
          [a, value],
        );
      for (const value of [
        "",
        "a".repeat(500),
        "😀".repeat(250),
        "é".repeat(500),
        "a\nb",
        "a\r\nb",
        "a\tb",
        null,
      ]) {
        await tx`update reader_profiles set biography=${value} where user_id=${a}`;
        expect(
          (
            await tx`select biography from reader_profiles where user_id=${a}`
          )[0]!.biography,
        ).toBe(value);
      }
      for (const value of [
        "a".repeat(501),
        "😀".repeat(251),
        "e\u0301",
        " padded",
        "padded ",
        "a\u0001b",
        "a\u000bb",
        "a\u001fb",
        "a\u007fb",
        "a\u0085b",
        "a\u009fb",
        "a\u202eb",
        "a\u2069b",
      ])
        await rejected(
          tx,
          "update reader_profiles set biography=$2 where user_id=$1",
          [a, value],
        );
      // PostgreSQL UTF8 cannot recover a JS lone surrogate after client replacement;
      // deliberately do not claim SQL coverage of B1's pre-encoding rejection.
      for (const [column, value] of [
        ["revision", 0],
        ["revision", -1],
        ["state", "UNKNOWN"],
        ["visibility", "UNKNOWN"],
      ] as const)
        await rejected(
          tx,
          `update reader_profiles set ${column}=$2 where user_id=$1`,
          [a, value],
        );
      // Positive INT storage boundary, not OCC or an automatic-bump contract.
      await tx`update reader_profiles set revision=2147483647 where user_id=${a}`;
      expect(
        (await tx`select revision from reader_profiles where user_id=${a}`)[0]!
          .revision,
      ).toBe(2147483647);
      await rejected(
        tx,
        "update reader_profiles set revision=$2::integer where user_id=$1",
        [a, 2147483648],
        "22003",
      );
      await rejected(
        tx,
        "update reader_profiles set revision=$2::text::integer where user_id=$1",
        [a, "1.5"],
        "22P02",
      );
    });
  });

  it("stores only canonical genre references in five unique slots and rejects missing/removed profile writes", async () => {
    await rollback(async (tx) => {
      const a = await user(tx),
        missing = await user(tx);
      await profile(tx, a);
      const genres = Array.from({ length: 6 }, () => `rp-${randomUUID()}`);
      for (const slug of genres)
        await tx`insert into genres(slug,name_en,name_vi) values(${slug},'Synthetic genre','Synthetic genre')`;
      for (let i = 0; i < 5; i++)
        await tx`insert into reader_profile_interests(user_id,slot,genre_slug) values(${a},${i + 1},${genres[i]!})`;
      expect(
        (
          await tx`select genre_slug from reader_profile_interests where user_id=${a} order by slot`
        ).map((r) => r.genre_slug),
      ).toEqual(genres.slice(0, 5));
      for (const slot of [0, 6])
        await rejected(
          tx,
          "insert into reader_profile_interests(user_id,slot,genre_slug) values($1,$2,$3)",
          [a, slot, genres[5]!],
        );
      await rejected(
        tx,
        "insert into reader_profile_interests(user_id,slot,genre_slug) values($1,1,$2)",
        [a, genres[5]!],
        "23505",
      );
      await rejected(
        tx,
        "update reader_profile_interests set genre_slug=$2 where user_id=$1 and slot=2",
        [a, genres[0]!],
        "23505",
      );
      await rejected(
        tx,
        "update reader_profile_interests set genre_slug=$2 where user_id=$1 and slot=2",
        [a, `rp-${randomUUID()}`],
        "23503",
      );
      await rejected(
        tx,
        "insert into reader_profile_interests(user_id,slot,genre_slug) values($1,1,$2)",
        [missing, genres[0]!],
        "23503",
      );
      await rejected(
        tx,
        "delete from genres where slug=$1",
        [genres[0]!],
        "23503",
      );
      await rejected(
        tx,
        "update reader_profiles set state='REMOVED' where user_id=$1",
        [a],
      );
      await tx`update reader_profiles set state='REMOVED',visibility='PRIVATE',display_name=null,biography=null where user_id=${a}`;
      expect(
        await tx`select slot from reader_profile_interests where user_id=${a}`,
      ).toHaveLength(0);
      await rejected(
        tx,
        "insert into reader_profile_interests(user_id,slot,genre_slug) values($1,1,$2)",
        [a, genres[0]!],
      );
      await profile(tx, missing);
      await tx`insert into reader_profile_interests(user_id,slot,genre_slug) values(${missing},1,${genres[0]!})`;
      await rejected(
        tx,
        "update reader_profile_interests set user_id=$2 where user_id=$1",
        [missing, a],
      );
      for (const set of [
        "visibility='PUBLIC'",
        "display_name='Synthetic'",
        "biography='Synthetic'",
      ])
        await rejected(
          tx,
          `update reader_profiles set ${set} where user_id=$1`,
          [a],
        );
    });
  });

  it("keeps directed blocks account-bound without requiring profiles", async () => {
    await rollback(async (tx) => {
      const a = await user(tx),
        b = await user(tx);
      await tx`insert into reader_blocks(blocker_id,blocked_id) values(${a},${b}),(${b},${a})`;
      expect(
        await tx`select blocker_id from reader_blocks where blocker_id=any(${[a, b]}::text[])`,
      ).toHaveLength(2);
      await rejected(
        tx,
        "insert into reader_blocks(blocker_id,blocked_id) values($1,$1)",
        [a],
      );
      await rejected(
        tx,
        "insert into reader_blocks(blocker_id,blocked_id) values($1,$2)",
        [a, b],
        "23505",
      );
      await rejected(
        tx,
        "insert into reader_blocks(blocker_id,blocked_id) values($1,$2)",
        [a, opaque()],
        "23503",
      );
      await rejected(
        tx,
        "insert into reader_blocks(blocker_id,blocked_id) values($1,$2)",
        [opaque(), a],
        "23503",
      );
    });
  });

  it.each([true, false])(
    "serializes interest INSERT against removal (removal wins first: %s)",
    async (removalFirst) => {
      requireTestDatabase();
      const owner = opaque(),
        genre = `rp-${randomUUID()}`;
      type Reserved = Awaited<ReturnType<typeof sql.reserve>>;
      type Outcome =
        | { ok: true; count: number }
        | { ok: false; code: string | undefined };
      let winner: Reserved | undefined, waiter: Reserved | undefined;
      let winnerOpen = false,
        waiterOpen = false;
      let pending: Promise<Outcome> | undefined;
      try {
        await user(sql, owner);
        await profile(sql, owner);
        await sql`insert into genres(slug,name_en,name_vi) values(${genre},'Synthetic race genre','Synthetic race genre')`;
        winner = await sql.reserve();
        waiter = await sql.reserve();
        const [winnerBackend] = await winner`select pg_backend_pid() as pid`;
        const [waiterBackend] = await waiter`select pg_backend_pid() as pid`;
        const winnerPid = Number(winnerBackend!.pid),
          waiterPid = Number(waiterBackend!.pid);
        expect(winnerPid).not.toBe(waiterPid);
        for (const connection of [winner, waiter]) {
          const [settings] =
            await connection`select current_setting('statement_timeout') as timeout`;
          expect(settings!.timeout).toBe("5s");
        }
        await winner.unsafe("BEGIN");
        winnerOpen = true;
        await waiter.unsafe("BEGIN");
        waiterOpen = true;
        expect(
          await winner`select user_id from reader_profiles where user_id=${owner} for update`,
        ).toHaveLength(1);
        const removal =
          "update reader_profiles set state='REMOVED',visibility='PRIVATE',display_name=null,biography=null where user_id=$1 returning user_id";
        const insertion =
          "insert into reader_profile_interests(user_id,slot,genre_slug) values($1,1,$2) returning user_id";
        if (removalFirst) {
          expect(await winner.unsafe(removal, [owner])).toHaveLength(1);
        } else {
          expect(await winner.unsafe(insertion, [owner, genre])).toHaveLength(
            1,
          );
        }
        // Attach both handlers immediately: no rejected background query can escape.
        pending = waiter
          .unsafe(
            removalFirst ? insertion : removal,
            removalFirst ? [owner, genre] : [owner],
          )
          .then(
            (rows) => ({ ok: true as const, count: rows.length }),
            (error) => ({
              ok: false as const,
              code: (error as { code?: string }).code,
            }),
          );
        // Same bounded real-lock observer pattern as metadata-concurrency: never
        // sleep for assumed scheduling, retry a mutation, or change SQL deadlines.
        const deadline = Date.now() + 4500;
        let observed = false;
        do {
          const dependencies = await sql`select pid from pg_stat_activity
          where datname=current_database() and pid=${waiterPid}::integer
          and wait_event_type='Lock'
          and ${winnerPid}::integer=any(pg_blocking_pids(pid))`;
          if (dependencies.length === 1) {
            observed = true;
            break;
          }
        } while (Date.now() < deadline);
        expect(observed).toBe(true);
        await winner.unsafe("COMMIT");
        winnerOpen = false;
        const outcome = await pending;
        if (removalFirst) {
          expect(outcome).toEqual({ ok: false, code: "23514" });
          await waiter.unsafe("ROLLBACK");
          waiterOpen = false;
        } else {
          expect(outcome).toEqual({ ok: true, count: 1 });
          await waiter.unsafe("COMMIT");
          waiterOpen = false;
        }
        expect(
          await sql`select state,visibility,display_name,biography from reader_profiles where user_id=${owner}`,
        ).toEqual([
          {
            state: "REMOVED",
            visibility: "PRIVATE",
            display_name: null,
            biography: null,
          },
        ]);
        expect(
          await sql`select slot from reader_profile_interests where user_id=${owner}`,
        ).toHaveLength(0);
      } finally {
        // Release the blocker before draining the query, then roll back any waiter
        // transaction (including the aborted 23514 case) before releasing its pool slot.
        try {
          if (winnerOpen && winner) await winner.unsafe("ROLLBACK");
        } finally {
          try {
            if (pending) await pending;
            if (waiterOpen && waiter) await waiter.unsafe("ROLLBACK");
          } finally {
            winner?.release();
            waiter?.release();
            requireTestDatabase();
            try {
              await sql`delete from users where id=${owner}`;
            } finally {
              await sql`delete from genres where slug=${genre}`;
            }
          }
        }
      }
    },
  );

  it("allows exactly one concurrent account to claim a handle using the native pool", async () => {
    requireTestDatabase();
    const ids = [opaque(), opaque()],
      claim = handle();
    try {
      for (const id of ids) await user(sql, id);
      const outcomes = await Promise.all(
        ids.map(async (id) => {
          try {
            await profile(sql, id, claim);
            return "created";
          } catch (error) {
            return (error as { code?: string }).code ?? "unexpected";
          }
        }),
      );
      expect(outcomes.sort()).toEqual(["23505", "created"]);
      expect(
        await sql`select user_id from reader_profiles where handle=${claim} and user_id=any(${ids}::text[])`,
      ).toHaveLength(1);
    } finally {
      requireTestDatabase();
      await sql`delete from users where id=any(${ids}::text[])`;
    }
  });
});
