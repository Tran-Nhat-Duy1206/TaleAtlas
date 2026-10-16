import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";

/** Advisory links only; private pages and every API independently recheck persisted authority. */
export function ModerationNavigation({
  locale,
  verified,
  moderator,
}: {
  locale: Locale;
  verified: boolean;
  moderator: boolean;
}) {
  if (!verified) return null;
  const t = moderationCopy[locale];
  return (
    <>
      <a href={`/${locale}/community/reports/manage`}>{t.reports}</a>
      {moderator && (
        <a href={`/${locale}/community/moderation`}>{t.moderation}</a>
      )}
    </>
  );
}
