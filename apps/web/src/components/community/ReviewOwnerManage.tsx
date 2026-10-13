"use client";
import { useState } from "react";
import type { z } from "zod";
import { reviewOwnedListResponseSchema } from "../../features/community/review-http-contracts";
import type { Locale } from "../../lib/i18n";
import { reviewCopy } from "../../lib/review-i18n";
import { CommunityClientError } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import { useReviewPages } from "./ReviewList";
import { ReviewOwnerActions } from "./ReviewOwnerActions";
import { Pagination } from "./Pagination";
import styles from "./community.module.css";

export type ReviewOwnedListData = z.infer<typeof reviewOwnedListResponseSchema>;
export type ReviewOwnerManageProps = {
  locale: Locale;
  initial: ReviewOwnedListData;
};
function validateOwned(data: ReviewOwnedListData) {
  const ids = new Set<string>();
  for (const item of data.items) {
    if (item.kind !== "REVIEW" || ids.has(item.id))
      throw new CommunityClientError(0, true);
    ids.add(item.id);
  }
}
/** The private page supplies validated signed-session SSR metadata; hydration never fetches. */
export function ReviewOwnerManage(props: ReviewOwnerManageProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  if (source.initial !== props.initial)
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  try {
    validateOwned(reviewOwnedListResponseSchema.parse(props.initial));
  } catch {
    return <p role="alert">{reviewCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedReviewOwnerManage
      key={`${props.locale}:${source.epoch}`}
      {...props}
    />
  );
}
function ScopedReviewOwnerManage({ locale, initial }: ReviewOwnerManageProps) {
  const ready = useCommunityReady(),
    t = reviewCopy[locale];
  const [locks, setLocks] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [message, setMessage] = useState("");
  const list = useReviewPages(
    initial,
    reviewOwnedListResponseSchema,
    validateOwned,
    (data) => {
      const last = data.items.at(-1);
      return last ? { id: last.id, timestamp: null } : null;
    },
    "/api/community/reviews/owned",
    locale,
  );
  const blocked = list.busy || locks.size > 0;
  function setLocked(id: string, locked: boolean) {
    setLocks((previous) => {
      const next = new Set(previous);
      if (locked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function reload(page = list.page) {
    if (!ready || blocked) return;
    setMessage("");
    void list.load(page);
  }
  function complete(outcome: "UPDATED" | "WITHDRAWN") {
    if (!ready) return;
    setLocks(new Set<string>());
    setMessage(outcome === "WITHDRAWN" ? t.withdrawn : t.success);
    void list.load();
  }
  return (
    <section className={styles.community}>
      <h1>{t.manage}</h1>
      <p>{t.ownedReviewNotice}</p>
      <p>{t.replacementRatingNotice}</p>
      <button
        type="button"
        disabled={!ready || blocked}
        onClick={() => reload()}
      >
        {t.loadOwned}
      </button>
      {message && <p role="status">{message}</p>}
      {list.busy && <p role="status">{t.loading}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.items.length === 0 && <p>{t.ownedEmpty}</p>}
      {list.data?.items.map((metadata) => (
        <article
          key={`${metadata.id}:${metadata.revision}:${list.refreshToken}`}
          className={styles.card}
        >
          <h2>{t.review}</h2>
          <dl className={styles.meta}>
            <dt>{t.work}</dt>
            <dd>{metadata.workId}</dd>
            <dt>{t.content}</dt>
            <dd>{metadata.id}</dd>
            <dt>{t.revision}</dt>
            <dd>{metadata.revision}</dd>
          </dl>
          <p>{metadata.workAvailable ? t.available : t.unavailable}</p>
          {metadata.authorState !== "ACTIVE" && (
            <p>{metadata.authorState === "ERASED" ? t.erased : t.deleted}</p>
          )}
          {metadata.moderationState === "HIDDEN" && <p>{t.hidden}</p>}
          <ReviewOwnerActions
            locale={locale}
            scope={metadata}
            seed={metadata}
            disabled={list.busy || (locks.size > 0 && !locks.has(metadata.id))}
            onLockChange={(locked) => setLocked(metadata.id, locked)}
            onComplete={complete}
          />
        </article>
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
