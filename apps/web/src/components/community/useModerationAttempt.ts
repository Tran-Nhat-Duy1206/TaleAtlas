"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { useCommunityReady } from "./useCommunityReady";
import {
  CommunityClientError,
  communityRequest,
  errorCopy,
  freezeCommunityMutation,
  mutationOptions,
  type FrozenMutation,
} from "./client";

/** D-only command controller. No request, UUID, retry or authority effect runs on mount/hydration. */
export function useModerationAttempt<T>(
  locale: Locale,
  responseSchema: z.ZodType<T>,
  validate: (value: T) => void,
  confirmed: (value: T) => void,
  conflict: () => void,
) {
  const ready = useCommunityReady();
  const [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState<FrozenMutation | null>(null);
  const [failure, setFailure] = useState<CommunityClientError | null>(null),
    [error, setError] = useState("");
  const lock = useRef(false),
    attempt = useRef<FrozenMutation | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function send(selected: FrozenMutation) {
    if (!ready || lock.current || attempt.current !== selected) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      const result = await communityRequest(
        selected.url,
        responseSchema,
        mutationOptions(selected),
      );
      validate(result);
      if (!mounted.current) return;
      attempt.current = null;
      setFrozen(null);
      setFailure(null);
      confirmed(result);
    } catch (cause) {
      if (mounted.current) {
        const next =
          cause instanceof CommunityClientError
            ? cause
            : new CommunityClientError(0, true);
        setFailure(next);
        setError(errorCopy(next, locale));
        if (
          next.status === 409 ||
          next.status === 401 ||
          next.status === 403 ||
          next.status === 404
        )
          conflict();
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function submit<I>(
    inputSchema: z.ZodType<I>,
    fields: () => unknown,
    url: string,
  ) {
    if (!ready || lock.current || attempt.current || failure?.status === 409)
      return false;
    try {
      // Invoke field/UUID construction only after the readiness and frozen-attempt guards.
      const selected = freezeCommunityMutation(
        inputSchema,
        fields(),
        url,
        "POST",
      );
      attempt.current = selected;
      setFrozen(selected);
      void send(selected);
      return true;
    } catch (cause) {
      setError(errorCopy(cause, locale));
      return false;
    }
  }
  async function restart(reloadMetadata: () => Promise<void>) {
    if (!ready || lock.current || !attempt.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await reloadMetadata();
      if (mounted.current) {
        attempt.current = null;
        setFrozen(null);
        setFailure(null);
        setError("");
      }
    } catch (cause) {
      if (mounted.current) setError(errorCopy(cause, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    ready,
    busy,
    frozen,
    failure,
    error,
    submit,
    restart,
    canStart: ready && !busy && frozen === null && failure?.status !== 409,
    guarded: () =>
      ready &&
      !lock.current &&
      attempt.current === null &&
      failure?.status !== 409,
    retry: () => {
      if (ready && !lock.current && attempt.current && failure?.uncertain)
        void send(attempt.current);
    },
  };
}
