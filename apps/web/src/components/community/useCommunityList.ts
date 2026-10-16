"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { communityListUrl, communityRequest, errorCopy } from "./client";
import { useCommunityReady } from "./useCommunityReady";

/** No hydration read/prefetch. Every explicit read clears old content and reveal state first. */
export function useCommunityList<T>(
  initial: unknown,
  schema: z.ZodType<T>,
  validate: (data: T) => void,
  path: string,
  locale: Locale,
) {
  const ready = useCommunityReady();
  function seed() {
    const data = schema.parse(initial);
    validate(data);
    return data;
  }
  const [data, setData] = useState<T | null>(seed);
  const [page, setPage] = useState(1),
    [refreshToken, setRefreshToken] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The owning wrapper remounts this hook on every SSR/RSC initial-object replacement.
  async function load(nextPage = page) {
    if (!ready || lock.current) return;
    lock.current = true;
    setData(null);
    setRefreshToken((value) => value + 1);
    setBusy(true);
    setError("");
    try {
      const result = await communityRequest(
        communityListUrl(path, locale, nextPage),
        schema,
      );
      validate(result);
      if (mounted.current) {
        setData(result);
        setPage(nextPage);
      }
    } catch (failure) {
      if (mounted.current) setError(errorCopy(failure, locale));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { data, page, refreshToken, busy, error, load };
}
