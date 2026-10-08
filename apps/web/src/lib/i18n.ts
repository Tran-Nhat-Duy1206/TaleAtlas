import { branding } from "./branding";
export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return value === "en" || value === "vi";
}
const en = {
  home: "Home",
  login: "Sign in",
  register: "Create account",
  settings: "Settings",
  logout: "Sign out",
  language: "Language",
  theme: "Appearance",
  light: "Light",
  dark: "Dark",
  system: "System",
  skip: "Skip to content",
  artLabel: "A PLACE TO BEGIN",
  artCoordinate: "01 / FOUNDATION",
  artVolume: "VOL. 00",
  eyebrow: "THE FIRST CHAPTER · V0",
  headline: "Every story starts\nwith a foundation.",
  intro: `${branding.name} is taking shape. This first release gives you a secure account and a bilingual home — the groundwork for a future story discovery experience.`,
  start: "Make yourself at home",
  learn: "What’s here today",
  foundation: "A small start. Built with care.",
  foundationText:
    "No invented library. No pretend community. Just the essentials, ready to use.",
  accountTitle: "Your own starting point",
  accountText:
    "Create an account, verify your email, and manage your session securely.",
  languageTitle: "Two languages, one home",
  languageText:
    "Navigate in English or Vietnamese, with a layout that works on any screen.",
  themeTitle: "A comfortable reading space",
  themeText:
    "Choose light, dark, or your system’s appearance. Your choice stays with you.",
  future: "The next chapter is still being written.",
  futureText:
    "Story catalogs, reading lists, and community features are not part of this release.",
  footer: "An honest beginning. A thoughtful foundation.",
  email: "Email address",
  password: "Password",
  name: "Your name",
  confirmPassword: "Confirm password",
  forgot: "Forgot password?",
  forgotTitle: "A fresh start",
  forgotIntro: "We’ll email you a link to reset your password.",
  resetTitle: "Choose a new password",
  resetIntro: "Use at least 12 characters for your new password.",
  sendReset: "Send reset link",
  reset: "Reset password",
  backLogin: "Back to sign in",
  registerIntro:
    "Start with the essentials. Verify your email before signing in.",
  loginIntro: "Welcome back to your starting point.",
  noAccount: "New here?",
  hasAccount: "Already have an account?",
  working: "Please wait…",
  genericError: "We couldn’t complete that request. Please try again.",
  invalidCredentials: "Check your email and password, then try again.",
  unverified: "Please verify your email before signing in.",
  exists:
    "Unable to create this account. Try signing in or resetting your password.",
  weak: "Use a password of at least 12 characters.",
  mismatch: "The passwords don’t match.",
  invalidToken:
    "This reset link is missing or no longer valid. Request a new link.",
  resetSent:
    "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.",
  resetDone: "Your password has been reset. You can now sign in.",
  verifyTitle: "Check your inbox",
  verifyIntro:
    "Open the verification link in your email to activate your account. If you don’t see it, check your spam folder.",
  verifySent:
    "If verification is needed for this email, a new link is on its way.",
  verified: "Your email is verified. You can now sign in.",
  verificationFailed:
    "This verification link is invalid or has expired. Request a new email.",
  resend: "Send verification email",
  account: "Account",
  settingsIntro: "A little space for your account and preferences.",
  loading: "Checking your session…",
  sessionError: "We couldn’t check your session. Please try again.",
  retry: "Try again",
  signedInAs: "Signed in as",
  verifiedLabel: "Email verified",
  yes: "Yes",
  no: "Not yet",
  sessionTitle: "Your session",
  sessionText: "Sign out to end this session on this device.",
  danger: "Delete account",
  dangerText:
    "Permanently delete your account and end your sessions. This cannot be undone.",
  deleteConfirm: "I understand that deleting my account is permanent.",
  deleteAction: "Permanently delete account",
  deleteError: "Account deletion failed. Check your password and try again.",
  deleteSent:
    "Check your inbox to confirm permanent account deletion. Your account remains active until you open that link.",
  passwordHint: "At least 12 characters.",
  authNote:
    "Email verification is required. We use email only for account messages.",
  status: "TECHNICAL FOUNDATION",
  privacy: "Private account area",
  preferences: "Preferences",
};
const vi: typeof en = {
  home: "Trang chủ",
  login: "Đăng nhập",
  register: "Tạo tài khoản",
  settings: "Cài đặt",
  logout: "Đăng xuất",
  language: "Ngôn ngữ",
  theme: "Giao diện",
  light: "Sáng",
  dark: "Tối",
  system: "Hệ thống",
  skip: "Chuyển đến nội dung",
  artLabel: "NƠI KHỞI ĐẦU",
  artCoordinate: "01 / NỀN TẢNG",
  artVolume: "TẬP 00",
  eyebrow: "CHƯƠNG ĐẦU TIÊN · V0",
  headline: "Mỗi câu chuyện bắt đầu\ntừ một nền tảng.",
  intro: `${branding.name} đang dần thành hình. Phiên bản đầu tiên mang đến tài khoản bảo mật và không gian song ngữ — nền tảng cho trải nghiệm khám phá truyện trong tương lai.`,
  start: "Bắt đầu hành trình",
  learn: "Những gì có hôm nay",
  foundation: "Khởi đầu nhỏ. Chăm chút từng bước.",
  foundationText:
    "Không thư viện hư cấu. Không cộng đồng giả. Chỉ những tính năng thiết yếu, sẵn sàng sử dụng.",
  accountTitle: "Điểm khởi đầu của riêng bạn",
  accountText:
    "Tạo tài khoản, xác minh email và quản lý phiên đăng nhập an toàn.",
  languageTitle: "Hai ngôn ngữ, một mái nhà",
  languageText:
    "Sử dụng tiếng Anh hoặc tiếng Việt, với giao diện phù hợp mọi màn hình.",
  themeTitle: "Không gian dễ chịu",
  themeText:
    "Chọn giao diện sáng, tối hoặc theo hệ thống. Lựa chọn của bạn được lưu lại.",
  future: "Chương tiếp theo vẫn đang được viết.",
  futureText:
    "Danh mục truyện, danh sách đọc và tính năng cộng đồng chưa có trong phiên bản này.",
  footer: "Khởi đầu chân thật. Nền tảng chu đáo.",
  email: "Địa chỉ email",
  password: "Mật khẩu",
  name: "Tên của bạn",
  confirmPassword: "Xác nhận mật khẩu",
  forgot: "Quên mật khẩu?",
  forgotTitle: "Một khởi đầu mới",
  forgotIntro: "Chúng tôi sẽ gửi liên kết đặt lại mật khẩu qua email.",
  resetTitle: "Chọn mật khẩu mới",
  resetIntro: "Dùng ít nhất 12 ký tự cho mật khẩu mới.",
  sendReset: "Gửi liên kết đặt lại",
  reset: "Đặt lại mật khẩu",
  backLogin: "Về trang đăng nhập",
  registerIntro:
    "Bắt đầu với những điều thiết yếu. Xác minh email trước khi đăng nhập.",
  loginIntro: "Chào mừng bạn trở lại.",
  noAccount: "Bạn mới đến?",
  hasAccount: "Đã có tài khoản?",
  working: "Vui lòng chờ…",
  genericError: "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
  invalidCredentials: "Kiểm tra email và mật khẩu rồi thử lại.",
  unverified: "Vui lòng xác minh email trước khi đăng nhập.",
  exists:
    "Không thể tạo tài khoản này. Hãy thử đăng nhập hoặc đặt lại mật khẩu.",
  weak: "Mật khẩu cần ít nhất 12 ký tự.",
  mismatch: "Hai mật khẩu không trùng nhau.",
  invalidToken:
    "Liên kết đặt lại bị thiếu hoặc không còn hợp lệ. Hãy yêu cầu liên kết mới.",
  resetSent:
    "Nếu email này có tài khoản, liên kết đặt lại sẽ được gửi. Kiểm tra hộp thư và thư rác.",
  resetDone: "Mật khẩu đã được đặt lại. Bạn có thể đăng nhập.",
  verifyTitle: "Kiểm tra hộp thư",
  verifyIntro:
    "Mở liên kết xác minh trong email để kích hoạt tài khoản. Nếu chưa thấy, hãy kiểm tra thư rác.",
  verifySent: "Nếu email này cần xác minh, liên kết mới sẽ được gửi.",
  verified: "Email đã được xác minh. Bạn có thể đăng nhập.",
  verificationFailed:
    "Liên kết xác minh không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.",
  resend: "Gửi email xác minh",
  account: "Tài khoản",
  settingsIntro: "Không gian dành cho tài khoản và tùy chọn của bạn.",
  loading: "Đang kiểm tra phiên đăng nhập…",
  sessionError: "Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.",
  retry: "Thử lại",
  signedInAs: "Đăng nhập với",
  verifiedLabel: "Email đã xác minh",
  yes: "Có",
  no: "Chưa",
  sessionTitle: "Phiên đăng nhập",
  sessionText: "Đăng xuất để kết thúc phiên trên thiết bị này.",
  danger: "Xóa tài khoản",
  dangerText:
    "Xóa vĩnh viễn tài khoản và kết thúc các phiên đăng nhập. Không thể hoàn tác.",
  deleteConfirm: "Tôi hiểu rằng việc xóa tài khoản là vĩnh viễn.",
  deleteAction: "Xóa tài khoản vĩnh viễn",
  deleteError: "Không thể xóa tài khoản. Kiểm tra mật khẩu và thử lại.",
  deleteSent:
    "Kiểm tra hộp thư để xác nhận xóa tài khoản vĩnh viễn. Tài khoản vẫn hoạt động cho đến khi bạn mở liên kết đó.",
  passwordHint: "Ít nhất 12 ký tự.",
  authNote: "Cần xác minh email. Email chỉ được dùng cho thông báo tài khoản.",
  status: "NỀN TẢNG KỸ THUẬT",
  privacy: "Khu vực tài khoản riêng tư",
  preferences: "Tùy chọn",
};
export function dictionary(locale: Locale) {
  return locale === "vi" ? vi : en;
}
