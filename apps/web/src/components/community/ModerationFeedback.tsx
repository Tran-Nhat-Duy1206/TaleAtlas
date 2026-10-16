"use client";
import type { Locale } from "../../lib/i18n";
import { moderationCopy } from "../../lib/moderation-i18n";
import type { CommunityClientError } from "./client";
export function ModerationFeedback({
  locale,
  ready,
  busy,
  frozen,
  failure,
  error,
  onRetry,
  onRestart,
}: {
  locale: Locale;
  ready: boolean;
  busy: boolean;
  frozen: boolean;
  failure: CommunityClientError | null;
  error: string;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const t = moderationCopy[locale];
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {frozen && failure?.uncertain && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            if (ready && !busy) onRetry();
          }}
        >
          {t.retry}
        </button>
      )}
      {frozen && failure && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            if (ready && !busy) onRestart();
          }}
        >
          {failure.status === 409 ? t.refreshTarget : t.newAttempt}
        </button>
      )}
    </>
  );
}
