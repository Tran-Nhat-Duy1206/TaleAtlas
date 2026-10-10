import { describe, expect, it } from "vitest";
import {
  requestReviewSchema,
  requestReviewRecordSchema,
} from "../../apps/web/src/features/ingestion/moderation";
const id = "11111111-1111-4111-8111-111111111111";
const work = {
  primaryTitle: "Manually verified title",
  format: "NOVEL",
  visibility: "PUBLISHED",
  publicationReviewAcknowledged: true,
  releaseStatus: "UNKNOWN",
  source: { label: "Human citation", citation: "Verified manually" },
};
const approve = {
  action: "APPROVE",
  revision: 3,
  inputRevision: 1,
  candidateId: id,
  reason: "Checked identity and publication",
  identityReviewAcknowledged: true,
  publicationReviewAcknowledged: true,
  work,
};
describe("pure explicit candidate moderation contracts", () => {
  it("requires a supplied V1 published Work and both explicit review acknowledgments", () => {
    expect(requestReviewSchema.parse(approve).action).toBe("APPROVE");
    for (const patch of [
      { identityReviewAcknowledged: false },
      { publicationReviewAcknowledged: false },
      { candidateId: undefined },
      { inputRevision: undefined },
      { work: undefined },
      { work: { ...work, visibility: "DRAFT" } },
      { work: { ...work, publicationReviewAcknowledged: false } },
      { work: { ...work, cover: { rights: "LICENSED" } } },
    ])
      expect(
        requestReviewSchema.safeParse({ ...approve, ...patch }).success,
      ).toBe(false);
  });
  it("has strict disjoint action fields and never accepts candidate payloads or role claims", () => {
    const link = {
      action: "LINK",
      revision: 3,
      inputRevision: 1,
      candidateId: id,
      reason: "Verified exact target",
      identityReviewAcknowledged: true,
      workId: id,
      workRevision: 1,
    };
    expect(requestReviewSchema.safeParse(link).success).toBe(true);
    for (const patch of [
      { work: work },
      { workRevision: 0 },
      { workId: "bad" },
      { candidate: {} },
      { actorRole: "admin" },
    ])
      expect(requestReviewSchema.safeParse({ ...link, ...patch }).success).toBe(
        false,
      );
    expect(
      requestReviewSchema.safeParse({ ...approve, ownerUserId: id }).success,
    ).toBe(false);
  });
  it("allows reasoned negative decisions without fresh candidates but rejects empty reasons and unknown keys", () => {
    for (const action of ["REJECT", "NEEDS_INFO"]) {
      expect(
        requestReviewSchema.safeParse({
          action,
          revision: 1,
          reason: "Need evidence",
        }).success,
      ).toBe(true);
      expect(
        requestReviewSchema.safeParse({
          action,
          revision: 1,
          reason: "Need evidence",
          candidateId: id,
        }).success,
      ).toBe(true);
      expect(
        requestReviewSchema.safeParse({ action, revision: 1, reason: " " })
          .success,
      ).toBe(false);
      expect(
        requestReviewSchema.safeParse({
          action,
          revision: 1,
          reason: "No",
          inputRevision: 1,
        }).success,
      ).toBe(false);
    }
  });
  it("bounds audit input and enforces minimal resulting-work invariants", () => {
    expect(
      requestReviewSchema.safeParse({ ...approve, reason: "x".repeat(2001) })
        .success,
    ).toBe(false);
    expect(
      requestReviewSchema.safeParse({
        ...approve,
        work: {
          ...work,
          descriptions: [
            { language: "en", text: "漢".repeat(20000) },
            { language: "vi", text: "a".repeat(20000) },
          ],
        },
      }).success,
    ).toBe(false);
    const record = {
      id,
      state: "APPROVED",
      revision: 4,
      inputRevision: 1,
      resultingWorkId: id,
    };
    expect(requestReviewRecordSchema.safeParse(record).success).toBe(true);
    expect(
      requestReviewRecordSchema.safeParse({ ...record, resultingWorkId: null })
        .success,
    ).toBe(false);
    expect(
      requestReviewRecordSchema.safeParse({
        ...record,
        ownerEmail: "private@example.invalid",
      }).success,
    ).toBe(false);
  });
});
