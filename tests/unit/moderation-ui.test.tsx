// @vitest-environment jsdom
// Mocked transport/component proof only; genuine administrator/browser proof is separate.
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { randomUUID } from "node:crypto";
import { ReviewForm } from "../../apps/web/src/components/ingestion/ReviewForm";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});
const work = {
  primaryTitle: "Human checked title",
  primaryTitleLanguage: "en",
  format: "NOVEL",
  visibility: "PUBLISHED",
  publicationReviewAcknowledged: true,
  releaseStatus: "UNKNOWN",
  source: { label: "Synthetic source", citation: "Manually reviewed fixture." },
};
for (const locale of ["en", "vi"] as const)
  describe(`native review payload ${locale}`, () => {
    function setup() {
      const id = randomUUID(),
        candidateId = randomUUID();
      render(
        <ReviewForm
          locale={locale}
          requestId={id}
          revision={3}
          inputRevision={1}
          candidateId={candidateId}
        />,
      );
      return {
        id,
        candidateId,
        form: screen.getByRole("form"),
        reason: screen.getByRole("textbox", {
          name: locale === "vi" ? "Lý do" : "Review reason",
        }),
        json: screen.getByRole("textbox", {
          name:
            locale === "vi"
              ? "JSON tác phẩm đã kiểm tra (hợp đồng V1)"
              : "Manually verified Work JSON (V1 contract)",
        }),
      };
    }
    it("does not copy suggestions into manually verified facts or default acknowledgments", () => {
      const { json, form } = setup();
      expect(json).toHaveValue("");
      for (const box of screen.getAllByRole("checkbox"))
        expect(box).not.toBeChecked();
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      fireEvent.submit(form);
      expect(fetch).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });
    it("requires actual checked acknowledgments and validates the exact reply before refreshing", async () => {
      const { id, candidateId, form, reason, json } = setup();
      fireEvent.change(reason, {
        target: { value: "Human checked identity and source" },
      });
      fireEvent.change(json, { target: { value: JSON.stringify(work) } });
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id,
          state: "APPROVED",
          revision: 4,
          inputRevision: 1,
          resultingWorkId: randomUUID(),
        }),
      });
      vi.stubGlobal("fetch", fetch);
      fireEvent.submit(form);
      expect(fetch).not.toHaveBeenCalled();
      for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
      fireEvent.submit(form);
      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = fetch.mock.calls[0]!;
      expect(url).toBe(`/api/admin/requests/${id}/review`);
      expect(JSON.parse(options.body)).toMatchObject({
        action: "APPROVE",
        revision: 3,
        inputRevision: 1,
        candidateId,
        identityReviewAcknowledged: true,
        publicationReviewAcknowledged: true,
        work,
      });
    });
    it("does not report a malformed200 or stale409 as completed review", async () => {
      const { form, reason, json } = setup();
      fireEvent.change(reason, { target: { value: "Human checked" } });
      fireEvent.change(json, { target: { value: JSON.stringify(work) } });
      for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
      const fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: randomUUID(),
            state: "APPROVED",
            revision: 4,
            inputRevision: 1,
            resultingWorkId: randomUUID(),
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 409 });
      vi.stubGlobal("fetch", fetch);
      fireEvent.submit(form);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          locale === "vi" ? "Không thể duyệt" : "Review failed",
        ),
      );
      expect(refresh).not.toHaveBeenCalled();
      fireEvent.submit(form);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          locale === "vi" ? "Bản duyệt đã cũ" : "Stale review",
        ),
      );
      expect(refresh).not.toHaveBeenCalled();
    });
  });
