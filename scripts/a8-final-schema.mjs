// Closed observational evidence only. No I/O, exceptions, text or DOM identities.
const fail = () => {
  throw new Error("A8_FINAL_EVIDENCE_REJECTED");
};
export const SITES = Object.freeze([
  "LIBRARY_FILTER",
  "MY_REQUESTS",
  "REQUEST_FORM",
  "SETTINGS",
]);
export const OWNER_IDS = Object.freeze(["A8_OWNER_A", "A8_OWNER_C"]);
export const PHASES = Object.freeze([
  "BOOT",
  "REGISTER",
  "SIGN_UP",
  "VERIFY",
  "SIGN_IN",
  "SETTINGS",
  "LOGOUT",
  "DONE",
]);
const TYPES = ["input", "select", "textarea", "button", "summary"];
const FLAGS = [
  "closedDetails",
  "closedDetailsExcluded",
  "displayNone",
  "visibilityHidden",
  "ancestorVisibilityHidden",
  "inert",
  "hidden",
  "contentHidden",
  "opacityZero",
  "pointerNone",
  "disabled",
];
const END_KEYS = ["index", "type", ...FLAGS, "checkVisibility", "hit"];
const AUTH_KEYS = [
  "id",
  "retry",
  "phase",
  "signUp",
  "signIn",
  "verificationReached",
  "settingsReached",
  "headerState",
  "settingsState",
  "sessionTransport",
  "accountVisible",
  "accountMatch",
  "snapshot",
  "observationError",
];
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
function exact(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some((k) => !keys.includes(k)))
    fail();
  const out = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail();
    out[key] = d.value;
  }
  return out;
}
const isBoolean = (v) => typeof v === "boolean";
const suppressed = (v) =>
  v.closedDetailsExcluded ||
  v.displayNone ||
  v.visibilityHidden ||
  v.contentHidden ||
  v.opacityZero;
function endpoint(value) {
  const e = exact(value, END_KEYS);
  if (
    !integer(e.index, 127) ||
    !TYPES.includes(e.type) ||
    FLAGS.some((k) => !isBoolean(e[k])) ||
    !["VISIBLE", "NOT_VISIBLE", "UNSUPPORTED", "UNKNOWN"].includes(
      e.checkVisibility,
    ) ||
    !["SELF", "PEER", "OTHER", "NONE", "OUTSIDE", "UNKNOWN"].includes(e.hit)
  )
    fail();
  if (e.closedDetailsExcluded && !e.closedDetails) fail();
  return Object.fromEntries(END_KEYS.map((k) => [k, e[k]]));
}
export function validateGeometry(value) {
  try {
    const g = exact(value, [
      "id",
      "retry",
      "site",
      "overlap",
      "eligibility",
      "pair",
    ]);
    if (
      !OWNER_IDS.includes(g.id) ||
      !integer(g.retry, 1) ||
      !SITES.includes(g.site) ||
      !isBoolean(g.overlap)
    )
      fail();
    if (!g.overlap) {
      if (g.pair !== null || g.eligibility !== null) fail();
      return {
        id: g.id,
        retry: g.retry,
        site: g.site,
        overlap: false,
        eligibility: null,
        pair: null,
      };
    }
    if (
      !["ALL_SUPPRESSED", "UNSUPPRESSED_CANDIDATE", "UNKNOWN"].includes(
        g.eligibility,
      )
    )
      fail();
    const p = exact(g.pair, [
      "a",
      "b",
      "intersectionWidth",
      "intersectionHeight",
    ]);
    const a = endpoint(p.a),
      b = endpoint(p.b);
    if (
      a.index >= b.index ||
      ![p.intersectionWidth, p.intersectionHeight].every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && n > 1 && n <= 100000,
      )
    )
      fail();
    if (g.eligibility === "ALL_SUPPRESSED" && !suppressed(a) && !suppressed(b))
      fail();
    if (
      g.eligibility === "UNSUPPRESSED_CANDIDATE" &&
      (suppressed(a) ||
        suppressed(b) ||
        a.checkVisibility !== "VISIBLE" ||
        b.checkVisibility !== "VISIBLE")
    )
      fail();
    return {
      id: g.id,
      retry: g.retry,
      site: g.site,
      overlap: true,
      eligibility: g.eligibility,
      pair: {
        a,
        b,
        intersectionWidth: p.intersectionWidth,
        intersectionHeight: p.intersectionHeight,
      },
    };
  } catch {
    fail();
  }
}
function response(value) {
  const r = exact(value, ["status", "result"]);
  if (
    ![
      "NOT_ATTEMPTED",
      "MISSING",
      "CANCELED",
      "FAILED",
      "RESPONSE",
      "MULTIPLE",
    ].includes(r.result)
  )
    fail();
  if (r.result === "RESPONSE") {
    if (!Number.isSafeInteger(r.status) || r.status < 100 || r.status > 599)
      fail();
  } else if (r.status !== null) fail();
  return { status: r.status, result: r.result };
}
export function validateAuth(value) {
  try {
    const a = exact(value, AUTH_KEYS);
    if (
      a.id !== "T0016" ||
      !integer(a.retry, 1) ||
      !PHASES.includes(a.phase) ||
      !isBoolean(a.verificationReached) ||
      !isBoolean(a.settingsReached) ||
      !["authenticated", "anonymous", "pending", "error", "unknown"].includes(
        a.headerState,
      ) ||
      ![
        "ACCOUNT_RENDERED",
        "STATUS_PRESENT",
        "ALERT_PRESENT",
        "NOT_SETTINGS",
        "UNKNOWN",
      ].includes(a.settingsState) ||
      ![
        "NOT_OBSERVED",
        "HTTP_OK",
        "RATE_LIMITED",
        "HTTP_ERROR",
        "CANCELED",
        "FAILED",
        "MULTIPLE",
      ].includes(a.sessionTransport) ||
      !(a.accountVisible === null || isBoolean(a.accountVisible)) ||
      !["ZERO", "ONE", "MULTIPLE", "UNKNOWN"].includes(a.accountMatch) ||
      !["POST_SIGN_IN", "FINAL", "NONE"].includes(a.snapshot) ||
      !isBoolean(a.observationError)
    )
      fail();
    if (
      a.snapshot === "NONE" &&
      (a.headerState !== "unknown" ||
        a.settingsState !== "UNKNOWN" ||
        a.accountVisible !== null ||
        a.accountMatch !== "UNKNOWN")
    )
      fail();
    if (a.accountMatch === "ZERO" && a.accountVisible !== false) fail();
    return {
      id: "T0016",
      retry: a.retry,
      phase: a.phase,
      signUp: response(a.signUp),
      signIn: response(a.signIn),
      verificationReached: a.verificationReached,
      settingsReached: a.settingsReached,
      headerState: a.headerState,
      settingsState: a.settingsState,
      sessionTransport: a.sessionTransport,
      accountVisible: a.accountVisible,
      accountMatch: a.accountMatch,
      snapshot: a.snapshot,
      observationError: a.observationError,
    };
  } catch {
    fail();
  }
}
export function validateEvidenceFile(value) {
  const e = exact(value, ["kind", "value"]);
  if (e.kind === "geometry")
    return { kind: "geometry", value: validateGeometry(e.value) };
  if (e.kind === "auth") return { kind: "auth", value: validateAuth(e.value) };
  fail();
}
export function selfTestEvidence() {
  let touched = false;
  const poison = {
    get() {
      touched = true;
      throw new Error("PRIVATE_SENTINEL");
    },
    enumerable: true,
  };
  const e = {
    index: 0,
    type: "textarea",
    ...Object.fromEntries(FLAGS.map((k) => [k, false])),
    checkVisibility: "NOT_VISIBLE",
    hit: "OUTSIDE",
  };
  e.closedDetails = true;
  e.closedDetailsExcluded = true;
  const g = {
    id: "A8_OWNER_A",
    retry: 0,
    site: "REQUEST_FORM",
    overlap: true,
    eligibility: "ALL_SUPPRESSED",
    pair: {
      a: e,
      b: { ...e, index: 2, type: "input" },
      intersectionWidth: 12,
      intersectionHeight: 14,
    },
  };
  const a = {
    id: "T0016",
    retry: 1,
    phase: "SIGN_UP",
    signUp: { status: 429, result: "RESPONSE" },
    signIn: { status: null, result: "NOT_ATTEMPTED" },
    verificationReached: false,
    settingsReached: false,
    headerState: "anonymous",
    settingsState: "NOT_SETTINGS",
    sessionTransport: "NOT_OBSERVED",
    accountVisible: null,
    accountMatch: "UNKNOWN",
    snapshot: "FINAL",
    observationError: false,
  };
  const reject = (fn, value) => {
    let bad = false;
    try {
      fn(value);
    } catch {
      bad = true;
    }
    if (!bad) fail();
  };
  validateGeometry(g);
  validateAuth(a);
  const painted = {
    ...e,
    closedDetails: false,
    closedDetailsExcluded: false,
    checkVisibility: "VISIBLE",
    inert: true,
    disabled: true,
    pointerNone: true,
    hidden: true,
    ancestorVisibilityHidden: true,
  };
  const visiblePair = {
    ...g,
    eligibility: "UNSUPPRESSED_CANDIDATE",
    pair: { ...g.pair, a: painted, b: { ...painted, index: 2 } },
  };
  validateGeometry(visiblePair);
  reject(validateGeometry, { ...visiblePair, eligibility: "ALL_SUPPRESSED" });
  const summaryPair = {
    ...visiblePair,
    pair: {
      ...visiblePair.pair,
      a: { ...painted, type: "summary", closedDetails: true },
    },
  };
  validateGeometry(summaryPair);
  reject(validateGeometry, { ...summaryPair, eligibility: "ALL_SUPPRESSED" });
  reject(validateAuth, { ...a, signUp: { status: 429, result: "CANCELED" } });
  reject(validateAuth, { ...a, sessionTransport: "HTTP_ERROR_PRIVATE" });
  for (const n of [NaN, Infinity, -1, 0, 100001, "private"])
    reject(validateGeometry, {
      ...g,
      pair: { ...g.pair, intersectionWidth: n },
    });
  for (const change of [
    { email: "private@example.invalid" },
    { site: "REQUEST_FORM?secret=x" },
    { id: "A8_OWNER_A_PRIVATE" },
    { retry: 2 },
    { overlap: false },
  ])
    reject(validateGeometry, { ...g, ...change });
  for (const change of [
    { url: "https://private.invalid/?token=x" },
    { phase: "SIGN_UP_PRIVATE" },
    { headerState: "secret" },
    { retry: -1 },
    { snapshot: "NONE" },
  ])
    reject(validateAuth, { ...a, ...change });
  for (const status of [NaN, Infinity, 0, 99, 600, "429"])
    reject(validateAuth, { ...a, signUp: { status, result: "RESPONSE" } });
  for (const value of [
    Object.assign(Object.create({}), g),
    { ...g, [Symbol("private")]: true },
    {
      ...g,
      toJSON() {
        return "private";
      },
    },
  ])
    reject(validateGeometry, value);
  const getter = { ...g };
  Object.defineProperty(getter, "pair", poison);
  reject(validateGeometry, getter);
  const nested = { ...e };
  Object.defineProperty(nested, "type", poison);
  reject(validateGeometry, { ...g, pair: { ...g.pair, a: nested } });
  const authGetter = { ...a };
  Object.defineProperty(authGetter, "signUp", poison);
  reject(validateAuth, authGetter);
  if (
    touched ||
    /PRIVATE_SENTINEL|private@example|token=/.test(
      JSON.stringify([validateGeometry(g), validateAuth(a)]),
    )
  )
    fail();
  return true;
}
