"use client";
import Image from "next/image";
import { useState } from "react";
import { approvedCover } from "@/components/catalog/WorkCover";
import type { AggregateWork } from "@/features/catalog/contracts";
import type { Locale } from "@/lib/i18n";
import { branding } from "@/lib/branding";
export function LibraryCover({
  work,
  locale,
}: {
  work: Pick<AggregateWork, "cover" | "displayTitle">;
  locale: Locale;
}) {
  const path = approvedCover(work.cover),
    [failed, setFailed] = useState<string | null>(null);
  const placeholder = !path || failed === path;
  const label =
    locale === "vi"
      ? `Hình minh họa gốc của ${branding.name} — không phải bìa chính thức`
      : `Original ${branding.name} placeholder — not official cover artwork`;
  return (
    <figure>
      <Image
        unoptimized
        src={placeholder ? "/images/work-placeholder.svg" : path!}
        alt={
          placeholder
            ? label
            : `${locale === "vi" ? "Bìa của" : "Cover of"} ${work.displayTitle}`
        }
        width={120}
        height={160}
        loading="lazy"
        onError={() => setFailed(path)}
      />
      <figcaption>{placeholder ? label : work.cover?.credit}</figcaption>
    </figure>
  );
}
