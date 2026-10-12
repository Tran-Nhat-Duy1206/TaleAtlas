"use client";
import { useState } from "react";
import Link from "next/link";
import { discussionListResponseSchema } from "../../features/community/http-contracts";
import { communityUuidSchema } from "../../features/community/contracts";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import { assertDiscussionRead, CommunityClientError } from "./client";
import { useCommunityList } from "./useCommunityList";
import { CommunityContent } from "./CommunityContent";
import { ContentForm } from "./ContentForm";
import { Participation } from "./Participation";
import { Pagination } from "./Pagination";
import styles from "./community.module.css";
import type { z } from "zod";
export type CommunityParticipation = "VERIFIED" | "ANONYMOUS" | "UNVERIFIED";
export type DiscussionList = z.infer<typeof discussionListResponseSchema>;
export type ThreadListProps = {
  locale: Locale;
  workId: string;
  workSlug: string;
  initial: DiscussionList;
  participation: CommunityParticipation;
};
function validateThreads(data: DiscussionList, workId: string) {
  if (communityUuidSchema.parse(workId) !== workId)
    throw new CommunityClientError(409);
  const ids = new Set<string>();
  for (const item of data.items) {
    assertDiscussionRead(item, workId, "THREAD");
    if (ids.has(item.id)) throw new CommunityClientError(409);
    ids.add(item.id);
  }
}
export function ThreadList(props: ThreadListProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  // Conditional state adjustment remounts before children commit, even at the same revision.
  if (source.initial !== props.initial) {
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  }
  try {
    validateThreads(
      discussionListResponseSchema.parse(props.initial),
      props.workId,
    );
  } catch {
    return <p role="alert">{communityCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedThreadList
      key={`${props.locale}:${props.workId}:${source.epoch}`}
      {...props}
    />
  );
}
function ScopedThreadList({
  locale,
  workId,
  workSlug,
  initial,
  participation,
}: ThreadListProps) {
  const t = communityCopy[locale],
    [creating, setCreating] = useState(false);
  const list = useCommunityList(
    initial,
    discussionListResponseSchema,
    (data) => validateThreads(data, workId),
    `/api/community/works/${workId}/threads`,
    locale,
  );
  function reload(page = list.page) {
    setCreating(false);
    void list.load(page);
  }
  return (
    <section className={styles.community}>
      <h1>{t.discussions}</h1>
      <Participation locale={locale} participation={participation} />
      <div className={styles.actions}>
        <button type="button" disabled={list.busy} onClick={() => reload()}>
          {t.refresh}
        </button>
        {participation === "VERIFIED" && !creating && (
          <button
            type="button"
            disabled={list.busy || !list.data}
            onClick={() => setCreating(true)}
          >
            {t.newThread}
          </button>
        )}
      </div>
      {creating && (
        <ContentForm
          locale={locale}
          workId={workId}
          kind="THREAD"
          onComplete={() => reload(1)}
          onCancel={() => setCreating(false)}
        />
      )}
      {list.busy && <p role="status">{t.loading}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.items.length === 0 && <p>{t.empty}</p>}
      {list.data?.items.map((content) => (
        <div key={content.id}>
          <CommunityContent
            content={content}
            locale={locale}
            refreshToken={list.refreshToken}
            ownerControls={participation === "VERIFIED"}
            onRefresh={() => reload()}
          />
          <Link
            prefetch={false}
            href={`/${locale}/works/${encodeURIComponent(workSlug)}/discussions/${content.id}`}
          >
            {t.openDiscussion}
          </Link>
        </div>
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
