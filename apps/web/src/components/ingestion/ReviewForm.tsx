"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  requestReviewSchema,
  requestReviewRecordSchema,
} from "../../features/ingestion/moderation";
import type { Locale } from "../../lib/i18n";

export function ReviewForm({
  locale,
  requestId,
  revision,
  inputRevision,
  candidateId,
}: {
  locale: Locale;
  requestId: string;
  revision: number;
  inputRevision: number;
  candidateId: string;
}) {
  const vi = locale === "vi";
  const router = useRouter();
  const [action, setAction] = useState("APPROVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    let work: unknown;
    try {
      if (action === "APPROVE") work = JSON.parse(String(data.get("work")));
    } catch {
      setError(vi ? "JSON tác phẩm không hợp lệ." : "Invalid Work JSON.");
      return;
    }
    const parsed = requestReviewSchema.safeParse({
      action,
      revision,
      reason: data.get("reason"),
      candidateId,
      ...(["APPROVE", "LINK"].includes(action)
        ? {
            inputRevision,
            identityReviewAcknowledged: data.get("identity") === "on",
          }
        : {}),
      ...(action === "APPROVE"
        ? {
            work,
            publicationReviewAcknowledged: data.get("publication") === "on",
          }
        : {}),
      ...(action === "LINK"
        ? {
            workId: data.get("workId"),
            workRevision: Number(data.get("workRevision")),
          }
        : {}),
    });
    if (!parsed.success) {
      setError(
        vi
          ? "Kiểm tra dữ liệu và xác nhận duyệt."
          : "Check the fields and review acknowledgments.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/requests/${requestId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? vi
              ? "Bản duyệt đã cũ. Tải lại trang."
              : "Stale review. Reload the page."
            : vi
              ? "Không thể duyệt."
              : "Review failed.",
        );
        return;
      }
      const result = requestReviewRecordSchema.parse(await response.json());
      const expectedState =
        action === "APPROVE"
          ? "APPROVED"
          : action === "LINK"
            ? "LINKED_EXISTING"
            : action === "REJECT"
              ? "REJECTED"
              : "NEEDS_INFO";
      if (
        result.id !== requestId ||
        result.revision !== revision + 1 ||
        result.inputRevision !== inputRevision ||
        result.state !== expectedState
      )
        throw new Error("INVALID_REPLY");
      router.refresh();
    } catch {
      setError(vi ? "Không thể duyệt." : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      aria-label={vi ? "Duyệt ứng viên" : "Review candidate"}
    >
      <h3>{vi ? "Quyết định thủ công" : "Human review decision"}</h3>
      <p>
        {vi
          ? "Ứng viên chưa được xác minh. Không tự động sao chép, hợp nhất hay xuất bản. Kiểm tra danh tính và từng dữ kiện theo dẫn chứng có quyền sử dụng."
          : "Candidates are unverified. No automatic copy, merge or publication. Verify identity and every asserted fact against permitted cited evidence."}
      </p>
      <label>
        {vi ? "Quyết định" : "Decision"}
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          disabled={busy}
        >
          <option value="APPROVE">
            {vi ? "Tạo tác phẩm đã duyệt" : "Approve new Work"}
          </option>
          <option value="LINK">
            {vi ? "Liên kết tác phẩm có sẵn" : "Link existing Work"}
          </option>
          <option value="REJECT">{vi ? "Từ chối" : "Reject"}</option>
          <option value="NEEDS_INFO">
            {vi ? "Cần thông tin" : "Needs information"}
          </option>
        </select>
      </label>
      <label>
        {vi ? "Lý do" : "Review reason"}
        <textarea name="reason" required maxLength={2000} disabled={busy} />
      </label>
      {action === "APPROVE" && (
        <>
          <label>
            {vi
              ? "JSON tác phẩm đã kiểm tra (hợp đồng V1)"
              : "Manually verified Work JSON (V1 contract)"}
            <textarea
              name="work"
              required
              rows={14}
              maxLength={60000}
              disabled={busy}
            />
          </label>
          <p>
            {vi
              ? "Yêu cầu visibility PUBLISHED, publicationReviewAcknowledged true và nguồn trích dẫn. Không tự điền dữ kiện từ ứng viên."
              : "Requires PUBLISHED visibility, publicationReviewAcknowledged true and a cited source. Candidate facts are not auto-filled."}
          </p>
          <label>
            <input
              type="checkbox"
              name="publication"
              required
              disabled={busy}
            />
            {vi
              ? "Tôi xác nhận kiểm tra quyền và các dữ kiện trước khi xuất bản."
              : "I attest to publication rights and verified metadata review."}
          </label>
        </>
      )}
      {action === "LINK" && (
        <>
          <label>
            {vi ? "UUID tác phẩm đã xuất bản" : "Published Work UUID"}
            <input name="workId" required disabled={busy} />
          </label>
          <label>
            {vi ? "Phiên bản tác phẩm" : "Work revision"}
            <input
              name="workRevision"
              type="number"
              min={1}
              required
              disabled={busy}
            />
          </label>
        </>
      )}
      {["APPROVE", "LINK"].includes(action) && (
        <label>
          <input type="checkbox" name="identity" required disabled={busy} />
          {vi
            ? "Tôi đã so sánh danh tính; đây không phải hợp nhất tự động."
            : "I reviewed bibliographic identity; this is not an automatic merge."}
        </label>
      )}
      <button disabled={busy} type="submit">
        {vi ? "Gửi quyết định duyệt" : "Submit review decision"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
