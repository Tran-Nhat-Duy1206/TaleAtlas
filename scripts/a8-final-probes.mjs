import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  validateGeometry,
  validateAuth,
  validateEvidenceFile,
} from "./a8-final-schema.mjs";

let counter = 0;
// No logging, attachments or fallbacks. Only an owned, private CI directory is eligible.
function emit(kind, value) {
  try {
    const envelope = validateEvidenceFile({ kind, value });
    const dir = process.env.A8_DIAG_PRIVATE;
    const temp = process.env.RUNNER_TEMP;
    if (
      process.platform !== "linux" ||
      process.env.CI !== "true" ||
      !dir ||
      !temp
    )
      return;
    const resolved = path.resolve(dir),
      base = fs.realpathSync(temp);
    if (
      resolved === base ||
      !resolved.startsWith(base + path.sep) ||
      fs.realpathSync(resolved) !== resolved
    )
      return;
    const stat = fs.lstatSync(resolved);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== 0o700 ||
      stat.uid !== process.getuid()
    )
      return;
    const file = path.join(
      resolved,
      `a8-final-evidence-${process.pid}-${++counter}.json`,
    );
    const fd = fs.openSync(
      file,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fs.writeFileSync(fd, JSON.stringify(envelope));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* Observations must never replace the test outcome. */
  }
}

export function recordGeometry(site, safe, testInfo) {
  try {
    const title = testInfo.title;
    const id =
      title === "A8 Owner A"
        ? "A8_OWNER_A"
        : title === "A8 Owner C"
          ? "A8_OWNER_C"
          : null;
    if (!id || !safe) return;
    emit(
      "geometry",
      validateGeometry({ id, retry: testInfo.retry, site, ...safe }),
    );
  } catch {
    /* best effort */
  }
}

// Self-contained: serialized into the existing page.evaluate callback. No line comments.
export function browserGeometryObserver(enabled) {
  const cache = new WeakMap();
  let first = null,
    candidate = null,
    unknown = null,
    allSuppressed = true,
    failed = false;
  const suppressed = (e) =>
    e.closedDetailsExcluded ||
    e.displayNone ||
    e.visibilityHidden ||
    e.contentHidden ||
    e.opacityZero;
  function flags(el, index) {
    if (cache.has(el)) return cache.get(el);
    const e = {
      index,
      type: el.tagName.toLowerCase(),
      closedDetails: false,
      closedDetailsExcluded: false,
      displayNone: false,
      visibilityHidden: false,
      ancestorVisibilityHidden: false,
      inert: false,
      hidden: false,
      contentHidden: false,
      opacityZero: false,
      pointerNone: false,
      disabled: false,
      checkVisibility: "UNSUPPORTED",
      hit: "UNKNOWN",
    };
    if (
      !["input", "select", "textarea", "button", "summary"].includes(e.type) ||
      index < 0 ||
      index > 127
    )
      throw new Error();
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      e.displayNone ||= s.display === "none";
      e.opacityZero ||= Number(s.opacity) === 0;
      e.pointerNone ||= s.pointerEvents === "none";
      e.inert ||= n.hasAttribute("inert");
      e.hidden ||= n.hasAttribute("hidden");
      e.disabled ||= n.hasAttribute("disabled");
      if (n === el)
        e.visibilityHidden =
          s.visibility === "hidden" || s.visibility === "collapse";
      else {
        e.ancestorVisibilityHidden ||=
          s.visibility === "hidden" || s.visibility === "collapse";
        e.contentHidden ||= s.contentVisibility === "hidden";
      }
      if (n.tagName === "DETAILS" && !n.open) {
        e.closedDetails = true;
        const summary = Array.from(n.children).find(
          (c) => c.tagName === "SUMMARY",
        );
        if (!summary || !summary.contains(el)) e.closedDetailsExcluded = true;
      }
    }
    if (typeof el.checkVisibility === "function") {
      try {
        e.checkVisibility = el.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
        })
          ? "VISIBLE"
          : "NOT_VISIBLE";
      } catch {
        e.checkVisibility = "UNKNOWN";
      }
    }
    cache.set(el, e);
    return e;
  }
  const pairs = [];
  function pair(i, j, ar, br) {
    try {
      if (enabled && pairs.length < 8128)
        pairs.push([i, j, { ...ar }, { ...br }]);
    } catch {
      failed = true;
    }
  }
  function observePair(a, b, i, j, ar, br) {
    if (!enabled) return;
    try {
      const w = Math.min(ar.right, br.right) - Math.max(ar.left, br.left),
        h = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
      if (![w, h].every((n) => Number.isFinite(n) && n > 1 && n <= 100000)) {
        failed = true;
        allSuppressed = false;
        return;
      }
      const ae = { ...flags(a, i) },
        be = { ...flags(b, j) };
      const x = (Math.max(ar.left, br.left) + Math.min(ar.right, br.right)) / 2,
        y = (Math.max(ar.top, br.top) + Math.min(ar.bottom, br.bottom)) / 2;
      if (![x, y].every(Number.isFinite)) {
        failed = true;
        return;
      }
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
        ae.hit = "OUTSIDE";
        be.hit = "OUTSIDE";
      } else {
        try {
          const hit = document.elementFromPoint(x, y);
          const membership = (self, peer) =>
            !hit
              ? "NONE"
              : self === hit || self.contains(hit)
                ? "SELF"
                : peer === hit || peer.contains(hit)
                  ? "PEER"
                  : "OTHER";
          ae.hit = membership(a, b);
          be.hit = membership(b, a);
        } catch {
          ae.hit = "UNKNOWN";
          be.hit = "UNKNOWN";
        }
      }
      const p = { a: ae, b: be, intersectionWidth: w, intersectionHeight: h };
      first ||= p;
      if (!suppressed(ae) && !suppressed(be)) {
        allSuppressed = false;
        if (
          ae.checkVisibility === "VISIBLE" &&
          be.checkVisibility === "VISIBLE"
        )
          candidate ||= p;
        else unknown ||= p;
      }
    } catch {
      failed = true;
      allSuppressed = false;
    }
  }
  function result(overlap, controls) {
    try {
      if (!enabled) return null;
      if (!overlap) return { overlap: false, eligibility: null, pair: null };
      for (const [i, j, ar, br] of pairs)
        observePair(controls[i], controls[j], i, j, ar, br);
      if (!first) return null;
      return {
        overlap: true,
        eligibility: failed
          ? "UNKNOWN"
          : allSuppressed
            ? "ALL_SUPPRESSED"
            : candidate
              ? "UNSUPPRESSED_CANDIDATE"
              : "UNKNOWN",
        pair: candidate || unknown || first,
      };
    } catch {
      return null;
    }
  }
  return { pair, result };
}

const probes = new WeakMap();
function error(p) {
  if (p) p.value.observationError = true;
}
function responseState(slot) {
  if (slot.count > 1) return { status: null, result: "MULTIPLE" };
  return slot.count
    ? { status: slot.status, result: slot.result }
    : { status: null, result: "NOT_ATTEMPTED" };
}
export function beginFoundationAuth(page, testInfo) {
  let p = null;
  try {
    p = {
      value: {
        id: "T0016",
        retry: testInfo.retry,
        phase: "BOOT",
        signUp: { status: null, result: "NOT_ATTEMPTED" },
        signIn: { status: null, result: "NOT_ATTEMPTED" },
        verificationReached: false,
        settingsReached: false,
        headerState: "unknown",
        settingsState: "UNKNOWN",
        sessionTransport: "NOT_OBSERVED",
        accountVisible: null,
        accountMatch: "UNKNOWN",
        snapshot: "NONE",
        observationError: false,
      },
      up: { count: 0, status: null, result: "MISSING" },
      in: { count: 0, status: null, result: "MISSING" },
      requests: new WeakMap(),
      listeners: [],
    };
    probes.set(p, p);
    const listen = (event, fn) => {
      const safe = (...args) => {
        try {
          fn(...args);
        } catch {
          error(p);
        }
      };
      p.listeners.push([event, safe]);
      page.on(event, safe);
    };
    const classify = (request) => {
      const u = new URL(request.url());
      const current = new URL(page.url());
      if (
        !["http:", "https:"].includes(current.protocol) ||
        u.origin !== current.origin
      )
        return null;
      if (
        request.method() === "POST" &&
        u.pathname === "/api/auth/sign-up/email"
      )
        return "up";
      if (
        request.method() === "POST" &&
        u.pathname === "/api/auth/sign-in/email"
      )
        return "in";
      if (
        request.method() === "GET" &&
        u.pathname === "/api/auth/get-session" &&
        ["SIGN_IN", "SETTINGS"].includes(p.value.phase)
      )
        return "session";
      return null;
    };
    // RATE_LIMITED means at least one observed 429, not necessarily the last outcome.
    const transport = (category) => {
      const old = p.value.sessionTransport;
      p.value.sessionTransport =
        old === "RATE_LIMITED" || category === "RATE_LIMITED"
          ? "RATE_LIMITED"
          : old === "NOT_OBSERVED" || old === category
            ? category
            : "MULTIPLE";
    };
    listen("request", (request) => {
      const key = classify(request);
      if (!key) return;
      p.requests.set(request, key);
      if (key !== "session") {
        p[key].count++;
        p[key].status = null;
        p[key].result = "MISSING";
      }
    });
    listen("response", (response) => {
      const request = response.request();
      const key = p.requests.get(request);
      if (!key) return;
      const status = response.status();
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        error(p);
        return;
      }
      if (key === "session")
        transport(
          status === 429
            ? "RATE_LIMITED"
            : status >= 200 && status < 300
              ? "HTTP_OK"
              : "HTTP_ERROR",
        );
      else {
        p[key].status = status;
        p[key].result = "RESPONSE";
      }
    });
    listen("requestfailed", (request) => {
      const key = p.requests.get(request);
      if (!key) return;
      const failure = request.failure();
      const result =
        failure?.errorText === "net::ERR_ABORTED" ||
        failure?.errorText === "ERR_ABORTED"
          ? "CANCELED"
          : "FAILED";
      if (key === "session") transport(result);
      else {
        p[key].status = null;
        p[key].result = result;
      }
    });
    listen("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const u = new URL(frame.url());
      const current = new URL(page.url());
      if (
        !["http:", "https:"].includes(u.protocol) ||
        u.origin !== current.origin
      )
        return;
      if (
        ["SIGN_UP", "VERIFY", "SIGN_IN", "SETTINGS", "LOGOUT", "DONE"].includes(
          p.value.phase,
        ) &&
        /^\/(en|vi)\/verify-email$/.test(u.pathname)
      )
        p.value.verificationReached = true;
      if (
        ["SIGN_IN", "SETTINGS", "LOGOUT", "DONE"].includes(p.value.phase) &&
        /^\/(en|vi)\/settings$/.test(u.pathname)
      )
        p.value.settingsReached = true;
    });
  } catch {
    error(p);
  }
  return p;
}
export function setFoundationPhase(p, phase) {
  try {
    if (
      probes.has(p) &&
      [
        "BOOT",
        "REGISTER",
        "SIGN_UP",
        "VERIFY",
        "SIGN_IN",
        "SETTINGS",
        "LOGOUT",
        "DONE",
      ].includes(phase)
    )
      p.value.phase = phase;
  } catch {
    error(p);
  }
}
async function snapshot(p, page, expectedEmail, label) {
  try {
    if (!probes.has(p)) return;
    p.value.snapshot = label;
    // One read-only evaluate returns closed categories, never the source attribute or DOM.
    const state = await page.evaluate(() => {
      const raw = document
        .querySelector("header.site-header .nav-account")
        ?.getAttribute("data-session-state");
      const headerState =
        raw === "authenticated"
          ? "authenticated"
          : raw === "anonymous"
            ? "anonymous"
            : raw === "pending"
              ? "pending"
              : raw === "error"
                ? "error"
                : "unknown";
      const main = document.querySelector("#main");
      const settingsState =
        location.pathname !== "/en/settings"
          ? "NOT_SETTINGS"
          : main?.querySelector(".settings-page .settings-card dl")
            ? "ACCOUNT_RENDERED"
            : main?.querySelector('[role="alert"]')
              ? "ALERT_PRESENT"
              : main?.querySelector('[role="status"]')
                ? "STATUS_PRESENT"
                : "UNKNOWN";
      return { headerState, settingsState };
    });
    p.value.headerState = state.headerState;
    p.value.settingsState = state.settingsState;
    p.value.accountVisible = null;
    p.value.accountMatch = "UNKNOWN";
    if (typeof expectedEmail === "string") {
      const locator = page.getByText(expectedEmail, { exact: true });
      const count = await locator.count();
      p.value.accountMatch =
        count === 0 ? "ZERO" : count === 1 ? "ONE" : "MULTIPLE";
      p.value.accountVisible =
        count === 0 ? false : count === 1 ? await locator.isVisible() : null;
    }
  } catch {
    error(p);
  }
}
export async function captureFoundationAccount(p, page, expectedEmail) {
  try {
    await snapshot(p, page, expectedEmail, "POST_SIGN_IN");
  } catch {
    error(p);
  }
}
export async function finishFoundationAuth(p, page) {
  try {
    if (!probes.has(p)) return;
    if (p.value.snapshot === "NONE")
      await snapshot(p, page, undefined, "FINAL");
  } catch {
    error(p);
  } finally {
    try {
      for (const [event, fn] of p?.listeners || []) {
        try {
          page.off(event, fn);
        } catch {
          error(p);
        }
      }
    } catch {
      error(p);
    }
    try {
      if (probes.has(p)) {
        p.value.signUp = responseState(p.up);
        p.value.signIn = responseState(p.in);
        emit("auth", validateAuth(p.value));
        probes.delete(p);
      }
    } catch {
      /* best effort */
    }
  }
}

// Executes the serialized observer, not a rewritten test implementation.
function selfTestGeometryObserver() {
  const check = (condition) => {
    if (!condition) throw new Error("A8_GEOMETRY_SELFTEST");
  };
  const node = (tagName, parentElement = null, style = {}, attrs = []) => {
    const n = {
      tagName,
      parentElement,
      children: [],
      open: false,
      style,
      hasAttribute: (name) => attrs.includes(name),
      checkVisibility: () => true,
    };
    n.contains = (other) => {
      for (let p = other; p; p = p.parentElement) if (p === n) return true;
      return false;
    };
    if (parentElement) parentElement.children.push(n);
    return n;
  };
  const details = node("DETAILS"),
    summary = node("SUMMARY", details),
    textarea = node("TEXTAREA", details),
    checkbox = node("INPUT");
  let hit = checkbox;
  const context = {
    innerWidth: 400,
    innerHeight: 400,
    document: { elementFromPoint: () => hit },
    getComputedStyle: (el) => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
      contentVisibility: "visible",
      ...el.style,
    }),
  };
  const factory = () =>
    vm.runInNewContext(
      `(${browserGeometryObserver.toString().replace(/[\r\n]+/g, " ")})(true)`,
      context,
    );
  const box = { left: 10, top: 10, right: 30, bottom: 30 };
  const safe = (value) =>
    value === null
      ? null
      : validateGeometry({
          id: "A8_OWNER_A",
          retry: 0,
          site: "REQUEST_FORM",
          ...JSON.parse(JSON.stringify(value)),
        });
  let observer = factory();
  observer.pair(0, 1, box, box);
  let value = safe(observer.result(true, [textarea, checkbox, summary]));
  check(
    value.eligibility === "ALL_SUPPRESSED" &&
      value.pair.a.closedDetails &&
      value.pair.a.closedDetailsExcluded &&
      !value.pair.b.closedDetailsExcluded &&
      value.pair.a.hit === "PEER" &&
      value.pair.b.hit === "SELF",
  );
  observer = factory();
  observer.pair(0, 1, box, box);
  value = safe(observer.result(true, [summary, checkbox]));
  check(
    value.eligibility === "UNSUPPRESSED_CANDIDATE" &&
      value.pair.a.closedDetails &&
      !value.pair.a.closedDetailsExcluded,
  );
  observer = factory();
  observer.pair(0, 1, box, box);
  observer.pair(1, 2, box, box);
  value = safe(observer.result(true, [textarea, checkbox, summary]));
  check(
    value.eligibility === "UNSUPPRESSED_CANDIDATE" &&
      value.pair.a.index === 1 &&
      value.pair.b.index === 2,
  );
  const hiddenAncestor = node("DIV", null, { visibility: "hidden" });
  const inert = node(
    "INPUT",
    hiddenAncestor,
    { visibility: "visible", pointerEvents: "none" },
    ["inert", "disabled"],
  );
  observer = factory();
  observer.pair(0, 1, box, box);
  value = safe(observer.result(true, [inert, checkbox]));
  check(
    value.eligibility === "UNSUPPRESSED_CANDIDATE" &&
      value.pair.a.ancestorVisibilityHidden &&
      !value.pair.a.visibilityHidden &&
      value.pair.a.inert &&
      value.pair.a.disabled &&
      value.pair.a.pointerNone,
  );
  const huge = { left: 0, top: 0, right: 100001, bottom: 100001 };
  observer = factory();
  observer.pair(0, 1, huge, huge);
  check(observer.result(true, [textarea, checkbox]) === null);
  observer = factory();
  observer.pair(0, 1, box, box);
  observer.pair(0, 1, huge, huge);
  value = safe(observer.result(true, [textarea, checkbox]));
  check(value.eligibility === "UNKNOWN");
  observer = factory();
  observer.pair(0, 1, { ...box, right: NaN }, box);
  check(observer.result(true, [textarea, checkbox]) === null);
  observer = factory();
  delete checkbox.checkVisibility;
  observer.pair(0, 1, box, box);
  value = safe(observer.result(true, [summary, checkbox]));
  check(
    value.eligibility === "UNKNOWN" &&
      value.pair.b.checkVisibility === "UNSUPPORTED",
  );
  observer = factory();
  value = safe(observer.result(false, []));
  check(
    value.overlap === false &&
      value.pair === null &&
      value.eligibility === null,
  );
}

// Browser-free contract tests. No persistence, HTTP, browsers, timers or original tests.
export async function selfTestProbes() {
  selfTestGeometryObserver();
  const listeners = new Map();
  const frame = { url: () => "http://example.invalid/en/settings" };
  const fixture = {
    header: "authenticated",
    view: "ACCOUNT_RENDERED",
    pathname: "/en/settings",
  };
  const fakeMain = {
    querySelector: (selector) =>
      (selector === ".settings-page .settings-card dl" &&
        fixture.view === "ACCOUNT_RENDERED") ||
      (selector === '[role="alert"]' && fixture.view === "ALERT_PRESENT") ||
      (selector === '[role="status"]' && fixture.view === "STATUS_PRESENT")
        ? {}
        : null,
  };
  const fakeDocument = {
    querySelector: (selector) =>
      selector === "header.site-header .nav-account"
        ? { getAttribute: () => fixture.header }
        : selector === "#main"
          ? fakeMain
          : null,
  };
  const page = {
    on: (n, f) => listeners.set(n, f),
    off: (n) => listeners.delete(n),
    url: () => frame.url(),
    mainFrame: () => frame,
    evaluate: async (fn) =>
      vm.runInNewContext(`(${fn.toString()})()`, {
        document: fakeDocument,
        location: { pathname: fixture.pathname },
      }),
    getByText: () => ({
      count: async () => 2,
      isVisible: async () => {
        throw new Error("MUST_NOT_CALL");
      },
    }),
  };
  const p = beginFoundationAuth(page, { retry: 0 });
  const req = (endpoint) => ({
    url: () => `http://example.invalid/api/auth/${endpoint}`,
    method: () => "POST",
    failure: () => ({ errorText: "net::ERR_ABORTED" }),
  });
  const up = req("sign-up/email");
  listeners.get("request")(up);
  listeners.get("response")({ request: () => up, status: () => 429 });
  if (responseState(p.up).status !== 429) throw new Error("A8_PROBE_SELFTEST");
  const login = req("sign-in/email");
  listeners.get("request")(login);
  if (responseState(p.in).result !== "MISSING")
    throw new Error("A8_PROBE_SELFTEST");
  listeners.get("requestfailed")(login);
  if (responseState(p.in).result !== "CANCELED")
    throw new Error("A8_PROBE_SELFTEST");
  listeners.get("framenavigated")(frame);
  if (p.value.settingsReached) throw new Error("A8_PROBE_SELFTEST");
  setFoundationPhase(p, "SIGN_IN");
  listeners.get("framenavigated")(frame);
  if (!p.value.settingsReached) throw new Error("A8_PROBE_SELFTEST");
  const session = {
    url: () => "http://example.invalid/api/auth/get-session",
    method: () => "GET",
  };
  listeners.get("request")(session);
  listeners.get("response")({ request: () => session, status: () => 429 });
  listeners.get("response")({ request: () => session, status: () => 429 });
  if (p.value.sessionTransport !== "RATE_LIMITED")
    throw new Error("A8_PROBE_SELFTEST");
  listeners.get("response")({ request: () => session, status: () => 200 });
  if (p.value.sessionTransport !== "RATE_LIMITED")
    throw new Error("A8_PROBE_SELFTEST");
  frame.url = () => "http://example.invalid/en/verify-email";
  listeners.get("framenavigated")(frame);
  if (!p.value.verificationReached) throw new Error("A8_PROBE_SELFTEST");
  for (const header of ["authenticated", "anonymous", "pending", "error"]) {
    fixture.header = header;
    await captureFoundationAccount(p, page, "private-sentinel@example.invalid");
    if (p.value.headerState !== header) throw new Error("A8_PROBE_SELFTEST");
  }
  for (const view of [
    "ACCOUNT_RENDERED",
    "STATUS_PRESENT",
    "ALERT_PRESENT",
    "UNKNOWN",
  ]) {
    fixture.view = view;
    await captureFoundationAccount(p, page, "private-sentinel@example.invalid");
    if (p.value.settingsState !== view) throw new Error("A8_PROBE_SELFTEST");
  }
  fixture.pathname = "/en/login";
  await captureFoundationAccount(p, page, "private-sentinel@example.invalid");
  if (p.value.settingsState !== "NOT_SETTINGS")
    throw new Error("A8_PROBE_SELFTEST");
  const safe = validateAuth({
    ...p.value,
    signUp: responseState(p.up),
    signIn: responseState(p.in),
  });
  if (
    safe.accountMatch !== "MULTIPLE" ||
    safe.accountVisible !== null ||
    JSON.stringify(safe).includes("sentinel")
  )
    throw new Error("A8_PROBE_SELFTEST");
  for (const [event, fn] of p.listeners) page.off(event, fn);
  probes.delete(p);
  let rejected = false;
  try {
    validateEvidenceFile({
      kind: "auth",
      value: { ...safe, email: "sentinel" },
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("A8_PROBE_SELFTEST");
  return true;
}
