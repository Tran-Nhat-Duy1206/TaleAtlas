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
  within,
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
const optionalNames = [
  "alternativeTitles",
  "originalTitle",
  "author",
  "sourceUrl",
  "originalLanguage",
  "publicationLanguage",
  "publicationYear",
  "description",
  "additionalEvidence",
  "notes",
] as const;
function moreDetails(locale: Locale): HTMLDetailsElement {
  const summary = screen.getByText(requestDictionary(locale).moreDetails, {
    selector: "summary",
  });
  return summary.closest("details")!;
}
function toggleDetails(panel: HTMLDetailsElement, open: boolean) {
  // Explicit DOM events exercise React state, not native browser keyboard behavior.
  panel.open = open;
  fireEvent(panel, new Event("toggle"));
}
function openDetails(locale: Locale) {
  toggleDetails(moreDetails(locale), true);
}
function expectFieldError(field: HTMLElement, message: string) {
  expect(field).toHaveAttribute("aria-invalid", "true");
  const ids = (field.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  const descriptions = ids.map((descriptionId) => {
    const description = document.getElementById(descriptionId);
    expect(description).not.toBeNull();
    expect(description?.closest("label")).toBeNull();
    return description!;
  });
  const error = descriptions.find((description) =>
    description.textContent?.includes(message),
  );
  expect(error).toBeDefined();
  expect(error).toBeVisible();
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
    openDetails("en");
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
      openDetails(locale);
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
    openDetails("vi");
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
    [500, "error"],
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

describe("progressive native request details", () => {
  const initialCases = [
    { name: "empty", initialDetails: undefined, expanded: false },
    {
      name: "title and format only",
      initialDetails: {
        title: "Title only",
        format: "NOVEL" as const,
        alternativeTitles: [],
      },
      expanded: false,
    },
    {
      name: "whitespace optional values",
      initialDetails: {
        title: "Whitespace",
        format: "UNKNOWN" as const,
        alternativeTitles: [" ", "\t"],
        originalTitle: " ",
        author: "\t",
        sourceUrl: " ",
        originalLanguage: " ",
        publicationLanguage: " ",
        description: "\n",
        additionalEvidence: " ",
        notes: " ",
      },
      expanded: false,
    },
    {
      name: "alternative title prefill",
      initialDetails: {
        title: "Aliases",
        format: "UNKNOWN" as const,
        alternativeTitles: [" ", "Alias"],
      },
      expanded: true,
    },
    {
      name: "private notes prefill",
      initialDetails: {
        title: "Notes",
        format: "UNKNOWN" as const,
        alternativeTitles: [],
        notes: "Saved note",
      },
      expanded: true,
    },
    {
      name: "numeric year prefill",
      initialDetails: {
        title: "Year",
        format: "UNKNOWN" as const,
        alternativeTitles: [],
        publicationYear: 2024,
      },
      expanded: true,
    },
  ];
  describe.each(["en", "vi"] as const)("%s", (locale) => {
    describe.each(["create", "edit"] as const)("%s", (mode) => {
      it.each(initialCases)(
        "initializes $name without hiding the basic controls",
        ({ initialDetails, expanded }) => {
          const t = requestDictionary(locale);
          render(
            React.createElement(NewRequestForm, {
              locale,
              initialDetails,
              ...(mode === "edit" ? { requestId: id, revision: 7 } : {}),
            }),
          );
          const panel = moreDetails(locale);
          const form = panel.closest("form")!;
          expect(form.className).toMatch(/progressiveForm/);
          expect(panel.className).toMatch(/moreDetails/);
          expect(panel.open).toBe(expanded);
          const basics = screen.getByRole("group", {
            name: t.basicInformation,
          });
          expect(within(basics).getByLabelText(t.title)).toBeVisible();
          expect(
            within(basics).getByRole("combobox", { name: t.format }),
          ).toBeVisible();
          expect(
            basics.querySelectorAll("input, select, textarea"),
          ).toHaveLength(2);
          expect(basics.closest("details")).toBeNull();
          expect(
            screen
              .getByRole("checkbox", { name: t.disclaimer })
              .closest("details"),
          ).toBeNull();
          expect(
            screen
              .getByRole("button", {
                name: mode === "edit" ? t.save : t.submit,
              })
              .closest("details"),
          ).toBeNull();
          for (const name of optionalNames) {
            const control = screen.getByLabelText(t[name]);
            expect(panel).toContainElement(control);
            expect(control).toBeEnabled();
            expect(control).toHaveAttribute("name", name);
          }
          expect(fetchStub).not.toHaveBeenCalled();
        },
      );
    });

    it("retains mounted optional values through collapse, reopen and collapsed POST", async () => {
      const t = requestDictionary(locale);
      render(
        React.createElement(NewRequestForm, {
          locale,
          prefillTitle: "Retained title",
        }),
      );
      const panel = moreDetails(locale);
      const form = panel.closest("form")!;
      const controls = optionalNames.map((name) =>
        screen.getByLabelText(t[name]),
      );
      openDetails(locale);
      const values = {
        alternativeTitles: "Alias one\nAlias two",
        originalTitle: "Original",
        author: "Author",
        sourceUrl: "https://example.org/book",
        originalLanguage: "en",
        publicationLanguage: "vi",
        publicationYear: "2024",
        description: "Description",
        additionalEvidence: "Evidence",
        notes: "Private note",
      };
      for (const name of optionalNames)
        fireEvent.change(screen.getByLabelText(t[name]), {
          target: { value: values[name] },
        });
      toggleDetails(panel, false);
      expect(panel.open).toBe(false);
      const data = new FormData(form);
      for (const [index, name] of optionalNames.entries()) {
        expect(screen.getByLabelText(t[name])).toBe(controls[index]);
        expect(controls[index]).toBeEnabled();
        expect(data.get(name)).toBe(values[name]);
      }
      toggleDetails(panel, true);
      for (const name of optionalNames)
        expect(screen.getByLabelText(t[name])).toHaveValue(
          name === "publicationYear" ? 2024 : values[name],
        );
      toggleDetails(panel, false);
      acknowledge(locale);
      submit(locale);
      await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
      expect(submitRequestSchema.parse(body())).toEqual({
        submitKey,
        details: {
          ...values,
          title: "Retained title",
          format: "UNKNOWN",
          alternativeTitles: ["Alias one", "Alias two"],
          publicationYear: 2024,
        },
      });
      expect(fetchStub.mock.calls[0][1].method).toBe("POST");
    });

    it("PATCHes retained collapsed edit details with revision and UNKNOWN format", async () => {
      const t = requestDictionary(locale);
      render(
        React.createElement(NewRequestForm, {
          locale,
          requestId: id,
          revision: 11,
          initialDetails: {
            title: "Edit title",
            format: "UNKNOWN",
            alternativeTitles: ["Edit alias"],
            notes: "Original private note",
          },
        }),
      );
      const panel = moreDetails(locale);
      expect(panel.open).toBe(true);
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "Changed private note" },
      });
      toggleDetails(panel, false);
      acknowledge(locale);
      fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      );
      await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
      expect(fetchStub.mock.calls[0][0]).toBe(`/api/requests/${id}`);
      expect(fetchStub.mock.calls[0][1].method).toBe("PATCH");
      expect(updateRequestSchema.parse(body())).toEqual({
        revision: 11,
        details: {
          title: "Edit title",
          format: "UNKNOWN",
          alternativeTitles: ["Edit alias"],
          notes: "Changed private note",
        },
      });
    });

    it("reveals a single schema-invalid optional field before focusing and associates its localized error", async () => {
      const t = requestDictionary(locale);
      render(
        React.createElement(NewRequestForm, {
          locale,
          prefillTitle: "Valid title",
        }),
      );
      const panel = moreDetails(locale);
      openDetails(locale);
      const field = screen.getByLabelText(t.sourceUrl);
      fireEvent.change(field, {
        target: { value: "http://localhost/private" },
      });
      toggleDetails(panel, false);
      let openAtFocus = false;
      field.addEventListener("focus", () => {
        openAtFocus = panel.open;
      });
      acknowledge(locale);
      submit(locale);
      await waitFor(() => expect(field).toHaveFocus());
      expect(openAtFocus).toBe(true);
      expect(panel.open).toBe(true);
      expectFieldError(field, t.sourceUrlError);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(t.invalid);
      expect(alert.closest("details")).toBeNull();
      expect(fetchStub).not.toHaveBeenCalled();
      expect(uuid).not.toHaveBeenCalled();
    });

    it("reveals multiple schema errors and keeps user toggle state on later renders", async () => {
      const t = requestDictionary(locale);
      const props = { locale, prefillTitle: "Valid title" };
      const view = render(React.createElement(NewRequestForm, props));
      const panel = moreDetails(locale);
      openDetails(locale);
      for (const name of ["originalLanguage", "publicationLanguage"] as const)
        fireEvent.change(screen.getByLabelText(t[name]), {
          target: { value: "invalid language" },
        });
      toggleDetails(panel, false);
      acknowledge(locale);
      submit(locale);
      await waitFor(() => expect(panel.open).toBe(true));
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(t.invalid);
      for (const name of ["originalLanguage", "publicationLanguage"] as const) {
        const field = screen.getByLabelText(t[name]);
        expectFieldError(field, t[`${name}Error`]);
        expect(
          within(alert).getByRole("link", { name: t[name] }),
        ).toHaveAttribute("href", `#${field.id}`);
      }
      toggleDetails(panel, false);
      view.rerender(React.createElement(NewRequestForm, props));
      expect(panel.open).toBe(false);
      expect(screen.getByLabelText(t.originalLanguage)).toHaveValue(
        "invalid language",
      );
      toggleDetails(panel, true);
      expectFieldError(
        screen.getByLabelText(t.originalLanguage),
        t.originalLanguageError,
      );
      expect(fetchStub).not.toHaveBeenCalled();
    });

    it.each([
      ["sourceUrl", "not a URL", "typeMismatch"],
      ["publicationYear", "10000", "rangeOverflow"],
      ["publicationYear", "0", "rangeUnderflow"],
    ] as const)(
      "handles native invalid %s %s without cancelling constraint validation",
      (name, value, validityKey) => {
        const t = requestDictionary(locale);
        render(
          React.createElement(NewRequestForm, {
            locale,
            prefillTitle: "Native validation",
          }),
        );
        const panel = moreDetails(locale);
        const form = panel.closest("form")!;
        openDetails(locale);
        const field = screen.getByLabelText(t[name]) as HTMLInputElement;
        fireEvent.change(field, { target: { value } });
        expect(field.willValidate).toBe(true);
        expect(field.validity[validityKey]).toBe(true);
        expect(field.validity.customError).toBe(false);
        expect(form.noValidate).toBe(false);
        toggleDetails(panel, false);
        // jsdom validity + explicit invalid dispatch; not actual native keyboard/focus evidence.
        let openAtTarget = false;
        field.addEventListener(
          "invalid",
          () => {
            openAtTarget = panel.open;
          },
          { once: true },
        );
        expect(fireEvent.invalid(field, { cancelable: true })).toBe(true);
        expect(openAtTarget).toBe(true);
        expect(panel.open).toBe(true);
        expectFieldError(field, t[`${name}Error`]);
        expect(screen.getByRole("alert")).toHaveTextContent(
          t.validationSummary,
        );
        expect(screen.getByRole("alert").closest("details")).toBeNull();
        expect(field.validity[validityKey]).toBe(true);
        expect(field.validity.customError).toBe(false);
        expect(fetchStub).not.toHaveBeenCalled();
        expect(uuid).not.toHaveBeenCalled();
      },
    );

    it("keeps values and the allocated key after a schema-invalid retry", async () => {
      const t = requestDictionary(locale);
      fetchStub.mockRejectedValueOnce(new Error("PRIVATE_TRANSPORT"));
      render(
        React.createElement(NewRequestForm, { locale, prefillTitle: "Retry" }),
      );
      openDetails(locale);
      fireEvent.change(screen.getByLabelText(t.notes), {
        target: { value: "Keep private note" },
      });
      acknowledge(locale);
      submit(locale);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(t.error),
      );
      fireEvent.change(screen.getByLabelText(t.originalLanguage), {
        target: { value: "bad language" },
      });
      toggleDetails(moreDetails(locale), false);
      submit(locale);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(t.notes)).toHaveValue("Keep private note");
      expect(screen.getByLabelText(t.originalLanguage)).toHaveValue(
        "bad language",
      );
      expect(
        screen.getByRole("checkbox", { name: t.disclaimer }),
      ).toBeChecked();
      expect(uuid).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText(t.originalLanguage), {
        target: { value: "en" },
      });
      submit(locale);
      await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2));
      expect(submitRequestSchema.parse(body(0)).submitKey).toBe(
        submitRequestSchema.parse(body(1)).submitKey,
      );
      expect(submitRequestSchema.parse(body(1)).details).toMatchObject({
        notes: "Keep private note",
        originalLanguage: "en",
      });
      expect(screen.queryByText(/PRIVATE_TRANSPORT/)).not.toBeInTheDocument();
      expect(uuid).toHaveBeenCalledTimes(1);
    });
  });

  it("uses unique stable IDs and exact field labels across two forms, with help outside labels", () => {
    const forms = () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(NewRequestForm, {
          locale: "en",
          prefillTitle: "English",
        }),
        React.createElement(NewRequestForm, {
          locale: "vi",
          prefillTitle: "Vietnamese",
        }),
      );
    const view = render(forms());
    const before = Array.from(
      view.container.querySelectorAll("[id]"),
      (element) => element.id,
    );
    expect(before.length).toBeGreaterThan(0);
    expect(new Set(before).size).toBe(before.length);
    for (const locale of ["en", "vi"] as const) {
      const t = requestDictionary(locale);
      openDetails(locale);
      for (const name of [
        "title",
        "format",
        ...optionalNames,
        "disclaimer",
      ] as const) {
        const field = screen.getByLabelText(t[name]);
        expect(field.id).not.toBe("");
        const label = Array.from(view.container.querySelectorAll("label")).find(
          (candidate) => candidate.htmlFor === field.id,
        );
        expect(label).toBeDefined();
        expect(field).toHaveAccessibleName(t[name]);
      }
      for (const help of [t.moreDetailsHelp, t.privateNotesHelp]) {
        expect(screen.getByText(help)).toBeVisible();
        expect(screen.getByText(help).closest("label")).toBeNull();
      }
      expect(screen.getByLabelText(t.notes)).toHaveAccessibleDescription(
        t.privateNotesHelp,
      );
    }
    view.rerender(forms());
    expect(
      Array.from(
        view.container.querySelectorAll("[id]"),
        (element) => element.id,
      ),
    ).toEqual(before);
  });
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
    for (const dictionary of [en, vi])
      for (const field of [
        "title",
        "format",
        ...optionalNames,
        "disclaimer",
      ] as const)
        expect(dictionary[`${field}Error`].trim().length).toBeGreaterThan(0);
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
