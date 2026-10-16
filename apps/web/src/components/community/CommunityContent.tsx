"use client";
import type { CSSProperties } from "react";
import type { DiscussionPublic } from "../../features/community/http-contracts";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import { SpoilerSection } from "./SpoilerSection";
import { OwnerActions } from "./OwnerActions";
import { ReportAction } from "./ReportAction";
import styles from "./community.module.css";
export function CommunityContent({
  content,
  locale,
  refreshToken,
  ownerControls = false,
  participation = "ANONYMOUS",
  reportDisabled = false,
  reportLocked = false,
  onReportLock,
  onRefresh,
}: {
  content: DiscussionPublic;
  locale: Locale;
  refreshToken: number;
  ownerControls?: boolean;
  participation?: "VERIFIED" | "ANONYMOUS" | "UNVERIFIED";
  reportDisabled?: boolean;
  reportLocked?: boolean;
  onReportLock?: (locked: boolean) => void;
  onRefresh: () => void;
}) {
  const t = communityCopy[locale];
  return (
    <article
      className={`${styles.card} ${content.kind === "REPLY" ? styles.reply : ""}`}
      style={{ "--reply-depth": content.depth ?? 0 } as CSSProperties}
    >
      {content.state !== "ACTIVE" ? (
        <p>
          {content.state === "DELETED"
            ? t.deleted
            : content.state === "ERASED"
              ? t.erased
              : t.hidden}
        </p>
      ) : (
        <>
          {content.kind === "THREAD" && (
            <SpoilerSection
              content={content}
              section="title"
              locale={locale}
              refreshToken={refreshToken}
            />
          )}
          <SpoilerSection
            content={content}
            section="body"
            locale={locale}
            refreshToken={refreshToken}
          />
          {content.author && (
            <p className={styles.meta}>
              {t.by} {content.author.displayName}
            </p>
          )}
          {content.createdAt && (
            <time className={styles.meta} dateTime={content.createdAt}>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(content.createdAt))}
            </time>
          )}
        </>
      )}
      {content.kind === "REPLY" && (
        <p className={styles.meta}>
          {t.replyLevel} {(content.depth ?? 0) + 1}
          {content.parentId && (
            <>
              {" "}
              · {t.parentReply} {content.parentId}
            </>
          )}
        </p>
      )}
      {content.state === "ACTIVE" && (
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
      )}
      {ownerControls && (
        <fieldset disabled={reportLocked} className={styles.form}>
          <OwnerActions
            key={refreshToken}
            locale={locale}
            scope={content}
            publicContent={content}
            onComplete={() => {
              if (!reportLocked) onRefresh();
            }}
          />
        </fieldset>
      )}
    </article>
  );
}
