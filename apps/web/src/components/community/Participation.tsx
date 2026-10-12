import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
export function Participation({
  locale,
  participation,
}: {
  locale: Locale;
  participation: "VERIFIED" | "ANONYMOUS" | "UNVERIFIED";
}) {
  const t = communityCopy[locale];
  return (
    <>
      <p>{t.publicNotice}</p>
      <Link prefetch={false} href={`/${locale}/community/manage`}>
        {t.manage}
      </Link>
      {participation === "ANONYMOUS" && (
        <Link prefetch={false} href={`/${locale}/login`}>
          {t.login}
        </Link>
      )}
      {participation === "UNVERIFIED" && (
        <Link prefetch={false} href={`/${locale}/verify-email`}>
          {t.verify}
        </Link>
      )}
    </>
  );
}
