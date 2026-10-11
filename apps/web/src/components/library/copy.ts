import type { Locale } from "@/lib/i18n";
export const statuses = [
  "WANT_TO_READ",
  "READING",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const;
export type Status = (typeof statuses)[number];
const en = {
  title: "My library",
  private: "Private — only you can see this library.",
  unavailable: "Work unavailable",
  empty: "No entries match these filters.",
  loading: "Loading your library…",
  error: "We couldn’t complete that request. Try again.",
  denied: "Sign in with a verified account to use your library.",
  login: "Sign in",
  refresh: "Refresh current state",
  refreshing:
    "Changes saved. Refreshing current state… If it does not update, refresh again.",
  stale: "This entry changed. Refresh its current state before trying again.",
  retry: "Retry the same request",
  save: "Save changes",
  saving: "Saving…",
  status: "Reading status",
  favorite: "Favorite",
  all: "All",
  yes: "Favorites only",
  no: "Not favorites",
  sort: "Sort",
  updated: "Recently updated",
  added: "Recently added",
  alphabetical: "Title",
  rating: "Rating",
  apply: "Apply filters",
  previous: "Previous",
  next: "Next",
  page: "Page",
  invalid:
    "Invalid filters or page. Use a single value per filter and a page from 1 to 400.",
  reset: "Reset filters",
  detail: "Open library entry",
  catalog: "View catalog work",
  add: "Add to my library",
  restore: "Restore to my library",
  archive: "Archive entry",
  confirm:
    "I confirm removal from my library. Private reading history will be preserved.",
  archived: "Entry archived. Private reading history is preserved.",
  reread:
    "I understand this starts a new reading attempt after a completed read.",
  rereadHint:
    "Reading again after completion starts a new attempt; explicitly acknowledge below.",
  completedHint:
    "Without an unfinished reading attempt, Completed records that you previously read this work. No personal reading dates are invented.",
  holdHint:
    "On hold pauses an unfinished reading attempt and preserves progress.",
  dropHint:
    "Dropped abandons an unfinished reading attempt; saved progress and private history remain.",
  planHint:
    "Plan to read pauses an unfinished attempt and preserves progress. Reading resumes the same attempt.",
  progress: "Saved chapter",
  volume: "Saved volume",
  back: "Back to my library",
  saved: "Changes saved.",
  labels: {
    WANT_TO_READ: "Plan to read",
    READING: "Reading",
    COMPLETED: "Completed",
    ON_HOLD: "On hold",
    DROPPED: "Dropped",
  },
};
const vi: typeof en = {
  title: "Thư viện của tôi",
  private: "Riêng tư — chỉ bạn có thể xem thư viện này.",
  unavailable: "Tác phẩm không khả dụng",
  empty: "Không có mục phù hợp với bộ lọc.",
  loading: "Đang tải thư viện…",
  error: "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
  denied: "Đăng nhập bằng tài khoản đã xác minh để dùng thư viện.",
  login: "Đăng nhập",
  refresh: "Tải lại trạng thái hiện tại",
  refreshing:
    "Đã lưu thay đổi. Đang tải lại trạng thái hiện tại… Nếu chưa cập nhật, hãy tải lại lần nữa.",
  stale: "Mục này đã thay đổi. Tải lại trạng thái hiện tại trước khi thử lại.",
  retry: "Thử lại cùng yêu cầu",
  save: "Lưu thay đổi",
  saving: "Đang lưu…",
  status: "Trạng thái đọc",
  favorite: "Yêu thích",
  all: "Tất cả",
  yes: "Chỉ mục yêu thích",
  no: "Không yêu thích",
  sort: "Sắp xếp",
  updated: "Cập nhật gần nhất",
  added: "Mới thêm",
  alphabetical: "Tên tác phẩm",
  rating: "Đánh giá",
  apply: "Áp dụng bộ lọc",
  previous: "Trước",
  next: "Tiếp",
  page: "Trang",
  invalid:
    "Bộ lọc hoặc trang không hợp lệ. Mỗi bộ lọc chỉ nhận một giá trị và trang từ 1 đến 400.",
  reset: "Đặt lại bộ lọc",
  detail: "Mở mục thư viện",
  catalog: "Xem tác phẩm trong danh mục",
  add: "Thêm vào thư viện",
  restore: "Khôi phục vào thư viện",
  archive: "Lưu trữ mục",
  confirm:
    "Tôi xác nhận bỏ mục khỏi thư viện. Lịch sử đọc riêng tư sẽ được giữ lại.",
  archived: "Đã lưu trữ mục. Lịch sử đọc riêng tư được giữ lại.",
  reread: "Tôi hiểu thao tác này bắt đầu lượt đọc mới sau khi đã đọc xong.",
  rereadHint:
    "Đọc lại sau khi hoàn thành sẽ bắt đầu lượt đọc mới; cần xác nhận rõ bên dưới.",
  completedHint:
    "Nếu không có lượt đọc dang dở, Đã đọc ghi nhận bạn từng đọc tác phẩm này. Không tự tạo ngày đọc cá nhân.",
  holdHint: "Tạm dừng sẽ tạm ngưng lượt đọc dang dở và giữ tiến độ.",
  dropHint:
    "Bỏ đọc sẽ kết thúc lượt đọc dang dở; tiến độ và lịch sử riêng tư vẫn được giữ.",
  planHint:
    "Dự định đọc sẽ tạm ngưng lượt đọc dang dở và giữ tiến độ. Đang đọc sẽ tiếp tục cùng lượt đọc đó.",
  progress: "Chương đã lưu",
  volume: "Tập đã lưu",
  back: "Về thư viện của tôi",
  saved: "Đã lưu thay đổi.",
  labels: {
    WANT_TO_READ: "Dự định đọc",
    READING: "Đang đọc",
    COMPLETED: "Đã đọc",
    ON_HOLD: "Tạm dừng",
    DROPPED: "Bỏ đọc",
  },
};
export const libraryCopy: Record<Locale, typeof en> = { en, vi };
