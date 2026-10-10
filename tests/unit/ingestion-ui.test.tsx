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
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { ProcessButton } from "../../apps/web/src/components/ingestion/ProcessButton";
import { ingestionCopy } from "../../apps/web/src/components/ingestion/copy";
const id = "11111111-1111-4111-8111-111111111111";
const success = { claimed: 1, processed: 1, stale: 0, disabled: 0, failed: 0 };
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
// Mocked transport component checks only; no authentication/backend proof.
describe("private processing button transport", () => {
  it("sends bounded selected request input and drains JSON before refreshing", async () => {
    let resolveJson!: (value: unknown) => void;
    const json = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveJson = resolve;
        }),
    );
    const fetch = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetch);
    render(<ProcessButton locale="en" requestId={id} />);
    fireEvent.click(screen.getByRole("button", { name: ingestionCopy.en.run }));
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/admin/ingestion/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1, requestId: id }),
    });
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.click(screen.getByRole("button"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    resolveJson(success);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(ingestionCopy.en.done);
    expect(screen.getByRole("button")).toBeEnabled();
  });
  it.each([
    { claimed: 1, processed: 0, stale: 0, disabled: 0, failed: 1 },
    { claimed: 1, processed: 0, stale: 0, disabled: 1, failed: 0 },
    { ...success, claimed: 2 },
    { ...success, claimed: 4, processed: 4 },
    { ...success, processed: 0.5 },
    { ...success, processed: -1 },
    { ...success, leaseToken: "private-token-must-never-render" },
    null,
    {},
  ])(
    "does not report success or navigate for invalid/incomplete counts %j",
    async (payload) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => payload }),
      );
      render(<ProcessButton locale="vi" requestId={id} />);
      fireEvent.click(
        screen.getByRole("button", { name: ingestionCopy.vi.run }),
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          ingestionCopy.vi.error,
        ),
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain(
        "private-token-must-never-render",
      );
      expect(screen.getByRole("button")).toBeEnabled();
    },
  );
  it("handles HTTP failure without exposing its body or refreshing", async () => {
    const json = vi
      .fn()
      .mockResolvedValue({ error: "private-token-must-never-render" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json }));
    render(<ProcessButton locale="en" requestId={id} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ingestionCopy.en.error,
      ),
    );
    expect(json).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "private-token-must-never-render",
    );
  });
  it("handles malformed JSON without refreshing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("invalid JSON");
        },
      }),
    );
    render(<ProcessButton locale="en" requestId={id} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ingestionCopy.en.error,
      ),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("accepts a dormant zero-claimed response without invented processing evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            claimed: 0,
            processed: 0,
            stale: 0,
            disabled: 0,
            failed: 0,
          }),
        }),
    );
    render(<ProcessButton locale="en" requestId={id} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(ingestionCopy.en.done);
    expect(document.body.textContent).not.toContain("provider-verified");
  });
});
