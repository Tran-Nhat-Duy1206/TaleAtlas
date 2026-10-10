import { z } from "zod";
import { sourceSchema } from "./contracts";

export const exactReleaseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    if (value < "0001-01-01" || value > "9999-12-31") return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "An exact valid calendar day is required");
export const releaseInputSchema = z
  .object({
    workId: z.uuid(),
    workRevision: z.number().int().positive(),
    releaseDate: exactReleaseDateSchema,
    language: z
      .string()
      .max(35)
      .regex(/^(?:und|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/),
    label: z.string().trim().min(1).max(300),
    source: sourceSchema,
    releaseReviewAcknowledged: z.literal(true),
  })
  .strict();
export const discoveryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(30).default(20),
    locale: z.enum(["en", "vi"]).default("en"),
  })
  .strict();
export const releaseQuerySchema = discoveryQuerySchema
  .extend({
    from: exactReleaseDateSchema.optional(),
    to: exactReleaseDateSchema.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "Date range is reversed");
export const discoveryCopy = {
  en: {
    recent: "Recently Added",
    releases: "Verified Releases",
    empty: "No verified records yet.",
    recentNote:
      "Ordered by first human-reviewed publication in TaleAtlas, not an inferred book release date.",
    releaseNote:
      "Exact release dates manually checked against cited evidence. Unknown dates and publication years are not converted into release events.",
    source: "Evidence",
    verified: "Reviewed",
    date: "Release date",
    language: "Language",
    next: "Next",
    previous: "Previous",
  },
  vi: {
    recent: "Mới thêm",
    releases: "Phát hành đã xác minh",
    empty: "Chưa có bản ghi đã xác minh.",
    recentNote:
      "Sắp xếp theo lần xuất bản đầu tiên được con người duyệt trên TaleAtlas, không phải ngày phát hành sách suy đoán.",
    releaseNote:
      "Ngày phát hành chính xác được kiểm tra thủ công theo dẫn chứng. Không chuyển ngày chưa rõ hoặc năm xuất bản thành sự kiện phát hành.",
    source: "Dẫn chứng",
    verified: "Đã duyệt",
    date: "Ngày phát hành",
    language: "Ngôn ngữ",
    next: "Tiếp",
    previous: "Trước",
  },
};
