"use client";

import { useParams } from "next/navigation";
import { dictionary, isLocale } from "@/lib/i18n";
import styles from "@/components/library/library.module.css";

export default function LibraryLoading() {
  // loading.tsx receives no params prop. Read the router's selected segment,
  // not a pathname, session preference, or post-hydration language guess.
  const locale = useParams()?.locale;
  if (typeof locale !== "string" || !isLocale(locale)) return null;
  return (
    <section className={styles.library}>
      <p role="status" lang={locale}>
        {dictionary(locale).routeLoading}
      </p>
    </section>
  );
}
