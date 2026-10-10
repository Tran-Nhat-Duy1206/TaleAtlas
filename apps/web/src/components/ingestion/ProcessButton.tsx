"use client";
import { useState } from "react";
import { z } from "zod";
const count = z.number().int().min(0).max(3);
const processingCounts = z
  .strictObject({
    claimed: count,
    processed: count,
    stale: count,
    disabled: count,
    failed: count,
  })
  .refine(
    (value) =>
      value.claimed ===
      value.processed + value.stale + value.disabled + value.failed,
  );
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { ingestionDictionary } from "./copy";
export function ProcessButton({
  locale,
  requestId,
}: {
  locale: Locale;
  requestId: string;
}) {
  const d = ingestionDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"done" | "error" | null>(null);
  async function process() {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/ingestion/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1, requestId }),
      });
      // Fully consume the real mutation response before RSC navigation. Never expose leases.
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("processing failed");
      const counts = processingCounts.parse(payload);
      if (counts.failed > 0 || counts.disabled > 0)
        throw new Error("processing incomplete");
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button button-primary"
        disabled={busy}
        onClick={process}
      >
        {busy ? d.working : d.run}
      </button>
      <p role={status === "error" ? "alert" : "status"} aria-live="polite">
        {status ? d[status] : ""}
      </p>
    </div>
  );
}
