import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import styles from "./community.module.css";
export function Pagination({
  locale,
  page,
  count,
  busy,
  onPage,
}: {
  locale: Locale;
  page: number;
  count: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const t = communityCopy[locale];
  return (
    <nav className={styles.navigation} aria-label={t.pagination}>
      <button
        type="button"
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t.previous}
      </button>
      <span>
        {t.page} {page}
      </span>
      <button
        type="button"
        disabled={busy || count < 25 || page >= 200}
        onClick={() => onPage(page + 1)}
      >
        {t.next}
      </button>
    </nav>
  );
}
