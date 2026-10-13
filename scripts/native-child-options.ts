type NativeChildEnvironment = Readonly<Record<string, string | undefined>>;

/** Optional owned-native child budget; never changes the supplied environment. */
export function nativeChildNodeOptions(
  environment: NativeChildEnvironment,
): string | undefined {
  const existing = environment.NODE_OPTIONS;
  const cap = environment.TALEATLAS_TEST_NATIVE_HEAP_MB;
  if (cap === undefined) return existing;

  if (
    cap.length !== 4 ||
    !/^[0-9]{4}$/.test(cap) ||
    Number(cap) < 1024 ||
    Number(cap) > 4096
  ) {
    throw new Error("Invalid native child heap budget");
  }

  // Bounded unquoted options only: do not guess Node's quote/escape grammar.
  // Default (no opt-in) still preserves any existing options without parsing.
  if (
    existing !== undefined &&
    /["'\\\u0000-\u001f\u007f]|[^\S ]/u.test(existing)
  ) {
    throw new Error("Native child Node options cannot be safely combined");
  }
  if (
    existing !== undefined &&
    /(?:^| )--max[-_]old[-_]space[-_]size(?:[-_]percentage)?(?:=| |$)/.test(
      existing,
    )
  ) {
    throw new Error("Conflicting native child heap option");
  }

  const option = `--max-old-space-size=${cap}`;
  return existing ? `${existing} ${option}` : option;
}
