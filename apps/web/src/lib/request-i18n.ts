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
  basicInformation: "Basic information (required)",
  moreDetails: "More details (optional)",
  moreDetailsHelp:
    "Add only information you know. Leave unknown details blank.",
  privateNotesHelp:
    "Private notes are not included in public request summaries.",
  validationSummary: "Check the marked fields and the required acknowledgment.",
  titleError:
    "Enter a title of 1–600 characters containing letters or numbers.",
  formatError: "Choose a listed format. Unknown is allowed.",
  alternativeTitlesError:
    "Enter up to 12 alternative titles, 1–600 characters each.",
  originalTitleError: "Use up to 600 characters, or leave this blank.",
  authorError: "Use up to 300 characters, or leave this blank.",
  sourceUrlError:
    "Use a public http(s) citation URL of up to 2000 characters, without credentials or a port.",
  originalLanguageError:
    "Use a language code such as en or vi, or leave this blank.",
  publicationLanguageError:
    "Use a language code such as en or vi, or leave this blank.",
  publicationYearError:
    "Enter a whole year from 1 to 9999, or leave this blank.",
  descriptionError: "Use up to 4000 characters, or leave this blank.",
  additionalEvidenceError: "Use up to 3000 characters, or leave this blank.",
  notesError: "Use up to 2000 characters, or leave this blank.",
  disclaimerError:
    "Acknowledge that a request does not guarantee approval or publication.",
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
  basicInformation: "Thông tin cơ bản (bắt buộc)",
  moreDetails: "Thông tin thêm (không bắt buộc)",
  moreDetailsHelp:
    "Chỉ thêm thông tin bạn biết. Để trống các chi tiết chưa rõ.",
  privateNotesHelp:
    "Ghi chú riêng tư không xuất hiện trong bản tóm tắt yêu cầu công khai.",
  validationSummary: "Kiểm tra các trường được đánh dấu và xác nhận bắt buộc.",
  titleError: "Nhập tên từ 1–600 ký tự, có chứa chữ hoặc số.",
  formatError: "Chọn định dạng trong danh sách. Có thể chọn Chưa rõ.",
  alternativeTitlesError: "Nhập tối đa 12 tên khác, mỗi tên từ 1–600 ký tự.",
  originalTitleError: "Dùng tối đa 600 ký tự hoặc để trống.",
  authorError: "Dùng tối đa 300 ký tự hoặc để trống.",
  sourceUrlError:
    "Dùng URL trích dẫn http(s) công khai, tối đa 2000 ký tự, không kèm thông tin đăng nhập hoặc cổng.",
  originalLanguageError: "Dùng mã ngôn ngữ như en hoặc vi, hoặc để trống.",
  publicationLanguageError: "Dùng mã ngôn ngữ như en hoặc vi, hoặc để trống.",
  publicationYearError: "Nhập năm nguyên từ 1 đến 9999 hoặc để trống.",
  descriptionError: "Dùng tối đa 4000 ký tự hoặc để trống.",
  additionalEvidenceError: "Dùng tối đa 3000 ký tự hoặc để trống.",
  notesError: "Dùng tối đa 2000 ký tự hoặc để trống.",
  disclaimerError:
    "Xác nhận rằng gửi yêu cầu không đảm bảo được duyệt hoặc xuất bản.",
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
