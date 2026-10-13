import { communityCopy } from "./community-i18n";
import type { Locale } from "./i18n";

const en = {
  ...communityCopy.en,
  reviews: "Public reviews",
  manage: "Manage my public reviews",
  back: "Back to work",
  newReview: "Write a public review",
  review: "Public review",
  reviewBody: "Public review text",
  reviewBodyHelp:
    "Write 20–8000 plain-text characters. Nothing is imported from your private library.",
  emptyReviews: "No public reviews yet.",
  reviewCount: "Visible reviews",
  ratedReviewCount: "Visible rated reviews",
  meanRating: "Average public rating",
  unrated: "Unrated",
  rating: "Independent public rating",
  chooseRating: "Choose a rating or explicitly choose unrated",
  ratingHelp:
    "Choose unrated or 1–5 in half-point steps. This public choice is independent of private ratings and review spoilers.",
  statsNotice:
    "Counts and the average include only active, visible reviews of this currently published work. Unrated reviews count as reviews, not as zero ratings. These are not private reading or engagement statistics.",
  reserved:
    "You already have a reserved review slot for this work. Manage the UUID metadata below. A moderated review keeps its slot even after withdrawal; withdrawal does not bypass moderation.",
  ownedReviewNotice:
    "Ownership metadata only: no review text, rating, catalog title, identity, dates or history is loaded. Withdrawal is available for eligible owned reviews even when the work is unavailable.",
  replacementRatingNotice:
    "Start with blank replacement text and a fresh rating choice, including an explicit unrated choice. Neither the previous review nor its rating is loaded or preserved.",
  loadOwned: "Reload my review metadata",
};
const vi: typeof en = {
  ...communityCopy.vi,
  reviews: "Bài đánh giá công khai",
  manage: "Quản lý bài đánh giá công khai của tôi",
  back: "Về tác phẩm",
  newReview: "Viết bài đánh giá công khai",
  review: "Bài đánh giá công khai",
  reviewBody: "Văn bản đánh giá công khai",
  reviewBodyHelp:
    "Viết 20–8000 ký tự văn bản thuần. Không nhập dữ liệu từ thư viện riêng của bạn.",
  emptyReviews: "Chưa có bài đánh giá công khai.",
  reviewCount: "Bài đánh giá đang hiển thị",
  ratedReviewCount: "Bài đánh giá có điểm đang hiển thị",
  meanRating: "Điểm công khai trung bình",
  unrated: "Chưa chấm điểm",
  rating: "Điểm công khai được chọn độc lập",
  chooseRating: "Chọn điểm hoặc chủ ý chọn chưa chấm điểm",
  ratingHelp:
    "Chọn chưa chấm điểm hoặc điểm từ 1 đến 5, theo bước nửa điểm. Lựa chọn công khai này độc lập với điểm riêng và phần tiết lộ của bài đánh giá.",
  statsNotice:
    "Số lượng và điểm trung bình chỉ tính bài đánh giá còn hoạt động, đang hiển thị của tác phẩm hiện được xuất bản. Bài chưa chấm điểm được tính là bài đánh giá, không phải điểm 0. Đây không phải thống kê đọc riêng hay tương tác.",
  reserved:
    "Bạn đã có một vị trí đánh giá được giữ cho tác phẩm này. Quản lý thông tin UUID bên dưới. Bài bị kiểm duyệt vẫn giữ vị trí ngay cả sau khi rút; rút bài không né được kiểm duyệt.",
  ownedReviewNotice:
    "Chỉ thông tin sở hữu: không tải văn bản đánh giá, điểm, tên tác phẩm, danh tính, ngày tháng hay lịch sử. Có thể rút bài thuộc sở hữu và đủ điều kiện kể cả khi tác phẩm không khả dụng.",
  replacementRatingNotice:
    "Bắt đầu bằng văn bản thay thế trống và chọn điểm mới, kể cả chủ ý chọn chưa chấm điểm. Không tải hay giữ lại bài đánh giá hoặc điểm trước đó.",
  loadOwned: "Tải lại thông tin sở hữu bài đánh giá",
};
export const reviewCopy: Record<Locale, typeof en> = { en, vi };
