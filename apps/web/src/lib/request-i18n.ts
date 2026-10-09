import type { Locale } from "./i18n";
const en = {
  mine: "My requests",
  new: "Request a story",
  owned: "Requests you submitted",
  followed: "Requests you follow",
  empty: "No requests here yet.",
  signIn: "Sign in to submit or view requests.",
  login: "Sign in",
  error: "We couldn’t load or complete this request. Please try again.",
  invalid:
    "Check the highlighted fields and their length. Use a public http(s) citation URL, language codes such as en or vi, and a year from 1 to 9999.",
  size: "Request details must fit within 12 KB. Shorten the optional information.",
  conflict:
    "This request changed or cannot be changed now. Reload before trying again.",
  title: "Title",
  format: "Format",
  unknown: "Unknown",
  alternativeTitles: "Alternative titles (one per line, up to 12)",
  originalTitle: "Original title",
  author: "Author",
  sourceUrl: "Source URL",
  originalLanguage: "Original language code",
  publicationLanguage: "Publication language code",
  publicationYear: "Publication year",
  description: "Description",
  additionalEvidence: "Additional evidence",
  notes: "Private notes",
  disclaimer:
    "I understand that submitting a request does not guarantee approval or publication.",
  submit: "Submit request",
  save: "Save changes",
  working: "Please wait…",
  cancel: "Cancel request",
  history: "Request history",
  edit: "Update information",
  view: "View published work",
  supporters: "Supporters",
  follow: "Follow this request",
  unfollow: "Stop following",
  equivalence:
    "I have reviewed this summary and believe it refers to the story I want. A similar title alone is not proof.",
  missing: "Didn’t find your story?",
  reviewed: "Related reviewed requests",
  safe: "Only reviewed summary information is shared. Requests do not guarantee publication.",
  previous: "Previous",
  next: "Next",
  page: "Page",
  unavailable: "This request is unavailable.",
  optional:
    "Only title and format are required. Leave unknown optional information blank.",
};
const vi: typeof en = {
  mine: "Yêu cầu của tôi",
  new: "Yêu cầu thêm truyện",
  owned: "Yêu cầu bạn đã gửi",
  followed: "Yêu cầu bạn theo dõi",
  empty: "Chưa có yêu cầu nào.",
  signIn: "Đăng nhập để gửi hoặc xem yêu cầu.",
  login: "Đăng nhập",
  error: "Không thể tải hoặc hoàn tất yêu cầu. Vui lòng thử lại.",
  invalid:
    "Kiểm tra các trường được đánh dấu và độ dài. Dùng URL trích dẫn http(s) công khai, mã ngôn ngữ như en hoặc vi, và năm từ 1 đến 9999.",
  size: "Thông tin yêu cầu không được vượt quá 12 KB. Hãy rút ngắn thông tin tùy chọn.",
  conflict:
    "Yêu cầu đã thay đổi hoặc không thể sửa lúc này. Tải lại trước khi thử lại.",
  title: "Tên truyện",
  format: "Định dạng",
  unknown: "Chưa rõ",
  alternativeTitles: "Tên khác (mỗi dòng một tên, tối đa 12)",
  originalTitle: "Tên gốc",
  author: "Tác giả",
  sourceUrl: "URL nguồn",
  originalLanguage: "Mã ngôn ngữ gốc",
  publicationLanguage: "Mã ngôn ngữ phát hành",
  publicationYear: "Năm phát hành",
  description: "Mô tả",
  additionalEvidence: "Bằng chứng bổ sung",
  notes: "Ghi chú riêng tư",
  disclaimer:
    "Tôi hiểu rằng gửi yêu cầu không đảm bảo được duyệt hoặc xuất bản.",
  submit: "Gửi yêu cầu",
  save: "Lưu thay đổi",
  working: "Vui lòng chờ…",
  cancel: "Hủy yêu cầu",
  history: "Lịch sử yêu cầu",
  edit: "Cập nhật thông tin",
  view: "Xem tác phẩm công khai",
  supporters: "Người ủng hộ",
  follow: "Theo dõi yêu cầu",
  unfollow: "Ngừng theo dõi",
  equivalence:
    "Tôi đã xem tóm tắt và tin rằng đây là truyện mình muốn. Tên tương tự không phải bằng chứng đồng nhất.",
  missing: "Chưa tìm thấy truyện của bạn?",
  reviewed: "Yêu cầu liên quan đã được kiểm tra",
  safe: "Chỉ chia sẻ tóm tắt đã được kiểm tra. Yêu cầu không đảm bảo xuất bản.",
  previous: "Trước",
  next: "Sau",
  page: "Trang",
  unavailable: "Yêu cầu này không khả dụng.",
  optional:
    "Chỉ cần tên truyện và định dạng. Để trống thông tin tùy chọn chưa rõ.",
};
export function requestDictionary(locale: Locale) {
  return locale === "vi" ? vi : en;
}
export function requestStateLabel(state: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    SUBMITTED: ["Submitted", "Đã gửi"],
    ENRICHING: ["Processing information", "Đang xử lý thông tin"],
    NEEDS_REVIEW: ["Needs review", "Cần kiểm tra"],
    NEEDS_INFO: ["More information needed", "Cần thêm thông tin"],
    APPROVED: ["Approved", "Đã duyệt"],
    LINKED_EXISTING: [
      "Linked to an existing work",
      "Đã liên kết tác phẩm có sẵn",
    ],
    REJECTED: ["Rejected", "Đã từ chối"],
    CANCELLED: ["Cancelled", "Đã hủy"],
  };
  return (
    labels[state]?.[locale === "vi" ? 1 : 0] ??
    requestDictionary(locale).unknown
  );
}
export function requestEventLabel(kind: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    SUBMITTED: ["Request submitted", "Đã gửi yêu cầu"],
    INFORMATION_UPDATED: ["Information updated", "Đã cập nhật thông tin"],
    CANCELLED: ["Request cancelled", "Đã hủy yêu cầu"],
    MODERATED: ["Review decision", "Quyết định kiểm tra"],
  };
  return (
    labels[kind]?.[locale === "vi" ? 1 : 0] ??
    (locale === "vi" ? "Cập nhật trạng thái" : "Status updated")
  );
}
