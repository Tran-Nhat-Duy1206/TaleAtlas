"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  communityTargetScopeSchema,
  reportCreateSchema,
  communityCommandResponseSchema,
  ownedReportSchema,
  requireModerationScope,
  type CommunityTargetScopeDTO,
  type CommunityCommandResponseDTO,
} from "../../features/community/moderation-http-contracts";
import type { Locale } from "../../lib/i18n";
import { moderationCopy, reportReasonCopy } from "../../lib/moderation-i18n";
import { CommunityClientError, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";
import { useModerationAttempt } from "./useModerationAttempt";
import { ModerationFeedback } from "./ModerationFeedback";
import styles from "./community.module.css";

export type ReportActionProps = {
  locale: Locale;
  scope: CommunityTargetScopeDTO;
  participation: "VERIFIED" | "ANONYMOUS" | "UNVERIFIED";
  showParticipationLinks?: boolean;
  disabled?: boolean;
  onLockChange?: (locked: boolean) => void;
};
export function ReportAction(props: ReportActionProps) {
  const parsed = communityTargetScopeSchema.safeParse(props.scope);
  if (!parsed.success)
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  return (
    <ScopedReportAction
      key={`${props.locale}:${parsed.data.workId}:${parsed.data.id}:${parsed.data.kind}:${parsed.data.revision}:${props.participation}`}
      {...props}
      scope={parsed.data}
    />
  );
}
function ScopedReportAction({
  locale,
  scope,
  participation,
  showParticipationLinks = true,
  disabled = false,
  onLockChange,
}: ReportActionProps) {
  const ready = useCommunityReady(),
    t = moderationCopy[locale];
  const [open, setOpen] = useState(false),
    [receipt, setReceipt] = useState<NonNullable<
      CommunityCommandResponseDTO["report"]
    > | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function status() {
    if (
      !ready ||
      disabled ||
      participation !== "VERIFIED" ||
      lock.current ||
      !receipt ||
      open
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await communityRequest(
        `/api/community/reports/${receipt.id}/owned?locale=${locale}`,
        ownedReportSchema,
      );
      if (
        result.id !== receipt.id ||
        result.workId !== scope.workId ||
        result.contentId !== scope.id ||
        result.contentKind !== scope.kind ||
        result.revision < receipt.revision
      )
        throw new CommunityClientError(0, true);
      if (mounted.current)
        setReceipt({
          id: result.id,
          state: result.state,
          revision: result.revision,
        });
    } catch (error) {
      if (mounted.current) {
        setReceipt(null);
        setMessage(errorCopy(error, locale));
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={styles.form}>
      {!open && (
        <button
          type="button"
          disabled={!ready || disabled || busy || participation !== "VERIFIED"}
          onClick={() => {
            if (
              ready &&
              !disabled &&
              !lock.current &&
              participation === "VERIFIED"
            ) {
              setOpen(true);
              setMessage("");
            }
          }}
        >
          {t.report}
        </button>
      )}
      {showParticipationLinks && participation === "ANONYMOUS" && (
        <a href={`/${locale}/login`}>{t.login}</a>
      )}
      {showParticipationLinks && participation === "UNVERIFIED" && (
        <a href={`/${locale}/verify-email`}>{t.verify}</a>
      )}
      <a href={`/${locale}/community/reports/manage`}>{t.reports}</a>
      {open && participation === "VERIFIED" && (
        <ReportForm
          locale={locale}
          scope={scope}
          disabled={disabled}
          onLockChange={onLockChange}
          onComplete={(result) => {
            setReceipt(result);
            setOpen(false);
            setMessage(t.reportSuccess);
            onLockChange?.(false);
          }}
          onCancel={() => {
            if (ready && !lock.current) setOpen(false);
          }}
        />
      )}
      {receipt && (
        <>
          <dl className={styles.meta}>
            <dt>{t.reportId}</dt>
            <dd>{receipt.id}</dd>
            <dt>{t.reportState}</dt>
            <dd>
              {receipt.state === "OPEN"
                ? t.open
                : receipt.state === "DISMISSED"
                  ? t.dismissed
                  : t.upheld}
            </dd>
            <dt>{t.reportRevision}</dt>
            <dd>{receipt.revision}</dd>
          </dl>
          <button
            type="button"
            disabled={!ready || busy || open || participation !== "VERIFIED"}
            onClick={() => void status()}
          >
            {t.refreshReport}
          </button>
        </>
      )}
      {message && (
        <p role={message === t.reportSuccess ? "status" : "alert"}>{message}</p>
      )}
    </div>
  );
}
export type ReportFormProps = {
  locale: Locale;
  scope: CommunityTargetScopeDTO;
  disabled?: boolean;
  onLockChange?: (locked: boolean) => void;
  onComplete: (
    receipt: NonNullable<CommunityCommandResponseDTO["report"]>,
  ) => void;
  onCancel?: () => void;
};
export function ReportForm(props: ReportFormProps) {
  const parsed = communityTargetScopeSchema.safeParse(props.scope);
  if (!parsed.success)
    return <p role="alert">{moderationCopy[props.locale].scopeError}</p>;
  return (
    <ScopedReportForm
      key={`${props.locale}:${parsed.data.workId}:${parsed.data.id}:${parsed.data.kind}:${parsed.data.revision}`}
      {...props}
      scope={parsed.data}
    />
  );
}
function ScopedReportForm({
  locale,
  scope,
  disabled = false,
  onLockChange,
  onComplete,
  onCancel,
}: ReportFormProps) {
  const t = moderationCopy[locale],
    prefix = useId();
  const [reason, setReason] = useState(""),
    [explanation, setExplanation] = useState("");
  const attempt = useModerationAttempt(
    locale,
    communityCommandResponseSchema,
    (result) => {
      requireModerationScope(
        result.content,
        scope.workId,
        scope.id,
        scope.kind,
      );
      if (
        !result.report ||
        result.content.revision < scope.revision ||
        (!result.replayed &&
          (result.content.revision !== scope.revision ||
            result.report.state !== "OPEN" ||
            result.report.revision !== 1))
      )
        throw new CommunityClientError(0, true);
    },
    (result) => {
      if (result.report) {
        setReason("");
        setExplanation("");
        onComplete(result.report);
      }
    },
    () => {
      setReason("");
      setExplanation("");
    },
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !attempt.canStart || !attempt.guarded() || reason === "")
      return;
    const submitted = attempt.submit(
      reportCreateSchema,
      () => ({
        contentKind: scope.kind,
        expectedRevision: scope.revision,
        reason,
        explanation,
        mutationKey: crypto.randomUUID(),
      }),
      `/api/community/works/${scope.workId}/contents/${scope.id}/reports`,
    );
    if (submitted) onLockChange?.(true);
  }
  return (
    <form className={styles.form} aria-label={t.reportForm} onSubmit={submit}>
      <h3>{t.reportForm}</h3>
      <p>{t.privacyNotice}</p>
      <fieldset
        className={styles.form}
        disabled={disabled || !attempt.canStart}
      >
        <label htmlFor={`${prefix}-category`}>{t.reportReason}</label>
        <select
          id={`${prefix}-category`}
          required
          value={reason}
          onChange={(event) => {
            if (!disabled && attempt.canStart && attempt.guarded())
              setReason(event.target.value);
          }}
        >
          <option value="" disabled>
            {t.chooseReportReason}
          </option>
          {Object.entries(reportReasonCopy[locale]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor={`${prefix}-explanation`}>{t.explanation}</label>
        <textarea
          id={`${prefix}-explanation`}
          maxLength={1000}
          required={reason === "OTHER"}
          minLength={reason === "OTHER" ? 3 : undefined}
          value={explanation}
          aria-describedby={`${prefix}-explanation-help`}
          onChange={(event) => {
            if (!disabled && attempt.canStart && attempt.guarded())
              setExplanation(event.target.value);
          }}
        />
        <p id={`${prefix}-explanation-help`}>{t.explanationHelp}</p>
        <button
          type="submit"
          disabled={
            disabled ||
            !attempt.canStart ||
            reason === "" ||
            (reason === "OTHER" && explanation.trim().length < 3)
          }
        >
          {t.submitReport}
        </button>
      </fieldset>
      <ModerationFeedback
        locale={locale}
        {...attempt}
        ready={attempt.ready && !disabled}
        frozen={attempt.frozen !== null}
        onRetry={() => {
          if (!disabled) attempt.retry();
        }}
        onRestart={() => {
          if (!attempt.ready || disabled || attempt.busy) return;
          // Deliberate document re-read obtains a freshly authorized masked public scope. An owned-report
          // list cannot certify a target for a reporter with no receipt. Keep the old key locked until navigation.
          setReason("");
          setExplanation("");
          window.location.reload();
        }}
      />
      {onCancel && !attempt.frozen && (
        <button
          type="button"
          disabled={!attempt.ready || attempt.busy}
          onClick={() => {
            if (attempt.guarded()) onCancel();
          }}
        >
          {t.cancel}
        </button>
      )}
    </form>
  );
}
