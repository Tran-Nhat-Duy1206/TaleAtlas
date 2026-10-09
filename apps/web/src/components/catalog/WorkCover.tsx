"use client";
import { useState } from "react";
import Image from "next/image";
import { branding } from "@/lib/branding";
import type { AggregateWork } from "../../features/catalog/contracts";
import type { Locale } from "../../lib/i18n";
import styles from "./catalog.module.css";
const fallback = "/images/work-placeholder.svg";
export function approvedCover(cover: AggregateWork["cover"]): string | null {
  return cover &&
    ["LICENSED", "PERMISSION", "PUBLIC_DOMAIN"].includes(cover.rights) &&
    cover.credit?.trim() &&
    cover.rightsStatement?.trim() &&
    cover.assetPath &&
    /^\/covers\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpg|jpeg|webp|avif)$/.test(
      cover.assetPath,
    )
    ? cover.assetPath
    : null;
}
export function WorkCover({
  work,
  locale,
}: {
  work: AggregateWork;
  locale: Locale;
}) {
  const approved = approvedCover(work.cover);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const placeholder = !approved || failedPath === approved;
  const label =
    locale === "vi"
      ? `Hình minh họa gốc của ${branding.name} — không phải bìa chính thức`
      : `Original ${branding.name} placeholder — not official cover artwork`;
  return (
    <figure className={styles.cover}>
      {/* Vetted local assets only: no paid transformation or remote image proxy. */}
      <Image
        unoptimized
        src={placeholder ? fallback : (approved ?? fallback)}
        alt={
          placeholder
            ? label
            : `${locale === "vi" ? "Bìa của" : "Cover of"} ${work.displayTitle}`
        }
        width={480}
        height={640}
        loading="lazy"
        onError={() => {
          if (approved) setFailedPath(approved);
        }}
      />
      <figcaption>{placeholder ? label : work.cover?.credit}</figcaption>
    </figure>
  );
}
