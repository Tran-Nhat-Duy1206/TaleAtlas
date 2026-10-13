import { communityCopy } from "./community-i18n";
import type { Locale } from "./i18n";

const en = {
  ...communityCopy.en,
  report: "Report this public content",
  reportForm: "Submit a private report",
  reports: "Manage my reports",
  reportId: "Report UUID",
  reportState: "Report status",
  reportRevision: "Report revision",
  reportReason: "Report category",
  chooseReportReason: "Choose a report category",
  explanation: "Optional private explanation",
  explanationHelp:
    "Up to 1000 plain-text characters. Other requires at least 3 meaningful characters.",
  privacyNotice:
    "Reports are private moderation requests, not public reviews or private-library notes. Do not include passwords or unnecessary personal information. A library entry and spoiler reveal are not required.",
  submitReport: "Send private report",
  reportSuccess: "Private report received.",
  refreshReport: "Reload my report status",
  reportNotice:
    "Only your report UUID, target UUID scope, status and revision are shown. No reporter identity, report text, public body, rating or moderation narrative is loaded.",
  emptyReports: "No reports submitted.",
  moderation: "Community moderation",
  moderatorNotice:
    "Manual community review only. Moderator access does not grant catalog or private-library access. Unavailable works are identified only by UUID.",
  deniedModeration:
    "Current verified moderator or administrator access is required.",
  queue: "Report queue",
  filter: "Report status filter",
  open: "Open",
  dismissed: "Dismissed",
  upheld: "Upheld",
  selectTarget: "Select target metadata",
  refreshTarget: "Reload current target metadata",
  authorState: "Author state",
  moderationState: "Moderation visibility",
  active: "Active",
  visible: "Visible",
  redacted: "Evidence redacted",
  evidence: "Explicit private evidence",
  evidenceNotice:
    "Choose and acknowledge one section at a time. No related text is fetched automatically. Revealed evidence never fills a report or moderation reason.",
  evidenceSection: "Evidence section",
  chooseEvidence: "Choose one evidence section",
  titleEvidence: "Target title only",
  bodyEvidence: "Target body only",
  contextEvidence: "Spoiler context only",
  reportEvidence: "Report narrative only",
  actionReasonEvidence: "Action reason only",
  evidenceAck:
    "I deliberately request only this selected private evidence at the current revision.",
  revealEvidence: "Read selected evidence only",
  noEvidence: "Selected evidence unavailable or redacted.",
  history: "Private metadata history",
  events: "Content event metadata",
  actions: "Moderation action metadata",
  eventRevision: "Content revision",
  actionId: "Action UUID",
  sequence: "Sequence",
  occurredAt: "Recorded time",
  emptyHistory: "No metadata in this history stream.",
  action: "Moderation decision",
  chooseAction: "Choose a moderation decision",
  dismiss: "Dismiss this open report",
  hide: "Hide content from public delivery",
  restore: "Restore moderation visibility only",
  decisionNotice:
    "Dismiss resolves a report without hiding content. Hide removes public delivery. Restore changes moderation visibility only: it never restores erased or withdrawn text, ratings, private data, unpublished works or hidden ancestors. Closed reports cannot be resolved again; later restoration uses no report pair.",
  reason: "Private moderation reason",
  reasonHelp:
    "Write a fresh mandatory plain-text reason, up to 1000 characters. No existing evidence or previous reason is copied.",
  actionIntent:
    "I deliberately apply this moderation decision to the current UUID scope and revisions.",
  apply: "Apply moderation decision",
  decisionSuccess:
    "Moderation decision confirmed. Reload current metadata before another decision.",
  metadataOnly: "UUID metadata only",
  reviewKind: "Review",
};
const vi: typeof en = {
  ...communityCopy.vi,
  report: "Báo cáo nội dung công khai này",
  reportForm: "Gửi báo cáo riêng",
  reports: "Quản lý báo cáo của tôi",
  reportId: "UUID báo cáo",
  reportState: "Trạng thái báo cáo",
  reportRevision: "Phiên bản báo cáo",
  reportReason: "Loại báo cáo",
  chooseReportReason: "Chọn loại báo cáo",
  explanation: "Giải thích riêng tùy chọn",
  explanationHelp:
    "Tối đa 1000 ký tự văn bản thuần. Loại Khác cần ít nhất 3 ký tự có ý nghĩa.",
  privacyNotice:
    "Báo cáo là yêu cầu kiểm duyệt riêng, không phải đánh giá công khai hay ghi chú thư viện riêng. Không cung cấp mật khẩu hoặc thông tin cá nhân không cần thiết. Không cần mục thư viện hay mở phần tiết lộ.",
  submitReport: "Gửi báo cáo riêng",
  reportSuccess: "Đã nhận báo cáo riêng.",
  refreshReport: "Tải lại trạng thái báo cáo của tôi",
  reportNotice:
    "Chỉ hiển thị UUID báo cáo, phạm vi UUID nội dung, trạng thái và phiên bản của bạn. Không tải danh tính người báo cáo, văn bản báo cáo, nội dung công khai, điểm hay lý do kiểm duyệt.",
  emptyReports: "Chưa gửi báo cáo nào.",
  moderation: "Kiểm duyệt cộng đồng",
  moderatorNotice:
    "Chỉ xem xét cộng đồng thủ công. Quyền kiểm duyệt không cấp quyền truy cập danh mục hay thư viện riêng. Tác phẩm không khả dụng chỉ được nhận diện bằng UUID.",
  deniedModeration:
    "Cần quyền kiểm duyệt viên hoặc quản trị viên hiện tại và tài khoản đã xác minh.",
  queue: "Hàng đợi báo cáo",
  filter: "Lọc trạng thái báo cáo",
  open: "Đang mở",
  dismissed: "Đã bác bỏ",
  upheld: "Đã chấp nhận",
  selectTarget: "Chọn thông tin nội dung",
  refreshTarget: "Tải lại thông tin nội dung hiện tại",
  authorState: "Trạng thái tác giả",
  moderationState: "Trạng thái hiển thị kiểm duyệt",
  active: "Đang hoạt động",
  visible: "Đang hiển thị",
  redacted: "Bằng chứng đã được xóa",
  evidence: "Bằng chứng riêng được chọn rõ ràng",
  evidenceNotice:
    "Chọn và xác nhận từng phần riêng biệt. Không tự tải văn bản liên quan. Bằng chứng đã mở không điền vào báo cáo hay lý do kiểm duyệt.",
  evidenceSection: "Phần bằng chứng",
  chooseEvidence: "Chọn một phần bằng chứng",
  titleEvidence: "Chỉ tiêu đề nội dung",
  bodyEvidence: "Chỉ văn bản nội dung",
  contextEvidence: "Chỉ ngữ cảnh tiết lộ",
  reportEvidence: "Chỉ lời giải thích báo cáo",
  actionReasonEvidence: "Chỉ lý do quyết định",
  evidenceAck:
    "Tôi chủ ý yêu cầu riêng phần bằng chứng đã chọn ở phiên bản hiện tại.",
  revealEvidence: "Chỉ đọc bằng chứng đã chọn",
  noEvidence: "Bằng chứng đã chọn không khả dụng hoặc đã được xóa.",
  history: "Lịch sử thông tin riêng",
  events: "Thông tin sự kiện nội dung",
  actions: "Thông tin quyết định kiểm duyệt",
  eventRevision: "Phiên bản nội dung",
  actionId: "UUID quyết định",
  sequence: "Số thứ tự",
  occurredAt: "Thời điểm ghi nhận",
  emptyHistory: "Luồng lịch sử này chưa có thông tin.",
  action: "Quyết định kiểm duyệt",
  chooseAction: "Chọn quyết định kiểm duyệt",
  dismiss: "Bác bỏ báo cáo đang mở này",
  hide: "Ẩn nội dung khỏi hiển thị công khai",
  restore: "Chỉ khôi phục trạng thái hiển thị kiểm duyệt",
  decisionNotice:
    "Bác bỏ giải quyết báo cáo mà không ẩn nội dung. Ẩn ngừng hiển thị công khai. Khôi phục chỉ đổi trạng thái hiển thị kiểm duyệt: không khôi phục văn bản đã xóa hoặc đã rút, điểm, dữ liệu riêng, tác phẩm chưa xuất bản hay nội dung cha đang ẩn. Không giải quyết lại báo cáo đã đóng; lần khôi phục sau không gắn cặp báo cáo.",
  reason: "Lý do kiểm duyệt riêng",
  reasonHelp:
    "Viết lý do mới bắt buộc bằng văn bản thuần, tối đa 1000 ký tự. Không sao chép bằng chứng hay lý do trước đó.",
  actionIntent:
    "Tôi chủ ý áp dụng quyết định kiểm duyệt này với phạm vi UUID và các phiên bản hiện tại.",
  apply: "Áp dụng quyết định kiểm duyệt",
  decisionSuccess:
    "Đã xác nhận quyết định kiểm duyệt. Tải lại thông tin hiện tại trước quyết định tiếp theo.",
  metadataOnly: "Chỉ thông tin UUID",
  reviewKind: "Đánh giá",
};
export const moderationCopy: Record<Locale, typeof en> = { en, vi };
export const reportReasonCopy = {
  en: {
    SPAM: "Spam",
    HARASSMENT: "Harassment",
    HATE: "Hate",
    SEXUAL_CONTENT: "Sexual content",
    ILLEGAL_CONTENT: "Illegal content",
    COPYRIGHT: "Copyright",
    OTHER: "Other",
  },
  vi: {
    SPAM: "Thư rác",
    HARASSMENT: "Quấy rối",
    HATE: "Thù ghét",
    SEXUAL_CONTENT: "Nội dung tình dục",
    ILLEGAL_CONTENT: "Nội dung bất hợp pháp",
    COPYRIGHT: "Bản quyền",
    OTHER: "Khác",
  },
} satisfies Record<
  Locale,
  Record<
    | "SPAM"
    | "HARASSMENT"
    | "HATE"
    | "SEXUAL_CONTENT"
    | "ILLEGAL_CONTENT"
    | "COPYRIGHT"
    | "OTHER",
    string
  >
>;
