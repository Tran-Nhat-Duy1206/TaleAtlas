// @vitest-environment jsdom
// Rendered-component units with fetch/navigation stubs, not browser acceptance.
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
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { ...props, href }, children),
}));
import { NewRequestForm } from "../../apps/web/src/components/requests/NewRequestForm";
import { RequestActions } from "../../apps/web/src/components/requests/RequestActions";
import { RequestSummaryCard } from "../../apps/web/src/components/requests/RequestSummaryCard";
import {
  requestDictionary,
  requestStateLabel,
} from "../../apps/web/src/lib/request-i18n";
import {
  submitRequestSchema,
  updateRequestSchema,
} from "../../apps/web/src/features/ingestion/contracts";
import {
  supportRequestSchema,
  type RequestSummary,
} from "../../apps/web/src/features/ingestion/support";
import { WORK_REQUEST_STATES } from "../../packages/database/src/ingestion-types";
import type { Locale } from "../../apps/web/src/lib/i18n";
const id = "00000000-0000-4000-8000-000000000001";
const submitKey = "00000000-0000-4000-8000-000000000002";
const success = () => ({ ok: true, status: 200, json: async () => ({ id }) });
let fetchStub: ReturnType<typeof vi.fn>;
let uuid: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchStub = vi.fn().mockResolvedValue(success());
  uuid = vi.fn().mockReturnValue(submitKey);
  vi.stubGlobal("fetch", fetchStub);
  vi.stubGlobal("crypto", { randomUUID: uuid });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function submit(locale: Locale) {
  fireEvent.submit(
    screen
      .getByRole("button", { name: requestDictionary(locale).submit })
      .closest("form")!,
  );
}
function acknowledge(locale: Locale) {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: requestDictionary(locale).disclaimer,
    }),
  );
}
function body(call = 0): unknown {
  return JSON.parse(fetchStub.mock.calls[call][1].body);
}

describe("real request form rendering and payloads", () => {
  it.each(["en", "vi"] as const)(
    "preserves prefill, defaults UNKNOWN and requires actual disclaimer in %s",
    async (locale) => {
      const t = requestDictionary(locale);
      render(
        React.createElement(NewRequestForm, {
          locale,
          prefillTitle: "A user supplied story",
        }),
      );
      expect(screen.getByLabelText(t.title)).toHaveValue(
        "A user supplied story",
      );
      expect(screen.getByRole("combobox", { name: t.format })).toHaveValue(
        "UNKNOWN",
      );
      expect(
        screen.getByRole("checkbox", { name: t.disclaimer }),
      ).not.toBeChecked();
      submit(locale);
      expect(fetchStub).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(t.disclaimer);
      fireEvent.change(screen.getByLabelText(t.title), {
        target: { value: "  The current user input  " },
      });
      acknowledge(locale);
      submit(locale);
      await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
      const parsed = submitRequestSchema.parse(body());
      expect(parsed).toEqual({
        submitKey,
        details: {
          title: "The current user input",
          format: "UNKNOWN",
          alternativeTitles: [],
        },
      });
      expect(fetchStub.mock.calls[0][0]).toBe("/api/requests");
      expect(fetchStub.mock.calls[0][1].method).toBe("POST");
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(`/${locale}/requests/${id}`),
      );
      expect(mocks.replace).toHaveBeenCalledTimes(1);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
  it("keeps the same submission UUID after a failed transport and navigates only on successful retry", async () => {
    fetchStub.mockRejectedValueOnce(
      new Error("private driver details must not render"),
    );
    const t = requestDictionary("en");
    render(
      React.createElement(NewRequestForm, {
        locale: "en",
        prefillTitle: "Retry title",
      }),
    );
    acknowledge("en");
    submit("en");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(t.error),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/private driver/)).not.toBeInTheDocument();
    submit("en");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(submitRequestSchema.parse(body(0)).submitKey).toBe(
      submitRequestSchema.parse(body(1)).submitKey,
    );
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("omits whitespace-only bibliography while parsing real optional values and newline titles", async () => {
    const t = requestDictionary("en");
    render(
      React.createElement(NewRequestForm, {
        locale: "en",
        prefillTitle: "Bibliography",
      }),
    );
    fireEvent.change(screen.getByLabelText(t.alternativeTitles), {
      target: { value: " First alias\n\n Second alias " },
    });
    fireEvent.change(screen.getByLabelText(t.author), {
      target: { value: "  User supplied author  " },
    });
    fireEvent.change(screen.getByLabelText(t.publicationYear), {
      target: { value: "2024" },
    });
    for (const field of [
      "originalTitle",
      "sourceUrl",
      "originalLanguage",
      "publicationLanguage",
      "description",
      "additionalEvidence",
      "notes",
    ] as const) {
      fireEvent.change(screen.getByLabelText(t[field]), {
        target: { value: "   " },
      });
    }
    acknowledge("en");
    submit("en");
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(submitRequestSchema.parse(body()).details).toEqual({
      title: "Bibliography",
      format: "UNKNOWN",
      alternativeTitles: ["First alias", "Second alias"],
      author: "User supplied author",
      publicationYear: 2024,
    });
  });
  it.each(["en", "vi"] as const)(
    "rejects citation/language/year locally with localized errors in %s",
    (locale) => {
      const t = requestDictionary(locale);
      render(
        React.createElement(NewRequestForm, {
          locale,
          prefillTitle: "Valid title",
        }),
      );
      fireEvent.change(screen.getByLabelText(t.sourceUrl), {
        target: { value: "http://localhost/private" },
      });
      fireEvent.change(screen.getByLabelText(t.originalLanguage), {
        target: { value: "not a language code" },
      });
      fireEvent.change(screen.getByLabelText(t.publicationYear), {
        target: { value: "10000" },
      });
      acknowledge(locale);
      submit(locale);
      expect(fetchStub).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(t.invalid);
      expect(screen.getByLabelText(t.sourceUrl)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText(t.originalLanguage)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText(t.publicationYear)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(uuid).not.toHaveBeenCalled();
    },
  );
  it("enforces the byte cap rather than a character count", () => {
    const t = requestDictionary("vi");
    render(
      React.createElement(NewRequestForm, {
        locale: "vi",
        prefillTitle: "Tên hợp lệ",
      }),
    );
    // Each optional field fits its individual character limit; UTF-8 total exceeds 12 KB.
    fireEvent.change(screen.getByLabelText(t.description), {
      target: { value: "界".repeat(3000) },
    });
    fireEvent.change(screen.getByLabelText(t.additionalEvidence), {
      target: { value: "界".repeat(1500) },
    });
    acknowledge("vi");
    submit("vi");
    expect(fetchStub).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(t.size);
  });
  it("PATCHes the actual edited details and expected revision, not fabricated metadata", async () => {
    const t = requestDictionary("en");
    render(
      React.createElement(NewRequestForm, {
        locale: "en",
        requestId: id,
        revision: 7,
        initialDetails: {
          title: "Before",
          format: "NOVEL",
          alternativeTitles: [],
          notes: "Old note",
        },
      }),
    );
    fireEvent.change(screen.getByLabelText(t.title), {
      target: { value: "After" },
    });
    fireEvent.change(screen.getByLabelText(t.notes), { target: { value: "" } });
    acknowledge("en");
    fireEvent.submit(
      screen.getByRole("button", { name: t.save }).closest("form")!,
    );
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(fetchStub.mock.calls[0][0]).toBe(`/api/requests/${id}`);
    expect(fetchStub.mock.calls[0][1].method).toBe("PATCH");
    expect(updateRequestSchema.parse(body())).toEqual({
      revision: 7,
      details: { title: "After", format: "NOVEL", alternativeTitles: [] },
    });
  });
  it.each([
    [409, "conflict"],
    [401, "signIn"],
    [400, "invalid"],
    [413, "size"],
  ] as const)(
    "maps HTTP %s without rendering source/driver strings",
    async (status, key) => {
      fetchStub.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ message: "SECRET_DATABASE_DRIVER" }),
      });
      const t = requestDictionary("vi");
      render(
        React.createElement(NewRequestForm, {
          locale: "vi",
          prefillTitle: "Truyện",
        }),
      );
      acknowledge("vi");
      submit("vi");
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t[key]),
      );
      expect(
        screen.queryByText(/SECRET_DATABASE_DRIVER/),
      ).not.toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );
});

describe("explicit equivalence and safe followed summaries", () => {
  it.each(["en", "vi"] as const)(
    "never sends support before user acknowledgement in %s",
    async (locale) => {
      const t = requestDictionary(locale);
      render(React.createElement(RequestActions, { locale, id }));
      const checkbox = screen.getByRole("checkbox", { name: t.equivalence });
      const button = screen.getByRole("button", { name: t.follow });
      expect(checkbox).not.toBeChecked();
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(fetchStub).not.toHaveBeenCalled();
      fireEvent.click(checkbox);
      fireEvent.click(button);
      await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
      expect(supportRequestSchema.parse(body())).toEqual({
        equivalenceAcknowledged: true,
      });
      expect(fetchStub.mock.calls[0][0]).toBe(`/api/requests/${id}/support`);
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(`/${locale}/requests`),
      );
      expect(checkbox).not.toBeChecked();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );
  it("cancels with the owner's actual expected revision and one navigation", async () => {
    const t = requestDictionary("vi");
    render(
      React.createElement(RequestActions, {
        locale: "vi",
        id,
        revision: 9,
        cancel: true,
      }),
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(fetchStub.mock.calls[0][0]).toBe(`/api/requests/${id}/cancel`);
    expect(body()).toEqual({ revision: 9 });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("resets acknowledgement when the reviewed revision changes", () => {
    const request: RequestSummary = {
      id,
      title: "Reviewed title",
      format: "UNKNOWN",
      state: "NEEDS_REVIEW",
      revision: 1,
      supporterCount: 2,
      following: false,
      work: null,
    };
    const view = render(
      React.createElement(RequestSummaryCard, {
        locale: "en",
        request,
        actions: true,
      }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    view.rerender(
      React.createElement(RequestSummaryCard, {
        locale: "en",
        request: { ...request, revision: 2 },
        actions: true,
      }),
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it("renders only safe summary fields even if extra private properties are present", () => {
    const request = {
      id,
      title: "Reviewed summary",
      format: "NOVEL",
      state: "NEEDS_REVIEW",
      revision: 2,
      supporterCount: 3,
      following: true,
      work: { slug: "public-work" },
      details: { notes: "PRIVATE_NOTES" },
      events: [{ payload: { reason: "PRIVATE_EVENT" } }],
      ownerUserId: "PRIVATE_OWNER",
    } as RequestSummary;
    render(
      React.createElement(RequestSummaryCard, {
        locale: "vi",
        request,
        actions: true,
      }),
    );
    expect(screen.getByText("Reviewed summary")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: requestDictionary("vi").view }),
    ).toHaveAttribute("href", "/vi/works/public-work");
    expect(document.body.textContent).not.toMatch(
      /PRIVATE_NOTES|PRIVATE_EVENT|PRIVATE_OWNER|NEEDS_REVIEW/,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("shows withdrawn title/format as unknown after cancellation and permits safe unfollow only", async () => {
    const t = requestDictionary("en");
    const request: RequestSummary = {
      id,
      title: null,
      format: null,
      state: "CANCELLED",
      revision: 4,
      supporterCount: 1,
      following: true,
      work: null,
    };
    render(
      React.createElement(RequestSummaryCard, {
        locale: "en",
        request,
        actions: true,
      }),
    );
    expect(screen.getByRole("link", { name: t.unknown })).toBeInTheDocument();
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: t.view }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.unfollow }));
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(fetchStub.mock.calls[0][1].method).toBe("DELETE");
    expect(body()).toEqual({});
  });
  it("does not offer new support for cancelled summaries", () => {
    render(
      React.createElement(RequestSummaryCard, {
        locale: "en",
        request: {
          id,
          title: null,
          format: null,
          state: "CANCELLED",
          revision: 4,
          supporterCount: 0,
          following: false,
          work: null,
        },
        actions: true,
      }),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("request dictionary coverage", () => {
  it("maintains bilingual key parity and nonempty values", () => {
    const en = requestDictionary("en"),
      vi = requestDictionary("vi");
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const dictionary of [en, vi])
      for (const value of Object.values(dictionary))
        expect(value.trim().length).toBeGreaterThan(0);
  });
  it.each(["en", "vi"] as const)(
    "labels every state instead of exposing raw codes in %s",
    (locale) => {
      for (const state of WORK_REQUEST_STATES) {
        const label = requestStateLabel(state, locale);
        expect(label).not.toBe(state);
        expect(label).not.toBe(requestDictionary(locale).unknown);
      }
    },
  );
});
