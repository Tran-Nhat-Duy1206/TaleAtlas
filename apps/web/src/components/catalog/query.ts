import {
  catalogQuerySchema,
  type ParsedCatalogQuery,
} from "../../features/catalog/contracts";
import type { Locale } from "../../lib/i18n";
export type PublicSearchParams = Record<string, string | string[] | undefined>;
export function publicCatalogQuery(
  params: PublicSearchParams,
  locale: Locale,
): ParsedCatalogQuery {
  const known: Record<string, string> = {};
  for (const key of ["q", "page", "pageSize", "format", "genre"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) known[key] = value;
  }
  const parsed = catalogQuerySchema.safeParse({ ...known, locale });
  return parsed.success ? parsed.data : catalogQuerySchema.parse({ locale });
}
export function catalogPageHref(
  locale: Locale,
  query: ParsedCatalogQuery,
  page: number,
) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.format) params.set("format", query.format);
  if (query.genre) params.set("genre", query.genre);
  params.set("pageSize", String(query.pageSize));
  params.set("page", String(page));
  return `/${locale}/works?${params}`;
}
export const publicCopy = {
  en: {
    title: "Explore the catalog",
    intro:
      "Discover stories through sourced bibliographic records. TaleAtlas does not host chapters or downloads.",
    search: "Search titles, creators or genres",
    format: "Format",
    all: "All formats",
    genre: "Genre slug",
    apply: "Search",
    reset: "Clear filters",
    results: "works found",
    empty: "No works found",
    emptyText:
      "Try a different title or clear the filters. Published records will appear here as the catalog grows.",
    previous: "Previous",
    next: "Next",
    page: "Page",
    back: "Back to catalog",
    placeholder: "Original TaleAtlas placeholder — not official cover artwork",
    cover: "Cover of",
    metadata: "Work information",
    language: "Original language",
    country: "Country",
    publication: "Publication",
    release: "Release status",
    titles: "Titles",
    creators: "Creators and credits",
    editions: "Editions",
    descriptions: "Descriptions",
    genres: "Genres",
    identifiers: "External identifiers",
    source: "Source and citation",
    consulted: "Consulted",
    information: "Informational source link",
    coverRights: "Cover credit and rights",
    license: "Rights information",
    unavailable: "Not recorded",
    primary: "Primary title",
    original: "Original title",
    alias: "Alternative title",
    publisher: "Publisher",
    isbn: "ISBN",
    edition: "Edition",
    workCredit: "Work-level credit",
    rights: "Rights",
    licensed: "Licensed",
    permission: "Used with permission",
    publicDomain: "Public domain",
    unknown: "Not verified",
    relations: "Related works",
    relationNote: "Published catalog relationships (reference identifiers).",
    adaptation: "Adaptation of",
    sequel: "Sequel of",
    prequel: "Prequel of",
    spinOff: "Spin-off of",
    sideStory: "Side story of",
    remake: "Remake of",
    shared: "Shared universe",
    other: "Other relationship",
  },
  vi: {
    title: "Khám phá danh mục",
    intro:
      "Khám phá truyện qua thông tin thư mục có trích dẫn nguồn. TaleAtlas không lưu trữ chương truyện hay nội dung tải xuống.",
    search: "Tìm tên tác phẩm, tác giả hoặc thể loại",
    format: "Định dạng",
    all: "Mọi định dạng",
    genre: "Mã thể loại",
    apply: "Tìm kiếm",
    reset: "Xóa bộ lọc",
    results: "tác phẩm được tìm thấy",
    empty: "Không tìm thấy tác phẩm",
    emptyText:
      "Thử tên khác hoặc xóa bộ lọc. Các hồ sơ đã công bố sẽ xuất hiện khi danh mục phát triển.",
    previous: "Trước",
    next: "Tiếp",
    page: "Trang",
    back: "Về danh mục",
    placeholder: "Hình minh họa gốc của TaleAtlas — không phải bìa chính thức",
    cover: "Bìa của",
    metadata: "Thông tin tác phẩm",
    language: "Ngôn ngữ gốc",
    country: "Quốc gia",
    publication: "Xuất bản",
    release: "Tình trạng phát hành",
    titles: "Tên tác phẩm",
    creators: "Tác giả và người đóng góp",
    editions: "Ấn bản",
    descriptions: "Giới thiệu",
    genres: "Thể loại",
    identifiers: "Mã định danh bên ngoài",
    source: "Nguồn và trích dẫn",
    consulted: "Ngày tham khảo",
    information: "Liên kết nguồn thông tin",
    coverRights: "Ghi công và quyền sử dụng bìa",
    license: "Thông tin quyền sử dụng",
    unavailable: "Chưa ghi nhận",
    primary: "Tên chính",
    original: "Tên gốc",
    alias: "Tên khác",
    publisher: "Nhà xuất bản",
    isbn: "ISBN",
    edition: "Ấn bản",
    workCredit: "Đóng góp cho tác phẩm",
    rights: "Quyền sử dụng",
    licensed: "Có giấy phép",
    permission: "Được cho phép sử dụng",
    publicDomain: "Thuộc phạm vi công cộng",
    unknown: "Chưa xác minh",
    relations: "Tác phẩm liên quan",
    relationNote: "Quan hệ giữa các hồ sơ đã công bố (mã tham chiếu).",
    adaptation: "Chuyển thể từ",
    sequel: "Phần tiếp theo của",
    prequel: "Tiền truyện của",
    spinOff: "Ngoại truyện của",
    sideStory: "Truyện bên lề của",
    remake: "Làm lại từ",
    shared: "Cùng vũ trụ",
    other: "Quan hệ khác",
  },
} as const;
