import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { works } from "../../packages/database/src/catalog-schema";
import * as database from "../../apps/web/src/server/database";
import { adminInput } from "../../apps/web/src/components/catalog/admin-input";
import { normalizeTitle } from "../../apps/web/src/features/catalog/contracts";
import { catalogAuthFixture } from "../helpers/catalog-auth-fixture";
import { requireTestDatabase } from "../helpers/test-database";
import {
  createWork,
  updateWork,
  setVisibility,
} from "../../apps/web/src/server/catalog/service";
import {
  submitMetadataSuggestion,
  reviewMetadataSuggestion,
} from "../../apps/web/src/server/catalog/metadata-suggestions";
import { POST as review } from "../../apps/web/src/app/api/admin/metadata-suggestions/[id]/review/route";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import type { MetadataSuggestion } from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";

const f = catalogAuthFixture();
type Actor = Awaited<ReturnType<typeof f.account>>;
type Reserved = Awaited<ReturnType<typeof f.client.reserve>>;
type Tx = Parameters<
  Parameters<ReturnType<typeof database.getDatabase>["transaction"]>[0]
>[0];
let admin: Actor;
const workIds = new Set<string>();
const headers = (a: Actor) =>
  new Headers({ cookie: a.cookie, origin: f.origin });
const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
async function fixture() {
  const owner = await f.account("user");
  const w = (await createWork(
    {
      primaryTitle: `Concurrency ${randomUUID()}`,
      primaryTitleLanguage: "en",
      format: "NOVEL",
      visibility: "PUBLISHED",
      releaseStatus: "UNKNOWN",
      publicationReviewAcknowledged: true,
      source: {
        label: f.sourceLabel,
        citation: "Synthetic concurrency baseline",
      },
      titles: [{ title: "Untouched sibling", language: "vi", kind: "ALIAS" }],
      descriptions: [{ language: "en", text: "Untouched summary" }],
    },
    headers(admin),
  )) as AdminWork;
  workIds.add(w.id);
  const input = {
    version: 1,
    workId: w.id,
    baseWorkRevision: w.revision,
    submitKey: randomUUID(),
    operation: {
      type: "TITLE_ADD",
      value: {
        title: `Concurrent published ${randomUUID()}`,
        language: "fr",
        kind: "ALIAS",
      },
    },
    citation: {
      label: f.sourceLabel,
      citation: `Private concurrency ${f.runId}`,
    },
  };
  const s = await submitMetadataSuggestion(w.id, input, headers(owner));
  return { owner, w, input, s };
}
function decision(s: MetadataSuggestion) {
  return {
    version: 1,
    suggestionId: s.id,
    revision: s.revision,
    baseWorkRevision: s.baseWorkRevision,
    decision: "APPROVE",
    reason: `Private concurrency review ${f.runId}`,
    metadataReviewAcknowledged: true,
    publicationReviewAcknowledged: true,
    rightsReviewAcknowledged: true,
  };
}
function approve(s: MetadataSuggestion) {
  return review(
    new Request(`${f.origin}/api/admin/metadata-suggestions/${s.id}/review`, {
      method: "POST",
      headers: {
        cookie: admin.cookie,
        origin: f.origin,
        "content-type": "application/json",
      },
      body: JSON.stringify(decision(s)),
    }),
    { params: Promise.resolve({ id: s.id }) },
  );
}
async function snapshot(id: string) {
  return {
    work: [...(await f.client`select * from works where id=${id}`)],
    titles: [
      ...(await f.client`select * from work_titles where work_id=${id} order by id`),
    ],
    descriptions: [
      ...(await f.client`select * from work_descriptions where work_id=${id} order by language`),
    ],
    sources: [
      ...(await f.client`select * from catalog_sources where label=${f.sourceLabel} order by id`),
    ],
    audits: [
      ...(await f.client`select * from catalog_audit_events where work_id=${id} order by id`),
    ],
    evidence: [
      ...(await f.client`select * from catalog_metadata_evidence where work_id=${id} order by id`),
    ],
  };
}
/** Observe real lock dependencies, never retry a mutation or sleep for presumed ordering. */
async function blockedBy(
  observer: Reserved,
  blocker: number,
  expectedWaiter?: number,
) {
  const deadline = Date.now() + 4500;
  do {
    const rows =
      await observer`select pid from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and ${blocker}::integer = any(pg_blocking_pids(pid)) and (${expectedWaiter ?? null}::integer is null or pid=${expectedWaiter ?? null}::integer)`;
    if (rows.length === 1) return Number(rows[0].pid);
    if (rows.length > 1)
      throw new Error("Owned lock barrier unexpectedly has multiple waiters");
  } while (Date.now() < deadline);
  throw new Error(
    "Owned PostgreSQL lock dependency did not materialize within 4.5 seconds",
  );
}
async function publicationSnapshot(id: string) {
  return {
    ...(await snapshot(id)),
    proposals: [
      ...(await f.client`select * from metadata_edit_suggestions where work_id=${id} order by id`),
    ],
    events: [
      ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${id} order by e.suggestion_id,e.revision`),
    ],
    scalarEvidence: [
      ...(await f.client`select * from catalog_field_evidence where work_id=${id} order by id`),
    ],
    memberships: [
      ...(await f.client`select * from work_genres where work_id=${id} order by genre_slug`),
    ],
    editions: [
      ...(await f.client`select * from editions where work_id=${id} order by id`),
    ],
    credits: [
      ...(await f.client`select * from work_creators where work_id=${id} order by id`),
    ],
    covers: [
      ...(await f.client`select * from work_covers where work_id=${id}`),
    ],
    identifiers: [
      ...(await f.client`select * from work_identifiers where work_id=${id} order by id`),
    ],
    relations: [
      ...(await f.client`select * from work_relations where from_work_id=${id} or to_work_id=${id} order by from_work_id,to_work_id,type`),
    ],
  };
}
type PublicationSnapshot = Awaited<ReturnType<typeof publicationSnapshot>>;
function latch<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("SQL delivery gate exceeded 4.5 seconds")),
          4500,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Gate delivery, not execution: both mutations use their real transactions and SQL.
 * First owns Work; second is observed waiting on that backend. Pause second after
 * it acquires Work to capture the committed winner, then prove the loser writes
 * absolutely nothing (including timestamps, private headers/events and sources).
 */
async function orderedPublication<A, B>(
  id: string,
  first: () => Promise<A>,
  second: () => Promise<B>,
) {
  const db = database.getDatabase();
  const reached = [latch<number>(), latch<number>()];
  const release = [latch<void>(), latch<void>()];
  let deliveries = 0;
  const deliveredTransactions = new WeakSet<object>();
  const wrapBuilder = (
    builder: object,
    tx: Tx,
    work = false,
    locked = false,
  ): object =>
    new Proxy(builder, {
      get(object, key) {
        const member = Reflect.get(object, key, object);
        if (typeof member !== "function") return member;
        if (key === "then")
          return (
            resolve?: (rows: unknown) => unknown,
            reject?: (error: unknown) => unknown,
          ) =>
            Promise.resolve(
              Reflect.apply(member, object, [
                async (rows: unknown) => {
                  if (work && locked && !deliveredTransactions.has(tx)) {
                    deliveredTransactions.add(tx);
                    expect(rows).toEqual(
                      expect.arrayContaining([expect.objectContaining({ id })]),
                    );
                    const index = deliveries++;
                    if (index > 1)
                      throw new Error("Unexpected third Work lock delivery");
                    const pids = (await tx.execute(
                      "select pg_backend_pid() as pid",
                    )) as { pid: number }[];
                    reached[index].resolve(Number(pids[0].pid));
                    await bounded(release[index].promise);
                  }
                  return rows;
                },
              ]),
            ).then(resolve, reject);
        return (...args: unknown[]) => {
          const next = Reflect.apply(member, object, args);
          return next && typeof next === "object"
            ? wrapBuilder(
                next,
                tx,
                work || (key === "from" && args[0] === works),
                locked || (key === "for" && args[0] === "update"),
              )
            : next;
        };
      },
    });
  const gated = new Proxy(db, {
    get(object, key) {
      const member = Reflect.get(object, key, object);
      if (typeof member !== "function") return member;
      if (key === "transaction")
        return (callback: (tx: object) => unknown, config?: unknown) =>
          Reflect.apply(member, object, [
            (tx: Tx) =>
              callback(
                new Proxy(tx, {
                  get(target, method) {
                    const value = Reflect.get(target, method, target);
                    if (method === "select")
                      return (...args: unknown[]) =>
                        wrapBuilder(Reflect.apply(value, target, args), tx);
                    return typeof value === "function"
                      ? value.bind(target)
                      : value;
                  },
                }),
              ),
            config,
          ]);
      return member.bind(object);
    },
  });
  const observer = await f.client.reserve();
  const spy = vi.spyOn(database, "getDatabase").mockReturnValue(gated);
  let firstTask: ReturnType<typeof settle<A>> | undefined;
  let secondTask: ReturnType<typeof settle<B>> | undefined;
  try {
    firstTask = settle(first());
    const firstPid = await bounded(reached[0].promise);
    secondTask = settle(second());
    const secondPid = await blockedBy(observer, firstPid);
    const [waiting] =
      await observer`select query from pg_stat_activity where pid=${secondPid}`;
    expect(waiting.query).toMatch(/works/);
    expect(waiting.query).toMatch(/for update/i);
    release[0].resolve();
    const winner = await bounded(firstTask);
    expect(winner.ok).toBe(true);
    if (!winner.ok) throw winner.error;
    expect(await bounded(reached[1].promise)).toBe(secondPid);
    const committed = await publicationSnapshot(id);
    release[1].resolve();
    const loser = await bounded(secondTask);
    expect(loser.ok).toBe(false);
    if (loser.ok)
      throw new Error("Stale concurrent mutation unexpectedly committed");
    expect(await publicationSnapshot(id)).toEqual(committed);
    expect(deliveries).toBe(2);
    return { committed, winner: winner.value, error: loser.error };
  } finally {
    // No abandoned mutation, open gate, spy or reserved observer on assertion failure.
    release[0].resolve();
    release[1].resolve();
    try {
      await Promise.all([firstTask, secondTask]);
    } finally {
      spy.mockRestore();
      observer.release();
    }
  }
}
function unchangedCollections(
  before: PublicationSnapshot,
  after: PublicationSnapshot,
) {
  for (const key of [
    "descriptions",
    "memberships",
    "editions",
    "credits",
    "covers",
    "identifiers",
    "relations",
  ] as const)
    expect(after[key], key).toEqual(before[key]);
  for (const key of [
    "sources",
    "audits",
    "evidence",
    "scalarEvidence",
  ] as const)
    for (const row of before[key])
      expect(
        after[key].find((next) => next.id === row.id),
        key,
      ).toEqual(row);
}
function unchangedProposal(
  before: PublicationSnapshot,
  after: PublicationSnapshot,
  id: string,
) {
  expect(after.proposals.find((row) => row.id === id)).toEqual(
    before.proposals.find((row) => row.id === id),
  );
  expect(after.events.filter((row) => row.suggestion_id === id)).toEqual(
    before.events.filter((row) => row.suggestion_id === id),
  );
}
async function approvedTitle(
  before: PublicationSnapshot,
  after: PublicationSnapshot,
  s: MetadataSuggestion,
  reviewer: Actor,
  operation: "TITLE_ADD" | "TITLE_REMOVE" | "TITLE_REPLACE",
  title: string | null,
  targetId?: string,
) {
  const source = after.sources.filter(
    (row) => !before.sources.some((old) => old.id === row.id),
  );
  expect(source).toHaveLength(1);
  expect(source[0]).toEqual({
    id: expect.any(String),
    label: f.sourceLabel,
    citation: s.proposal!.citation.citation,
    url: null,
    consulted_at: null,
    created_at: expect.any(Date),
  });
  const sourceId = source[0].id;
  const searchTitles = before.titles
    .filter((row) => row.kind !== "PRIMARY")
    .filter((row) => !(operation === "TITLE_REMOVE" && row.id === targetId))
    .map((row) =>
      operation === "TITLE_REPLACE" && row.id === targetId ? title : row.title,
    );
  if (operation === "TITLE_ADD") searchTitles.push(title);
  const expectedSearch = normalizeTitle(
    [
      before.work[0].primary_title,
      ...searchTitles,
      ...before.descriptions.map((row) => row.text),
    ].join(" "),
  );
  const [search] =
    await f.client`select to_tsvector('simple'::regconfig, ${expectedSearch}) as vector`;
  expect(after.work[0]).toEqual({
    ...before.work[0],
    revision: before.work[0].revision + 1,
    source_id: sourceId,
    search_text: expectedSearch,
    search_vector: search.vector,
    updated_at: expect.any(Date),
  });
  expect(after.proposals).toEqual(
    before.proposals.map((row) =>
      row.id === s.id
        ? {
            ...row,
            state: "APPROVED",
            revision: 2,
            applied_work_revision: before.work[0].revision + 1,
            updated_at: expect.any(Date),
          }
        : row,
    ),
  );
  const events = after.events.filter((row) => row.suggestion_id === s.id);
  expect(events).toHaveLength(2);
  expect(events[0]).toEqual(
    before.events.find((row) => row.suggestion_id === s.id),
  );
  expect(events[1]).toEqual({
    id: expect.any(String),
    suggestion_id: s.id,
    revision: 2,
    from_state: "SUBMITTED",
    to_state: "APPROVED",
    actor_user_id: reviewer.id,
    review_reason: decision(s).reason,
    applied_work_revision: before.work[0].revision + 1,
    metadata_review_acknowledged: true,
    publication_review_acknowledged: true,
    rights_review_acknowledged: true,
    reason_redacted: false,
    created_at: expect.any(Date),
  });
  expect(after.events).toHaveLength(before.events.length + 1);
  const audits = after.audits.filter(
    (row) => !before.audits.some((old) => old.id === row.id),
  );
  expect(audits).toHaveLength(1);
  expect(audits[0]).toEqual({
    id: expect.any(String),
    work_id: s.workId,
    actor_user_id: reviewer.id,
    actor_id_snapshot: "metadata-review",
    operation: "UPDATE",
    previous_revision: before.work[0].revision,
    new_revision: before.work[0].revision + 1,
    changes: { sourceId },
    timestamp: expect.any(Date),
  });
  const evidence = after.evidence.filter(
    (row) => !before.evidence.some((old) => old.id === row.id),
  );
  expect(evidence).toHaveLength(1);
  const selected = targetId
    ? before.titles.find((row) => row.id === targetId)
    : undefined;
  const titleId =
    targetId ?? after.titles.find((row) => row.title === title)?.id;
  expect(titleId).toBeTruthy();
  expect(evidence[0]).toEqual({
    id: expect.any(String),
    suggestion_id: s.id,
    work_id: s.workId,
    work_revision: before.work[0].revision + 1,
    approval_event_id: events[1].id,
    audit_event_id: audits[0].id,
    operation_type: operation,
    title_id: titleId,
    title_language: selected?.language ?? "fr",
    title_kind: selected?.kind ?? "ALIAS",
    description_language: null,
    genre_slug: null,
    before_present: operation !== "TITLE_ADD",
    after_present: operation !== "TITLE_REMOVE",
    before_title: selected?.title ?? null,
    after_title: title,
    before_description: null,
    after_description: null,
    decision_source_id: sourceId,
    previous_source_id: selected?.source_id ?? null,
    resulting_source_id: operation === "TITLE_REMOVE" ? null : sourceId,
    rights_basis: null,
    originality_acknowledged: null,
    rights_review_acknowledged: null,
    created_at: expect.any(Date),
  });
  const expectedTitles = before.titles.filter((row) => row.id !== targetId);
  for (const row of expectedTitles)
    expect(after.titles.find((next) => next.id === row.id)).toEqual(row);
  expect(after.titles).toHaveLength(
    before.titles.length +
      (operation === "TITLE_ADD" ? 1 : operation === "TITLE_REMOVE" ? -1 : 0),
  );
  if (operation === "TITLE_REMOVE")
    expect(after.titles.find((row) => row.id === titleId)).toBeUndefined();
  else
    expect(after.titles.find((row) => row.id === titleId)).toEqual({
      ...(selected ?? {
        id: titleId,
        work_id: s.workId,
        language: "fr",
        kind: "ALIAS",
      }),
      title,
      normalized: normalizeTitle(title!),
      source_id: sourceId,
    });
  unchangedCollections(before, after);
  expect(after.scalarEvidence).toEqual(before.scalarEvidence);
}
async function erased(id: string) {
  const [row] =
    await f.client`select * from metadata_edit_suggestions where id=${id}`;
  expect(row.content_state).toBe("ERASED");
  expect(row.owner_user_id).toBeNull();
  expect(row.erased_at).toBeTruthy();
  for (const key of [
    "title_id",
    "title_text",
    "title_language",
    "title_kind",
    "description_language",
    "description_text",
    "genre_slug",
    "operation_reason",
    "citation_label",
    "citation_text",
    "citation_url",
    "citation_consulted_at",
    "rights_basis",
    "originality_acknowledged",
    "rights_statement",
    "submit_key",
    "input_hash",
  ])
    expect(row[key]).toBeNull();
  return row;
}
beforeAll(async () => {
  await f.start();
  admin = await f.account("admin");
});
afterAll(async () => {
  requireTestDatabase();
  try {
    for (const id of workIds)
      expect(
        await f.client`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${f.sourceLabel}) returning id`,
      ).toHaveLength(1);
  } finally {
    await f.stop();
  }
});
describe.sequential(
  "V5B real PostgreSQL publication/erasure lock ordering",
  () => {
    for (const first of ["CANONICAL_UPDATE", "APPROVAL"] as const) {
      it(`canonical Work update vs approval: ${first} owns Work first; stale loser leaves the committed winner byte-for-byte unchanged`, async () => {
        const { w, s, input } = await fixture();
        const reviewer = await f.account("admin");
        const writer = await f.account("admin");
        const before = await publicationSnapshot(w.id);
        const citation = `Canonical concurrent revision ${randomUUID()}`;
        const value = {
          ...adminInput(w),
          revision: w.revision,
          publicationReviewAcknowledged: true,
          releaseStatus: "COMPLETED",
          // The seed has no cover; do not materialize adminInput's UNKNOWN default.
          cover: undefined,
          titles: [
            ...adminInput(w).titles!,
            {
              title: "Canonical winner sibling",
              language: "de",
              kind: "ALIAS",
            },
          ],
          source: { label: f.sourceLabel, citation },
        };
        const write = () => updateWork(w.id, value, headers(writer));
        const publish = () =>
          reviewMetadataSuggestion(s.id, decision(s), headers(reviewer));
        const { committed: after, error } =
          first === "CANONICAL_UPDATE"
            ? await orderedPublication(w.id, write, publish)
            : await orderedPublication(w.id, publish, write);
        expect(error).toMatchObject({
          status: 409,
          code:
            first === "CANONICAL_UPDATE"
              ? "WORK_REVISION_CONFLICT"
              : "CONFLICT",
        });
        if (first === "APPROVAL") {
          await approvedTitle(
            before,
            after,
            s,
            reviewer,
            "TITLE_ADD",
            input.operation.value.title,
          );
          expect(after.work[0].release_status).toBe("UNKNOWN");
          expect(
            after.titles.some(
              (row) => row.title === "Canonical winner sibling",
            ),
          ).toBe(false);
          expect(after.sources.some((row) => row.citation === citation)).toBe(
            false,
          );
        } else {
          unchangedProposal(before, after, s.id);
          unchangedCollections(before, after);
          const expectedSearch = normalizeTitle(
            [
              w.primaryTitle,
              "Untouched sibling",
              "Canonical winner sibling",
              "Untouched summary",
            ].join(" "),
          );
          const [search] =
            await f.client`select to_tsvector('simple'::regconfig, ${expectedSearch}) as vector`;
          expect(after.work[0]).toEqual({
            ...before.work[0],
            revision: w.revision + 1,
            release_status: "COMPLETED",
            source_id: expect.any(String),
            search_text: expectedSearch,
            search_vector: search.vector,
            updated_at: expect.any(Date),
          });
          const sources = after.sources.filter(
            (row) => !before.sources.some((old) => old.id === row.id),
          );
          expect(sources).toHaveLength(1);
          expect(sources[0]).toMatchObject({
            id: after.work[0].source_id,
            label: f.sourceLabel,
            citation,
            url: null,
            consulted_at: null,
          });
          const added = after.titles.filter(
            (row) => !before.titles.some((old) => old.id === row.id),
          );
          expect(added).toHaveLength(1);
          expect(added[0]).toMatchObject({
            work_id: w.id,
            title: "Canonical winner sibling",
            normalized: normalizeTitle("Canonical winner sibling"),
            language: "de",
            kind: "ALIAS",
            source_id: sources[0].id,
          });
          for (const row of before.titles)
            expect(after.titles.find((next) => next.id === row.id)).toEqual(
              row,
            );
          expect(after.titles).toHaveLength(before.titles.length + 1);
          expect(after.work[0].search_text).toBe(
            normalizeTitle(
              [
                w.primaryTitle,
                "Untouched sibling",
                "Canonical winner sibling",
                "Untouched summary",
              ].join(" "),
            ),
          );
          expect(
            after.titles.some(
              (row) => row.title === input.operation.value.title,
            ),
          ).toBe(false);
          const audits = after.audits.filter(
            (row) => !before.audits.some((old) => old.id === row.id),
          );
          expect(audits).toHaveLength(1);
          expect(audits[0]).toMatchObject({
            actor_user_id: writer.id,
            actor_id_snapshot: writer.id,
            operation: "UPDATE",
            previous_revision: w.revision,
            new_revision: w.revision + 1,
          });
          expect(audits[0].changes).toEqual({
            primaryTitle: w.primaryTitle,
            primaryTitleLanguage: "en",
            format: "NOVEL",
            visibility: "PUBLISHED",
            releaseStatus: "COMPLETED",
            originalLanguage: null,
            country: null,
            publicationYear: null,
            publicationLabel: null,
            sourceId: sources[0].id,
            publicationReviewAcknowledged: true,
            titles: value.titles,
            descriptions: value.descriptions,
            editions: [],
            creators: [],
            genres: [],
            cover: null,
            identifiers: [],
            relations: [],
          });
          expect(after.evidence).toEqual(before.evidence);
          expect(after.proposals).toEqual(before.proposals);
          expect(after.events).toEqual(before.events);
          const scalar = after.scalarEvidence.filter(
            (row) => !before.scalarEvidence.some((old) => old.id === row.id),
          );
          expect(scalar).toHaveLength(1);
          expect(scalar[0]).toMatchObject({
            work_id: w.id,
            source_id: sources[0].id,
            revision: w.revision + 1,
            field_path: "work.releaseStatus",
            value: "COMPLETED",
          });
        }
      });
    }
    for (const first of ["UNPUBLISH", "APPROVAL"] as const) {
      it(`unpublish vs approval: ${first} owns Work first; no stale visibility or metadata overwrite`, async () => {
        const { w, s, input } = await fixture();
        const reviewer = await f.account("admin");
        const writer = await f.account("admin");
        const before = await publicationSnapshot(w.id);
        const hide = () =>
          setVisibility(
            w.id,
            { revision: w.revision, visibility: "HIDDEN" },
            headers(writer),
          );
        const publish = () =>
          reviewMetadataSuggestion(s.id, decision(s), headers(reviewer));
        const { committed: after, error } =
          first === "UNPUBLISH"
            ? await orderedPublication(w.id, hide, publish)
            : await orderedPublication(w.id, publish, hide);
        expect(error).toMatchObject({
          status: 409,
          code: first === "UNPUBLISH" ? "WORK_REVISION_CONFLICT" : "CONFLICT",
        });
        if (first === "APPROVAL") {
          await approvedTitle(
            before,
            after,
            s,
            reviewer,
            "TITLE_ADD",
            input.operation.value.title,
          );
          expect(after.work[0].visibility).toBe("PUBLISHED");
        } else {
          expect(after.work[0]).toEqual({
            ...before.work[0],
            visibility: "HIDDEN",
            revision: w.revision + 1,
            updated_at: expect.any(Date),
          });
          const audits = after.audits.filter(
            (row) => !before.audits.some((old) => old.id === row.id),
          );
          expect(audits).toHaveLength(1);
          expect(audits[0]).toMatchObject({
            work_id: w.id,
            actor_user_id: writer.id,
            actor_id_snapshot: writer.id,
            operation: "HIDE",
            previous_revision: w.revision,
            new_revision: w.revision + 1,
            changes: { visibility: "HIDDEN" },
          });
          expect(after).toEqual({
            ...before,
            work: after.work,
            audits: after.audits,
          });
          unchangedProposal(before, after, s.id);
        }
      });
    }
    for (const first of ["TITLE_REMOVE", "TITLE_REPLACE"] as const) {
      it(`distinct remove/replace proposals target the exact same title UUID: ${first} wins, the other remains privately SUBMITTED`, async () => {
        const { owner, w, input, s: unrelated } = await fixture();
        // Disjoint principals ensure the observed waiter is on Work, not the
        // shared proposer/reviewer row used by the existing two-approver test.
        const otherOwner = await f.account("user");
        const removeReviewer = await f.account("admin");
        const replaceReviewer = await f.account("admin");
        const [target] =
          await f.client`select * from work_titles where work_id=${w.id} and language='vi' and kind='ALIAS'`;
        expect(target).toMatchObject({
          work_id: w.id,
          title: "Untouched sibling",
          language: "vi",
          kind: "ALIAS",
        });
        const replacement = `Replacement exact fact ${randomUUID()}`;
        const remove = await submitMetadataSuggestion(
          w.id,
          {
            ...input,
            submitKey: randomUUID(),
            operation: {
              type: "TITLE_REMOVE",
              titleId: target.id,
              reason: "Synthetic explicitly removed alias",
            },
            citation: {
              label: f.sourceLabel,
              citation: `Remove exact fact ${randomUUID()}`,
            },
          },
          headers(owner),
        );
        const replace = await submitMetadataSuggestion(
          w.id,
          {
            ...input,
            submitKey: randomUUID(),
            operation: {
              type: "TITLE_REPLACE",
              titleId: target.id,
              title: replacement,
            },
            citation: {
              label: f.sourceLabel,
              citation: `Replace exact fact ${randomUUID()}`,
            },
          },
          headers(otherOwner),
        );
        expect(remove.id).not.toBe(replace.id);
        expect(remove).toMatchObject({
          baseWorkRevision: w.revision,
          revision: 1,
          state: "SUBMITTED",
          appliedWorkRevision: null,
        });
        expect(replace).toMatchObject({
          baseWorkRevision: w.revision,
          revision: 1,
          state: "SUBMITTED",
          appliedWorkRevision: null,
        });
        const before = await publicationSnapshot(w.id);
        const removeTask = () =>
          reviewMetadataSuggestion(
            remove.id,
            decision(remove),
            headers(removeReviewer),
          );
        const replaceTask = () =>
          reviewMetadataSuggestion(
            replace.id,
            decision(replace),
            headers(replaceReviewer),
          );
        const { committed: after, error } =
          first === "TITLE_REMOVE"
            ? await orderedPublication(w.id, removeTask, replaceTask)
            : await orderedPublication(w.id, replaceTask, removeTask);
        expect(error).toMatchObject({
          status: 409,
          code: "WORK_REVISION_CONFLICT",
        });
        const winner = first === "TITLE_REMOVE" ? remove : replace;
        const loser = first === "TITLE_REMOVE" ? replace : remove;
        await approvedTitle(
          before,
          after,
          winner,
          first === "TITLE_REMOVE" ? removeReviewer : replaceReviewer,
          first,
          first === "TITLE_REMOVE" ? null : replacement,
          target.id,
        );
        unchangedProposal(before, after, loser.id);
        unchangedProposal(before, after, unrelated.id);
        expect(
          after.evidence.some((row) => row.suggestion_id === loser.id),
        ).toBe(false);
        expect(
          after.sources.some(
            (row) => row.citation === loser.proposal!.citation.citation,
          ),
        ).toBe(false);
      });
    }
    it("APPROVE owns principals before Work wait; owner DELETE waits, then erases only private content after publication", async () => {
      const { owner, w, input, s } = await fixture();
      const before = await snapshot(w.id);
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let reviewTask: ReturnType<typeof settle<Response>> | undefined;
      let deleteTask: ReturnType<typeof settle<unknown>> | undefined;
      let holding = false;
      try {
        await a`begin`;
        holding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        await a`select id from works where id=${w.id} for update`;
        reviewTask = settle(approve(s));
        const bPid = await blockedBy(a, Number(aPid));
        deleteTask = settle(
          c`delete from users where id=${owner.id} and email=${owner.email}`.execute(),
        );
        await blockedBy(a, bPid, Number(cPid));
        await a`commit`;
        holding = false;
        const reviewed = await reviewTask;
        expect(reviewed.ok).toBe(true);
        if (!reviewed.ok) throw reviewed.error;
        expect(reviewed.value.status).toBe(200);
        const deleted = await deleteTask;
        expect(deleted.ok).toBe(true);
        if (!deleted.ok) throw deleted.error;
        const row = await erased(s.id);
        expect(row.state).toBe("APPROVED");
        expect(row.applied_work_revision).toBe(w.revision + 1);
        const after = await snapshot(w.id);
        expect(after.work[0].revision).toBe(w.revision + 1);
        expect(
          after.titles.filter((t) => t.title === input.operation.value.title),
        ).toHaveLength(1);
        for (const t of before.titles)
          expect(after.titles.find((r) => r.id === t.id)).toEqual(t);
        expect(after.descriptions).toEqual(before.descriptions);
        expect(after.sources.length).toBe(before.sources.length + 1);
        expect(after.audits.length).toBe(before.audits.length + 1);
        expect(after.evidence).toHaveLength(1);
        const events =
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`;
        expect(events).toHaveLength(2);
        expect(events[1].review_reason).toBeNull();
        expect(events[1].reason_redacted).toBe(true);
      } finally {
        // Releasing A always unblocks both real operations before connections/accounts close.
        try {
          if (holding) await a`rollback`;
        } finally {
          try {
            await Promise.all([reviewTask, deleteTask]);
          } finally {
            a.release();
            c.release();
          }
        }
      }
    });
    it("DELETE owns proposer before header wait; APPROVE waits on DELETE and fails closed after irreversible erasure", async () => {
      const { owner, w, s } = await fixture();
      const before = await snapshot(w.id);
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let reviewTask: ReturnType<typeof settle<Response>> | undefined;
      let deleteTask: ReturnType<typeof settle<unknown>> | undefined;
      let holding = false;
      try {
        await a`begin`;
        holding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        await a`select id from metadata_edit_suggestions where id=${s.id} for update`;
        deleteTask = settle(
          c`delete from users where id=${owner.id} and email=${owner.email}`.execute(),
        );
        await blockedBy(a, Number(aPid), Number(cPid));
        reviewTask = settle(approve(s));
        const bPid = await blockedBy(a, Number(cPid));
        expect(bPid).not.toBe(Number(aPid));
        await a`commit`;
        holding = false;
        const deleted = await deleteTask;
        expect(deleted.ok).toBe(true);
        if (!deleted.ok) throw deleted.error;
        const reviewed = await reviewTask;
        expect(reviewed.ok).toBe(true);
        if (!reviewed.ok) throw reviewed.error;
        expect([403, 409]).toContain(reviewed.value.status);
        const row = await erased(s.id);
        expect(row.state).toBe("SUBMITTED");
        expect(row.revision).toBe(1);
        expect(await snapshot(w.id)).toEqual(before);
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id}`,
        ).toHaveLength(1);
      } finally {
        try {
          if (holding) await a`rollback`;
        } finally {
          try {
            await Promise.all([reviewTask, deleteTask]);
          } finally {
            a.release();
            c.release();
          }
        }
      }
    });
    it("rejects an exact genre target deleted by operator curation after its MVCC display snapshot", async () => {
      requireTestDatabase();
      const { owner, w, input } = await fixture();
      const slug = `aaa-meta-race-${randomUUID()}`;
      const nameEn = `Owned operator curation ${f.runId}`;
      const nameVi = `Thể loại riêng ${f.runId}`;
      await f.client`insert into genres (slug, name_en, name_vi) values (${slug}, ${nameEn}, ${nameVi})`;
      const before = await snapshot(w.id);
      const proposals = [
        ...(await f.client`select * from metadata_edit_suggestions where work_id=${w.id} order by id`),
      ];
      const events = [
        ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${w.id} order by e.id`),
      ];
      const memberships = [
        ...(await f.client`select * from work_genres where work_id=${w.id} order by genre_slug`),
      ];
      const otherGenres = [
        ...(await f.client`select * from genres where slug<>${slug} order by slug`),
      ];
      const a = await f.client.reserve(),
        c = await f.client.reserve();
      let holding = false;
      let submitTask: ReturnType<typeof settle<MetadataSuggestion>> | undefined;
      try {
        await c`begin`;
        holding = true;
        const [{ pid: cPid }] = await c`select pg_backend_pid() as pid`;
        expect(
          await c`delete from genres where slug=${slug} and name_en=${nameEn} and name_vi=${nameVi} and not exists (select 1 from work_genres where genre_slug=${slug}) returning slug`,
        ).toHaveLength(1);
        // A sees the old version while C's controlled single-row deletion is uncommitted.
        expect(
          await a`select slug from genres where slug=${slug}`,
        ).toHaveLength(1);
        submitTask = settle(
          submitMetadataSuggestion(
            w.id,
            {
              ...input,
              submitKey: randomUUID(),
              operation: { type: "GENRE_ADD_MEMBERSHIP", slug },
            },
            headers(owner),
          ),
        );
        const bPid = await blockedBy(a, Number(cPid));
        const [waiting] =
          await a`select query from pg_stat_activity where pid=${bPid}`;
        expect(waiting.query).toMatch(/genres/);
        expect(waiting.query).toMatch(/for share/i);
        await c`commit`;
        holding = false;
        const attempted = await submitTask;
        expect(attempted.ok).toBe(false);
        if (attempted.ok)
          throw new Error(
            "Deleted genre unexpectedly produced a metadata proposal",
          );
        expect(attempted.error).toMatchObject({
          status: 409,
          code: "TARGET_MISSING",
        });
        expect(await snapshot(w.id)).toEqual(before);
        expect([
          ...(await f.client`select * from metadata_edit_suggestions where work_id=${w.id} order by id`),
        ]).toEqual(proposals);
        expect([
          ...(await f.client`select e.* from metadata_edit_events e join metadata_edit_suggestions s on s.id=e.suggestion_id where s.work_id=${w.id} order by e.id`),
        ]).toEqual(events);
        expect([
          ...(await f.client`select * from work_genres where work_id=${w.id} order by genre_slug`),
        ]).toEqual(memberships);
        expect(
          await f.client`select slug from genres where slug=${slug}`,
        ).toHaveLength(0);
        expect([
          ...(await f.client`select * from genres where slug<>${slug} order by slug`),
        ]).toEqual(otherGenres);
      } finally {
        try {
          if (holding) await c`rollback`;
        } finally {
          try {
            if (submitTask) await submitTask;
          } finally {
            a.release();
            c.release();
            // Only the generated, unreferenced operator-fixture definition is eligible.
            await f.client`delete from genres where slug=${slug} and name_en=${nameEn} and name_vi=${nameVi} and not exists (select 1 from work_genres where genre_slug=${slug})`;
          }
        }
      }
    });
    it("serializes simultaneous owner and reviewer erasure without a parent-event lock cycle", async () => {
      requireTestDatabase();
      const { owner, w, s } = await fixture();
      const reviewer = await f.account("admin");
      const approved = await review(
        new Request(
          `${f.origin}/api/admin/metadata-suggestions/${s.id}/review`,
          {
            method: "POST",
            headers: {
              cookie: reviewer.cookie,
              origin: f.origin,
              "content-type": "application/json",
            },
            body: JSON.stringify(decision(s)),
          },
        ),
        { params: Promise.resolve({ id: s.id }) },
      );
      expect(approved.status).toBe(200);
      const before = await snapshot(w.id);
      const expected = {
        ...before,
        audits: before.audits.map((row) =>
          row.actor_user_id === reviewer.id
            ? { ...row, actor_user_id: null }
            : row,
        ),
      };
      const a = await f.client.reserve(),
        b = await f.client.reserve();
      let aHolding = false,
        bHolding = false,
        reviewerDone = false;
      let ownerTask: ReturnType<typeof settle<unknown>> | undefined;
      let reviewerTask: ReturnType<typeof settle<unknown>> | undefined;
      try {
        await a`begin`;
        aHolding = true;
        const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
        const [{ pid: bPid }] = await b`select pg_backend_pid() as pid`;
        expect(
          await a`select id from users where id=${owner.id} and email=${owner.email} for update`,
        ).toHaveLength(1);
        expect(
          await a`select id from metadata_edit_suggestions where id=${s.id} for update`,
        ).toHaveLength(1);
        reviewerTask = settle(
          (async () => {
            await b`begin`;
            bHolding = true;
            try {
              const rows =
                await b`delete from users where id=${reviewer.id} and email=${reviewer.email} returning id`;
              await b`commit`;
              bHolding = false;
              return rows;
            } catch (error) {
              try {
                await b`rollback`;
              } finally {
                bHolding = false;
              }
              throw error;
            }
          })(),
        ).then((result) => {
          reviewerDone = true;
          return result;
        });
        // Old guard: B holds event E and waits on A's header. Correct privacy-only
        // guard: B may already finish, so requiring a parent wait would reject the fix.
        const deadline = Date.now() + 4500;
        let reached = false;
        do {
          const waiting =
            await a`select query from pg_stat_activity where pid=${bPid} and wait_event_type='Lock' and ${aPid}::integer=any(pg_blocking_pids(pid))`;
          if (waiting.length === 1) {
            expect(waiting[0].query).toMatch(/delete from users/i);
            reached = true;
            break;
          }
          if (reviewerDone) {
            reached = true;
            break;
          }
        } while (Date.now() < deadline);
        expect(
          reached,
          "Reviewer erasure must either reach the owned header lock or finish without that unnecessary lock within 4.5 seconds",
        ).toBe(true);
        ownerTask = settle(
          (async () => {
            try {
              const rows =
                await a`delete from users where id=${owner.id} and email=${owner.email} returning id`;
              await a`commit`;
              aHolding = false;
              return rows;
            } catch (error) {
              try {
                await a`rollback`;
              } finally {
                aHolding = false;
              }
              throw error;
            }
          })(),
        );
        const [deletedOwner, deletedReviewer] = await Promise.all([
          ownerTask,
          reviewerTask,
        ]);
        expect(
          {
            committed: deletedOwner.ok,
            sqlState: deletedOwner.ok ? null : deletedOwner.error?.code,
          },
          "Owner deletion must commit without a parent-event deadlock or timeout",
        ).toEqual({ committed: true, sqlState: null });
        expect(
          {
            committed: deletedReviewer.ok,
            sqlState: deletedReviewer.ok ? null : deletedReviewer.error?.code,
          },
          "Reviewer deletion must commit without a parent-event deadlock or timeout",
        ).toEqual({ committed: true, sqlState: null });
        if (!deletedOwner.ok) throw deletedOwner.error;
        if (!deletedReviewer.ok) throw deletedReviewer.error;
        expect(deletedOwner.value).toHaveLength(1);
        expect(deletedReviewer.value).toHaveLength(1);
        expect(
          await f.client`select id from users where id in (${owner.id},${reviewer.id})`,
        ).toHaveLength(0);
        const header = await erased(s.id);
        expect(header.state).toBe("APPROVED");
        expect(header.revision).toBe(2);
        expect(header.applied_work_revision).toBe(w.revision + 1);
        const events =
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id} order by revision`;
        expect(events).toHaveLength(2);
        for (const event of events) {
          expect(event.actor_user_id).toBeNull();
          expect(event.review_reason).toBeNull();
          expect(event.reason_redacted).toBe(true);
        }
        // Frozen V1 audit actor FK nulling is expected; every other factual value,
        // source/audit/evidence identity, and row count must remain unchanged.
        expect(await snapshot(w.id)).toEqual(expected);
      } finally {
        try {
          // Before launching ownerTask, A is the only manually held blocker.
          if (!ownerTask && aHolding) {
            await a`rollback`;
            aHolding = false;
          }
        } finally {
          try {
            await Promise.all([ownerTask, reviewerTask]);
          } finally {
            try {
              if (aHolding) await a`rollback`;
            } finally {
              try {
                if (bHolding) await b`rollback`;
              } finally {
                a.release();
                b.release();
              }
            }
          }
        }
      }
    });
    it("same-PK session-token rotation, expiry and verification revocation after preflight cannot authorize publication", async () => {
      for (const change of ["TOKEN", "EXPIRY", "VERIFIED"] as const) {
        const { w, s } = await fixture();
        const reviewer = await f.account("admin");
        const before = await snapshot(w.id);
        const [session] =
          await f.client`select id from sessions where user_id=${reviewer.id}`;
        expect(session).toBeTruthy();
        const attempt = await settle(
          reviewMetadataSuggestion(
            s.id,
            async () => {
              if (change === "TOKEN")
                await f.client`update sessions set token=${randomUUID()} where id=${session.id} and user_id=${reviewer.id}`;
              else if (change === "EXPIRY")
                await f.client`update sessions set expires_at=clock_timestamp()-interval '1 second' where id=${session.id} and user_id=${reviewer.id}`;
              else
                await f.client`update users set email_verified=false where id=${reviewer.id} and email=${reviewer.email}`;
              return decision(s);
            },
            headers(reviewer),
          ),
        );
        expect(attempt.ok).toBe(false);
        if (attempt.ok)
          throw new Error("Revoked principal unexpectedly published");
        expect(attempt.error).toMatchObject({
          status: change === "VERIFIED" ? 403 : 401,
        });
        expect(await snapshot(w.id)).toEqual(before);
        expect(
          (
            await f.client`select state from metadata_edit_suggestions where id=${s.id}`
          )[0].state,
        ).toBe("SUBMITTED");
        expect(
          await f.client`select * from metadata_edit_events where suggestion_id=${s.id}`,
        ).toHaveLength(1);
      }
    });
  },
);
