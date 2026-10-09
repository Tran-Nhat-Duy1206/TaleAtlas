import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import { requestDictionary } from "../../lib/request-i18n";
import styles from "./request.module.css";
export function RequestNotice({
  locale,
  signIn = false,
  returnTo,
}: {
  locale: Locale;
  signIn?: boolean;
  returnTo?: string;
}) {
  const t = requestDictionary(locale);
  return (
    <section className={`feature ${styles.module} ${styles.card}`}>
      <h1>{t.mine}</h1>
      <p role={signIn ? undefined : "alert"}>{signIn ? t.signIn : t.error}</p>
      {signIn && (
        <>
          <Link
            className="button"
            href={`/${locale}/login?callbackURL=${encodeURIComponent(returnTo ?? `/${locale}/requests`)}`}
          >
            {t.login}
          </Link>
          {returnTo && (
            <p>
              <Link href={returnTo}>
                {locale === "vi"
                  ? "Quay lại yêu cầu (giữ thông tin đã tìm)"
                  : "Return to requests (keep your search)"}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
