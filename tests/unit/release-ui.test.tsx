// @vitest-environment jsdom
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
  refresh: vi.fn(),
  guard: vi.fn(),
  getWork: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../../apps/web/src/components/catalog/AdminGuard", () => ({
  adminGuard: mocks.guard,
}));
vi.mock("../../apps/web/src/server/catalog/service", () => ({
  adminGetWork: mocks.getWork,
}));
import ReleasesPage from "../../apps/web/src/app/[locale]/admin/releases/page";
import {
  ReleaseForm,
  releaseFormCopy,
} from "../../apps/web/src/components/catalog/ReleaseForm";

// Synthetic fixtures, mocked transport only: not authentication or backend proof.
const id = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";
const work = {
  id,
  revision: 7,
  title: "Synthetic published work",
  source: {
    label: "Synthetic catalog evidence",
    citation: "Synthetic bibliographic citation",
  },
};
const date = "2024-02-29";
function fill(locale: "en" | "vi" = "en", acknowledge = true) {
  const d = releaseFormCopy[locale];
  fireEvent.change(screen.getByLabelText(d.date), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(d.language), {
    target: { value: "vi" },
  });
  fireEvent.change(screen.getByLabelText(d.label), {
    target: { value: "Synthetic release" },
  });
  fireEvent.change(screen.getByLabelText(d.sourceLabel), {
    target: { value: "Synthetic permitted evidence" },
  });
  fireEvent.change(screen.getByLabelText(d.citation), {
    target: { value: "Synthetic exact day citation" },
  });
  fireEvent.change(screen.getByLabelText(d.url), {
    target: { value: "https://example.org/evidence" },
  });
  if (acknowledge) fireEvent.click(screen.getByRole("checkbox"));
}
function submit() {
  fireEvent.submit(screen.getByRole("button").closest("form")!);
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("exact release administration transport", () => {
  it.each(["en", "vi"] as const)(
    "requires an unchecked explicit manual attestation in %s",
    (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      render(<ReleaseForm locale={locale} work={work} />);
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toBeRequired();
      expect(
        screen.getByLabelText(releaseFormCopy[locale].revision),
      ).toHaveAttribute("readonly");
      expect(screen.getByText(work.source.citation)).toBeInTheDocument();
      fill(locale, false);
      expect(screen.getByRole("button").closest("form")!.checkValidity()).toBe(
        false,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(fetch).not.toHaveBeenCalled();
      submit(); // Even a programmatic/native-validation bypass must be rejected.
      expect(screen.getByRole("alert")).toHaveTextContent(
        releaseFormCopy[locale].invalid,
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("sends actual snapshot revision/date/source and drains strict JSON before success or refresh", async () => {
    let resolve!: (body: unknown) => void;
    const json = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json });
    vi.stubGlobal("fetch", fetch);
    render(<ReleaseForm locale="en" work={work} />);
    fill();
    submit();
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/admin/catalog/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workId: id,
        workRevision: 7,
        releaseDate: date,
        language: "vi",
        label: "Synthetic release",
        source: {
          label: "Synthetic permitted evidence",
          citation: "Synthetic exact day citation",
          url: "https://example.org/evidence",
        },
        releaseReviewAcknowledged: true,
      }),
    });
    expect(screen.getByRole("button")).toBeDisabled();
    submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    resolve({ id: releaseId, releaseDate: date });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(releaseId);
    expect(screen.getByRole("status")).toHaveTextContent(
      releaseFormCopy.en.done,
    );
  });
  it.each([
    null,
    {},
    { id: "bad", releaseDate: date },
    { id: releaseId, releaseDate: "2024-02-30" },
    { id: releaseId, releaseDate: "2024-03-01" },
    { id: releaseId, releaseDate: date, actor: "private-secret" },
  ])("rejects malformed or mismatched success body %j", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => body }),
    );
    render(<ReleaseForm locale="vi" work={work} />);
    fill("vi");
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        releaseFormCopy.vi.error,
      ),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toContain("private-secret");
  });
  it.each([409, 403, 500, 201])(
    "drains and sanitizes HTTP %s without optimistic success",
    async (status) => {
      const json = vi.fn().mockResolvedValue({
        id: releaseId,
        releaseDate: date,
        error: "private-secret",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: status < 400, status, json }),
      );
      render(<ReleaseForm locale="en" work={work} />);
      fill();
      submit();
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          releaseFormCopy.en.error,
        ),
      );
      expect(json).toHaveBeenCalledTimes(1);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).toBeNull();
      expect(document.body.textContent).not.toContain("private-secret");
    },
  );
  it("rejects malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("private-secret");
        },
      }),
    );
    render(<ReleaseForm locale="en" work={work} />);
    fill();
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        releaseFormCopy.en.error,
      ),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("private-secret");
  });
  it.each([
    ["releaseDate", "2024"],
    ["releaseDate", "2023-02-29"],
    ["language", "English"],
    ["sourceLabel", " "],
    ["citation", " "],
    ["sourceUrl", "http://example.org/evidence"],
    ["sourceUrl", "https://localhost/evidence"],
  ])(
    "rejects invalid %s without fetching evidence or submitting",
    (name, value) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      render(<ReleaseForm locale="en" work={work} />);
      fill();
      fireEvent.change(document.querySelector(`[name="${name}"]`)!, {
        target: { value },
      });
      submit();
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        releaseFormCopy.en.invalid,
      );
      expect(document.querySelector("img")).toBeNull();
    },
  );
});

describe("release page access ordering (mocked services, not authentication proof)", () => {
  it("does not inspect query or private work when guard denies", async () => {
    mocks.guard.mockResolvedValue(null);
    let queryRead = false;
    const searchParams = {
      then: () => {
        queryRead = true;
        throw new Error("Query read before authorization");
      },
    } as unknown as Promise<{ workId?: string }>;
    const page = await ReleasesPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams,
    });
    render(page);
    expect(queryRead).toBe(false);
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("offers a GET UUID picker without a work read or submission form", async () => {
    mocks.guard.mockResolvedValue(new Headers());
    render(
      await ReleasesPage({
        params: Promise.resolve({ locale: "vi" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(screen.getByRole("button").closest("form")).toHaveAttribute(
      "method",
      "GET",
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("loads actual published snapshot using guarded headers", async () => {
    const headers = new Headers({ cookie: "synthetic-session" });
    mocks.guard.mockResolvedValue(headers);
    mocks.getWork.mockResolvedValue({
      ...work,
      displayTitle: work.title,
      visibility: "PUBLISHED",
    });
    render(
      await ReleasesPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ workId: id }),
      }),
    );
    expect(mocks.getWork).toHaveBeenCalledWith(id, headers);
    expect(screen.getByText(work.source.citation)).toBeInTheDocument();
    expect(screen.getByLabelText(releaseFormCopy.en.revision)).toHaveValue("7");
    expect(document.body.textContent).not.toContain("synthetic-session");
  });
  it.each(["HIDDEN", "DRAFT"])(
    "returns 404 for %s without a release form",
    async (visibility) => {
      mocks.guard.mockResolvedValue(new Headers());
      mocks.getWork.mockResolvedValue({
        ...work,
        displayTitle: work.title,
        visibility,
      });
      await expect(
        ReleasesPage({
          params: Promise.resolve({ locale: "en" }),
          searchParams: Promise.resolve({ workId: id }),
        }),
      ).rejects.toThrow("NOT_FOUND");
    },
  );
  it.each(["bad-uuid", [id, id]])(
    "rejects invalid query after guard and before private read",
    async (workId) => {
      mocks.guard.mockResolvedValue(new Headers());
      await expect(
        ReleasesPage({
          params: Promise.resolve({ locale: "en" }),
          searchParams: Promise.resolve({ workId }),
        }),
      ).rejects.toThrow("NOT_FOUND");
      expect(mocks.guard).toHaveBeenCalledTimes(1);
      expect(mocks.getWork).not.toHaveBeenCalled();
    },
  );
});
