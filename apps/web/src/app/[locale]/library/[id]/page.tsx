import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { libraryGuard } from "@/server/library/guard";
import { getLibraryEntry } from "@/server/library/service";
import { libraryCopy } from "@/components/library/copy";
import { EntryControls } from "@/components/library/EntryControls";
import { ReadingControls } from "@/components/library/ReadingControls";
import { ReadingHistory } from "@/components/library/ReadingHistory";
import {
  readingHttpEntry,
  readingSessionResponseSchema,
} from "@/features/library/reading-http-contracts";
import { WorkCover } from "@/components/catalog/WorkCover";
import styles from "@/components/library/library.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Library entry",
  robots: { index: false, follow: false },
};
export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = libraryCopy[locale],
    h = await libraryGuard(locale, `/${locale}/library/${id}`);
  if (!h)
    return (
      <section className={styles.library}>
        <p role="alert">{t.denied}</p>
      </section>
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const entry = await getLibraryEntry(id, h, locale).catch(() => null);
  if (!entry)
    return (
      <section className={styles.library}>
        <p role="alert">{t.unavailable}</p>
        <Link href={`/${locale}/library`}>{t.back}</Link>
      </section>
    );
  const reading = readingHttpEntry(entry);
  const validSession = readingSessionResponseSchema.safeParse(
    reading.readingSession,
  );
  reading.readingSession = validSession.success ? validSession.data : null;
  return (
    <section className={styles.library}>
      <Link href={`/${locale}/library`}>{t.back}</Link>
      <p>{t.private}</p>
      <h1>{entry.work.available ? entry.work.displayTitle : t.unavailable}</h1>
      {entry.work.available && (
        <>
          <div className={styles.cover}>
            <WorkCover work={entry.work} locale={locale} />
          </div>
          <Link
            href={`/${locale}/works/${encodeURIComponent(entry.work.slug)}`}
          >
            {t.catalog}
          </Link>
        </>
      )}
      <EntryControls
        key={`${entry.id}:${entry.revision}`}
        locale={locale}
        entry={{
          id: entry.id,
          workId: entry.workId,
          revision: entry.revision,
          status: entry.status,
          favorite: entry.favorite,
          hasCompletedRead: entry.hasCompletedRead,
          currentSession: entry.currentSession
            ? { state: entry.currentSession.state }
            : null,
        }}
      />
      <ReadingControls
        key={`reading:${entry.id}:${entry.revision}`}
        locale={locale}
        entry={reading}
      />
      <ReadingHistory
        key={`history:${entry.id}:${entry.revision}`}
        id={entry.id}
        locale={locale}
      />
    </section>
  );
}
