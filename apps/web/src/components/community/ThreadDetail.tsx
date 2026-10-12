"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  discussionListResponseSchema,
  discussionPublicSchema,
  type DiscussionPublic,
} from "../../features/community/http-contracts";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import {
  assertDiscussionRead,
  communityListUrl,
  communityRequest,
  CommunityClientError,
  errorCopy,
} from "./client";
import { CommunityContent } from "./CommunityContent";
import { ContentForm } from "./ContentForm";
import { Participation } from "./Participation";
import { Pagination } from "./Pagination";
import type { CommunityParticipation, DiscussionList } from "./ThreadList";
import styles from "./community.module.css";
export type ThreadDetailProps = {
  locale: Locale;
  workId: string;
  workSlug: string;
  initialThread: DiscussionPublic;
  initialReplies: DiscussionList;
  participation: CommunityParticipation;
};
function validate(
  thread: DiscussionPublic,
  replies: DiscussionList,
  workId: string,
  id: string,
) {
  assertDiscussionRead(thread, workId, "THREAD", id);
  // Withdrawn/erased roots retain unrelated public replies; only moderation hides the conversation.
  if (thread.state === "HIDDEN" && replies.items.length)
    throw new CommunityClientError(409);
  const ids = new Set<string>();
  for (const item of replies.items) {
    assertDiscussionRead(item, workId, "REPLY", undefined, id);
    if (ids.has(item.id)) throw new CommunityClientError(409);
    ids.add(item.id);
  }
  // When both rows are in this bounded page, additionally fence their parent depth.
  for (const child of replies.items) {
    const parent = replies.items.find((item) => item.id === child.parentId);
    if (parent && child.depth !== parent.depth! + 1)
      throw new CommunityClientError(409);
  }
}
export function ThreadDetail(props: ThreadDetailProps) {
  const [source, setSource] = useState({
    initialThread: props.initialThread,
    initialReplies: props.initialReplies,
    epoch: 0,
  });
  if (
    source.initialThread !== props.initialThread ||
    source.initialReplies !== props.initialReplies
  ) {
    setSource({
      initialThread: props.initialThread,
      initialReplies: props.initialReplies,
      epoch: source.epoch + 1,
    });
  }
  try {
    validate(
      discussionPublicSchema.parse(props.initialThread),
      discussionListResponseSchema.parse(props.initialReplies),
      props.workId,
      props.initialThread.id,
    );
  } catch {
    return <p role="alert">{communityCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedThreadDetail
      key={`${props.locale}:${props.workId}:${props.initialThread.id}:${source.epoch}`}
      {...props}
    />
  );
}
function ScopedThreadDetail({
  locale,
  workId,
  workSlug,
  initialThread,
  initialReplies,
  participation,
}: ThreadDetailProps) {
  const t = communityCopy[locale],
    id = initialThread.id,
    path = `/api/community/works/${workId}/threads/${id}`;
  const [thread, setThread] = useState<DiscussionPublic | null>(() =>
    discussionPublicSchema.parse(initialThread),
  );
  const [replies, setReplies] = useState<DiscussionList | null>(() =>
    discussionListResponseSchema.parse(initialReplies),
  );
  const [page, setPage] = useState(1),
    [refreshToken, setRefreshToken] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [target, setTarget] = useState<{
    parentId: string | null;
    depth: number;
  } | null>(null);
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function reload(nextPage = page) {
    if (lock.current) return;
    lock.current = true;
    setThread(null);
    setReplies(null);
    setTarget(null);
    setRefreshToken((value) => value + 1);
    setBusy(true);
    setError("");
    try {
      const [nextThread, nextReplies] = await Promise.all([
        communityRequest(path, discussionPublicSchema),
        communityRequest(
          communityListUrl(`${path}/replies`, locale, nextPage),
          discussionListResponseSchema,
        ),
      ]);
      validate(nextThread, nextReplies, workId, id);
      if (mounted.current) {
        setThread(nextThread);
        setReplies(nextReplies);
        setPage(nextPage);
      }
    } catch (failure) {
      if (mounted.current) setError(errorCopy(failure, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const canReply =
    participation === "VERIFIED" && thread?.state === "ACTIVE" && !busy;
  return (
    <section className={styles.community}>
      <h1>{t.conversation}</h1>
      <Link
        prefetch={false}
        href={`/${locale}/works/${encodeURIComponent(workSlug)}/discussions`}
      >
        {t.all}
      </Link>
      <Participation locale={locale} participation={participation} />
      <button type="button" disabled={busy} onClick={() => void reload()}>
        {t.refresh}
      </button>
      {busy && <p role="status">{t.loading}</p>}
      {error && <p role="alert">{error}</p>}
      {thread && (
        <CommunityContent
          content={thread}
          locale={locale}
          refreshToken={refreshToken}
          ownerControls={participation === "VERIFIED"}
          onRefresh={() => void reload()}
        />
      )}
      {canReply && !target && (
        <button
          type="button"
          onClick={() => setTarget({ parentId: null, depth: 0 })}
        >
          {t.reply}
        </button>
      )}
      {target && canReply && (
        <ContentForm
          key={`${id}:${refreshToken}:${target.parentId}`}
          locale={locale}
          workId={workId}
          kind="REPLY"
          threadId={id}
          parentId={target.parentId}
          depth={target.depth}
          onComplete={() => void reload(1)}
          onCancel={() => setTarget(null)}
        />
      )}
      <h2>{t.replies}</h2>
      {replies?.items.length === 0 && <p>{t.noReplies}</p>}
      {replies?.items.map((content) => (
        <div key={content.id}>
          <CommunityContent
            content={content}
            locale={locale}
            refreshToken={refreshToken}
            ownerControls={participation === "VERIFIED"}
            onRefresh={() => void reload()}
          />
          {canReply &&
            content.state === "ACTIVE" &&
            ((content.depth ?? 0) < 2 ? (
              <button
                type="button"
                disabled={target !== null}
                onClick={() =>
                  setTarget({ parentId: content.id, depth: content.depth! + 1 })
                }
              >
                {t.nestedReply}
              </button>
            ) : (
              <p className={styles.notice}>{t.depthLimit}</p>
            ))}
        </div>
      ))}
      <Pagination
        locale={locale}
        page={page}
        count={replies?.items.length ?? 0}
        busy={busy}
        onPage={(next) => void reload(next)}
      />
    </section>
  );
}
