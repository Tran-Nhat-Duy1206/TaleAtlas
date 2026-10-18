import type { Locale } from "./i18n";

const en = {
  genre: "Genre",
  allGenres: "All genres",
  selectedGenre: (slug: string) => `Selected genre: ${slug}`,
  genresUnavailable: "Genre choices unavailable",
  genreCapacity:
    "Genre choices are unavailable because the list exceeds the supported capacity. Your current genre filter is retained.",
  originalLanguage: "Original language (recorded code)",
  originalLanguageHelp:
    "Leave blank for all languages. Enter the exact recorded original language tag, including letter case (for example, ja or zh-Hant). This is not the interface language.",
  releaseStatus: "Release status",
  allStatuses: "All statuses",
  invalidQuery:
    "Some search parameters are invalid. Default filters and results are shown instead. Apply your filters again to search.",
  emptyPage: "No works on this page",
  emptyPageText:
    "Matching works exist, but this page has no results. Return to the first page with the same filters.",
  firstPage: "Go to first page",
};
const vi: typeof en = {
  genre: "Thể loại",
  allGenres: "Tất cả thể loại",
  selectedGenre: (slug: string) => `Thể loại đã chọn: ${slug}`,
  genresUnavailable: "Không thể chọn thể loại",
  genreCapacity:
    "Không thể hiển thị lựa chọn thể loại vì danh sách vượt quá giới hạn được hỗ trợ. Bộ lọc thể loại hiện tại của bạn vẫn được giữ nguyên.",
  originalLanguage: "Ngôn ngữ gốc (mã đã ghi nhận)",
  originalLanguageHelp:
    "Để trống để tìm mọi ngôn ngữ. Nhập chính xác thẻ ngôn ngữ gốc đã ghi nhận, kể cả chữ hoa và chữ thường (ví dụ: ja hoặc zh-Hant). Đây không phải ngôn ngữ giao diện.",
  releaseStatus: "Trạng thái phát hành",
  allStatuses: "Tất cả trạng thái",
  invalidQuery:
    "Một số tham số tìm kiếm không hợp lệ. Bộ lọc và kết quả mặc định đang được hiển thị thay thế. Hãy áp dụng lại bộ lọc để tìm kiếm.",
  emptyPage: "Không có tác phẩm trên trang này",
  emptyPageText:
    "Có tác phẩm phù hợp, nhưng trang này không có kết quả. Hãy quay về trang đầu với cùng bộ lọc.",
  firstPage: "Về trang đầu",
};

export const catalogDiscoveryCopy: Record<Locale, typeof en> = { en, vi };
