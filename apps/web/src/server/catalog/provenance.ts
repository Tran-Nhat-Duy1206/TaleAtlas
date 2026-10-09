import "server-only";
import { eq, sql } from "drizzle-orm";
import { catalogFieldEvidence } from "@taleatlas/database/catalog";
import { getDatabase } from "../database";

type Tx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type Row = Record<string, unknown>;
type Assertion = { value: string | number | null; sourceId: string };
export type FieldAssertions = Map<string, Assertion>;

// Consume one exact prior assertion, so duplicate aliases cannot reuse one UUID.
// Null and absent optional metadata have the same persisted meaning.
export function retainAssertion<T extends { sourceId: string }>(
  rows: T[],
  values: Row,
): T | undefined {
  const index = rows.findIndex((row) =>
    Object.entries(values).every(
      ([key, value]) => ((row as Row)[key] ?? null) === (value ?? null),
    ),
  );
  return index < 0 ? undefined : rows.splice(index, 1)[0];
}

export const workEvidenceFields = [
  "primaryTitle",
  "primaryTitleLanguage",
  "format",
  "releaseStatus",
  "originalLanguage",
  "country",
  "publicationYear",
  "publicationLabel",
] as const;
export const editionEvidenceFields = [
  "title",
  "language",
  "publisher",
  "format",
  "publicationYear",
  "publicationLabel",
  "isbn",
] as const;
export const coverEvidenceFields = [
  "assetPath",
  "rights",
  "credit",
  "rightsStatement",
  "licenseUrl",
] as const;

export function addFieldAssertions(
  result: FieldAssertions,
  prefix: string,
  row: Row,
  keys: readonly string[],
  sourceId: string,
) {
  if (prefix !== "work") result.set(`${prefix}.exists`, { value: 1, sourceId });
  for (const key of keys)
    result.set(`${prefix}.${key}`, {
      value: (row[key] ?? null) as Assertion["value"],
      sourceId,
    });
}

// Append only real scalar changes (including removals), never reattribute an
// unchanged value to an unrelated edit's source. All calls run in saveWork's
// revision-locked transaction alongside its audit event.
export async function recordFieldAssertions(
  tx: Tx,
  workId: string,
  revision: number,
  previous: FieldAssertions,
  next: FieldAssertions,
  editSourceId: string,
) {
  const rows = await tx
    .select()
    .from(catalogFieldEvidence)
    .where(eq(catalogFieldEvidence.workId, workId));
  const latest: FieldAssertions = new Map();
  rows.sort((a, b) => a.revision - b.revision);
  for (const row of rows)
    latest.set(row.fieldPath, {
      value: row.value,
      sourceId: row.sourceId,
    });
  // Legacy rows predate this feature. Preserve only their currently available
  // attribution; this cannot reconstruct provenance lost by earlier releases.
  const inserts = [];
  for (const [fieldPath, assertion] of previous) {
    if (!latest.has(fieldPath)) {
      inserts.push({ workId, fieldPath, revision: revision - 1, ...assertion });
      latest.set(fieldPath, assertion);
    }
  }
  const paths = new Set([...next.keys(), ...latest.keys()]);
  for (const fieldPath of paths) {
    const assertion = next.get(fieldPath) ?? {
      value: null,
      sourceId: editSourceId,
    };
    if (
      !latest.has(fieldPath) ||
      latest.get(fieldPath)!.value !== assertion.value
    ) {
      inserts.push({ workId, fieldPath, revision, ...assertion });
    }
  }
  if (inserts.length)
    await tx.insert(catalogFieldEvidence).values(
      inserts.map((row) => ({
        ...row,
        value: row.value === null ? sql`'null'::jsonb` : row.value,
      })),
    );
}
