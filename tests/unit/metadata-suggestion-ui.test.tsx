// @vitest-environment jsdom
// Rendered React units with mocked transport/navigation: NOT real-auth, SQL or browser acceptance.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MetadataSuggestionForm } from "../../apps/web/src/components/catalog/MetadataSuggestionForm";
import {
  MetadataSuggestionDetails,
  MetadataSuggestionReview,
} from "../../apps/web/src/components/catalog/MetadataSuggestionReview";
import {
  metadataCopy,
  metadataOperationTypes,
  currentMetadataValue,
  eligibleMetadataTitles,
} from "../../apps/web/src/components/catalog/metadata-suggestion-ui";
import { suggestionCopy } from "../../apps/web/src/components/catalog/suggestion-ui";
import {
  reviewMetadataProposalSchema,
  submitMetadataProposalSchema,
  type SubmitMetadataProposal,
} from "../../apps/web/src/features/catalog/metadata-operations";
import type {
  MetadataSuggestion,
  MetadataTarget,
} from "../../apps/web/src/features/catalog/metadata-suggestion-contracts";
import type { Locale } from "../../apps/web/src/lib/i18n";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const id = "10000000-0000-4000-8000-000000000001";
const workId = "10000000-0000-4000-8000-000000000002";
const submitKey = "10000000-0000-4000-8000-000000000003";
const canonicalId = "10000000-0000-4000-8000-000000000004";
const originalId = "10000000-0000-4000-8000-000000000005";
const aliasId = "10000000-0000-4000-8000-000000000006";
const secondAliasId = "10000000-0000-4000-8000-000000000007";
const target: MetadataTarget = {
  work: {
    id: workId,
    slug: "public-work",
    primaryTitle: "Canonical title",
    primaryTitleLanguage: "en",
    revision: 4,
    visibility: "PUBLISHED",
  },
  titles: [
    {
      id: canonicalId,
      workId,
      title: "Canonical title",
      language: "en",
      kind: "PRIMARY",
    },
    {
      id: originalId,
      workId,
      title: "Protected original",
      language: "ja",
      kind: "ORIGINAL",
    },
    {
      id: aliasId,
      workId,
      title: "Exact current alias",
      language: "en",
      kind: "ALIAS",
    },
    {
      id: secondAliasId,
      workId,
      title: "Second current alias",
      language: "vi",
      kind: "ALIAS",
    },
  ],
  descriptions: [
    { workId, language: "vi-VN", text: "Current Vietnamese summary" },
    { workId, language: "en", text: "Current English summary" },
  ],
  genreMemberships: [{ workId, slug: "fantasy" }],
  genreOptions: [
    { slug: "fantasy", nameEn: "Fantasy", nameVi: "Kỳ ảo" },
    { slug: "adventure", nameEn: "Adventure", nameVi: "Phiêu lưu" },
  ],
};
const proposal: SubmitMetadataProposal = {
  version: 1,
  workId,
  submitKey,
  baseWorkRevision: 4,
  citation: { label: "Source", citation: "Reference" },
  operation: {
    type: "TITLE_REPLACE",
    titleId: aliasId,
    title: "Corrected alias",
  },
};
const suggestion: MetadataSuggestion = {
  id,
  workId,
  baseWorkRevision: 4,
  revision: 1,
  state: "SUBMITTED",
  appliedWorkRevision: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
  contentState: "ACTIVE",
  proposal,
  reviewReason: null,
  reasonRedacted: false,
};
let transport: ReturnType<typeof vi.fn>;
const ok = (value: unknown) => ({
  ok: true,
  status: 200,
  json: async () => value,
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: "SECRET backend trace <script>unsafe</script>" }),
});
const copy = (locale: Locale = "en") => ({
  ...suggestionCopy[locale],
  ...metadataCopy[locale],
});
const body = (index = 0) => JSON.parse(transport.mock.calls[index][1].body);
function terminal(approve = false): MetadataSuggestion {
  return {
    ...suggestion,
    revision: 2,
    state: approve ? "APPROVED" : "REJECTED",
    appliedWorkRevision: approve ? 5 : null,
    reviewReason: "Reviewed carefully",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  transport = vi
    .fn()
    .mockImplementation(async (_url, init) =>
      ok({ ...suggestion, proposal: JSON.parse(init.body) }),
    );
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(submitKey) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function citation(locale: Locale = "en") {
  const t = copy(locale);
  change(t.label, " Source ");
  change(t.citation, " Reference ");
}
function selectOperation(
  type: SubmitMetadataProposal["operation"]["type"],
  locale: Locale = "en",
) {
  change(copy(locale).operation, type);
}
function fillOperation(
  type: SubmitMetadataProposal["operation"]["type"],
  locale: Locale = "en",
) {
  const t = copy(locale);
  selectOperation(type, locale);
  if (type === "TITLE_ADD" || type === "TITLE_REPLACE")
    change(t.title, " Corrected alias ");
  if (type === "TITLE_ADD") change(t.language, "fr");
  if (type === "DESCRIPTION_ADD" || type === "DESCRIPTION_REPLACE") {
    if (type === "DESCRIPTION_ADD") change(t.language, "fr");
    change(t.description, " Original summary ");
    change(t.statement, " I wrote this summary ");
    fireEvent.click(screen.getByRole("checkbox", { name: t.originality }));
  }
  if (type.includes("REMOVE")) change(t.removeReason, " Obsolete assertion ");
  citation(locale);
}
function submit(locale: Locale = "en") {
  fireEvent.submit(
    screen.getByRole("button", { name: copy(locale).submit }).closest("form")!,
  );
}
function decide(locale: Locale = "en", approve = false) {
  fireEvent.click(
    screen.getByRole("button", {
      name: approve ? copy(locale).approve : copy(locale).reject,
    }),
  );
}
function reason(locale: Locale = "en") {
  change(copy(locale).reason, " Reviewed carefully ");
}

const operationCases: [
  SubmitMetadataProposal["operation"]["type"],
  SubmitMetadataProposal["operation"],
][] = [
  [
    "TITLE_ADD",
    {
      type: "TITLE_ADD",
      value: { title: "Corrected alias", language: "fr", kind: "ALIAS" },
    },
  ],
  [
    "TITLE_REPLACE",
    { type: "TITLE_REPLACE", titleId: aliasId, title: "Corrected alias" },
  ],
  [
    "TITLE_REMOVE",
    { type: "TITLE_REMOVE", titleId: aliasId, reason: "Obsolete assertion" },
  ],
  [
    "DESCRIPTION_ADD",
    {
      type: "DESCRIPTION_ADD",
      language: "fr",
      text: "Original summary",
      rights: {
        basis: "ORIGINAL_SUMMARY",
        originalityAcknowledged: true,
        statement: "I wrote this summary",
      },
    },
  ],
  [
    "DESCRIPTION_REPLACE",
    {
      type: "DESCRIPTION_REPLACE",
      language: "vi-VN",
      text: "Original summary",
      rights: {
        basis: "ORIGINAL_SUMMARY",
        originalityAcknowledged: true,
        statement: "I wrote this summary",
      },
    },
  ],
  [
    "DESCRIPTION_REMOVE",
    {
      type: "DESCRIPTION_REMOVE",
      language: "vi-VN",
      reason: "Obsolete assertion",
    },
  ],
  ["GENRE_ADD_MEMBERSHIP", { type: "GENRE_ADD_MEMBERSHIP", slug: "adventure" }],
  [
    "GENRE_REMOVE_MEMBERSHIP",
    {
      type: "GENRE_REMOVE_MEMBERSHIP",
      slug: "fantasy",
      reason: "Obsolete assertion",
    },
  ],
];
describe.each(["en", "vi"] as const)(
  "metadata form rendered units / %s",
  (locale) => {
    it.each(operationCases)(
      "submits exact strict V5A %s envelope",
      async (type, operation) => {
        render(<MetadataSuggestionForm locale={locale} target={target} />);
        const t = copy(locale);
        expect(
          within(
            screen.getByRole("combobox", { name: t.operation }),
          ).getAllByRole("option"),
        ).toHaveLength(8);
        fillOperation(type, locale);
        submit(locale);
        await waitFor(() =>
          expect(navigation.replace).toHaveBeenCalledWith(
            `/${locale}/metadata-suggestions/${id}`,
          ),
        );
        expect(transport).toHaveBeenCalledTimes(1);
        expect(transport.mock.calls[0][0]).toBe(
          `/api/catalog/works/${workId}/metadata-suggestions`,
        );
        expect(transport.mock.calls[0][1].method).toBe("POST");
        expect(submitMetadataProposalSchema.parse(body())).toEqual({
          version: 1,
          workId,
          baseWorkRevision: 4,
          submitKey,
          citation: { label: "Source", citation: "Reference" },
          operation,
        });
        expect(body()).not.toHaveProperty("actorUserId");
      },
    );
    it("excludes canonical/ORIGINAL selectors and compares exact row UUIDs and language keys", () => {
      render(<MetadataSuggestionForm locale={locale} target={target} />);
      const t = copy(locale);
      selectOperation("TITLE_REPLACE", locale);
      const selector = screen.getByRole("combobox", { name: t.target });
      expect(
        within(selector)
          .getAllByRole("option")
          .map((o) => o.getAttribute("value")),
      ).toEqual([aliasId, secondAliasId]);
      expect(
        screen.getByRole("region", { name: t.currentValue }),
      ).toHaveTextContent("Exact current alias");
      change(t.target, secondAliasId);
      expect(
        screen.getByRole("region", { name: t.currentValue }),
      ).toHaveTextContent("Second current alias");
      selectOperation("DESCRIPTION_REPLACE", locale);
      expect(screen.getByRole("combobox", { name: t.language })).toHaveValue(
        "vi-VN",
      );
      expect(
        screen.getByRole("region", { name: t.currentValue }),
      ).toHaveTextContent("Current Vietnamese summary");
      change(t.language, "en");
      expect(
        screen.getByRole("region", { name: t.currentValue }),
      ).toHaveTextContent("Current English summary");
    });
    it("renders required field bounds and original-summary acknowledgments", () => {
      render(<MetadataSuggestionForm locale={locale} target={target} />);
      const t = copy(locale);
      expect(screen.getByLabelText(t.title)).toHaveAttribute(
        "maxlength",
        "500",
      );
      expect(screen.getByLabelText(t.language)).toHaveAttribute(
        "maxlength",
        "35",
      );
      expect(screen.getByLabelText(t.label)).toBeRequired();
      expect(screen.getByLabelText(t.label)).toHaveAttribute(
        "maxlength",
        "200",
      );
      expect(screen.getByLabelText(t.citation)).toHaveAttribute(
        "maxlength",
        "4000",
      );
      expect(screen.getByLabelText(t.url)).toHaveAttribute("maxlength", "2000");
      selectOperation("DESCRIPTION_ADD", locale);
      expect(screen.getByLabelText(t.description)).toHaveAttribute(
        "maxlength",
        "20000",
      );
      expect(screen.getByLabelText(t.statement)).toHaveAttribute(
        "maxlength",
        "2000",
      );
      expect(
        screen.getByRole("checkbox", { name: t.originality }),
      ).toBeRequired();
      expect(screen.getByText(t.rightsNote)).toBeInTheDocument();
      selectOperation("DESCRIPTION_REMOVE", locale);
      expect(
        screen.queryByRole("checkbox", { name: t.originality }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(t.removeReason)).toHaveAttribute(
        "maxlength",
        "2000",
      );
    });
  },
);
describe("metadata submission transport state", () => {
  it("keeps one UUID and identical canonical attempt after uncertain failure and blocks double clicks", async () => {
    let resolve!: (response: ReturnType<typeof ok>) => void;
    transport.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<MetadataSuggestionForm locale="en" target={target} />);
    fillOperation("TITLE_ADD");
    const form = screen
      .getByRole("button", { name: copy().submit })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(copy().title)).toBeDisabled();
    resolve(fail(503));
    await screen.findByRole("alert");
    submit();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(body(1)).toEqual(body(0));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy().newAttempt }));
    expect(screen.getByLabelText(copy().title)).not.toBeDisabled();
  });
  it("keeps identical attempt after rejected network promise", async () => {
    transport.mockRejectedValueOnce(new Error("SECRET token"));
    render(<MetadataSuggestionForm locale="en" target={target} />);
    fillOperation("TITLE_ADD");
    submit();
    await screen.findByRole("alert");
    submit();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(body(1)).toEqual(body());
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 409, 429, 503])(
    "handles opaque status %s without leakage or automatic retry",
    async (status) => {
      transport.mockResolvedValueOnce(fail(status));
      render(<MetadataSuggestionForm locale="vi" target={target} />);
      fillOperation("TITLE_ADD", "vi");
      submit("vi");
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent("SECRET");
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
      if (status === 409) {
        expect(alert).toHaveTextContent(copy("vi").stale);
        expect(
          screen.getByRole("button", { name: copy("vi").submit }),
        ).toBeDisabled();
        expect(
          screen.getByRole("button", { name: copy("vi").reload }),
        ).toBeInTheDocument();
        submit("vi");
        expect(transport).toHaveBeenCalledTimes(1);
      }
    },
  );
  it.each(["malformed", "work", "key", "operation", "base", "unknown"])(
    "denies mismatched successful response: %s",
    async (mismatch) => {
      transport.mockImplementationOnce(async (_url, init) => {
        const sent = JSON.parse(init.body);
        const reply = { ...suggestion, proposal: sent };
        if (mismatch === "malformed") return ok({});
        if (mismatch === "work")
          return ok({
            ...reply,
            workId: id,
            proposal: { ...sent, workId: id },
          });
        if (mismatch === "key")
          return ok({ ...reply, proposal: { ...sent, submitKey: id } });
        if (mismatch === "operation")
          return ok({
            ...reply,
            proposal: {
              ...sent,
              operation: {
                ...sent.operation,
                value: {
                  ...sent.operation.value,
                  title: "Different accepted text",
                },
              },
            },
          });
        if (mismatch === "base")
          return ok({
            ...reply,
            baseWorkRevision: 5,
            proposal: { ...sent, baseWorkRevision: 5 },
          });
        return ok({ ...reply, unexpected: true });
      });
      render(<MetadataSuggestionForm locale="en" target={target} />);
      fillOperation("TITLE_ADD");
      submit();
      await screen.findByRole("alert");
      expect(navigation.replace).not.toHaveBeenCalled();
    },
  );
  it.each(["citation", "originality", "statement"])(
    "blocks missing %s before network",
    (field) => {
      render(<MetadataSuggestionForm locale="en" target={target} />);
      fillOperation("DESCRIPTION_ADD");
      if (field === "originality")
        fireEvent.click(
          screen.getByRole("checkbox", { name: copy().originality }),
        );
      else
        change(field === "citation" ? copy().citation : copy().statement, "");
      submit();
      expect(transport).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(copy().invalid);
    },
  );
  it("disables unavailable removal without inventing targets", () => {
    render(
      <MetadataSuggestionForm
        locale="en"
        target={{
          ...target,
          titles: target.titles.slice(0, 2),
          descriptions: [],
          genreMemberships: [],
        }}
      />,
    );
    for (const type of [
      "TITLE_REMOVE",
      "DESCRIPTION_REMOVE",
      "GENRE_REMOVE_MEMBERSHIP",
    ] as const) {
      selectOperation(type);
      expect(
        screen.getByRole("button", { name: copy().submit }),
      ).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(copy().emptyTargets);
    }
    expect(transport).not.toHaveBeenCalled();
  });
});
describe.each(["en", "vi"] as const)("metadata review units / %s", (locale) => {
  it("requires three actual acknowledgments and a reason for whole-operation approval", async () => {
    transport.mockResolvedValue(ok(terminal(true)));
    render(
      <MetadataSuggestionReview
        locale={locale}
        suggestion={suggestion}
        current={target}
      />,
    );
    const t = copy(locale);
    expect(screen.getByText("Corrected alias")).toBeInTheDocument();
    expect(
      screen.getByText("Exact current alias · en · ALIAS"),
    ).toBeInTheDocument();
    expect(screen.getByText(aliasId)).toBeInTheDocument();
    expect(screen.getByLabelText(t.reason)).toBeRequired();
    expect(screen.getByLabelText(t.reason)).toHaveAttribute(
      "maxlength",
      "2000",
    );
    reason(locale);
    decide(locale, true);
    expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: t.metadataAck }));
    decide(locale, true);
    expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: t.publicationAck }));
    decide(locale, true);
    expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: t.rightsAck }));
    decide(locale, true);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(reviewMetadataProposalSchema.parse(body())).toEqual({
      version: 1,
      suggestionId: id,
      revision: 1,
      baseWorkRevision: 4,
      reason: "Reviewed carefully",
      decision: "APPROVE",
      metadataReviewAcknowledged: true,
      publicationReviewAcknowledged: true,
      rightsReviewAcknowledged: true,
    });
    expect(transport.mock.calls[0][0]).toBe(
      `/api/admin/metadata-suggestions/${id}/review`,
    );
    expect(screen.getByText(t.saved)).toBeInTheDocument();
  });
  it("rejects whole proposal without approval booleans or editable values", async () => {
    transport.mockResolvedValue(ok(terminal()));
    render(
      <MetadataSuggestionReview
        locale={locale}
        suggestion={suggestion}
        current={target}
      />,
    );
    reason(locale);
    decide(locale);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({
      version: 1,
      suggestionId: id,
      revision: 1,
      baseWorkRevision: 4,
      reason: "Reviewed carefully",
      decision: "REJECT",
    });
  });
});
describe("metadata review safety", () => {
  it.each(["operation", "submitKey"])(
    "freezes a successful review bound to different immutable proposal %s",
    async (mismatch) => {
      const changed =
        mismatch === "submitKey"
          ? { ...proposal, submitKey: aliasId }
          : {
              ...proposal,
              operation: {
                type: "TITLE_REPLACE" as const,
                titleId: secondAliasId,
                title: "Unreviewed different assertion",
              },
            };
      transport.mockResolvedValueOnce(ok({ ...terminal(), proposal: changed }));
      render(
        <MetadataSuggestionReview
          locale="en"
          suggestion={suggestion}
          current={target}
        />,
      );
      reason();
      decide();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy().reject }),
        ).toBeDisabled(),
      );
      expect(navigation.refresh).not.toHaveBeenCalled();
      expect(screen.queryByText(copy().saved)).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        copy().uncertainReview,
      );
      expect(
        screen.getByRole("button", { name: copy().reload }),
      ).toBeInTheDocument();
    },
  );
  it("requires a nonblank reason even when a native submit bypasses browser validity", () => {
    render(
      <MetadataSuggestionReview
        locale="en"
        suggestion={suggestion}
        current={target}
      />,
    );
    const button = screen.getByRole("button", { name: copy().reject });
    fireEvent(
      button.closest("form")!,
      new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: button,
      }),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(copy().invalid);
  });
  it.each(["stale", "unpublished", "missing", "protected"])(
    "disables approval but permits deliberate rejection: %s",
    async (mode) => {
      let current: MetadataTarget | null = target;
      if (mode === "stale")
        current = { ...target, work: { ...target.work, revision: 5 } };
      if (mode === "unpublished") current = null;
      if (mode === "missing")
        current = {
          ...target,
          titles: target.titles.filter((t) => t.id !== aliasId),
        };
      if (mode === "protected")
        current = {
          ...target,
          titles: target.titles.map((t) =>
            t.id === aliasId ? { ...t, kind: "ORIGINAL" as const } : t,
          ),
        };
      transport.mockResolvedValue(ok(terminal()));
      render(
        <MetadataSuggestionReview
          locale="en"
          suggestion={suggestion}
          current={current}
        />,
      );
      expect(
        screen.getByRole("button", { name: copy().approve }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: copy().reject }),
      ).not.toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(copy().conflict);
      reason();
      decide();
      await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    },
  );
  it.each([
    "network",
    "malformed",
    "id",
    "work",
    "base",
    "decision",
    "applied",
    409,
    503,
  ])(
    "freezes unknown/conflicting review outcome until reload: %s",
    async (mode) => {
      if (mode === "network")
        transport.mockRejectedValueOnce(new Error("SECRET"));
      else if (typeof mode === "number")
        transport.mockResolvedValueOnce(fail(mode));
      else {
        const reply = terminal();
        transport.mockResolvedValueOnce(
          ok(
            mode === "malformed"
              ? {}
              : mode === "id"
                ? { ...reply, id: aliasId }
                : mode === "work"
                  ? {
                      ...reply,
                      workId: aliasId,
                      proposal: { ...proposal, workId: aliasId },
                    }
                  : mode === "base"
                    ? {
                        ...reply,
                        baseWorkRevision: 5,
                        proposal: { ...proposal, baseWorkRevision: 5 },
                      }
                    : mode === "decision"
                      ? terminal(true)
                      : { ...reply, appliedWorkRevision: 5 },
          ),
        );
      }
      render(
        <MetadataSuggestionReview
          locale="en"
          suggestion={suggestion}
          current={target}
        />,
      );
      reason();
      decide();
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent("SECRET");
      expect(navigation.refresh).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: copy().approve }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: copy().reject }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: copy().reload }),
      ).toBeInTheDocument();
      decide();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each([401, 403, 404, 429])(
    "sanitizes known refusal %s without claiming saved",
    async (status) => {
      transport.mockResolvedValueOnce(fail(status));
      render(
        <MetadataSuggestionReview
          locale="vi"
          suggestion={suggestion}
          current={target}
        />,
      );
      reason("vi");
      decide("vi");
      expect(await screen.findByRole("alert")).not.toHaveTextContent("SECRET");
      expect(navigation.refresh).not.toHaveBeenCalled();
      expect(screen.queryByText(copy("vi").saved)).not.toBeInTheDocument();
    },
  );
  it("blocks double review while the whole decision is pending", async () => {
    let resolve!: (value: ReturnType<typeof ok>) => void;
    transport.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(
      <MetadataSuggestionReview
        locale="en"
        suggestion={suggestion}
        current={target}
      />,
    );
    reason();
    decide();
    decide();
    expect(transport).toHaveBeenCalledTimes(1);
    resolve(ok(terminal()));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
  });
  it.each(["en", "vi"] as const)(
    "never restores/reviews ERASED content in %s",
    (locale) => {
      render(
        <MetadataSuggestionReview
          locale={locale}
          suggestion={{
            ...suggestion,
            contentState: "ERASED",
            proposal: null,
            reasonRedacted: true,
          }}
          current={null}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(copy(locale).erased);
      expect(
        screen.queryByRole("button", { name: copy(locale).approve }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: copy(locale).reject }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Corrected alias")).not.toBeInTheDocument();
      expect(transport).not.toHaveBeenCalled();
    },
  );
});
describe("metadata details/copy pure rendering", () => {
  it("escapes proposal, citation, rights and reason as inert text", () => {
    const attack =
      '<img src=x onerror="window.PWNED=true"><script>unsafe()</script>';
    const rich: MetadataSuggestion = {
      ...terminal(),
      reviewReason: attack,
      proposal: {
        ...proposal,
        citation: {
          label: attack,
          citation: attack,
          url: "https://example.com/reference",
        },
        operation: {
          type: "DESCRIPTION_REPLACE",
          language: "en",
          text: attack,
          rights: {
            basis: "ORIGINAL_SUMMARY",
            originalityAcknowledged: true,
            statement: attack,
          },
        },
      },
    };
    const { container } = render(
      <MetadataSuggestionDetails
        locale="en"
        suggestion={rich}
        current={target}
      />,
    );
    expect(screen.getAllByText(attack)).toHaveLength(5);
    expect(container.querySelector("img,script")).toBeNull();
    const link = screen.getByRole("link", {
      name: "https://example.com/reference",
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("shows redaction without recreating an old review narrative", () => {
    render(
      <MetadataSuggestionDetails
        locale="vi"
        suggestion={{ ...terminal(), reviewReason: null, reasonRedacted: true }}
        current={null}
      />,
    );
    expect(screen.getByText(metadataCopy.vi.removedReason)).toBeInTheDocument();
    expect(screen.queryByText("Reviewed carefully")).not.toBeInTheDocument();
  });
  it("provides EN/VI operation parity and exact immutable selector lookup", () => {
    expect(metadataOperationTypes).toHaveLength(8);
    expect(Object.keys(metadataCopy.en.operations)).toEqual(
      Object.keys(metadataCopy.vi.operations),
    );
    expect(eligibleMetadataTitles(target).map((t) => t.id)).toEqual([
      aliasId,
      secondAliasId,
    ]);
    expect(currentMetadataValue(proposal.operation, target)).toBe(
      "Exact current alias · en · ALIAS",
    );
    expect(
      currentMetadataValue(
        { type: "DESCRIPTION_REMOVE", language: "vi-vn", reason: "obsolete" },
        target,
      ),
    ).toBeNull();
    expect(
      currentMetadataValue(
        {
          type: "GENRE_REMOVE_MEMBERSHIP",
          slug: "fantasy",
          reason: "obsolete",
        },
        target,
      ),
    ).toBe("fantasy");
    expect(currentMetadataValue(proposal.operation, null)).toBeNull();
  });
});

// Regression for explicit visible label spans: this checks the rendered HTML
// association model in jsdom, NOT Playwright's real-browser locator behavior.
// Native select locators and all browser deadlines/retries remain unchanged.
describe("metadata native-control exact visible label spans", () => {
  const variants = [
    ["operation", "TITLE_ADD", "SELECT"],
    ["target", "TITLE_REPLACE", "SELECT"],
    ["language", "DESCRIPTION_REPLACE", "SELECT"],
    ["kind", "TITLE_ADD", "SELECT"],
    ["genre", "GENRE_REMOVE_MEMBERSHIP", "SELECT"],
    ["language", "TITLE_ADD", "INPUT"],
    ["genre", "GENRE_ADD_MEMBERSHIP", "INPUT"],
  ] as const;
  for (const locale of ["en", "vi"] as const) {
    it.each(variants)(
      `${locale} gives %s in %s one exact visible span for its %s`,
      (field, operation, tagName) => {
        const t = copy(locale);
        const { container } = render(
          <MetadataSuggestionForm locale={locale} target={target} />,
        );
        selectOperation(operation, locale);
        const expectedLabel = t[field];
        expect(
          screen.getAllByLabelText(expectedLabel, { exact: true }),
        ).toHaveLength(1);
        const control = screen.getByLabelText(expectedLabel, { exact: true });
        expect(control.tagName).toBe(tagName);
        expect(control).toBeVisible();
        const references = (control.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .filter(Boolean);
        expect(references).toHaveLength(1);
        const label = document.getElementById(references[0]!);
        expect(label).not.toBeNull();
        expect(label!.tagName).toBe("SPAN");
        expect(label).toBeVisible();
        expect(label!.textContent).toBe(expectedLabel);
        expect(label!.querySelector("select, option")).toBeNull();
        expect(label!.contains(control)).toBe(false);
        expect(control).toHaveAccessibleName(expectedLabel);
        // Every currently rendered selector (and conditional text input) has a
        // distinct label ID: option text cannot enter another control's label.
        const controls = Array.from(
          container.querySelectorAll("select, input[aria-labelledby]"),
        );
        const labelIds = controls.map((element) => {
          if (element.tagName === "SELECT")
            expect(element).toHaveStyle({
              minWidth: "0",
              maxWidth: "100%",
              width: "100%",
            });
          const ids = (element.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .filter(Boolean);
          expect(ids).toHaveLength(1);
          expect(document.getElementById(ids[0]!)).toBeVisible();
          expect(container.querySelectorAll("span[id]").length).toBeGreaterThan(
            0,
          );
          expect(
            Array.from(container.querySelectorAll("span[id]")).filter(
              (span) => span.id === ids[0],
            ),
          ).toHaveLength(1);
          return ids[0]!;
        });
        expect(new Set(labelIds).size).toBe(controls.length);
        expect(transport).not.toHaveBeenCalled();
      },
    );
  }
});
