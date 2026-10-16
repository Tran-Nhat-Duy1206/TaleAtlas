"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  moderationTargetSchema,
  moderationQueueItemSchema,
  moderationActionSchema,
  moderationEvidenceInputSchema,
  moderationEvidenceResponseSchema,
  moderationHttpEvidence,
  type ModerationTargetDTO,
} from "../../features/community/moderation-http-contracts";
import type { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { moderationCopy, reportReasonCopy } from "../../lib/moderation-i18n";
import { communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import styles from "./community.module.css";

type QueueItem = z.infer<typeof moderationQueueItemSchema>;
type Action = z.infer<typeof moderationActionSchema>;
export type ModerationEvidenceProps = {
  locale: Locale;
  target: ModerationTargetDTO;
  report: QueueItem;
  action?: Action;
  disabled?: boolean;
  onFailure: (error: unknown) => void;
};
export function ModerationEvidence(props: ModerationEvidenceProps) {
  const target = moderationTargetSchema.safeParse(props.target),
    report = moderationQueueItemSchema.safeParse(props.report);
  const action =
    props.action === undefined
      ? null
      : moderationActionSchema.safeParse(props.action);
  if (
    !target.success ||
    !report.success ||
    report.data.target.id !== target.data.id ||
    report.data.target.workId !== target.data.workId ||
    report.data.target.kind !== target.data.kind ||
    report.data.target.revision !== target.data.revision ||
    (action && !action.success)
  )
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  return (
    <ScopedEvidence
      key={`${props.locale}:${target.data.id}:${target.data.revision}:${report.data.id}:${report.data.revision}:${props.action?.id ?? "none"}`}
      {...props}
    />
  );
}
function ScopedEvidence({
  locale,
  target,
  report,
  action,
  disabled = false,
  onFailure,
}: ModerationEvidenceProps) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale],
    prefix = useId();
  const [selection, setSelection] = useState(""),
    [ack, setAck] = useState(false),
    [spoilerAck, setSpoilerAck] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<z.infer<
    typeof moderationEvidenceResponseSchema
  > | null>(null);
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const enabled = ready && !disabled && !busy;
  async function read() {
    if (!enabled || lock.current || !ack || !spoilerAck || selection === "")
      return;
    lock.current = true;
    setBusy(true);
    setEvidence(null);
    setMessage("");
    try {
      const input = moderationEvidenceInputSchema.parse({
        workId: target.workId,
        targetId: target.id,
        contentKind: target.kind,
        expectedRevision: target.revision,
        selection,
        reportId: selection === "REPORT" ? report.id : null,
        expectedReportRevision: selection === "REPORT" ? report.revision : null,
        actionId: selection === "ACTION_REASON" ? (action?.id ?? null) : null,
        actionSequence:
          selection === "ACTION_REASON" ? (action?.sequence ?? null) : null,
        evidenceSelectionAcknowledged: true,
        spoilerRevealAcknowledged: true,
      });
      const result = await communityRequest(
        `/api/community/works/${target.workId}/contents/${target.id}/moderation/context`,
        moderationEvidenceResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const scoped = moderationHttpEvidence(result, input);
      if (mounted.current) {
        setEvidence(scoped);
        setAck(false);
        setSpoilerAck(false);
      }
    } catch (error) {
      if (mounted.current) {
        setAck(false);
        setSpoilerAck(false);
        setEvidence(null);
        setMessage(errorCopy(error, locale));
        onFailure(error);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className={styles.form}>
      <h3>{t.evidence}</h3>
      <p>{t.evidenceNotice}</p>
      <fieldset className={styles.form} disabled={!enabled}>
        <label htmlFor={`${prefix}-section`}>{t.evidenceSection}</label>
        <select
          id={`${prefix}-section`}
          value={selection}
          onChange={(event) => {
            if (!enabled || lock.current) return;
            setSelection(event.target.value);
            setAck(false);
            setSpoilerAck(false);
            setEvidence(null);
            setMessage("");
          }}
        >
          <option value="" disabled>
            {t.chooseEvidence}
          </option>
          {target.kind === "THREAD" && (
            <option value="TITLE">{t.titleEvidence}</option>
          )}
          <option value="BODY">{t.bodyEvidence}</option>
          <option value="SPOILER_CONTEXT">{t.contextEvidence}</option>
          <option value="REPORT">{t.reportEvidence}</option>
          {action && (
            <option value="ACTION_REASON">{t.actionReasonEvidence}</option>
          )}
        </select>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={ack}
            onChange={(event) => {
              if (enabled && !lock.current) setAck(event.target.checked);
            }}
          />
          {t.evidenceAck}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={spoilerAck}
            onChange={(event) => {
              if (enabled && !lock.current) setSpoilerAck(event.target.checked);
            }}
          />
          {t.revealAck}
        </label>
        <button
          type="button"
          disabled={!enabled || !ack || !spoilerAck || selection === ""}
          onClick={() => void read()}
        >
          {t.revealEvidence}
        </button>
      </fieldset>
      {message && <p role="alert">{message}</p>}
      {evidence &&
        (evidence.state !== "AVAILABLE" ? (
          <p>{t.noEvidence}</p>
        ) : evidence.selection === "REPORT" ? (
          <div>
            {evidence.reason !== null && (
              <p>{reportReasonCopy[locale][evidence.reason]}</p>
            )}
            <p className={styles.prose}>{evidence.explanation}</p>
          </div>
        ) : (
          <p className={styles.prose}>{evidence.text}</p>
        ))}
    </section>
  );
}
