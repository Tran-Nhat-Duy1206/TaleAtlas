import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readingAuthFixture } from "../helpers/reading-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import { createWork } from "../../apps/web/src/server/catalog/service";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  createCommunityThread,
  createCommunityReply,
  reportCommunityContent,
  moderateCommunityContent,
  communityModerationContext,
} from "../../apps/web/src/server/community/service";

// Concrete mixed-load evidence, not a maximal combined-history/fan-out guarantee.
// Accounts use actual signup, SMTP verification and signed session cookies.
const f = readingAuthFixture();
const sql = f.client;
type Actor = Awaited<ReturnType<typeof f.account>>;
type Reader = Pick<typeof sql, "unsafe">;
let admin: Actor;
const workIds: string[] = [];
const ips = new Map<string, string>();
const h = (actor: Actor) => {
  if (!ips.has(actor.id))
    ips.set(
      actor.id,
      `127.41.${Math.floor(ips.size / 250)}.${(ips.size % 250) + 1}`,
    );
  return new Headers({
    Origin: f.origin,
    Cookie: actor.cookie,
    "x-real-ip": ips.get(actor.id)!,
  });
};
function owned(actor: Actor) {
  requireTestDatabase();
  expect(
    f.users.some((u) => u.id === actor.id && u.email === actor.email),
  ).toBe(true);
}
async function work() {
  requireTestDatabase();
  const row = (await createWork(
    {
      primaryTitle: `Mixed erasure synthetic ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      publicationReviewAcknowledged: true,
      releaseStatus: "UNKNOWN",
      source: {
        label: f.sourceLabel,
        citation: "UUID-owned synthetic mixed V3/V4 erasure fixture only.",
      },
    },
    h(admin),
  )) as AdminWork;
  workIds.push(row.id);
  return row;
}
const threadInput = (needle: string) => ({
  mutationKey: randomUUID(),
  title: `Invented ${needle}`,
  body: `Invented authored body ${needle}`,
  titleSpoiler: true,
  bodySpoiler: true,
  spoilerContext: `Invented ${needle}`,
  publicSubmissionAcknowledged: true,
});
async function thread(w: AdminWork, actor: Actor, needle = "public fixture") {
  owned(actor);
  return createCommunityThread(w.id, threadInput(needle), h(actor));
}
async function report(
  w: AdminWork,
  targetId: string,
  actor: Actor,
  explanation: string,
  revision = 1,
) {
  owned(actor);
  return reportCommunityContent(
    w.id,
    targetId,
    {
      mutationKey: randomUUID(),
      contentKind: "THREAD",
      expectedRevision: revision,
      reason: "OTHER",
      explanation,
    },
    h(actor),
  );
}
async function dismiss(
  w: AdminWork,
  targetId: string,
  actor: Actor,
  reportId: string,
  reason: string,
  revision = 1,
) {
  owned(actor);
  return moderateCommunityContent(
    w.id,
    targetId,
    {
      mutationKey: randomUUID(),
      action: "DISMISS",
      contentKind: "THREAD",
      expectedRevision: revision,
      reportId,
      expectedReportRevision: 1,
      reason,
    },
    h(actor),
  );
}
async function settings(backend: Reader) {
  const [row] = await backend.unsafe(`select pg_backend_pid() as pid,
    current_setting('statement_timeout') as statement_timeout,
    current_setting('plan_cache_mode') as plan_cache_mode,
    current_setting('enable_bitmapscan') as enable_bitmapscan,
    current_setting('enable_indexscan') as enable_indexscan,
    current_setting('enable_seqscan') as enable_seqscan,
    current_setting('jit') as jit`);
  if (!row) throw new Error("Pinned backend settings missing");
  return row;
}
async function counts(backend: Reader, actor: Actor) {
  owned(actor);
  const [row] = await backend.unsafe(
    `select
    (select count(*)::int from users where id=$1) as users,
    (select count(*)::int from accounts where user_id=$1) as accounts,
    (select count(*)::int from sessions where user_id=$1) as sessions,
    (select count(*)::int from library_entries where user_id=$1) as library_entries,
    (select count(*)::int from library_events where user_id=$1) as library_events,
    (select count(*)::int from reading_sessions where user_id=$1) as reading_sessions,
    (select count(*)::int from reading_progress_events where user_id=$1) as reading_progress_events,
    (select count(*)::int from community_contents where author_id=$1) as contents,
    (select count(*)::int from community_content_events where actor_id=$1) as events,
    (select count(*)::int from community_reports where reporter_id=$1) as reports,
    (select count(*)::int from community_moderation_actions where actor_id=$1) as actions,
    (select count(*)::int from community_mutation_receipts where actor_id=$1) as receipts`,
    [actor.id],
  );
  if (!row) throw new Error("Owned counts missing");
  return row;
}
async function fingerprints(backend: Reader, actors: Actor[]) {
  actors.forEach(owned);
  const ids = actors.map((a) => a.id);
  const result: Record<string, unknown> = {};
  // These tables must remain byte-equivalent for unrelated authors. Target quote
  // evidence is intentionally redacted and asserted separately, not excluded silently.
  const columns = {
    users: "id",
    accounts: "user_id",
    sessions: "user_id",
    library_entries: "user_id",
    library_events: "user_id",
    reading_sessions: "user_id",
    reading_progress_events: "user_id",
    community_contents: "author_id",
    community_content_events: "actor_id",
    community_mutation_receipts: "actor_id",
  } as const;
  for (const [table, column] of Object.entries(columns)) {
    const [value] = await backend.unsafe(
      `select count(*)::int as count,
      md5(string_agg(row_to_json(t)::text, '|' order by id)) as digest
      from public.${table} t where ${column}=any($1::text[])`,
      [ids],
    );
    result[table] = value;
  }
  return result;
}
async function bulkWorks(base: AdminWork, n: number) {
  requireTestDatabase();
  expect(workIds.includes(base.id)).toBe(true);
  const [source] =
    await sql`select w.source_id from works w join catalog_sources s on s.id=w.source_id where w.id=${base.id} and s.label=${f.sourceLabel}`;
  if (!source) throw new Error("Owned source missing");
  const ids: string[] = [];
  for (let start = 0; start < n; start += 500) {
    const size = Math.min(500, n - start);
    const rows =
      await sql`insert into works(id,slug,primary_title,primary_title_language,format,visibility,source_id,search_text)
      select id,'mixed-erasure-' || id::text,'Invented owned bulk Work','en','NOVEL',
      case when ${start} + seq <= 1998 then 'PUBLISHED'::work_visibility else 'DRAFT'::work_visibility end,
      ${source.source_id},'Invented owned bulk Work'
      from (select gen_random_uuid() as id,seq from generate_series(1,${size}) as g(seq)) x returning id`;
    const chunk = rows.map((r) => String(r.id));
    ids.push(...chunk);
    workIds.push(...chunk);
  }
  return ids;
}
async function seedPrivate(actor: Actor, ids: string[]) {
  owned(actor);
  expect(ids.length).toBe(20_000);
  const ownedWorkIds = new Set(workIds);
  expect(ids.every((id) => ownedWorkIds.has(id))).toBe(true);
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    await sql.begin(async (seed) => {
      const entries =
        await seed`insert into library_entries(user_id,work_id,notes,event_count)
        select ${actor.id},work_id,'PRIVATE_MIXED_ERASURE_NEEDLE',1 from unnest(${chunk}::uuid[]) w(work_id) returning id`;
      const entryIds = entries.map((r) => String(r.id));
      await seed`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot)
        select id,user_id,work_id,1,gen_random_uuid(),repeat('a',64),'ADD',
        jsonb_build_object('notes','PRIVATE_MIXED_ERASURE_NEEDLE') from library_entries
        where id=any(${entryIds}::uuid[]) and user_id=${actor.id}`;
    });
  }
}
async function seedReviews(actor: Actor, ids: string[]) {
  owned(actor);
  expect(ids.length).toBe(1998);
  const ownedWorkIds = new Set(workIds);
  expect(ids.every((id) => ownedWorkIds.has(id))).toBe(true);
  const result: string[] = [];
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    const committedIds = await sql.begin(async (seed) => {
      const rows =
        await seed`insert into community_contents(work_id,kind,author_id,body,body_spoiler,spoiler_context,rating_half_stars,event_count,edited_at)
        select work_id,'REVIEW',${actor.id},'PUBLIC_MIXED_ERASURE_NEEDLE synthetic review',true,'Synthetic public context',7,1,now()
        from unnest(${chunk}::uuid[]) w(work_id) returning id`;
      const contentIds = rows.map((r) => String(r.id));
      await seed`insert into community_content_events(content_id,work_id,target_kind,actor_id,content_revision,command,before_author_state,after_author_state,before_moderation_state,after_moderation_state)
        select id,work_id,kind,${actor.id},1,'CREATE_REVIEW','ACTIVE','ACTIVE','VISIBLE','VISIBLE'
        from community_contents where id=any(${contentIds}::uuid[]) and author_id=${actor.id}`;
      await seed`insert into community_mutation_receipts(content_id,work_id,target_kind,actor_id,mutation_key,request_hash,command,outcome,content_revision)
        select id,work_id,kind,${actor.id},gen_random_uuid(),repeat('b',64),'CREATE_REVIEW','APPLIED',1
        from community_contents where id=any(${contentIds}::uuid[]) and author_id=${actor.id}`;
      return contentIds;
    });
    result.push(...committedIds);
  }
  return result;
}
async function erased(backend: Reader, ids: string[]) {
  expect(ids.every((id) => typeof id === "string")).toBe(true);
  const [shape] = await backend.unsafe(
    `select count(*)::int as total,
    count(*) filter(where author_id is null and author_state='ERASED'
      and title='' and body='' and spoiler_context is null and rating_half_stars is null
      and not title_spoiler and not body_spoiler and created_at is null and updated_at is null
      and edited_at is null and last_activity_at is null)::int as completely_erased
    from community_contents where id=any($1::uuid[])`,
    [ids],
  );
  expect(shape).toEqual({ total: ids.length, completely_erased: ids.length });
}

beforeAll(async () => {
  requireTestDatabase();
  await f.start();
  process.env.V4_COMMUNITIES_ENABLED = "true";
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  for (const depth of [2, 1, 0])
    await sql`delete from community_contents where work_id=any(${workIds}::uuid[]) and kind='REPLY' and depth=${depth}`;
  await sql`delete from community_contents where work_id=any(${workIds}::uuid[])`;
  await sql`delete from library_entries where user_id=any(${f.users.map((u) => u.id)}::text[])`;
  // Frozen catalog audit/evidence policy stays intact; only this run's UUID rows are removed.
  for (const table of [
    "catalog_field_evidence",
    "catalog_audit_events",
    "work_creators",
    "work_titles",
    "work_descriptions",
    "work_genres",
    "work_covers",
    "work_identifiers",
    "editions",
  ])
    await sql`delete from ${sql(table)} where work_id=any(${workIds}::uuid[])`;
  await sql`delete from work_relations where from_work_id=any(${workIds}::uuid[]) or to_work_id=any(${workIds}::uuid[])`;
  for (let start = 0; start < workIds.length; start += 250)
    await sql`delete from works where id=any(${workIds.slice(start, start + 250)}::uuid[])`;
  await sql`delete from catalog_sources where label=${f.sourceLabel}`;
  for (const actor of f.users) {
    for (const bucket of ["post", "report", "safety", "read"])
      await sql`delete from rate_limits where key=${`community.${bucket}:${actor.id}`}`;
  }
  delete process.env.V4_COMMUNITIES_ENABLED;
  await f.stop();
});

describe("V4A concrete mixed account erasure under the frozen five-second SQL timeout", () => {
  it("warms six tiny RI deletions on one backend, rolls back then deletes 20k private plus 2k authored public rows without changing other owners or settings", async () => {
    const w = await work(),
      owner = await f.account("moderator"),
      other = await f.account("user"),
      mod = await f.account("moderator");
    const backend = await sql.reserve();
    const suffix = randomUUID().replaceAll("-", "");
    const deleteName = `mixed_delete_${suffix}`,
      witnessName = `mixed_witness_${suffix}`;
    let transaction = false;
    try {
      const baselineSettings = await settings(backend);
      expect(baselineSettings.statement_timeout).toBe("5s");
      expect(baselineSettings.plan_cache_mode).toBe("auto");
      for (let i = 0; i < 6; i++) {
        const tiny = await f.account("user");
        owned(tiny);
        await sql`insert into library_entries(user_id,work_id,event_count) values(${tiny.id},${w.id},1)`;
        await sql`insert into library_events(entry_id,user_id,work_id,entry_revision,mutation_key,request_hash,kind,snapshot)
          select id,user_id,work_id,1,gen_random_uuid(),repeat('c',64),'ADD','{}'::jsonb from library_entries where user_id=${tiny.id}`;
        const tinyThread = await thread(w, tiny, `tiny-${i}`);
        await backend.unsafe("BEGIN");
        transaction = true;
        await backend.unsafe("delete from users where id=$1 and email=$2", [
          tiny.id,
          tiny.email,
        ]);
        expect((await counts(backend, tiny)).library_events).toBe(0);
        await erased(backend, [tinyThread.content.id]);
        await backend.unsafe("ROLLBACK");
        transaction = false;
      }
      const root = await thread(w, owner, "PUBLIC_MIXED_ERASURE_NEEDLE");
      const parent = await createCommunityReply(
        w.id,
        {
          mutationKey: randomUUID(),
          body: "PUBLIC_MIXED_ERASURE_NEEDLE parent",
          bodySpoiler: true,
          spoilerContext: "Synthetic parent context",
          publicSubmissionAcknowledged: true,
          threadId: root.content.id,
          parentId: null,
          depth: 0,
        },
        h(owner),
      );
      const child = await createCommunityReply(
        w.id,
        {
          mutationKey: randomUUID(),
          body: "Unrelated author surviving nested reply",
          bodySpoiler: false,
          spoilerContext: null,
          publicSubmissionAcknowledged: true,
          threadId: root.content.id,
          parentId: parent.content.id,
          depth: 1,
        },
        h(other),
      );
      const unrelated = await thread(w, other, "independent other author");
      const quote = await report(
        w,
        root.content.id,
        other,
        "Quoted PUBLIC_MIXED_ERASURE_NEEDLE",
      );
      await dismiss(
        w,
        root.content.id,
        mod,
        quote.report!.id,
        "Quoted PUBLIC_MIXED_ERASURE_NEEDLE",
      );
      const ownReport = await report(
        w,
        unrelated.content.id,
        owner,
        "Deleted actor's own report",
      );
      await dismiss(
        w,
        unrelated.content.id,
        owner,
        ownReport.report!.id,
        "Deleted actor's own moderation narrative",
      );
      await communityModerationContext(w.id, root.content.id, h(owner));
      const budgetKeys = ["post", "report", "safety", "modread"].map(
        (bucket) => `community.${bucket}:${owner.id}`,
      );
      const beforeBudgets = [
        ...(await sql`select * from rate_limits where key=any(${budgetKeys}::text[]) order by key`),
      ];
      expect(beforeBudgets).toHaveLength(4);
      const preparationStarted = performance.now();
      const bulk = await bulkWorks(w, 19999);
      await seedPrivate(owner, [w.id, ...bulk]);
      const reviews = await seedReviews(owner, bulk.slice(0, 1998));
      console.info("Synthetic mixed erasure raw-fixture preparation", {
        elapsedMs: Math.round(performance.now() - preparationStarted),
        privateEntries: 20000,
        authoredPublicRows: 2000,
      });
      const authoredIds = [root.content.id, parent.content.id, ...reviews];
      expect(authoredIds).toHaveLength(2000);
      const beforeCounts = await counts(backend, owner);
      expect(beforeCounts).toMatchObject({
        users: 1,
        library_entries: 20000,
        library_events: 20000,
        contents: 2000,
        events: 2001,
        reports: 1,
        actions: 1,
        receipts: 2002,
      });
      const otherFacts = await fingerprints(backend, [other, mod]);
      const ownerFacts = await fingerprints(backend, [owner]);
      const beforeReport = [
        ...(await sql`select * from community_reports where id=${quote.report!.id}`),
      ];
      const beforeAction = [
        ...(await sql`select * from community_moderation_actions where content_id=${root.content.id}`),
      ];
      const beforeSkeleton = [
        ...(await sql`select id,work_id,kind,thread_id,thread_kind,parent_id,parent_kind,parent_depth,depth,revision,event_count,report_count,moderation_action_count,moderation_state from community_contents where id=any(${authoredIds}::uuid[]) order by id`),
      ];
      await backend.unsafe(
        `PREPARE ${deleteName}(text,text) AS DELETE FROM public.users WHERE id=$1 AND email=$2 RETURNING id`,
      );
      await backend.unsafe(`PREPARE ${witnessName} AS SELECT 37 AS value`);
      const definitions = () =>
        backend.unsafe(
          "select name,statement,parameter_types::text from pg_prepared_statements where name=any($1::text[]) order by name",
          [[deleteName, witnessName]],
        );
      const beforeDefinitions = [...(await definitions())];
      const [quoted] = await backend.unsafe(
        "select quote_literal($1::text) as id,quote_literal($2::text) as email",
        [owner.id, owner.email],
      );
      for (const commit of [false, true]) {
        await backend.unsafe("BEGIN");
        transaction = true;
        const started = performance.now();
        expect(
          await backend.unsafe(
            `EXECUTE ${deleteName}(${quoted.id},${quoted.email})`,
          ),
        ).toEqual([{ id: owner.id }]);
        const elapsedMs = performance.now() - started;
        expect(elapsedMs).toBeLessThan(5000);
        expect(await counts(backend, owner)).toEqual({
          users: 0,
          accounts: 0,
          sessions: 0,
          library_entries: 0,
          library_events: 0,
          reading_sessions: 0,
          reading_progress_events: 0,
          contents: 0,
          events: 0,
          reports: 0,
          actions: 0,
          receipts: 0,
        });
        await erased(backend, authoredIds);
        expect(
          await backend.unsafe(
            "select key from rate_limits where key=any($1::text[])",
            [budgetKeys],
          ),
        ).toHaveLength(0);
        expect(await fingerprints(backend, [other, mod])).toEqual(otherFacts);
        expect(
          await backend.unsafe(
            "select id,work_id,kind,thread_id,thread_kind,parent_id,parent_kind,parent_depth,depth,revision,event_count,report_count,moderation_action_count,moderation_state from community_contents where id=any($1::uuid[]) order by id",
            [authoredIds],
          ),
        ).toEqual(beforeSkeleton);
        expect(
          await backend.unsafe(
            "select explanation,evidence_redacted from community_reports where id=$1",
            [quote.report!.id],
          ),
        ).toEqual([{ explanation: "", evidence_redacted: true }]);
        expect(
          await backend.unsafe(
            "select reason,evidence_redacted from community_moderation_actions where content_id=$1",
            [root.content.id],
          ),
        ).toEqual([{ reason: "", evidence_redacted: true }]);
        expect(await settings(backend)).toEqual(baselineSettings);
        expect(await definitions()).toEqual(beforeDefinitions);
        expect(await backend.unsafe(`EXECUTE ${witnessName}`)).toEqual([
          { value: 37 },
        ]);
        await backend.unsafe(commit ? "COMMIT" : "ROLLBACK");
        transaction = false;
        console.info("Synthetic mixed erasure measurement", {
          committed: commit,
          privateEntries: 20000,
          privateEvents: 20000,
          authoredPublicRows: 2000,
          elapsedMs: Math.round(elapsedMs),
        });
        if (!commit) {
          expect(await counts(backend, owner)).toEqual(beforeCounts);
          expect(
            await backend.unsafe(
              "select * from rate_limits where key=any($1::text[]) order by key",
              [budgetKeys],
            ),
          ).toEqual(beforeBudgets);
          expect(await fingerprints(backend, [owner])).toEqual(ownerFacts);
          expect(await fingerprints(backend, [other, mod])).toEqual(otherFacts);
          expect(
            await sql`select * from community_reports where id=${quote.report!.id}`,
          ).toEqual(beforeReport);
          expect(
            await sql`select * from community_moderation_actions where content_id=${root.content.id}`,
          ).toEqual(beforeAction);
        }
        expect(await settings(backend)).toEqual(baselineSettings);
        expect(await definitions()).toEqual(beforeDefinitions);
      }
      expect(
        await sql`select body,parent_id,depth from community_contents where id=${child.content.id}`,
      ).toEqual([
        {
          body: "Unrelated author surviving nested reply",
          parent_id: parent.content.id,
          depth: 1,
        },
      ]);
    } finally {
      if (transaction) await backend.unsafe("ROLLBACK");
      const definitions = await backend.unsafe(
        "select name from pg_prepared_statements where name=any($1::text[])",
        [[deleteName, witnessName]],
      );
      for (const definition of definitions) {
        const name = String(definition.name);
        if (![deleteName, witnessName].includes(name))
          throw new Error("Unowned prepared definition");
        await backend.unsafe(`DEALLOCATE ${name}`);
      }
      backend.release();
    }
  });

  it("reporter deletion nulls only scoped report IDs, redacts another moderator's quote and preserves that live actor's receipt key namespace", async () => {
    const w = await work(),
      author = await f.account("user"),
      reporter = await f.account("user"),
      mod = await f.account("moderator");
    const target = await thread(w, author),
      reported = await report(
        w,
        target.content.id,
        reporter,
        "Synthetic reporter-owned quoted evidence",
      );
    const decision = await dismiss(
      w,
      target.content.id,
      mod,
      reported.report!.id,
      "Synthetic moderator quote of erased reporter evidence",
    );
    const [actionBefore] =
      await sql`select * from community_moderation_actions where content_id=${target.content.id}`;
    const [receiptBefore] =
      await sql`select * from community_mutation_receipts where actor_id=${mod.id} and content_id=${target.content.id}`;
    const [contentBefore] =
      await sql`select * from community_contents where id=${target.content.id}`;
    owned(reporter);
    expect(
      await sql`delete from users where id=${reporter.id} and email=${reporter.email} returning id`,
    ).toEqual([{ id: reporter.id }]);
    expect(
      await sql`select id from community_reports where id=${reported.report!.id}`,
    ).toHaveLength(0);
    expect(
      await sql`select * from community_contents where id=${target.content.id}`,
    ).toEqual([contentBefore]);
    const [actionAfter] =
      await sql`select * from community_moderation_actions where id=${actionBefore.id}`;
    expect(actionAfter).toEqual({
      ...actionBefore,
      report_id: null,
      reason: "",
      evidence_redacted: true,
    });
    const [receiptAfter] =
      await sql`select * from community_mutation_receipts where id=${receiptBefore.id}`;
    expect(receiptAfter).toEqual({ ...receiptBefore, report_id: null });
    expect(receiptAfter.content_revision).toBe(decision.content.revision);
    expect(
      await sql`select id from community_mutation_receipts where actor_id=${mod.id} and mutation_key=${receiptBefore.mutation_key}`,
    ).toHaveLength(1);
    await expect(sql`insert into community_mutation_receipts(content_id,work_id,target_kind,actor_id,mutation_key,request_hash,command,outcome,content_revision)
      values(${target.content.id},${w.id},'THREAD',${mod.id},${receiptBefore.mutation_key},repeat('d',64),'HIDE','NOOP',${decision.content.revision})`).rejects.toMatchObject(
      { code: "23505" },
    );
  });

  it("resolves a pending erased-target report without repopulating any reporter/moderator narrative", async () => {
    const w = await work(),
      author = await f.account("user"),
      reporter = await f.account("user"),
      mod = await f.account("moderator");
    const target = await thread(w, author, "PENDING_ERASURE_NEEDLE"),
      reported = await report(
        w,
        target.content.id,
        reporter,
        "Quoted PENDING_ERASURE_NEEDLE",
      );
    owned(author);
    await sql`delete from users where id=${author.id} and email=${author.email}`;
    await erased(sql, [target.content.id]);
    expect(
      await sql`select state,revision,explanation,evidence_redacted from community_reports where id=${reported.report!.id}`,
    ).toEqual([
      { state: "OPEN", revision: 1, explanation: "", evidence_redacted: true },
    ]);
    const decided = await dismiss(
      w,
      target.content.id,
      mod,
      reported.report!.id,
      "Attempted new PENDING_ERASURE_NEEDLE quote",
    );
    expect(decided.report).toMatchObject({ state: "DISMISSED", revision: 2 });
    await erased(sql, [target.content.id]);
    expect(
      await sql`select reason,evidence_redacted from community_moderation_actions where content_id=${target.content.id}`,
    ).toEqual([{ reason: "", evidence_redacted: true }]);
    expect(
      await sql`select explanation,evidence_redacted from community_reports where id=${reported.report!.id}`,
    ).toEqual([{ explanation: "", evidence_redacted: true }]);
    requireTestDatabase();
    await sql`update community_reports set explanation='Attempted direct quote',evidence_redacted=false where id=${reported.report!.id}`;
    await sql`update community_moderation_actions set reason='Attempted direct quote',evidence_redacted=false where content_id=${target.content.id}`;
    expect(
      await sql`select explanation,evidence_redacted from community_reports where id=${reported.report!.id}`,
    ).toEqual([{ explanation: "", evidence_redacted: true }]);
    expect(
      await sql`select reason,evidence_redacted from community_moderation_actions where content_id=${target.content.id}`,
    ).toEqual([{ reason: "", evidence_redacted: true }]);
    expect(
      await sql`select actor_id,content_revision from community_content_events where content_id=${target.content.id}`,
    ).toEqual([{ actor_id: mod.id, content_revision: 2 }]);
    expect(
      await sql`select actor_id,content_revision,report_revision from community_mutation_receipts where actor_id=${mod.id} and content_id=${target.content.id}`,
    ).toEqual([{ actor_id: mod.id, content_revision: 2, report_revision: 2 }]);
  });
});
