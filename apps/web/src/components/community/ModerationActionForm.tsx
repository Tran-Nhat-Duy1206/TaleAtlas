"use client";
import { useId, useState, type FormEvent } from "react";
import {
  moderationQueueItemSchema,
  moderationCommandSchema,
  communityCommandResponseSchema,
  requireModerationScope,
} from "../../features/community/moderation-http-contracts";
import type { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";
import { CommunityClientError } from "./client";
import { useModerationAttempt } from "./useModerationAttempt";
import { ModerationFeedback } from "./ModerationFeedback";
import styles from "./community.module.css";

type Item = z.infer<typeof moderationQueueItemSchema>;
export type ModerationActionFormProps = {
  locale: Locale;
  item: Item;
  disabled?: boolean;
  onConfirmed: () => void;
  onReload: () => Promise<void>;
  onLocked: (locked: boolean) => void;
  onConflict: () => void;
};
export function ModerationActionForm(props: ModerationActionFormProps) {
  const parsed = moderationQueueItemSchema.safeParse(props.item);
  if (!parsed.success)
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  return (
    <ScopedActionForm
      key={`${props.locale}:${parsed.data.id}:${parsed.data.revision}:${parsed.data.target.revision}`}
      {...props}
      item={parsed.data}
    />
  );
}
function ScopedActionForm({
  locale,
  item,
  disabled = false,
  onConfirmed,
  onReload,
  onLocked,
  onConflict,
}: ModerationActionFormProps) {
  const t = moderationCopy[locale],
    prefix = useId(),
    target = item.target;
  const [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [intent, setIntent] = useState(false);
  const attempt = useModerationAttempt(
    locale,
    communityCommandResponseSchema,
    (result) => {
      requireModerationScope(
        result.content,
        target.workId,
        target.id,
        target.kind,
      );
      if (
        result.content.revision < target.revision ||
        (!result.replayed && result.content.revision > target.revision + 1)
      )
        throw new CommunityClientError(0, true);
      if (item.state === "OPEN") {
        if (!result.replayed && result.content.revision !== target.revision + 1)
          throw new CommunityClientError(0, true);
        if (result.report === null) {
          // A confirmed current replay may outlive its deleted reporter/report attachment.
          if (!result.replayed) throw new CommunityClientError(0, true);
        } else if (
          result.report.id !== item.id ||
          result.report.revision < item.revision ||
          (!result.replayed &&
            (result.report.revision !== item.revision + 1 ||
              result.report.state !==
                (action === "HIDE" ? "UPHELD" : "DISMISSED")))
        )
          throw new CommunityClientError(0, true);
      } else if (result.report !== null)
        throw new CommunityClientError(0, true);
    },
    () => {
      setAction("");
      setReason("");
      setIntent(false);
      onLocked(false);
      onConfirmed();
    },
    () => {
      setAction("");
      setReason("");
      setIntent(false);
      onConflict();
    },
  );
  const enabled = attempt.canStart && !disabled;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !enabled ||
      !attempt.guarded() ||
      !intent ||
      action === "" ||
      reason.trim() === ""
    )
      return;
    if (
      (action === "DISMISS" && !item.canDismiss) ||
      (action === "HIDE" && !target.canHide) ||
      (action === "RESTORE" && !target.canRestore)
    )
      return;
    const submitted = attempt.submit(
      moderationCommandSchema,
      () => ({
        action,
        reason,
        contentKind: target.kind,
        expectedRevision: target.revision,
        reportId: item.state === "OPEN" ? item.id : null,
        expectedReportRevision: item.state === "OPEN" ? item.revision : null,
        mutationKey: crypto.randomUUID(),
      }),
      `/api/community/works/${target.workId}/contents/${target.id}/moderation`,
    );
    if (submitted) onLocked(true);
  }
  return (
    <form className={styles.form} aria-label={t.action} onSubmit={submit}>
      <h3>{t.action}</h3>
      <p>{t.decisionNotice}</p>
      <fieldset className={styles.form} disabled={!enabled}>
        <label htmlFor={`${prefix}-action`}>{t.action}</label>
        <select
          id={`${prefix}-action`}
          required
          value={action}
          onChange={(event) => {
            if (enabled && attempt.guarded()) setAction(event.target.value);
          }}
        >
          <option value="" disabled>
            {t.chooseAction}
          </option>
          {item.canDismiss && <option value="DISMISS">{t.dismiss}</option>}
          {target.canHide && <option value="HIDE">{t.hide}</option>}
          {target.canRestore && <option value="RESTORE">{t.restore}</option>}
        </select>
        <label htmlFor={`${prefix}-reason`}>{t.reason}</label>
        <textarea
          id={`${prefix}-reason`}
          required
          minLength={1}
          maxLength={1000}
          value={reason}
          aria-describedby={`${prefix}-reason-help`}
          onChange={(event) => {
            if (enabled && attempt.guarded()) setReason(event.target.value);
          }}
        />
        <p id={`${prefix}-reason-help`}>{t.reasonHelp}</p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={intent}
            onChange={(event) => {
              if (enabled && attempt.guarded()) setIntent(event.target.checked);
            }}
          />
          {t.actionIntent}
        </label>
        <button
          type="submit"
          disabled={
            !enabled || !intent || action === "" || reason.trim() === ""
          }
        >
          {t.apply}
        </button>
      </fieldset>
      <ModerationFeedback
        locale={locale}
        {...attempt}
        frozen={attempt.frozen !== null}
        onRetry={attempt.retry}
        onRestart={() => {
          void attempt.restart(async () => {
            await onReload();
            setAction("");
            setReason("");
            setIntent(false);
            onLocked(false);
          });
        }}
      />
    </form>
  );
}
