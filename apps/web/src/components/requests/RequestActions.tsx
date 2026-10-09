"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "../../lib/i18n";
import { requestDictionary } from "../../lib/request-i18n";
import { cancelRequestSchema } from "../../features/ingestion/contracts";
import { supportRequestSchema } from "../../features/ingestion/support";
import styles from "./request.module.css";
export function RequestActions({
  locale,
  id,
  revision,
  cancel = false,
  following = false,
}: {
  locale: Locale;
  id: string;
  revision?: number;
  cancel?: boolean;
  following?: boolean;
}) {
  const t = requestDictionary(locale);
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act() {
    if (busy || (!cancel && !following && !ack)) return;
    const parsed = cancel
      ? cancelRequestSchema.safeParse({ revision })
      : following
        ? { success: true as const, data: {} }
        : supportRequestSchema.safeParse({ equivalenceAcknowledged: ack });
    if (!parsed.success) {
      setError(cancel ? t.conflict : t.equivalence);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/requests/${id}/${cancel ? "cancel" : "support"}`,
        {
          method: following && !cancel ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? t.conflict
            : response.status === 401
              ? t.signIn
              : t.error,
        );
        return;
      }
      // Finish the mutation response before destination navigation can cancel
      // its transport. Do not treat received headers alone as completed delivery.
      await response.json();
      setAck(false);
      router.replace(`/${locale}/requests`);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.form}>
      {!cancel && !following && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          {t.equivalence}
        </label>
      )}
      <div className={styles.actions}>
        <button
          className="button"
          type="button"
          disabled={busy || (!cancel && !following && !ack)}
          onClick={act}
        >
          {busy
            ? t.working
            : cancel
              ? t.cancel
              : following
                ? t.unfollow
                : t.follow}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
