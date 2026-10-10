"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  exactReleaseDateSchema,
  releaseInputSchema,
} from "@/features/catalog/discovery";
import type { Locale } from "@/lib/i18n";
import styles from "./admin.module.css";

export const releaseFormCopy = {
  en: {
    work: "Published work",
    id: "Work UUID",
    revision: "Reviewed work revision",
    snapshot: "Current work evidence (compare before recording a release)",
    date: "Exact release date",
    language: "Release language code",
    label: "Release label",
    sourceLabel: "Evidence label",
    citation: "Evidence citation",
    url: "Evidence HTTPS URL (optional)",
    note: "Record only a known exact calendar day. Do not infer a date from a publication year or an approximate date. If uncertain or unknown, do not submit.",
    acknowledge:
      "I manually verified this exact release day against the cited permitted source.",
    submit: "Record verified release",
    pending: "Recording…",
    invalid:
      "Check every field and explicitly acknowledge your manual review before submitting.",
    error:
      "The release could not be confirmed. Reload the published work and review its current revision before trying again.",
    done: "Verified release recorded. Confirmed record ID:",
  },
  vi: {
    work: "Tác phẩm đã xuất bản",
    id: "UUID tác phẩm",
    revision: "Phiên bản tác phẩm đã đối chiếu",
    snapshot:
      "Dẫn chứng hiện tại của tác phẩm (đối chiếu trước khi ghi nhận phát hành)",
    date: "Ngày phát hành chính xác",
    language: "Mã ngôn ngữ phát hành",
    label: "Nhãn phát hành",
    sourceLabel: "Nhãn dẫn chứng",
    citation: "Trích dẫn dẫn chứng",
    url: "URL HTTPS dẫn chứng (không bắt buộc)",
    note: "Chỉ ghi nhận ngày lịch chính xác đã biết. Không suy đoán ngày từ năm xuất bản hoặc ngày ước chừng. Nếu không chắc chắn hoặc chưa rõ, không gửi.",
    acknowledge:
      "Tôi đã kiểm tra thủ công ngày phát hành chính xác này theo nguồn được phép đã trích dẫn.",
    submit: "Ghi nhận phát hành đã xác minh",
    pending: "Đang ghi nhận…",
    invalid:
      "Kiểm tra tất cả các trường và xác nhận rõ việc kiểm tra thủ công trước khi gửi.",
    error:
      "Không thể xác nhận bản ghi phát hành. Tải lại tác phẩm đã xuất bản và đối chiếu phiên bản hiện tại trước khi thử lại.",
    done: "Đã ghi nhận phát hành đã xác minh. ID bản ghi được xác nhận:",
  },
} as const;

const responseSchema = z
  .object({ id: z.uuid(), releaseDate: exactReleaseDateSchema })
  .strict();
export function ReleaseForm({
  locale,
  work,
}: {
  locale: Locale;
  work: {
    id: string;
    revision: number;
    title: string;
    source: { label: string; citation: string; url?: string | null };
  };
}) {
  const d = releaseFormCopy[locale];
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmedId, setConfirmedId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    setConfirmedId("");
    const data = new FormData(event.currentTarget);
    const url = String(data.get("sourceUrl") ?? "").trim();
    const input = releaseInputSchema.safeParse({
      workId: work.id,
      workRevision: work.revision,
      releaseDate: data.get("releaseDate"),
      language: data.get("language"),
      label: data.get("label"),
      source: {
        label: data.get("sourceLabel"),
        citation: data.get("citation"),
        ...(url ? { url } : {}),
      },
      releaseReviewAcknowledged: data.get("acknowledged") === "on",
    });
    if (!input.success) {
      setError(d.invalid);
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/admin/catalog/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const body: unknown = await response.json();
      const parsed = responseSchema.safeParse(body);
      if (
        !response.ok ||
        response.status !== 200 ||
        !parsed.success ||
        parsed.data.releaseDate !== input.data.releaseDate
      )
        throw new Error("Unconfirmed release");
      setConfirmedId(parsed.data.id);
      router.refresh();
    } catch {
      setError(d.error);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>
        {d.work}: {work.title}
      </h2>
      <label className={styles.field}>
        {d.id}
        <input value={work.id} readOnly />
      </label>
      <label className={styles.field}>
        {d.revision}
        <input value={work.revision} readOnly />
      </label>
      <section aria-label={d.snapshot}>
        <h3>{d.snapshot}</h3>
        <p>{work.source.label}</p>
        <p>{work.source.citation}</p>
        {work.source.url && <p>{work.source.url}</p>}
      </section>
      <p id="release-exact-day-note">{d.note}</p>
      <fieldset disabled={pending}>
        <legend>{d.submit}</legend>
        <label className={styles.field}>
          {d.date}
          <input
            name="releaseDate"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            required
            aria-describedby="release-exact-day-note"
          />
        </label>
        <label className={styles.field}>
          {d.language}
          <input name="language" maxLength={35} required />
        </label>
        <label className={styles.field}>
          {d.label}
          <input name="label" maxLength={300} required />
        </label>
        <label className={styles.field}>
          {d.sourceLabel}
          <input name="sourceLabel" maxLength={200} required />
        </label>
        <label className={styles.field}>
          {d.citation}
          <textarea name="citation" maxLength={4000} required />
        </label>
        <label className={styles.field}>
          {d.url}
          <input name="sourceUrl" type="url" maxLength={2000} />
        </label>
        <label className={styles.review}>
          <input name="acknowledged" type="checkbox" required />
          {d.acknowledge}
        </label>
        <button type="submit">{pending ? d.pending : d.submit}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {confirmedId && (
        <p role="status">
          {d.done} {confirmedId}
        </p>
      )}
    </form>
  );
}
