import { describe, expect, it } from "vitest";
import {
  PROFILES,
  parseColor,
  composite,
  contrastRatio,
  classifyContrast,
  validateRect,
  classifyOverflow,
  classifyHorizontalBounds,
  projectObservation,
  type Observation,
} from "../helpers/accessibility-evidence";

const SHA = "45986e937ae17420c434834ca3ae3ae1222227cb";
const SENTINEL = "PRIVATE_SENTINEL_account_session_dom_url";
const black = { r: 0, g: 0, b: 0, a: 1 };
const white = { r: 255, g: 255, b: 255, a: 1 };
const rect = { left: 0, top: 0, right: 375, bottom: 900 };
const observation = (): Observation => ({
  schema: 1,
  sourceSha: SHA,
  caseId: "HOME",
  profileId: "A",
  state: "DEFAULT",
  scheme: "DARK",
  motion: "NO_PREFERENCE",
  outcome: "PASS",
  code: null,
  overflowPx: 0,
  contrastRatio: null,
});
function rejects(action: () => unknown, code: string) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const error = caught as Error;
  expect(error.message).toBe(code);
  expect(error).not.toHaveProperty("cause");
  expect(
    `${error.message}${error.stack}${JSON.stringify(error)}`,
  ).not.toContain(SENTINEL);
}

// Static pure-measurement contracts only: these do not certify actual accessibility.
describe("accessibility evidence profiles and color parsing", () => {
  it("publishes the four agreed immutable profiles", () => {
    expect(PROFILES).toEqual([
      { id: "A", width: 375, height: 900, locale: "vi", theme: "dark" },
      { id: "B", width: 768, height: 900, locale: "en", theme: "dark" },
      { id: "C", width: 1280, height: 900, locale: "en", theme: "light" },
      { id: "D", width: 1440, height: 900, locale: "vi", theme: "light" },
    ]);
    expect(Object.isFrozen(PROFILES)).toBe(true);
    expect(PROFILES.every(Object.isFrozen)).toBe(true);
  });
  it("expands three-digit hex", () => {
    expect(parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });
  it("expands four-digit hex including alpha", () => {
    expect(parseColor("#1238")).toEqual({ r: 17, g: 34, b: 51, a: 136 / 255 });
  });
  it("parses six-digit uppercase hex", () => {
    expect(parseColor(" #AABBCC ")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });
  it("parses eight-digit hex without rounding alpha", () => {
    expect(parseColor("#10203080")).toEqual({
      r: 16,
      g: 32,
      b: 48,
      a: 128 / 255,
    });
  });
  it("parses comma rgb and rgba", () => {
    expect(parseColor("rgb(12, 34, 56)")).toEqual({
      r: 12,
      g: 34,
      b: 56,
      a: 1,
    });
    expect(parseColor("rgba(12,34,56,.5)")).toEqual({
      r: 12,
      g: 34,
      b: 56,
      a: 0.5,
    });
  });
  it("parses modern spaces and slash alpha", () => {
    expect(parseColor("rgb(12 34 56 / 50%)")).toEqual({
      r: 12,
      g: 34,
      b: 56,
      a: 0.5,
    });
    expect(parseColor("rgba(12 34 56)")).toEqual({ r: 12, g: 34, b: 56, a: 1 });
  });
  it("supports bounded percentage channels", () => {
    expect(parseColor("rgb(100%, 0%, 50%)")).toEqual({
      r: 255,
      g: 0,
      b: 127.5,
      a: 1,
    });
  });
  it("supports transparent and the optional black and white names", () => {
    expect(parseColor("transparent")).toEqual({ ...black, a: 0 });
    expect(parseColor("black")).toEqual(black);
    expect(parseColor("white")).toEqual(white);
  });
  it("rejects malformed hex and unsupported CSS without leaking input", () => {
    for (const value of [
      "#12",
      "#12345",
      "#1234567",
      "#123456789",
      "#ggg",
      "red",
      "hsl(0 0% 0%)",
      "color(display-p3 1 0 0)",
      `var(--${SENTINEL})`,
    ]) {
      rejects(() => parseColor(value), "INVALID_COLOR");
    }
  });
  it("rejects nonfinite and out-of-range components rather than clamping", () => {
    for (const value of [
      "rgb(NaN 0 0)",
      "rgb(Infinity 0 0)",
      "rgb(256 0 0)",
      "rgb(-1 0 0)",
      "rgb(101% 0% 0%)",
      "rgba(0,0,0,1.01)",
      "rgb(0 0 0 / -0.1)",
    ]) {
      rejects(() => parseColor(value), "INVALID_COLOR");
    }
  });
  it("rejects malformed separators, missing values, and trailing content", () => {
    for (const value of [
      "rgb(0,0 0)",
      "rgb(0,0,0,1)",
      "rgba(0,0,0)",
      "rgb(0 0)",
      "rgb(0 0 0 /)",
      "rgb(0 0 0 / .5 / .5)",
      "rgb(0 0 0)junk",
      "rgb(0,,0)",
    ]) {
      rejects(() => parseColor(value), "INVALID_COLOR");
    }
  });
  it("rejects nonstrings without coercion and bounded-length violations", () => {
    let calls = 0;
    const hostile = {
      toString() {
        calls++;
        throw new Error(SENTINEL);
      },
    };
    for (const value of [
      null,
      undefined,
      0,
      NaN,
      Infinity,
      hostile,
      " ".repeat(257),
    ])
      rejects(() => parseColor(value), "INVALID_COLOR");
    expect(calls).toBe(0);
  });
});

describe("validated sRGB compositing and contrast", () => {
  it("composites half-transparent black over opaque white", () => {
    expect(composite({ ...black, a: 0.5 }, white)).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1,
    });
  });
  it("uses unpremultiplied output with two translucent colors", () => {
    expect(
      composite({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 0.5 }),
    ).toEqual({ r: 170, g: 0, b: 85, a: 0.75 });
  });
  it("handles transparent and opaque endpoints", () => {
    expect(composite({ ...white, a: 0 }, black)).toEqual(black);
    expect(composite(white, black)).toEqual(white);
    expect(composite({ ...white, a: 0 }, { ...black, a: 0 })).toEqual({
      ...black,
      a: 0,
    });
  });
  it("rejects invalid color objects and does not implicitly parse strings", () => {
    for (const value of [
      "#fff",
      null,
      { ...black, r: NaN },
      { ...black, g: Infinity },
      { ...black, b: 256 },
      { ...black, a: -0.1 },
      { ...black, a: 1.1 },
      { ...black, extra: SENTINEL },
    ]) {
      rejects(() => composite(value, white), "INVALID_COLOR");
      rejects(() => contrastRatio(white, value), "INVALID_COLOR");
    }
  });
  it("rejects color accessors without invoking getters", () => {
    let calls = 0;
    const value = {
      ...black,
      get r() {
        calls++;
        throw new Error(SENTINEL);
      },
    };
    rejects(() => composite(value, white), "INVALID_COLOR");
    rejects(() => contrastRatio(value, white), "INVALID_COLOR");
    expect(calls).toBe(0);
  });
  it("returns contrast 1 for identical opaque colors", () => {
    expect(contrastRatio(white, white)).toBe(1);
    expect(contrastRatio(black, black)).toBe(1);
  });
  it("returns contrast 21 for black and white symmetrically", () => {
    expect(contrastRatio(black, white)).toBe(21);
    expect(contrastRatio(white, black)).toBe(21);
  });
  it("uses standard luminance coefficients for primary colors", () => {
    expect(contrastRatio({ r: 255, g: 0, b: 0, a: 1 }, black)).toBeCloseTo(
      (0.2126 + 0.05) / 0.05,
      12,
    );
    expect(contrastRatio({ r: 0, g: 255, b: 0, a: 1 }, black)).toBeCloseTo(
      (0.7152 + 0.05) / 0.05,
      12,
    );
    expect(contrastRatio({ r: 0, g: 0, b: 255, a: 1 }, black)).toBeCloseTo(
      (0.0722 + 0.05) / 0.05,
      12,
    );
  });
  it("linearizes on both sides of the 0.04045 threshold", () => {
    for (const s of [0.04, 0.04045, 0.041]) {
      const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      const c = { r: s * 255, g: s * 255, b: s * 255, a: 1 };
      expect(contrastRatio(c, black)).toBeCloseTo((linear + 0.05) / 0.05, 12);
    }
  });
  it("requires both colors to be opaque for contrast", () => {
    rejects(() => contrastRatio({ ...black, a: 0.99 }, white), "INVALID_COLOR");
    rejects(() => contrastRatio(white, { ...black, a: 0 }), "INVALID_COLOR");
  });
  it("passes normal text at exactly 4.5 without rounding near misses", () => {
    expect(classifyContrast(4.5, "NORMAL_TEXT")).toBe("PASS");
    expect(classifyContrast(4.499999999, "NORMAL_TEXT")).toBe("FAIL");
    expect(classifyContrast(4.500000001, "NORMAL_TEXT")).toBe("PASS");
  });
  it("passes large text at exactly 3 without rounding near misses", () => {
    expect(classifyContrast(3, "LARGE_TEXT")).toBe("PASS");
    expect(classifyContrast(2.999999999, "LARGE_TEXT")).toBe("FAIL");
  });
  it("passes non-text at exactly 3 without rounding near misses", () => {
    expect(classifyContrast(3, "NON_TEXT")).toBe("PASS");
    expect(classifyContrast(2.999999999, "NON_TEXT")).toBe("FAIL");
  });
  it("classifies the valid contrast endpoints", () => {
    expect(classifyContrast(1, "NORMAL_TEXT")).toBe("FAIL");
    expect(classifyContrast(21, "NORMAL_TEXT")).toBe("PASS");
  });
  it("rejects invalid ratios and unknown runtime kinds", () => {
    for (const value of [0.99, 21.01, NaN, Infinity, "4.5", null])
      rejects(() => classifyContrast(value, "NORMAL_TEXT"), "INVALID_CONTRAST");
    rejects(
      () => classifyContrast(5, SENTINEL as "NORMAL_TEXT"),
      "INVALID_CONTRAST",
    );
  });
});

describe("bounded geometry classification, not automatic defect attribution", () => {
  it("returns fresh finite ordered rectangles, including zero-size and signed coordinates", () => {
    expect(validateRect(rect)).toEqual(rect);
    expect(validateRect(rect)).not.toBe(rect);
    expect(
      validateRect({
        left: -100000,
        top: -100000,
        right: 100000,
        bottom: 100000,
      }),
    ).toEqual({ left: -100000, top: -100000, right: 100000, bottom: 100000 });
    expect(validateRect({ left: 0, top: 0, right: 0, bottom: 0 })).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
  });
  it("rejects nonfinite, out-of-bound and reversed rectangles", () => {
    for (const value of [
      { ...rect, left: NaN },
      { ...rect, top: Infinity },
      { ...rect, bottom: 100001 },
      { ...rect, left: -100001 },
      { ...rect, right: -1 },
      { ...rect, bottom: -1 },
      { ...rect, left: "0" },
    ])
      rejects(() => validateRect(value), "INVALID_RECT");
  });
  it("rejects rectangle extra keys, arrays, and accessor fields", () => {
    let calls = 0;
    for (const value of [
      { ...rect, url: SENTINEL },
      [],
      {
        ...rect,
        get top() {
          calls++;
          return 0;
        },
      },
    ])
      rejects(() => validateRect(value), "INVALID_RECT");
    expect(calls).toBe(0);
  });
  it("uses an inclusive default one-pixel overflow tolerance", () => {
    expect(classifyOverflow(375, 375)).toBe("NONE");
    expect(classifyOverflow(376, 375)).toBe("NONE");
    expect(classifyOverflow(376.0001, 375)).toBe("OVERFLOW");
    expect(classifyOverflow(374, 375)).toBe("NONE");
  });
  it("supports zero and maximum four-pixel overflow tolerances", () => {
    expect(classifyOverflow(0, 0, 0)).toBe("NONE");
    expect(classifyOverflow(1, 0, 0)).toBe("OVERFLOW");
    expect(classifyOverflow(100000, 99996, 4)).toBe("NONE");
    expect(classifyOverflow(100000, 99995.9, 4)).toBe("OVERFLOW");
  });
  it("rejects invalid widths and tolerances", () => {
    for (const value of [-1, 100001, NaN, Infinity, "375", null]) {
      rejects(() => classifyOverflow(value, 375), "INVALID_GEOMETRY");
      rejects(() => classifyOverflow(375, value), "INVALID_GEOMETRY");
      rejects(() => classifyHorizontalBounds(rect, value), "INVALID_GEOMETRY");
    }
    for (const value of [-0.01, 4.01, NaN, Infinity]) {
      rejects(() => classifyOverflow(375, 375, value), "INVALID_GEOMETRY");
      rejects(
        () => classifyHorizontalBounds(rect, 375, value),
        "INVALID_GEOMETRY",
      );
    }
  });
  it("classifies both horizontal edges with inclusive tolerance", () => {
    expect(
      classifyHorizontalBounds({ ...rect, left: -1, right: 376 }, 375),
    ).toBe("WITHIN");
    expect(classifyHorizontalBounds({ ...rect, left: -1.001 }, 375)).toBe(
      "OUTSIDE",
    );
    expect(classifyHorizontalBounds({ ...rect, right: 376.001 }, 375)).toBe(
      "OUTSIDE",
    );
  });
  it("does not mistake vertical extent for horizontal overflow", () => {
    expect(
      classifyHorizontalBounds(
        { ...rect, top: -100000, bottom: 100000 },
        375,
        0,
      ),
    ).toBe("WITHIN");
    expect(
      classifyHorizontalBounds({ left: 0, top: 0, right: 0, bottom: 0 }, 0, 0),
    ).toBe("WITHIN");
    expect(
      classifyHorizontalBounds({ ...rect, left: -4, right: 379 }, 375, 4),
    ).toBe("WITHIN");
  });
});

describe("privacy-constrained observation projection", () => {
  it("reconstructs a fresh record with only the exact permitted flat keys", () => {
    const source = observation();
    const projected = projectObservation(source, SHA);
    expect(projected).toEqual(source);
    expect(projected).not.toBe(source);
    source.state = "ERROR";
    expect(projected.state).toBe("DEFAULT");
    expect(Object.keys(projected).sort()).toEqual(
      [
        "schema",
        "sourceSha",
        "caseId",
        "profileId",
        "state",
        "scheme",
        "motion",
        "outcome",
        "code",
        "overflowPx",
        "contrastRatio",
      ].sort(),
    );
  });
  it("accepts null-prototype data records", () => {
    const source = Object.assign(Object.create(null), observation());
    expect(projectObservation(source, SHA)).toEqual(observation());
  });
  it("accepts every agreed case, profile, and state identifier", () => {
    for (const caseId of [
      "HOME",
      "CATALOG",
      "DISCOVERY",
      "LOGIN",
      "LIBRARY",
      "REQUESTS",
      "REQUEST_FORM",
      "SETTINGS",
      "SYSTEM_THEME",
      "REDUCED_MOTION",
    ])
      expect(projectObservation({ ...observation(), caseId }, SHA).caseId).toBe(
        caseId,
      );
    for (const profileId of ["A", "B", "C", "D"])
      expect(
        projectObservation({ ...observation(), profileId }, SHA).profileId,
      ).toBe(profileId);
    for (const state of [
      "DEFAULT",
      "EMPTY",
      "INVALID",
      "PENDING",
      "ERROR",
      "DISCLOSURE",
      "SYSTEM",
      "MOTION",
    ])
      expect(projectObservation({ ...observation(), state }, SHA).state).toBe(
        state,
      );
  });
  it("accepts all fixed codes for non-passing evidence and bounded measurements", () => {
    for (const code of [
      "DOCUMENT_OVERFLOW",
      "CONTROL_BOUNDS",
      "LABEL_LINK",
      "FOCUS_NOT_VISIBLE",
      "SKIP_BYPASS",
      "THEME_RESOLUTION",
      "CONTRAST_BELOW_THRESHOLD",
      "MANUAL_REVIEW_REQUIRED",
      "DISCLOSURE_OPERATION",
      "STATE_SEMANTICS",
      "MEASUREMENT_LIMITATION",
      "FIXTURE_UNAVAILABLE",
    ])
      expect(
        projectObservation(
          {
            ...observation(),
            outcome: "FAIL",
            code,
            overflowPx: 100000,
            contrastRatio: 21,
          },
          SHA,
        ).code,
      ).toBe(code);
    expect(
      projectObservation(
        {
          ...observation(),
          outcome: "NOT_RUN",
          code: "FIXTURE_UNAVAILABLE",
          overflowPx: null,
          contrastRatio: null,
        },
        SHA,
      ).outcome,
    ).toBe("NOT_RUN");
    expect(
      projectObservation(
        {
          ...observation(),
          outcome: "NOT_VERIFIED",
          code: "MANUAL_REVIEW_REQUIRED",
          scheme: "LIGHT",
          motion: "REDUCE",
          contrastRatio: 1,
        },
        SHA,
      ).outcome,
    ).toBe("NOT_VERIFIED");
  });
  it("accepts unexecuted evidence only with absent measurements and permitted reasons", () => {
    for (const code of [
      null,
      "FIXTURE_UNAVAILABLE",
      "MEASUREMENT_LIMITATION",
    ]) {
      const source = {
        ...observation(),
        outcome: "NOT_RUN",
        code,
        overflowPx: null,
        contrastRatio: null,
      };
      expect(projectObservation(source, SHA)).toEqual(source);
    }
  });
  it("rejects unexecuted evidence carrying even zero-overflow or endpoint contrast measurements", () => {
    const source = {
      ...observation(),
      outcome: "NOT_RUN",
      code: "FIXTURE_UNAVAILABLE",
      overflowPx: null,
      contrastRatio: null,
    };
    for (const overflowPx of [0, 1, 100000])
      rejects(
        () => projectObservation({ ...source, overflowPx }, SHA),
        "INVALID_OBSERVATION",
      );
    for (const ratio of [1, 4.5, 21])
      rejects(
        () => projectObservation({ ...source, contrastRatio: ratio }, SHA),
        "INVALID_OBSERVATION",
      );
  });
  it("rejects unexecuted evidence claiming app failure or manual-review execution", () => {
    for (const code of [
      "DOCUMENT_OVERFLOW",
      "CONTROL_BOUNDS",
      "LABEL_LINK",
      "FOCUS_NOT_VISIBLE",
      "SKIP_BYPASS",
      "THEME_RESOLUTION",
      "CONTRAST_BELOW_THRESHOLD",
      "MANUAL_REVIEW_REQUIRED",
      "DISCLOSURE_OPERATION",
      "STATE_SEMANTICS",
    ]) {
      rejects(
        () =>
          projectObservation(
            {
              ...observation(),
              outcome: "NOT_RUN",
              code,
              overflowPx: null,
              contrastRatio: null,
            },
            SHA,
          ),
        "INVALID_OBSERVATION",
      );
    }
  });
  it("accepts unknown or manual evidence with each fixed explanatory reason", () => {
    for (const code of [
      "MANUAL_REVIEW_REQUIRED",
      "MEASUREMENT_LIMITATION",
      "FIXTURE_UNAVAILABLE",
    ]) {
      const source = {
        ...observation(),
        outcome: "NOT_VERIFIED",
        code,
        overflowPx: null,
        contrastRatio: null,
      };
      expect(projectObservation(source, SHA)).toEqual(source);
      expect(
        projectObservation(
          { ...source, overflowPx: 0, contrastRatio: 4.5 },
          SHA,
        ).outcome,
      ).toBe("NOT_VERIFIED");
    }
  });
  it("rejects unverified evidence with no explanation or contradictory app-failure reasons", () => {
    for (const code of [
      null,
      "DOCUMENT_OVERFLOW",
      "CONTROL_BOUNDS",
      "LABEL_LINK",
      "FOCUS_NOT_VISIBLE",
      "SKIP_BYPASS",
      "THEME_RESOLUTION",
      "CONTRAST_BELOW_THRESHOLD",
      "DISCLOSURE_OPERATION",
      "STATE_SEMANTICS",
    ]) {
      rejects(
        () =>
          projectObservation(
            { ...observation(), outcome: "NOT_VERIFIED", code },
            SHA,
          ),
        "INVALID_OBSERVATION",
      );
    }
  });
  it("rejects unknown identifiers, states, codes, and unsupported schema", () => {
    for (const key of [
      "caseId",
      "profileId",
      "state",
      "scheme",
      "motion",
      "outcome",
      "code",
      "schema",
    ])
      rejects(
        () => projectObservation({ ...observation(), [key]: SENTINEL }, SHA),
        "INVALID_OBSERVATION",
      );
    rejects(
      () => projectObservation({ ...observation(), schema: 2 }, SHA),
      "INVALID_OBSERVATION",
    );
  });
  it("rejects mismatched, uppercase, malformed, and non-authoritative SHA", () => {
    for (const expected of [
      "0".repeat(40),
      SHA.toUpperCase(),
      SHA.slice(1),
      `${SHA}\n`,
      SENTINEL,
    ])
      rejects(
        () => projectObservation(observation(), expected),
        "INVALID_OBSERVATION",
      );
    for (const sourceSha of ["0".repeat(40), SHA.toUpperCase(), null, NaN])
      rejects(
        () => projectObservation({ ...observation(), sourceSha }, SHA),
        "INVALID_OBSERVATION",
      );
  });
  it("enforces PASS/null and FAIL/non-null code consistency", () => {
    rejects(
      () =>
        projectObservation({ ...observation(), code: "CONTROL_BOUNDS" }, SHA),
      "INVALID_OBSERVATION",
    );
    rejects(
      () => projectObservation({ ...observation(), outcome: "FAIL" }, SHA),
      "INVALID_OBSERVATION",
    );
  });
  it("rejects invalid measurement types, nonfinite values, and range violations", () => {
    for (const overflowPx of [-1, 100001, NaN, Infinity, "0", undefined])
      rejects(
        () => projectObservation({ ...observation(), overflowPx }, SHA),
        "INVALID_OBSERVATION",
      );
    for (const ratio of [0.999, 21.001, NaN, Infinity, "4.5", undefined])
      rejects(
        () =>
          projectObservation({ ...observation(), contrastRatio: ratio }, SHA),
        "INVALID_OBSERVATION",
      );
  });
  it("rejects unknown privacy-bearing keys rather than silently serializing them", () => {
    for (const key of [
      "text",
      "url",
      "path",
      "dom",
      "session",
      "account",
      "zoom200",
    ])
      rejects(
        () => projectObservation({ ...observation(), [key]: SENTINEL }, SHA),
        "INVALID_OBSERVATION",
      );
  });
  it("rejects missing fields, primitives, arrays, and strings without coercion", () => {
    const { code: _code, ...missing } = observation();
    for (const value of [
      missing,
      null,
      undefined,
      [],
      [observation()],
      SENTINEL,
      1,
    ])
      rejects(() => projectObservation(value, SHA), "INVALID_OBSERVATION");
  });
  it("rejects accessors without invoking their getters", () => {
    let calls = 0;
    const value = {
      ...observation(),
      get state() {
        calls++;
        throw new Error(SENTINEL);
      },
    };
    rejects(() => projectObservation(value, SHA), "INVALID_OBSERVATION");
    const extra = Object.defineProperty(observation(), "private", {
      get() {
        calls++;
        throw new Error(SENTINEL);
      },
    });
    rejects(() => projectObservation(extra, SHA), "INVALID_OBSERVATION");
    expect(calls).toBe(0);
  });
  it("rejects own symbols including non-enumerable symbols", () => {
    const value = Object.defineProperty(observation(), Symbol(SENTINEL), {
      value: SENTINEL,
    });
    rejects(() => projectObservation(value, SHA), "INVALID_OBSERVATION");
  });
  it("rejects custom prototypes, inherited fields, and prototype-poisoning keys", () => {
    const custom = Object.assign(
      Object.create({ private: SENTINEL }),
      observation(),
    );
    const inherited = Object.create(observation());
    const poisoned = Object.defineProperty(observation(), "__proto__", {
      value: { private: SENTINEL },
      enumerable: true,
    });
    for (const value of [
      custom,
      inherited,
      poisoned,
      { ...observation(), constructor: SENTINEL },
    ])
      rejects(() => projectObservation(value, SHA), "INVALID_OBSERVATION");
  });
  it("replaces hostile reflection errors with a fixed safe error and no cause", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(SENTINEL);
        },
      },
    );
    rejects(() => projectObservation(hostile, SHA), "INVALID_OBSERVATION");
    rejects(() => composite(hostile, white), "INVALID_COLOR");
    rejects(() => validateRect(hostile), "INVALID_RECT");
  });
});
