import { describe, expect, it } from "vitest";
import { nativeChildNodeOptions } from "../../scripts/native-child-options";

const budget = (cap: string, options?: string) =>
  Object.freeze({
    TALEATLAS_TEST_NATIVE_HEAP_MB: cap,
    NODE_OPTIONS: options,
  });

describe("owned-native child Node options", () => {
  it("returns undefined when neither option is supplied", () => {
    expect(nativeChildNodeOptions(Object.freeze({}))).toBeUndefined();
  });

  it.each([
    { label: "empty", options: "" },
    { label: "ordinary", options: " --trace-warnings  --enable-source-maps " },
    { label: "heap", options: "--max-old-space-size=3072" },
    {
      label: "percentage hyphen",
      options: "--max-old-space-size-percentage=50",
    },
    {
      label: "percentage underscore",
      options: "--max_old_space_size_percentage 50",
    },
    { label: "percentage mixed", options: "--max_old-space_size-percentage" },
    { label: "quoted", options: '--require "synthetic module"' },
    { label: "escaped", options: "--require synthetic\\module" },
    { label: "control", options: "--trace-warnings\n" },
  ])("preserves absent-opt-in $label options byte-for-byte", ({ options }) => {
    const environment = Object.freeze({ NODE_OPTIONS: options });
    expect(nativeChildNodeOptions(environment)).toBe(options);
    expect(environment).toEqual({ NODE_OPTIONS: options });
  });

  it.each([
    { label: "lower bound", cap: "1024" },
    { label: "interior lower", cap: "1025" },
    { label: "proposed budget", cap: "2048" },
    { label: "interior upper", cap: "4095" },
    { label: "upper bound", cap: "4096" },
  ])("accepts a canonical $label", ({ cap }) => {
    expect(nativeChildNodeOptions(budget(cap))).toBe(
      `--max-old-space-size=${cap}`,
    );
    expect(nativeChildNodeOptions(budget(cap, ""))).toBe(
      `--max-old-space-size=${cap}`,
    );
  });

  it("preserves other option bytes and appends only the child heap flag", () => {
    const options = " --trace-warnings  --enable-source-maps ";
    const environment = budget("2048", options);
    expect(nativeChildNodeOptions(environment)).toBe(
      `${options} --max-old-space-size=2048`,
    );
    expect(environment).toEqual({
      TALEATLAS_TEST_NATIVE_HEAP_MB: "2048",
      NODE_OPTIONS: options,
    });
  });

  const invalid = [
    "",
    " ",
    " 2048",
    "2048 ",
    "+2048",
    "-2048",
    "02048",
    "0000",
    "0999",
    "1000",
    "1023",
    "4097",
    "9999",
    "10000",
    "512",
    "2048.0",
    "2e3",
    "0x800",
    "2_048",
    "2048MB",
    "１２３４",
    "2048\n",
    "2048\r",
    "2048\u0000",
    "synthetic-sensitive-input",
  ].map((cap, index) => ({ cap, label: `invalid form ${index + 1}` }));
  it.each(invalid)("rejects $label with a redacted error", ({ cap }) => {
    const environment = budget(cap);
    expect(() => nativeChildNodeOptions(environment)).toThrow(
      new Error("Invalid native child heap budget"),
    );
    expect(environment).toEqual(budget(cap));
  });

  const conflicts = [
    "--max-old-space-size=3072",
    "--max-old-space-size 3072",
    "--max_old_space_size=3072",
    "--max_old_space_size 3072",
    "--trace-warnings --max-old-space-size=3072 --enable-source-maps",
    " --max_old_space_size 3072 ",
    "--max-old-space-size",
    "--max-old-space-size=",
    "--max_old-space_size=3072",
    "--max-old-space-size-percentage=50",
    "--max-old-space-size-percentage 50",
    "--max-old-space-size-percentage=",
    "--max-old-space-size-percentage",
    "--max_old_space_size_percentage=50",
    "--max_old_space_size_percentage 50",
    "--max_old_space_size_percentage=",
    "--max_old_space_size_percentage",
    "--max_old-space_size-percentage=50",
    "--max_old-space_size-percentage 50",
    "--max_old-space_size-percentage=",
    "--max_old-space_size-percentage",
  ].map((options, index) => ({ options, label: `conflict form ${index + 1}` }));
  it.each(conflicts)("refuses $label without overriding it", ({ options }) => {
    const environment = budget("2048", options);
    expect(() => nativeChildNodeOptions(environment)).toThrow(
      new Error("Conflicting native child heap option"),
    );
    expect(environment.NODE_OPTIONS).toBe(options);
  });

  const ambiguous = [
    '--require "synthetic module"',
    '"--max-old-space-size=3072"',
    "'--max_old_space_size' 3072",
    "--require synthetic\\module",
    '--require "unterminated',
    "--trace-warnings\t--enable-source-maps",
    "--trace-warnings\n",
    "--trace-warnings\r",
    "--trace-warnings\u0000",
    "--trace-warnings\u007f",
    "--trace-warnings\u00a0--max-old-space-size=3072",
    "--trace-warnings\u2028--max_old_space_size 3072",
  ].map((options, index) => ({
    options,
    label: `ambiguous form ${index + 1}`,
  }));
  it.each(ambiguous)("fails closed for $label", ({ options }) => {
    expect(() => nativeChildNodeOptions(budget("2048", options))).toThrow(
      new Error("Native child Node options cannot be safely combined"),
    );
  });
});
