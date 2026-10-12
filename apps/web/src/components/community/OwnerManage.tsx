"use client";
import { useState } from "react";
import type { z } from "zod";
import { communityOwnedListResponseSchema } from "../../features/community/http-contracts";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import { CommunityClientError } from "./client";
import { useCommunityList } from "./useCommunityList";
import { OwnerActions } from "./OwnerActions";
import { Pagination } from "./Pagination";
import styles from "./community.module.css";
export type OwnedList = z.infer<typeof communityOwnedListResponseSchema>;
export type OwnerManageProps = { locale: Locale; initial: OwnedList };
function validate(data: OwnedList) {
  if (new Set(data.items.map((item) => item.id)).size !== data.items.length)
    throw new CommunityClientError(409);
}
export function OwnerManage(props: OwnerManageProps) {
  const [source, setSource] = useState({ initial: props.initial, epoch: 0 });
  if (source.initial !== props.initial) {
    setSource({ initial: props.initial, epoch: source.epoch + 1 });
  }
  try {
    validate(communityOwnedListResponseSchema.parse(props.initial));
  } catch {
    return <p role="alert">{communityCopy[props.locale].scopeError}</p>;
  }
  return (
    <ScopedOwnerManage key={`${props.locale}:${source.epoch}`} {...props} />
  );
}
function ScopedOwnerManage({ locale, initial }: OwnerManageProps) {
  const t = communityCopy[locale];
  const list = useCommunityList(
    initial,
    communityOwnedListResponseSchema,
    validate,
    "/api/community/owned",
    locale,
  );
  return (
    <section className={styles.community}>
      <h1>{t.manage}</h1>
      <p>{t.ownedNotice}</p>
      <p>{t.ownedEditingNotice}</p>
      <button
        type="button"
        disabled={list.busy}
        onClick={() => void list.load()}
      >
        {t.refresh}
      </button>
      {list.busy && <p role="status">{t.loading}</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.data?.items.length === 0 && <p>{t.ownedEmpty}</p>}
      {list.data?.items.map((content) => (
        <article
          key={`${content.id}:${list.refreshToken}`}
          className={styles.card}
        >
          <h2>{content.kind === "THREAD" ? t.thread : t.replyKind}</h2>
          <dl className={styles.meta}>
            <dt>{t.work}</dt>
            <dd>{content.workId}</dd>
            <dt>{t.content}</dt>
            <dd>{content.id}</dd>
            <dt>{t.revision}</dt>
            <dd>{content.revision}</dd>
          </dl>
          <p>{content.workAvailable ? t.available : t.unavailable}</p>
          {content.authorState !== "ACTIVE" && (
            <p>{content.authorState === "ERASED" ? t.erased : t.deleted}</p>
          )}
          {content.moderationState === "HIDDEN" && <p>{t.hidden}</p>}
          <OwnerActions
            locale={locale}
            scope={content}
            seed={content}
            onComplete={() => void list.load()}
          />
        </article>
      ))}
      <Pagination
        locale={locale}
        page={list.page}
        count={list.data?.items.length ?? 0}
        busy={list.busy}
        onPage={(next) => void list.load(next)}
      />
    </section>
  );
}
