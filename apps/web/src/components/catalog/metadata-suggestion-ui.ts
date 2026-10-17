import type { SubmitMetadataProposal } from "@/features/catalog/metadata-operations";
import type { MetadataTarget } from "@/features/catalog/metadata-suggestion-contracts";

export const metadataCopy = {
  en: {
    heading: "Suggest a metadata change",
    mine: "My metadata suggestions",
    review: "Review metadata suggestions",
    legacy: "Six-field corrections",
    advanced: "Additional titles, descriptions and genres",
    operation: "One metadata operation",
    language: "Exact language code",
    kind: "Title kind",
    target: "Target row UUID",
    title: "Title",
    description: "Description",
    genre: "Existing genre slug",
    currentValue: "Current target value",
    none: "No current value",
    removeReason: "Why should this assertion be removed?",
    originality:
      "I wrote this original summary; it is not copied third-party text",
    statement: "Original-summary declaration",
    rights: "Original-summary review",
    rightsNote:
      "A declaration and citation do not prove copyright permission. Do not copy third-party summaries.",
    rightsAck: "I reviewed originality, source and publication rights",
    protected:
      "Canonical PRIMARY and ORIGINAL titles are protected. Replacement changes text only; UUID, language and kind stay unchanged.",
    existing:
      "Use an existing curated genre slug. This workflow cannot create or rename genres.",
    invalid:
      "Check the selected target, text, exact language, citation and required originality or review acknowledgments.",
    erased:
      "Private proposal content was erased. It cannot be restored or reviewed.",
    removedReason:
      "The review reason was erased under the account-erasure policy.",
    uncertainReview:
      "The review outcome is uncertain. Reload its status before taking another action.",
    rate: "Too many requests. Retry this same attempt later.",
    emptyTargets: "No eligible target is available for this operation.",
    private:
      "Unreviewed content is private to its owner and catalog administrators.",
    operations: {
      TITLE_ADD: "Add an additional title",
      TITLE_REPLACE: "Replace additional title text",
      TITLE_REMOVE: "Remove an additional title",
      DESCRIPTION_ADD: "Add a language description",
      DESCRIPTION_REPLACE: "Replace a language description",
      DESCRIPTION_REMOVE: "Remove a language description",
      GENRE_ADD_MEMBERSHIP: "Add an existing genre membership",
      GENRE_REMOVE_MEMBERSHIP: "Remove a genre membership",
    },
    kinds: {
      PRIMARY: "Secondary primary title",
      ALIAS: "Alias",
      ORIGINAL: "Original title",
    },
  },
  vi: {
    heading: "Đề xuất thay đổi thông tin",
    mine: "Đề xuất thông tin của tôi",
    review: "Duyệt đề xuất thông tin",
    legacy: "Chỉnh sửa sáu trường",
    advanced: "Tên bổ sung, mô tả và thể loại",
    operation: "Một thao tác thông tin",
    language: "Mã ngôn ngữ chính xác",
    kind: "Loại tên",
    target: "UUID dòng đích",
    title: "Tên",
    description: "Mô tả",
    genre: "Mã thể loại hiện có",
    currentValue: "Giá trị hiện tại của đích",
    none: "Chưa có giá trị",
    removeReason: "Vì sao cần xóa thông tin này?",
    originality:
      "Tôi tự viết bản tóm tắt này, không sao chép văn bản của bên thứ ba",
    statement: "Tuyên bố về bản tóm tắt tự viết",
    rights: "Xét duyệt bản tóm tắt tự viết",
    rightsNote:
      "Tuyên bố và trích dẫn không chứng minh quyền tác giả. Không sao chép bản tóm tắt của bên thứ ba.",
    rightsAck: "Tôi đã xem xét tính nguyên gốc, nguồn và quyền công bố",
    protected:
      "Tên PRIMARY chuẩn và ORIGINAL được bảo vệ. Thay thế chỉ đổi văn bản; giữ nguyên UUID, ngôn ngữ và loại tên.",
    existing:
      "Dùng mã thể loại đã được biên tập. Không thể tạo hoặc đổi tên thể loại tại đây.",
    invalid:
      "Kiểm tra đích, văn bản, mã ngôn ngữ chính xác, trích dẫn và các xác nhận về tính nguyên gốc hoặc xét duyệt.",
    erased:
      "Nội dung riêng tư của đề xuất đã được xóa. Không thể khôi phục hoặc xét duyệt.",
    removedReason: "Lý do xét duyệt đã được xóa theo chính sách xóa tài khoản.",
    uncertainReview:
      "Chưa xác định được kết quả xét duyệt. Tải lại trạng thái trước khi thực hiện thao tác khác.",
    rate: "Quá nhiều yêu cầu. Hãy thử lại đúng lần gửi này sau.",
    emptyTargets: "Không có đích hợp lệ cho thao tác này.",
    private:
      "Chỉ người gửi và quản trị viên danh mục được xem nội dung chưa xét duyệt.",
    operations: {
      TITLE_ADD: "Thêm tên bổ sung",
      TITLE_REPLACE: "Thay văn bản tên bổ sung",
      TITLE_REMOVE: "Xóa tên bổ sung",
      DESCRIPTION_ADD: "Thêm mô tả theo ngôn ngữ",
      DESCRIPTION_REPLACE: "Thay mô tả theo ngôn ngữ",
      DESCRIPTION_REMOVE: "Xóa mô tả theo ngôn ngữ",
      GENRE_ADD_MEMBERSHIP: "Thêm thể loại hiện có",
      GENRE_REMOVE_MEMBERSHIP: "Xóa liên kết thể loại",
    },
    kinds: {
      PRIMARY: "Tên chính bổ sung",
      ALIAS: "Tên gọi khác",
      ORIGINAL: "Tên gốc",
    },
  },
};
export type MetadataOperation = SubmitMetadataProposal["operation"];
export const metadataOperationTypes = Object.keys(
  metadataCopy.en.operations,
) as MetadataOperation["type"][];
export function eligibleMetadataTitles(target: MetadataTarget) {
  return target.titles.filter(
    (row) =>
      row.kind !== "ORIGINAL" &&
      !(
        row.kind === "PRIMARY" &&
        row.language === target.work.primaryTitleLanguage &&
        row.title === target.work.primaryTitle
      ),
  );
}
export function currentMetadataValue(
  operation: MetadataOperation,
  target: MetadataTarget | null,
): string | null {
  if (!target) return null;
  switch (operation.type) {
    case "TITLE_ADD":
      return null;
    case "TITLE_REPLACE":
    case "TITLE_REMOVE": {
      const row = target.titles.find((t) => t.id === operation.titleId);
      return row ? `${row.title} · ${row.language} · ${row.kind}` : null;
    }
    case "DESCRIPTION_ADD":
    case "DESCRIPTION_REPLACE":
    case "DESCRIPTION_REMOVE":
      return (
        target.descriptions.find((d) => d.language === operation.language)
          ?.text ?? null
      );
    case "GENRE_ADD_MEMBERSHIP":
    case "GENRE_REMOVE_MEMBERSHIP":
      return target.genreMemberships.some((g) => g.slug === operation.slug)
        ? operation.slug
        : null;
  }
}
