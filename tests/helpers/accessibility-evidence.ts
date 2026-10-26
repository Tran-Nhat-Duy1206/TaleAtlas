// Pure measurement contracts, not an accessibility certification or app-defect verdict.
export const PROFILES = Object.freeze([
  Object.freeze({
    id: "A",
    width: 375,
    height: 900,
    locale: "vi",
    theme: "dark",
  }),
  Object.freeze({
    id: "B",
    width: 768,
    height: 900,
    locale: "en",
    theme: "dark",
  }),
  Object.freeze({
    id: "C",
    width: 1280,
    height: 900,
    locale: "en",
    theme: "light",
  }),
  Object.freeze({
    id: "D",
    width: 1440,
    height: 900,
    locale: "vi",
    theme: "light",
  }),
] as const);

export type Color = { r: number; g: number; b: number; a: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
const CASES = [
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
] as const;
const STATES = [
  "DEFAULT",
  "EMPTY",
  "INVALID",
  "PENDING",
  "ERROR",
  "DISCLOSURE",
  "SYSTEM",
  "MOTION",
] as const;
const CODES = [
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
] as const;
export type Observation = {
  schema: 1;
  sourceSha: string;
  caseId: (typeof CASES)[number];
  profileId: (typeof PROFILES)[number]["id"];
  state: (typeof STATES)[number];
  scheme: "LIGHT" | "DARK";
  motion: "NO_PREFERENCE" | "REDUCE";
  outcome: "PASS" | "FAIL" | "NOT_RUN" | "NOT_VERIFIED";
  code: (typeof CODES)[number] | null;
  overflowPx: number | null;
  contrastRatio: number | null;
};

function fail(code: string): never {
  // Never interpolate untrusted values, retain causes, or log rejected input.
  throw new Error(code);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function member<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.some((item) => item === value);
}
function record(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      fail(code);
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    )
      fail(code);
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) fail(code);
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return fail(code);
  }
}
function color(value: unknown): Color {
  const c = record(value, ["r", "g", "b", "a"], "INVALID_COLOR");
  if (
    !bounded(c.r, 0, 255) ||
    !bounded(c.g, 0, 255) ||
    !bounded(c.b, 0, 255) ||
    !bounded(c.a, 0, 1)
  )
    fail("INVALID_COLOR");
  return { r: c.r, g: c.g, b: c.b, a: c.a };
}

export function parseColor(value: unknown): Color {
  if (typeof value !== "string" || value.length > 256) fail("INVALID_COLOR");
  const text = value.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (text === "black" || text === "white") {
    const channel = text === "black" ? 0 : 255;
    return { r: channel, g: channel, b: channel, a: 1 };
  }
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) {
    let hex = text.slice(1);
    if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join("");
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = /^(rgb|rgba)\(([^()]*)\)$/.exec(text);
  if (!match) fail("INVALID_COLOR");
  const body = match[2].trim();
  let channels: string[];
  let alpha: string | undefined;
  if (body.includes(",")) {
    const parts = body.split(",").map((part) => part.trim());
    if (parts.length !== (match[1] === "rgba" ? 4 : 3)) fail("INVALID_COLOR");
    channels = parts.slice(0, 3);
    alpha = parts[3];
    if (
      channels.some((part) => part.endsWith("%")) &&
      !channels.every((part) => part.endsWith("%"))
    )
      fail("INVALID_COLOR");
  } else {
    const parts = body.split("/");
    if (parts.length > 2) fail("INVALID_COLOR");
    channels = parts[0].trim().split(/\s+/);
    alpha = parts[1]?.trim();
  }
  if (channels.length !== 3) fail("INVALID_COLOR");
  const component = (part: string, maximum: number): number => {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(part)) fail("INVALID_COLOR");
    const percent = part.endsWith("%");
    const number = Number(percent ? part.slice(0, -1) : part);
    if (!bounded(number, 0, percent ? 100 : maximum)) fail("INVALID_COLOR");
    return percent ? (number / 100) * maximum : number;
  };
  return {
    r: component(channels[0], 255),
    g: component(channels[1], 255),
    b: component(channels[2], 255),
    a: alpha === undefined ? 1 : component(alpha, 1),
  };
}

export function composite(fg: unknown, bg: unknown): Color {
  const front = color(fg);
  const back = color(bg);
  const a = front.a + back.a * (1 - front.a);
  const channel = (key: "r" | "g" | "b") =>
    a === 0
      ? 0
      : (front[key] * front.a + back[key] * back.a * (1 - front.a)) / a;
  return { r: channel("r"), g: channel("g"), b: channel("b"), a };
}
export function contrastRatio(fg: unknown, bg: unknown): number {
  const front = color(fg);
  const back = color(bg);
  if (front.a !== 1 || back.a !== 1) fail("INVALID_COLOR");
  const luminance = (c: Color) => {
    const linear = (value: number) => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
  };
  const a = luminance(front);
  const b = luminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function classifyContrast(
  ratio: unknown,
  kind: "NORMAL_TEXT" | "LARGE_TEXT" | "NON_TEXT",
): "PASS" | "FAIL" {
  if (
    !bounded(ratio, 1, 21) ||
    !member(kind, ["NORMAL_TEXT", "LARGE_TEXT", "NON_TEXT"])
  )
    fail("INVALID_CONTRAST");
  return ratio >= (kind === "NORMAL_TEXT" ? 4.5 : 3) ? "PASS" : "FAIL";
}
export function validateRect(value: unknown): Rect {
  const r = record(value, ["left", "top", "right", "bottom"], "INVALID_RECT");
  if (
    !bounded(r.left, -100000, 100000) ||
    !bounded(r.top, -100000, 100000) ||
    !bounded(r.right, -100000, 100000) ||
    !bounded(r.bottom, -100000, 100000) ||
    r.right < r.left ||
    r.bottom < r.top
  )
    fail("INVALID_RECT");
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}
export function classifyOverflow(
  scrollWidth: unknown,
  clientWidth: unknown,
  tolerance = 1,
): "NONE" | "OVERFLOW" {
  if (
    !bounded(scrollWidth, 0, 100000) ||
    !bounded(clientWidth, 0, 100000) ||
    !bounded(tolerance, 0, 4)
  )
    fail("INVALID_GEOMETRY");
  return scrollWidth - clientWidth > tolerance ? "OVERFLOW" : "NONE";
}
export function classifyHorizontalBounds(
  rect: unknown,
  viewportWidth: unknown,
  tolerance = 1,
): "WITHIN" | "OUTSIDE" {
  const r = validateRect(rect);
  if (!bounded(viewportWidth, 0, 100000) || !bounded(tolerance, 0, 4))
    fail("INVALID_GEOMETRY");
  return r.left < -tolerance || r.right > viewportWidth + tolerance
    ? "OUTSIDE"
    : "WITHIN";
}

const OBSERVATION_KEYS = [
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
] as const;
export function projectObservation(
  value: unknown,
  expectedSha: string,
): Observation {
  const o = record(value, OBSERVATION_KEYS, "INVALID_OBSERVATION");
  if (
    typeof expectedSha !== "string" ||
    expectedSha.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(expectedSha) ||
    o.sourceSha !== expectedSha ||
    o.schema !== 1 ||
    !member(o.caseId, CASES) ||
    !member(o.profileId, ["A", "B", "C", "D"]) ||
    !member(o.state, STATES) ||
    !member(o.scheme, ["LIGHT", "DARK"]) ||
    !member(o.motion, ["NO_PREFERENCE", "REDUCE"]) ||
    !member(o.outcome, ["PASS", "FAIL", "NOT_RUN", "NOT_VERIFIED"]) ||
    (o.code !== null && !member(o.code, CODES)) ||
    (o.outcome === "PASS" && o.code !== null) ||
    (o.outcome === "FAIL" && o.code === null) ||
    (o.outcome === "NOT_RUN" &&
      (o.overflowPx !== null ||
        o.contrastRatio !== null ||
        (o.code !== null &&
          !member(o.code, [
            "FIXTURE_UNAVAILABLE",
            "MEASUREMENT_LIMITATION",
          ])))) ||
    (o.outcome === "NOT_VERIFIED" &&
      !member(o.code, [
        "MANUAL_REVIEW_REQUIRED",
        "MEASUREMENT_LIMITATION",
        "FIXTURE_UNAVAILABLE",
      ])) ||
    (o.overflowPx !== null && !bounded(o.overflowPx, 0, 100000)) ||
    (o.contrastRatio !== null && !bounded(o.contrastRatio, 1, 21))
  )
    fail("INVALID_OBSERVATION");
  return {
    schema: 1,
    sourceSha: expectedSha,
    caseId: o.caseId,
    profileId: o.profileId,
    state: o.state,
    scheme: o.scheme,
    motion: o.motion,
    outcome: o.outcome,
    code: o.code,
    overflowPx: o.overflowPx,
    contrastRatio: o.contrastRatio,
  };
}
