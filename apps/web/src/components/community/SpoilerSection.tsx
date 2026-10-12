"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { communityCopy } from "../../lib/community-i18n";
import type { CommunityPublicDTO } from "../../features/community/projection";
import { communityRevealSchema } from "../../features/community/contracts";
import { discussionRevealResponseSchema } from "../../features/community/http-contracts";
import { assertSelectedReveal, communityRequest, errorCopy } from "./client";
import styles from "./community.module.css";

/** State belongs only to this UUID/revision/section and is never shared with another section or editor. */
type Props = {
  content: CommunityPublicDTO;
  section: "title" | "body";
  locale: Locale;
  refreshToken?: number;
};
export function SpoilerSection(props: Props) {
  return (
    <ScopedSpoilerSection
      key={`${props.content.id}:${props.content.workId}:${props.content.kind}:${props.content.revision}:${props.section}:${props.refreshToken ?? 0}`}
      {...props}
    />
  );
}
function ScopedSpoilerSection({
  content,
  section,
  locale,
  refreshToken = 0,
}: Props) {
  const t = communityCopy[locale],
    id = useId();
  const cacheKey = `${content.id}:${content.workId}:${content.kind}:${content.revision}:${section}:${refreshToken}`;
  const mounted = useRef(true);
  const [revealed, setRevealed] = useState<{
    key: string;
    text: string;
    context?: string;
  } | null>(null);
  const [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const value = content[section];
  if (value.state === "UNAVAILABLE") return null;
  if (value.state === "VISIBLE")
    return <p className={styles.prose}>{value.text}</p>;
  if (revealed?.key === cacheKey)
    return (
      <div>
        <p className={styles.prose}>{revealed.text}</p>
        {revealed.context !== undefined && (
          <p className={styles.prose}>{revealed.context}</p>
        )}
      </div>
    );
  async function reveal() {
    if (!ack || busy) return;
    setBusy(true);
    setError("");
    const requestedKey = cacheKey;
    try {
      const payload = communityRevealSchema.parse({
        workId: content.workId,
        targetId: content.id,
        contentKind: content.kind,
        expectedRevision: content.revision,
        title: section === "title",
        body: section === "body",
        spoilerRevealAcknowledged: true,
      });
      const result = await communityRequest(
        `/api/community/works/${content.workId}/contents/${content.id}/reveal`,
        discussionRevealResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      assertSelectedReveal(content, section, result);
      if (mounted.current)
        setRevealed({
          key: requestedKey,
          text: result[section]!,
          context: result.spoilerContext,
        });
    } catch (failure) {
      if (mounted.current) setError(errorCopy(failure, locale));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={styles.masked}>
      <p>{section === "title" ? t.maskedTitle : t.maskedBody}</p>
      <label className={styles.check} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={ack}
          disabled={busy}
          onChange={(e) => setAck(e.target.checked)}
        />
        {t.revealAck}
      </label>
      <button
        type="button"
        disabled={!ack || busy}
        onClick={() => void reveal()}
      >
        {busy ? t.loading : section === "title" ? t.revealTitle : t.revealBody}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
