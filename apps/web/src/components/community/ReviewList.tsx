"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  communityQuerySchema,
  communityUuidSchema,
} from "../../features/community/contracts";
import {
  reviewListResponseSchema,
  reviewSlotResponseSchema,
  requireReviewScope,
  type ReviewOwnedDTO,
  type ReviewPublicDTO,
} from "../../features/community/review-http-contracts";
import type { Locale } from "../../lib/i18n";
import { reviewCopy } from "../../lib/review-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import { ReviewBody } from "./ReviewBody";
import { ReportAction } from "./ReportAction";
import { useReportLocks } from "./useReportLocks";
import { ReviewForm } from "./ReviewForm";
import { ReviewOwnerActions } from "./ReviewOwnerActions";
import { Pagination } from "./Pagination";
import styles from "./community.module.css";

export type ReviewListData = z.infer<typeof reviewListResponseSchema>;
export type ReviewListProps = {
  locale: Locale;
  workId: string;
  workSlug: string;
  initial: ReviewListData;
  participation: "VERIFIED" | "ANONYMOUS" | "UNVERIFIED";
};
type Cursor = { id: string; timestamp: string | null };
/** Shared review pagination: deliberate reads only, snapshot-bound keysets, no hydration effects. */
export function useReviewPages<
  T extends { items: readonly unknown[]; pageSize: 25 },
>(
  initial: T,
  schema: z.ZodType<T>,
  validate: (data: T) => void,
  lastCursor: (data: T) => Cursor | null,
  path: string,
  locale: Locale,
) {
  const ready = useCommunityReady();
  const [data, setData] = useState<T | null>(() => {
    const parsed = schema.parse(initial);
    validate(parsed);
    return parsed;
  });
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const lock = useRef(false),
    mounted = useRef(true),
    cursors = useRef<(Cursor | null)[]>([null]);
  const current = useRef(data),
    currentPage = useRef(1);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load(nextPage = currentPage.current) {
    if (!ready || lock.current) return;
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > 200) return;
    let cursor: Cursor | null;
    if (nextPage === 1) cursor = null;
    else if (
      nextPage === currentPage.current + 1 &&
      current.current?.items.length === 25
    )
      cursor = lastCursor(current.current);
    else cursor = cursors.current[nextPage - 1] ?? null;
    if (nextPage !== 1 && cursor === null) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setData(null);
    current.current = null;
    setRefreshToken((value) => value + 1);
    try {
      const query = communityQuerySchema.parse({
        locale,
        ...(cursor ? { cursor } : { page: 1 }),
      });
      const params = new URLSearchParams({ locale: query.locale });
      if (query.cursor) {
        params.set("cursorId", query.cursor.id);
        params.set("cursorTimestamp", query.cursor.timestamp ?? "null");
      }
      const result = await communityRequest(
        `${path}?${params.toString()}`,
        schema,
      );
      validate(result);
      if (mounted.current) {
        // Discard later cursors after refreshing a snapshot; never mix pages from stale ordering.
        cursors.current =
          nextPage === 1
            ? [null]
            : [...cursors.current.slice(0, nextPage - 1), cursor];
        current.current = result;
        currentPage.current = nextPage;
        setPage(nextPage);
        setData(result);
      }
    } catch (failure) {
      if (mounted.current) setError(errorCopy(failure, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { data, page, busy, error, refreshToken, load };
}
function validateReviews(data: ReviewListData, workId: string) {
  if (communityUuidSchema.parse(workId) !== workId)
    throw new CommunityClientError(0, true);
  const ids = new Set<string>();
  for (const item of data.items) {
    requireReviewScope(item, workId);
    if (ids.has(item.id)) throw new CommunityClientError(0, true);
    ids.add(item.id);
  }
}
export function ReviewList(props: ReviewListProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  if (source.initial !== props.initial)
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  try {
    validateReviews(
      reviewListResponseSchema.parse(props.initial),
      props.workId,
    );
  } catch {
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedReviewList
      key={`${props.locale}:${props.workId}:${props.participation}:${source.epoch}`}
      {...props}
    />
  );
}
function reviewCursor(data: ReviewListData): Cursor | null {
  const item = data.items.at(-1);
  return item
    ? {
        id: item.id,
        timestamp: item.state === "ACTIVE" ? item.lastActivityAt : null,
      }
    : null;
}
function ScopedReviewList({
  locale,
  workId,
  workSlug,
  initial,
  participation,
}: ReviewListProps) {
  const ready = useCommunityReady(),
    t = reviewCopy[locale];
  const [creating, setCreating] = useState(false),
    [slot, setSlot] = useState<ReviewOwnedDTO | null>(null);
  const [slotBusy, setSlotBusy] = useState(false),
    [ownerLocked, setOwnerLocked] = useState(false),
    [message, setMessage] = useState("");
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const reports = useReportLocks();
  const slotLock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const list = useReviewPages(
    initial,
    reviewListResponseSchema,
    (value) => validateReviews(value, workId),
    reviewCursor,
    `/api/community/works/${workId}/reviews`,
    locale,
  );
  const blocked =
    list.busy || slotBusy || creating || ownerLocked || reports.count > 0;
  async function slotMetadata() {
    const result = await communityRequest(
      `/api/community/works/${workId}/reviews/owned?locale=${locale}`,
      reviewSlotResponseSchema,
    );
    if (result.item) requireReviewScope(result.item, workId);
    return result.item;
  }
  async function start() {
    if (
      !ready ||
      participation !== "VERIFIED" ||
      blocked ||
      reports.blocked() ||
      slotLock.current ||
      !list.data
    )
      return;
    slotLock.current = true;
    setSlotBusy(true);
    setMessage("");
    setSlot(null);
    setBodyEpoch((value) => value + 1);
    try {
      const metadata = await slotMetadata();
      if (mounted.current) {
        setSlot(metadata);
        setCreating(metadata === null);
      }
    } catch (error) {
      if (mounted.current) setMessage(errorCopy(error, locale));
    } finally {
      slotLock.current = false;
      if (mounted.current) setSlotBusy(false);
    }
  }
  async function restartCreate() {
    if (!ready || participation !== "VERIFIED" || slotLock.current)
      throw new CommunityClientError(0);
    slotLock.current = true;
    setSlotBusy(true);
    try {
      const metadata = await slotMetadata();
      if (mounted.current) {
        setCreating(false);
        setSlot(metadata);
        setMessage("");
      }
    } finally {
      slotLock.current = false;
      if (mounted.current) setSlotBusy(false);
    }
  }
  function reload(page = list.page) {
    if (!ready || blocked || reports.blocked() || slotLock.current) return;
    setCreating(false);
    setSlot(null);
    setMessage("");
    void list.load(page);
  }
  function complete(outcome: "UPDATED" | "WITHDRAWN" = "UPDATED") {
    if (!ready) return;
    setCreating(false);
    setSlot(null);
    setOwnerLocked(false);
    setMessage(outcome === "WITHDRAWN" ? t.withdrawn : t.success);
    void list.load(1);
  }
  function ownerLock(locked: boolean) {
    setOwnerLocked(locked);
    // Ownership actions do not reuse a previously revealed public body, including across revision changes.
    if (locked) setBodyEpoch((value) => value + 1);
  }
  const number = new Intl.NumberFormat(locale);
  const average = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <section
      className={styles.community}
      onClickCapture={
        reports.count > 0
          ? (event) => {
              if (
                reports.blocked() &&
                event.target instanceof Element &&
                event.target.closest("a")
              )
                event.preventDefault();
            }
          : undefined
      }
    >
      <h1>{t.reviews}</h1>
      <p>{t.publicNotice}</p>
      <p>{t.statsNotice}</p>
      <div className={styles.navigation}>
        <a href={`/${locale}/works/${encodeURIComponent(workSlug)}`}>
          {t.back}
        </a>
        <a href={`/${locale}/community/reviews/manage`}>{t.manage}</a>
        {participation === "ANONYMOUS" && (
          <a href={`/${locale}/login`}>{t.login}</a>
        )}
        {participation === "UNVERIFIED" && (
          <a href={`/${locale}/verify-email`}>{t.verify}</a>
        )}
      </div>
      {list.data && (
        <dl className={styles.meta}>
          <dt>{t.reviewCount}</dt>
          <dd>{number.format(list.data.statistics.reviewCount)}</dd>
          <dt>{t.ratedReviewCount}</dt>
          <dd>{number.format(list.data.statistics.ratedReviewCount)}</dd>
          <dt>{t.meanRating}</dt>
          <dd>
            {list.data.statistics.meanRating === null
              ? t.unrated
              : average.format(list.data.statistics.meanRating)}
          </dd>
        </dl>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!ready || blocked}
          onClick={() => reload()}
        >
          {t.refresh}
        </button>
        {!creating && (
          <button
            type="button"
            disabled={
              !ready || blocked || participation !== "VERIFIED" || !list.data
            }
            onClick={() => void start()}
          >
            {slotBusy ? t.loading : t.newReview}
          </button>
        )}
      </div>
      {creating && (
        <ReviewForm
          locale={locale}
          workId={workId}
          onComplete={complete}
          onRestart={restartCreate}
          onCancel={() => {
            if (ready && !slotLock.current) setCreating(false);
          }}
        />
      )}
      {slot && (
        <article className={styles.card}>
          <p>{t.reserved}</p>
          <dl className={styles.meta}>
            <dt>{t.work}</dt>
            <dd>{slot.workId}</dd>
            <dt>{t.content}</dt>
            <dd>{slot.id}</dd>
            <dt>{t.revision}</dt>
            <dd>{slot.revision}</dd>
          </dl>
          <p>{slot.workAvailable ? t.available : t.unavailable}</p>
          {slot.authorState !== "ACTIVE" && (
            <p>{slot.authorState === "ERASED" ? t.erased : t.deleted}</p>
          )}
          {slot.moderationState === "HIDDEN" && <p>{t.hidden}</p>}
          <ReviewOwnerActions
            locale={locale}
            scope={slot}
            seed={slot}
            disabled={list.busy || slotBusy || reports.count > 0}
            onLockChange={ownerLock}
            onComplete={complete}
          />
        </article>
      )}
      {(list.busy || slotBusy) && <p role="status">{t.loading}</p>}
      {message && (
        <p
          role={
            message === t.success || message === t.withdrawn
              ? "status"
              : "alert"
          }
        >
          {message}
        </p>
      )}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.items.length === 0 && <p>{t.emptyReviews}</p>}
      {list.data?.items.map((content) => (
        <ReviewCard
          key={`${content.id}:${list.refreshToken}:${bodyEpoch}`}
          content={content}
          locale={locale}
          refreshToken={bodyEpoch}
          participation={participation}
          reportDisabled={
            list.busy ||
            slotBusy ||
            creating ||
            ownerLocked ||
            reports.other(content.id)
          }
          onReportLock={(locked) => reports.update(content.id, locked)}
        />
      ))}
      <Pagination
        locale={locale}
        page={list.page}
        count={list.data?.items.length ?? 0}
        busy={blocked}
        onPage={reload}
      />
    </section>
  );
}
function ReviewCard({
  locale,
  content,
  refreshToken,
  participation,
  reportDisabled,
  onReportLock,
}: {
  locale: Locale;
  content: ReviewPublicDTO;
  refreshToken: number;
  participation: ReviewListProps["participation"];
  reportDisabled: boolean;
  onReportLock: (locked: boolean) => void;
}) {
  const t = reviewCopy[locale];
  return (
    <article className={styles.card}>
      <h2>{t.review}</h2>
      {content.state === "ACTIVE" ? (
        <>
          {content.author && (
            <p className={styles.meta}>
              {t.by} {content.author.displayName}
            </p>
          )}
          <p>
            {t.rating}:{" "}
            {content.ratingHalfStars === null
              ? t.unrated
              : new Intl.NumberFormat(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(content.ratingHalfStars / 2)}
          </p>
          <ReviewBody
            locale={locale}
            content={content}
            refreshToken={refreshToken}
          />
          <ReportAction
            locale={locale}
            scope={{
              id: content.id,
              workId: content.workId,
              kind: content.kind,
              revision: content.revision,
            }}
            participation={participation}
            showParticipationLinks={false}
            disabled={reportDisabled}
            onLockChange={onReportLock}
          />
        </>
      ) : (
        <p>
          {content.state === "DELETED"
            ? t.deleted
            : content.state === "ERASED"
              ? t.erased
              : t.hidden}
        </p>
      )}
    </article>
  );
}
