// @vitest-environment jsdom
// Rendered UI units with mocked transport/navigation; not browser or SQL acceptance.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { AdminWork } from "../../apps/web/src/features/catalog/contracts";
import {
  submitEditSuggestionSchema,
  reviewEditSuggestionSchema,
} from "../../apps/web/src/features/catalog/edit-suggestions";
import type { Locale } from "../../apps/web/src/lib/i18n";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { EditSuggestionForm } from "../../apps/web/src/components/catalog/EditSuggestionForm";
import { EditSuggestionReview } from "../../apps/web/src/components/catalog/EditSuggestionReview";
import {
  suggestionCopy,
  type SuggestionView,
} from "../../apps/web/src/components/catalog/suggestion-ui";
const id = "10000000-0000-4000-8000-000000000001";
const workId = "10000000-0000-4000-8000-000000000002";
const submitKey = "10000000-0000-4000-8000-000000000003";
const target = {
  id: workId,
  revision: 4,
  slug: "public-work",
  displayTitle: "Public work",
};
const suggestion: SuggestionView = {
  id,
  workId,
  revision: 1,
  baseWorkRevision: 4,
  state: "SUBMITTED",
  patch: { primaryTitle: "Correct title" },
  citation: { label: "Source", citation: "Reference" },
  reviewReason: null,
  appliedWorkRevision: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
};
// UI comparison fixture only, never shipped in a production component.
const current = {
  id: workId,
  revision: 4,
  visibility: "PUBLISHED",
  primaryTitle: "Current title",
  releaseStatus: "UNKNOWN",
} as AdminWork;
let transport: ReturnType<typeof vi.fn>;
const ok = (value: unknown = suggestion) => ({
  ok: true,
  status: 200,
  json: async () => value,
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ message: "SECRET raw backend failure" }),
});
beforeEach(() => {
  vi.clearAllMocks();
  transport = vi.fn().mockResolvedValue(ok());
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(submitKey) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function fill(locale: Locale = "en") {
  const t = suggestionCopy[locale];
  fireEvent.change(screen.getByLabelText(t.value), {
    target: { value: "Correct title" },
  });
  fireEvent.change(screen.getByLabelText(t.label), {
    target: { value: " Source " },
  });
  fireEvent.change(screen.getByLabelText(t.citation), {
    target: { value: " Reference " },
  });
}
function submit(locale: Locale = "en") {
  fireEvent.submit(
    screen
      .getByRole("button", { name: suggestionCopy[locale].submit })
      .closest("form")!,
  );
}
function review(locale: Locale = "en", approve = false) {
  const t = suggestionCopy[locale];
  fireEvent.change(screen.getByLabelText(t.reason), {
    target: { value: " Reviewed carefully " },
  });
  fireEvent.change(screen.getByRole("combobox", { name: t.review }), {
    target: { value: approve ? "APPROVE" : "REJECT" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: t.review }).closest("form")!,
  );
}
const body = (index = 0) => JSON.parse(transport.mock.calls[index][1].body);

describe("suggestion form / mocked transport", () => {
  it.each(["en", "vi"] as const)(
    "submits validated exact UUID/base with empty optional URL absent in %s",
    async (locale) => {
      render(<EditSuggestionForm locale={locale} target={target} />);
      const t = suggestionCopy[locale];
      expect(screen.getByLabelText(t.base)).toHaveValue("4");
      expect(screen.getByLabelText(t.base)).toHaveAttribute("readonly");
      fill(locale);
      submit(locale);
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          `/${locale}/edit-suggestions/${id}`,
        ),
      );
      expect(transport.mock.calls[0][0]).toBe(
        `/api/catalog/works/${workId}/suggestions`,
      );
      expect(transport.mock.calls[0][1].method).toBe("POST");
      expect(submitEditSuggestionSchema.parse(body())).toEqual({
        submitKey,
        baseWorkRevision: 4,
        patch: { primaryTitle: "Correct title" },
        citation: { label: "Source", citation: "Reference" },
      });
      expect(navigation.refresh).not.toHaveBeenCalled();
    },
  );
  it("keeps exact attempt/key on uncertain replay, allows explicit fresh attempt", async () => {
    transport.mockRejectedValueOnce(new Error("SECRET"));
    render(<EditSuggestionForm locale="en" target={target} />);
    fill();
    submit();
    await screen.findByRole("alert");
    expect(screen.getByLabelText(suggestionCopy.en.value)).toBeDisabled();
    expect(navigation.replace).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(body(1)).toEqual(body(0));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: suggestionCopy.en.newAttempt }),
    );
    expect(screen.getByLabelText(suggestionCopy.en.value)).not.toBeDisabled();
    expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
  });
  it.each([
    {},
    { ...suggestion, state: "APPROVED" },
    { ...suggestion, workId: id },
    { ...suggestion, baseWorkRevision: 5 },
    { ...suggestion, revision: 2 },
    { ...suggestion, unknown: true },
    { ...suggestion, id: "not-uuid" },
  ])(
    "never navigates for malformed/mismatched successful response %j",
    async (reply) => {
      transport.mockResolvedValueOnce(ok(reply));
      render(<EditSuggestionForm locale="en" target={target} />);
      fill();
      submit();
      await screen.findByRole("alert");
      expect(navigation.replace).not.toHaveBeenCalled();
    },
  );
  it.each([409, 404, 403, 500])(
    "sanitizes status %s and stale does not autoresubmit",
    async (status) => {
      transport.mockResolvedValueOnce(fail(status));
      render(<EditSuggestionForm locale="vi" target={target} />);
      fill("vi");
      submit("vi");
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent("SECRET");
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
      if (status === 409) {
        expect(alert).toHaveTextContent(suggestionCopy.vi.stale);
        expect(
          screen.getByRole("button", { name: suggestionCopy.vi.submit }),
        ).toBeDisabled();
        expect(
          screen.getByRole("button", { name: suggestionCopy.vi.reload }),
        ).toBeInTheDocument();
        submit("vi");
        expect(transport).toHaveBeenCalledTimes(1);
      }
    },
  );
  it("converts year to number and validates all scalar options", async () => {
    render(<EditSuggestionForm locale="en" target={target} />);
    fill();
    const t = suggestionCopy.en;
    fireEvent.change(screen.getByRole("combobox", { name: t.field }), {
      target: { value: "publicationYear" },
    });
    fireEvent.change(screen.getByLabelText(t.value), {
      target: { value: "2020" },
    });
    submit();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(body().patch).toEqual({ publicationYear: 2020 });
    expect(
      screen.getAllByRole("option").map((o) => o.getAttribute("value")),
    ).toContain("originalLanguage");
  });
  it.each([
    ["primaryTitle", "x".repeat(501)],
    ["primaryTitleLanguage", "English"],
    ["originalLanguage", "../"],
    ["publicationYear", "10000"],
    ["publicationLabel", "x".repeat(201)],
  ])("blocks invalid patch %s before network", (field, value) => {
    render(<EditSuggestionForm locale="en" target={target} />);
    fill();
    fireEvent.change(screen.getByLabelText(suggestionCopy.en.field), {
      target: { value: field },
    });
    fireEvent.change(screen.getByLabelText(suggestionCopy.en.value), {
      target: { value },
    });
    submit();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      suggestionCopy.en.invalid,
    );
  });
  it.each([
    ["label", "x".repeat(201)],
    ["citation", "x".repeat(4001)],
    ["url", "https://localhost/private"],
    ["url", "https://user:secret@example.com"],
  ] as const)("blocks invalid citation %s", (field, value) => {
    render(<EditSuggestionForm locale="en" target={target} />);
    fill();
    fireEvent.change(screen.getByLabelText(suggestionCopy.en[field]), {
      target: { value },
    });
    submit();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      suggestionCopy.en.invalid,
    );
  });
});

describe("admin comparison / mocked transport", () => {
  it.each(["en", "vi"] as const)(
    "requires actual dual booleans on approve, reject needs neither in %s",
    async (locale) => {
      const t = suggestionCopy[locale];
      transport.mockResolvedValue(
        ok({
          ...suggestion,
          revision: 2,
          state: "APPROVED",
          appliedWorkRevision: 5,
          reviewReason: "Reviewed carefully",
        }),
      );
      render(
        <EditSuggestionReview
          locale={locale}
          suggestion={suggestion}
          current={current}
        />,
      );
      expect(screen.getByText("Correct title")).toBeInTheDocument();
      expect(screen.getByText("Current title")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: t.metadataAck }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: t.publicationAck }),
      ).not.toBeChecked();
      review(locale, true);
      expect(transport).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("checkbox", { name: t.metadataAck }));
      review(locale, true);
      expect(transport).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("checkbox", { name: t.publicationAck }));
      review(locale, true);
      await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
      expect(reviewEditSuggestionSchema.parse(body())).toEqual({
        decision: "APPROVE",
        revision: 1,
        baseWorkRevision: 4,
        reason: "Reviewed carefully",
        metadataReviewAcknowledged: true,
        publicationReviewAcknowledged: true,
      });
      expect(transport.mock.calls[0][0]).toBe(
        `/api/admin/edit-suggestions/${id}/review`,
      );
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(screen.getByText(t.saved)).toBeInTheDocument();
    },
  );
  it("rejects with no acknowledgements and no metadata rewrite fields", async () => {
    transport.mockResolvedValueOnce(
      ok({
        ...suggestion,
        revision: 2,
        state: "REJECTED",
        reviewReason: "Reviewed carefully",
      }),
    );
    render(
      <EditSuggestionReview
        locale="en"
        suggestion={suggestion}
        current={current}
      />,
    );
    review();
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({
      decision: "REJECT",
      revision: 1,
      baseWorkRevision: 4,
      reason: "Reviewed carefully",
    });
  });
  it.each([
    {},
    {
      ...suggestion,
      revision: 2,
      state: "REJECTED",
      reviewReason: "Reviewed carefully",
      id: workId,
    },
    {
      ...suggestion,
      revision: 1,
      state: "REJECTED",
      reviewReason: "Reviewed carefully",
    },
    {
      ...suggestion,
      revision: 2,
      state: "REJECTED",
      reviewReason: "Reviewed carefully",
      appliedWorkRevision: 5,
    },
  ])(
    "no premature refresh or saved notice for bad review response",
    async (reply) => {
      transport.mockResolvedValueOnce(ok(reply));
      render(
        <EditSuggestionReview
          locale="en"
          suggestion={suggestion}
          current={current}
        />,
      );
      review();
      await screen.findByRole("alert");
      expect(navigation.refresh).not.toHaveBeenCalled();
      expect(
        screen.queryByText(suggestionCopy.en.saved),
      ).not.toBeInTheDocument();
    },
  );
  it("shows conflict comparison and disables approval without automerge", () => {
    render(
      <EditSuggestionReview
        locale="vi"
        suggestion={suggestion}
        current={{ ...current, revision: 5 }}
      />,
    );
    expect(
      screen.getByRole("option", { name: suggestionCopy.vi.approve }),
    ).toBeDisabled();
    expect(screen.getByText(suggestionCopy.vi.conflict)).toBeInTheDocument();
    expect(screen.getByText(suggestionCopy.vi.identity)).toBeInTheDocument();
  });
  it("review stale response blocks repeat and sanitizes errors", async () => {
    transport.mockResolvedValueOnce(fail(409));
    render(
      <EditSuggestionReview
        locale="en"
        suggestion={suggestion}
        current={current}
      />,
    );
    review();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      suggestionCopy.en.stale,
    );
    expect(
      screen.getByRole("button", { name: suggestionCopy.en.review }),
    ).toBeDisabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(
      screen.queryByText("SECRET raw backend failure"),
    ).not.toBeInTheDocument();
  });
});
