"use client";
import { useEffect, useRef, useState } from "react";
import {
  ownedReportListResponseSchema,
  ownedReportSchema,
  type OwnedReportDTO,
  type OwnedReportListResponseDTO,
} from "../../features/community/moderation-http-contracts";
import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import { useReviewPages } from "./ReviewList";
import { Pagination } from "./Pagination";
import styles from "./community.module.css";

export type ReportOwnerManageProps = {
  locale: Locale;
  initial: OwnedReportListResponseDTO;
};
function validate(data: OwnedReportListResponseDTO) {
  if (new Set(data.items.map((item) => item.id)).size !== data.items.length)
    throw new CommunityClientError(0, true);
}
export function ReportOwnerManage(props: ReportOwnerManageProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  if (source.initial !== props.initial)
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  try {
    validate(ownedReportListResponseSchema.parse(props.initial));
  } catch {
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedReportOwnerManage
      key={`${props.locale}:${source.epoch}`}
      {...props}
    />
  );
}
function ScopedReportOwnerManage({ locale, initial }: ReportOwnerManageProps) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale];
  const list = useReviewPages(
    initial,
    ownedReportListResponseSchema,
    validate,
    (data) => {
      const last = data.items.at(-1);
      return last ? { id: last.id, timestamp: null } : null;
    },
    "/api/community/reports/owned",
    locale,
  );
  function reload(page = list.page) {
    if (ready && !list.busy) void list.load(page);
  }
  return (
    <section className={styles.community}>
      <h1>{t.reports}</h1>
      <p>{t.reportNotice}</p>
      <p>{t.privacyNotice}</p>
      <button
        type="button"
        disabled={!ready || list.busy}
        onClick={() => reload()}
      >
        {t.refreshReport}
      </button>
      {list.busy && <p role="status">{t.loading}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.items.length === 0 && <p>{t.emptyReports}</p>}
      {list.data?.items.map((item) => (
        <OwnedReportCard
          key={`${item.id}:${item.revision}:${list.refreshToken}`}
          locale={locale}
          initial={item}
        />
      ))}
      <Pagination
        locale={locale}
        page={list.page}
        count={list.data?.items.length ?? 0}
        busy={list.busy}
        onPage={reload}
      />
    </section>
  );
}
function OwnedReportCard({
  locale,
  initial,
}: {
  locale: Locale;
  initial: OwnedReportDTO;
}) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale];
  const [data, setData] = useState<OwnedReportDTO | null>(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function refresh() {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setData(null);
    setMessage("");
    try {
      const result = await communityRequest(
        `/api/community/reports/${initial.id}/owned?locale=${locale}`,
        ownedReportSchema,
      );
      if (
        result.id !== initial.id ||
        result.workId !== initial.workId ||
        result.contentId !== initial.contentId ||
        result.contentKind !== initial.contentKind ||
        result.revision < initial.revision
      )
        throw new CommunityClientError(0, true);
      if (mounted.current) setData(result);
    } catch (error) {
      if (mounted.current) setMessage(errorCopy(error, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <article className={styles.card} aria-label={`${t.reportId} ${initial.id}`}>
      {data && (
        <>
          <dl className={styles.meta}>
            <dt>{t.reportId}</dt>
            <dd>{data.id}</dd>
            <dt>{t.reportState}</dt>
            <dd>
              {data.state === "OPEN"
                ? t.open
                : data.state === "DISMISSED"
                  ? t.dismissed
                  : t.upheld}
            </dd>
            <dt>{t.reportRevision}</dt>
            <dd>{data.revision}</dd>
            <dt>{t.work}</dt>
            <dd>{data.workId}</dd>
            <dt>{t.content}</dt>
            <dd>{data.contentId}</dd>
            <dt>{t.revision}</dt>
            <dd>{data.targetRevision}</dd>
          </dl>
          <p>{data.workAvailable ? t.available : t.unavailable}</p>
          <p>
            {data.targetAuthorState === "ACTIVE"
              ? t.active
              : data.targetAuthorState === "DELETED"
                ? t.deleted
                : t.erased}
          </p>
          <p>
            {data.targetModerationState === "VISIBLE" ? t.visible : t.hidden}
          </p>
        </>
      )}
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void refresh()}
      >
        {t.refreshReport}
      </button>
      {message && <p role="alert">{message}</p>}
    </article>
  );
}
