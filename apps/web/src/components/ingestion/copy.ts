import type { Locale } from "@/lib/i18n";
export const ingestionCopy = {
  en: {
    title: "Private metadata processing",
    denied: "Administrator access required",
    notice:
      "Submitted metadata, NOT provider-verified. All providers are disabled; no live retrieval is authorized. UNKNOWN means unknown, not a guess. Human review is required. Processing does not publish, create or link a Work.",
    selected: "Selected request ID",
    run: "Process selected queued request",
    working: "Processing…",
    done: "Processing completed. Queue refreshed.",
    error: "Unable to process this request. Please try again.",
    empty: "No requests found.",
    state: "State",
    revision: "Revision",
    inputRevision: "Input revision",
    input: "Submitted metadata (unverified)",
    candidate: "Normalized metadata: field values, provenance and conflicts",
    pending: "Not processed",
    matches: "Possible identity matches (explanations, not decisions)",
    noMatches: "No matches found. This does not establish a new identity.",
    previous: "Previous",
    next: "Next",
    pagination: "Pagination",
    page: "Page",
    choose: "Select request",
  },
  vi: {
    title: "Xử lý siêu dữ liệu riêng tư",
    denied: "Cần quyền quản trị viên",
    notice:
      "Siêu dữ liệu do người dùng gửi, KHÔNG được nhà cung cấp xác minh. Tất cả nhà cung cấp đều bị tắt; không cho phép truy xuất trực tiếp. UNKNOWN là chưa biết, không phải phỏng đoán. Cần người đánh giá. Xử lý không xuất bản, tạo hay liên kết tác phẩm.",
    selected: "ID yêu cầu đã chọn",
    run: "Xử lý yêu cầu đang chờ đã chọn",
    working: "Đang xử lý…",
    done: "Đã hoàn tất xử lý. Đã cập nhật hàng đợi.",
    error: "Không thể xử lý yêu cầu. Vui lòng thử lại.",
    empty: "Không tìm thấy yêu cầu.",
    state: "Trạng thái",
    revision: "Phiên bản",
    inputRevision: "Phiên bản đầu vào",
    input: "Siêu dữ liệu đã gửi (chưa xác minh)",
    candidate: "Siêu dữ liệu chuẩn hóa: giá trị trường, nguồn gốc và mâu thuẫn",
    pending: "Chưa xử lý",
    matches:
      "Kết quả đối chiếu có thể phù hợp (giải thích, không phải quyết định)",
    noMatches:
      "Không có kết quả phù hợp. Điều này không xác lập danh tính mới.",
    previous: "Trang trước",
    next: "Trang sau",
    pagination: "Phân trang",
    page: "Trang",
    choose: "Chọn yêu cầu",
  },
} as const;
export function ingestionDictionary(locale: Locale) {
  return ingestionCopy[locale];
}
