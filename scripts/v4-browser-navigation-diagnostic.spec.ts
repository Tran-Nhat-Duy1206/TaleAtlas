// Approved diagnostic only: no original scenario, application or transport changes.
import { test, expect, type CDPSession } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { communityBrowserFixture } from "../tests/helpers/community-browser-fixture";
import { communityCopy } from "../apps/web/src/lib/community-i18n";

export const NAVIGATION_EVENTS = [
  "fixture-ready",
  "work-goto",
  "work-loaded",
  "discussion-click",
  "discussion-click-complete",
  "heading-visible",
  "probe-error",
  "teardown",
  "probe-summary",
  "navigation-requested",
  "navigation-started",
  "navigation-committed",
  "request-start",
  "request-finished",
  "request-failed",
  "response",
  "hmr-connected",
  "hmr-message",
] as const;
export const ROUTES = [
  "public-work",
  "public-discussions",
  "framework-resource",
  "auth",
  "other",
  "unknown",
] as const;
export const REASONS = [
  "anchorClick",
  "formSubmissionGet",
  "formSubmissionPost",
  "httpHeaderRefresh",
  "initialFrameNavigation",
  "metaTagRefresh",
  "pageBlockInterstitial",
  "reload",
  "scriptInitiated",
  "differentDocument",
  "sameDocument",
  "Navigation",
  "BackForwardCacheRestore",
  "unknown",
] as const;
export const INITIATORS = [
  "parser",
  "script",
  "preload",
  "preflight",
  "SignedExchange",
  "other",
  "unknown",
] as const;
export const HMR_KINDS = [
  "building",
  "built",
  "reloadPage",
  "reload",
  "serverComponentChanges",
  "clientChanges",
  "pagesManifest",
  "middlewareChanges",
  "connected",
  "sync",
  "turbopack-connected",
  "turbopack-message",
  "TURBOPACK_MESSAGE",
  "update",
  "partial",
  "restart",
  "issues",
  "clear",
  "notFound",
  "unknown",
] as const;
export const ERROR_CLASSES = [
  "ERR_ABORTED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_REFUSED",
  "ERR_EMPTY_RESPONSE",
  "ERR_FAILED",
  "OTHER",
] as const;
export const PHASES = ["setup", "flow", "teardown"] as const;
export const MAX_BROWSER_ROWS = 10000;
export const HMR_HASH_COMPARISONS = ["MATCH", "DIFFER", "UNKNOWN"] as const;
export const HMR_SOURCE_SITES = [
  "APP_SOCKET_MESSAGE",
  "APP_SOCKET_DISCONNECT",
  "APP_UPDATE",
  "APP_FULL_RELOAD",
  "PAGES_HMR",
  "TURBOPACK_HMR",
  "UNKNOWN",
] as const;

export type BrowserRow = {
  v: 1;
  diagnosticOnly: true;
  locale: "en" | "vi";
  event: (typeof NAVIGATION_EVENTS)[number];
  atMs: number;
  sourceAtMs: number | null;
  phase: (typeof PHASES)[number];
  route: (typeof ROUTES)[number];
  requestOrdinal: number | null;
  status: number | null;
  reason: (typeof REASONS)[number];
  initiator: (typeof INITIATORS)[number];
  hmrKind: (typeof HMR_KINDS)[number];
  errorClass: (typeof ERROR_CLASSES)[number] | null;
  canceled: boolean | null;
  mainFrame: boolean | null;
  hmrInitiator: boolean | null;
  success: boolean | null;
  droppedRows: number | null;
  documentOrdinal: number | null;
  hmrSocketOrdinal: number | null;
  hmrPriorSyncSeen: boolean | null;
  hmrSyncHashPresent: boolean | null;
  hmrPriorSyncHashNonNull: boolean | null;
  hmrSyncHashComparison: (typeof HMR_HASH_COMPARISONS)[number];
  hmrSourceSite: (typeof HMR_SOURCE_SITES)[number];
};

export function browserEnum<T extends string>(
  values: readonly T[],
  input: unknown,
  fallback: T,
): T {
  return typeof input === "string" && values.includes(input as T)
    ? (input as T)
    : fallback;
}
export function browserNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0
    ? input
    : null;
}
export function browserInteger(input: unknown): number | null {
  const value = browserNumber(input);
  return value !== null && Number.isSafeInteger(value) ? value : null;
}
export function browserBoolean(input: unknown): boolean | null {
  return typeof input === "boolean" ? input : null;
}
/** The sole output projector: enumerate every key, never spread protocol input. */
export function projectBrowserRow(input: Record<string, unknown>): BrowserRow {
  const status = browserInteger(input.status);
  return {
    v: 1,
    diagnosticOnly: true,
    locale: input.locale === "vi" ? "vi" : "en",
    event: browserEnum(NAVIGATION_EVENTS, input.event, "probe-error"),
    atMs: browserNumber(input.atMs) ?? 0,
    sourceAtMs: browserNumber(input.sourceAtMs),
    phase: browserEnum(PHASES, input.phase, "setup"),
    route: browserEnum(ROUTES, input.route, "unknown"),
    requestOrdinal: browserInteger(input.requestOrdinal),
    status: status !== null && status >= 100 && status <= 599 ? status : null,
    reason: browserEnum(REASONS, input.reason, "unknown"),
    initiator: browserEnum(INITIATORS, input.initiator, "unknown"),
    hmrKind: browserEnum(HMR_KINDS, input.hmrKind, "unknown"),
    errorClass:
      input.errorClass === null || input.errorClass === undefined
        ? null
        : browserEnum(ERROR_CLASSES, input.errorClass, "OTHER"),
    canceled: browserBoolean(input.canceled),
    mainFrame: browserBoolean(input.mainFrame),
    hmrInitiator: browserBoolean(input.hmrInitiator),
    success: browserBoolean(input.success),
    droppedRows: browserInteger(input.droppedRows),
    documentOrdinal: browserInteger(input.documentOrdinal),
    hmrSocketOrdinal: browserInteger(input.hmrSocketOrdinal),
    hmrPriorSyncSeen: browserBoolean(input.hmrPriorSyncSeen),
    hmrSyncHashPresent: browserBoolean(input.hmrSyncHashPresent),
    hmrPriorSyncHashNonNull: browserBoolean(input.hmrPriorSyncHashNonNull),
    hmrSyncHashComparison: browserEnum(
      HMR_HASH_COMPARISONS,
      input.hmrSyncHashComparison,
      "UNKNOWN",
    ),
    hmrSourceSite: browserEnum(
      HMR_SOURCE_SITES,
      input.hmrSourceSite,
      "UNKNOWN",
    ),
  };
}
export function classifyBrowserRoute(
  raw: unknown,
  workPath: string | null,
): (typeof ROUTES)[number] {
  if (typeof raw !== "string") return "unknown";
  try {
    const url = new URL(raw);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
      return "other";
    if (url.hostname !== "127.0.0.1" || url.port !== "3000") return "other";
    if (url.pathname.startsWith("/_next/")) return "framework-resource";
    if (
      /^\/(?:api\/auth(?:\/|$)|(?:en|vi)\/(?:login|register|verify-email|settings)(?:\/|$))/.test(
        url.pathname,
      )
    )
      return "auth";
    if (workPath !== null && url.pathname === workPath) return "public-work";
    if (workPath !== null && url.pathname === `${workPath}/discussions`)
      return "public-discussions";
    return "other";
  } catch {
    return "unknown";
  }
}
export function classifyBrowserError(
  raw: unknown,
): (typeof ERROR_CLASSES)[number] | null {
  if (typeof raw !== "string") return null;
  return browserEnum(ERROR_CLASSES, raw.replace(/^net::/, ""), "OTHER");
}
/** Stack text is transient classifier input, never a persisted field. */
export function classifyHmrInitiator(input: unknown): boolean | null {
  if (!input || typeof input !== "object") return null;
  let stack = (input as Record<string, unknown>).stack;
  for (
    let depth = 0;
    depth < 4 && stack && typeof stack === "object";
    depth++
  ) {
    const value = stack as Record<string, unknown>;
    if (Array.isArray(value.callFrames)) {
      for (const frame of value.callFrames.slice(0, 100)) {
        if (!frame || typeof frame !== "object") continue;
        const item = frame as Record<string, unknown>;
        if (
          [item.url, item.functionName].some(
            (text) =>
              typeof text === "string" &&
              /(?:\bhmr\b|hot[-_]?reloader|webpack[-_]?hot|performFullReload|handleHotUpdate|turbopack[-_/](?:hmr|reload))/i.test(
                text,
              ),
          )
        )
          return true;
      }
    }
    stack = value.parent;
  }
  return null; // Missing or unmatched bounded stack is not proof of no HMR involvement.
}
/** Lexical evidence only, not an executed branch or active-client assertion. */
export function classifyHmrSourceSite(
  input: unknown,
): (typeof HMR_SOURCE_SITES)[number] {
  if (!input || typeof input !== "object") return "UNKNOWN";
  let stack = (input as Record<string, unknown>).stack;
  for (
    let depth = 0;
    depth < 4 && stack && typeof stack === "object";
    depth++
  ) {
    const value = stack as Record<string, unknown>;
    if (Array.isArray(value.callFrames)) {
      for (const frame of value.callFrames.slice(0, 100)) {
        if (!frame || typeof frame !== "object") continue;
        const item = frame as Record<string, unknown>;
        const url = typeof item.url === "string" ? item.url : "";
        const name =
          typeof item.functionName === "string" ? item.functionName : "";
        if (
          /client\/dev\/hot-reloader\/app\/web-socket\.[jt]s(?:[?:]|$)/i.test(
            url,
          )
        ) {
          if (/^(?:handleDisconnect|onDisconnect)$/.test(name))
            return "APP_SOCKET_DISCONNECT";
          if (/^(?:handleMessage|onMessage|processMessage)$/.test(name))
            return "APP_SOCKET_MESSAGE";
        }
        if (
          /client\/components\/react-dev-overlay\/app\/hot-reloader-app\.[jt]s(?:[?:]|$)|client\/dev\/hot-reloader\/app\/hot-reloader-app\.[jt]s(?:[?:]|$)/i.test(
            url,
          )
        ) {
          if (/performFullReload/.test(name)) return "APP_FULL_RELOAD";
          return "APP_UPDATE";
        }
        if (
          /client\/dev\/(?:hot-reloader\/pages\/hot-reloader-pages|hot-middleware-client|hot-reloader-client)\.[jt]s(?:[?:]|$)/i.test(
            url,
          )
        )
          return "PAGES_HMR";
        if (/turbopack[-_/](?:hmr|reload)/i.test(url + " " + name))
          return "TURBOPACK_HMR";
      }
    }
    stack = value.parent;
  }
  return "UNKNOWN";
}

/** Hashes remain closure-private. Observed state is not the client's internal state.
 * A pending navigation does not replace the owning document; only commit does.
 */
export function createHmrSyncTracker() {
  let documentOrdinal = 0;
  let socketOrdinal = 0;
  let seen = false;
  let known = false;
  let hash: string | null = null;
  return {
    currentDocument: () => documentOrdinal,
    mainFrameDocumentCommitted() {
      documentOrdinal++;
      seen = false;
      known = false;
      hash = null;
    },
    socketCreated() {
      return { documentOrdinal, hmrSocketOrdinal: ++socketOrdinal };
    },
    observe(
      owner: { documentOrdinal: number; hmrSocketOrdinal: number },
      raw: unknown,
    ) {
      const result = {
        documentOrdinal: owner.documentOrdinal,
        hmrSocketOrdinal: owner.hmrSocketOrdinal,
        hmrPriorSyncSeen: null as boolean | null,
        hmrSyncHashPresent: null as boolean | null,
        hmrPriorSyncHashNonNull: null as boolean | null,
        hmrSyncHashComparison:
          "UNKNOWN" as (typeof HMR_HASH_COMPARISONS)[number],
      };
      if (
        owner.documentOrdinal !== documentOrdinal ||
        typeof raw !== "string" ||
        raw.length > 1048576 ||
        Buffer.byteLength(raw, "utf8") > 1048576
      )
        return result;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return result;
      }
      if (!value || typeof value !== "object" || Array.isArray(value))
        return result;
      const message = value as Record<string, unknown>;
      if (message.type !== "sync") return result;
      const present = Object.prototype.hasOwnProperty.call(message, "hash");
      result.hmrPriorSyncSeen = seen;
      result.hmrSyncHashPresent = present;
      result.hmrPriorSyncHashNonNull = seen && known ? hash !== null : null;
      // Seeing SYNC and knowing its hash are independent observations.
      seen = true;
      // Installed App socket updates only SYNC with an own hash property.
      if (!present) return result;
      const valid = message.hash === null || typeof message.hash === "string";
      if (seen && known && hash !== null && valid) {
        result.hmrSyncHashComparison =
          hash === message.hash ? "MATCH" : "DIFFER";
      }
      known = valid;
      hash = valid ? (message.hash as string | null) : null;
      return result;
    },
  };
}

export function isDiagnosticHmrSocket(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return (
      ["ws:", "wss:"].includes(url.protocol) &&
      url.hostname === "127.0.0.1" &&
      url.port === "3000" &&
      url.pathname.startsWith("/_next/") &&
      /hmr|webpack/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
/** Closed classifications only; inspect known data wrappers, never module instructions. */
export function classifyHmrPayload(
  raw: unknown,
): Array<(typeof HMR_KINDS)[number]> {
  if (
    typeof raw !== "string" ||
    raw.length > 1048576 ||
    Buffer.byteLength(raw, "utf8") > 1048576
  )
    return ["unknown"];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return ["unknown"];
  }
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const kinds = new Set<(typeof HMR_KINDS)[number]>();
  // Both queued and examined nodes are capped; array length cannot expand work unboundedly.
  for (let index = 0; index < queue.length && index < 100; index++) {
    const node = queue[index];
    let current = node.value;
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
      } catch {
        continue;
      }
    }
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      if (node.depth < 3) {
        for (const item of current.slice(0, 100 - queue.length)) {
          queue.push({ value: item, depth: node.depth + 1 });
        }
      }
      continue;
    }
    const object = current as Record<string, unknown>;
    for (const key of ["action", "type", "event"]) {
      const kind = browserEnum(HMR_KINDS, object[key], "unknown");
      if (kind !== "unknown") kinds.add(kind);
    }
    // Recognized outer transport types must not conceal a nested restart/reload.
    if (node.depth < 3 && queue.length < 100 && object.data !== undefined) {
      queue.push({ value: object.data, depth: node.depth + 1 });
    }
  }
  return kinds.size ? [...kinds] : ["unknown"];
}

function ownedDirectory(): string {
  try {
    const supplied = process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_DIRECTORY;
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    if (
      process.env.CI !== "true" ||
      process.platform !== "linux" ||
      process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_ONLY !== "true" ||
      process.env.V4_COMMUNITIES_ENABLED !== "true" ||
      !supplied ||
      !path.isAbsolute(supplied) ||
      path.dirname(path.resolve(supplied)) !==
        path.join(root, ".local", "v4-http-transport-diagnostic") ||
      !/^[a-f0-9-]{36}$/.test(path.basename(supplied)) ||
      !lstatSync(supplied).isDirectory() ||
      realpathSync(supplied) !== path.resolve(supplied)
    )
      throw new Error("BROWSER_DIAGNOSTIC_GUARD_FAILED");
    return supplied;
  } catch {
    throw new Error("BROWSER_DIAGNOSTIC_GUARD_FAILED");
  }
}

for (const locale of ["en", "vi"] as const) {
  test(`sanitized ${locale} browser document navigation diagnostic`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    const directory = ownedDirectory();
    const rows: BrowserRow[] = [];
    let dropped = 0,
      phase: BrowserRow["phase"] = "setup",
      workPath: string | null = null;
    const started = performance.now();
    let session: CDPSession | undefined;
    let fixture:
      | Awaited<ReturnType<typeof communityBrowserFixture>>
      | undefined;
    let mainFrameId: string | null = null,
      ordinal = 0;
    let observationFailed = false,
      flowPassed = false,
      cleanupPassed = true;
    let discussionStatus: number | null = null;
    const documents = new Map<
      string,
      { ordinal: number; route: BrowserRow["route"]; mainFrame: boolean }
    >();
    const hmrTracker = createHmrSyncTracker();
    const hmrSockets = new Map<
      string,
      {
        requestOrdinal: number;
        documentOrdinal: number;
        hmrSocketOrdinal: number;
      }
    >();
    function emit(
      event: BrowserRow["event"],
      fields: Record<string, unknown> = {},
    ) {
      // Reserve the last slot for an explicit truthful summary, including overflow.
      if (rows.length >= MAX_BROWSER_ROWS - 1) {
        dropped++;
        return;
      }
      rows.push(
        projectBrowserRow({
          documentOrdinal: hmrTracker.currentDocument(),
          ...fields,
          locale,
          event,
          phase,
          atMs: performance.now() - started,
        }),
      );
    }
    const protocolObservers = new Map<
      string,
      (value: Record<string, unknown>) => void
    >();
    function listen(
      event: string,
      callback: (value: Record<string, unknown>) => void,
    ) {
      protocolObservers.set(event, callback);
    }
    function sourceAt(value: unknown): number | null {
      const timestamp = browserNumber(value);
      return timestamp === null ? null : browserNumber(timestamp * 1000);
    }
    try {
      if (baseURL !== "http://127.0.0.1:3000")
        throw new Error("BROWSER_DIAGNOSTIC_FAILED");
      session = await page.context().newCDPSession(page);
      // Public typed CDP notification API; no SDK/prototype/default mutation.
      session.on("event", ({ method, params }) => {
        const callback = protocolObservers.get(method);
        if (!callback) return;
        try {
          if (!params || typeof params !== "object") {
            observationFailed = true;
            return;
          }
          callback(params as Record<string, unknown>);
        } catch {
          observationFailed = true;
        }
      });
      listen("Page.frameRequestedNavigation", (value) =>
        emit("navigation-requested", {
          route: classifyBrowserRoute(value.url, workPath),
          reason: value.reason,
          mainFrame:
            typeof value.frameId === "string" && mainFrameId !== null
              ? value.frameId === mainFrameId
              : null,
        }),
      );
      listen("Page.frameStartedNavigating", (value) =>
        emit("navigation-started", {
          route: classifyBrowserRoute(value.url, workPath),
          reason: value.navigationType,
          mainFrame:
            typeof value.frameId === "string" && mainFrameId !== null
              ? value.frameId === mainFrameId
              : null,
        }),
      );
      listen("Page.frameNavigated", (value) => {
        const frame = value.frame;
        if (!frame || typeof frame !== "object") return;
        const data = frame as Record<string, unknown>;
        const isMain = typeof data.id === "string" && !data.parentId;
        if (isMain) {
          mainFrameId = data.id as string;
          hmrTracker.mainFrameDocumentCommitted();
        }
        emit("navigation-committed", {
          route: classifyBrowserRoute(data.url, workPath),
          reason: value.type,
          mainFrame: isMain,
        });
      });
      listen("Network.requestWillBeSent", (value) => {
        if (value.type !== "Document" || typeof value.requestId !== "string")
          return;
        const request = value.request as Record<string, unknown> | undefined;
        const route = classifyBrowserRoute(request?.url, workPath);
        let item = documents.get(value.requestId);
        if (!item) {
          item = {
            ordinal: ++ordinal,
            route,
            mainFrame: value.frameId === mainFrameId,
          };
          documents.set(value.requestId, item);
        }
        const redirect = value.redirectResponse as
          | Record<string, unknown>
          | undefined;
        if (redirect)
          emit("response", {
            route: item.route,
            requestOrdinal: item.ordinal,
            status: redirect.status,
            mainFrame: item.mainFrame,
            sourceAtMs: sourceAt(value.timestamp),
          });
        item.route = route;
        const initiator = value.initiator as
          | Record<string, unknown>
          | undefined;
        emit("request-start", {
          route,
          requestOrdinal: item.ordinal,
          initiator: initiator?.type,
          hmrInitiator: classifyHmrInitiator(initiator),
          hmrSourceSite: classifyHmrSourceSite(initiator),
          mainFrame: item.mainFrame,
          sourceAtMs: sourceAt(value.timestamp),
        });
      });
      listen("Network.responseReceived", (value) => {
        if (typeof value.requestId !== "string") return;
        const item = documents.get(value.requestId);
        if (!item) return;
        const response = value.response as Record<string, unknown> | undefined;
        const status = browserInteger(response?.status);
        if (item.mainFrame && item.route === "public-discussions")
          discussionStatus = status;
        emit("response", {
          route: item.route,
          requestOrdinal: item.ordinal,
          status,
          mainFrame: item.mainFrame,
          sourceAtMs: sourceAt(value.timestamp),
        });
      });
      for (const [protocolEvent, outputEvent] of [
        ["Network.loadingFailed", "request-failed"],
        ["Network.loadingFinished", "request-finished"],
      ] as const) {
        listen(protocolEvent, (value) => {
          if (typeof value.requestId !== "string") return;
          const item = documents.get(value.requestId);
          if (!item) return;
          emit(outputEvent, {
            route: item.route,
            requestOrdinal: item.ordinal,
            mainFrame: item.mainFrame,
            errorClass:
              protocolEvent === "Network.loadingFailed"
                ? classifyBrowserError(value.errorText)
                : null,
            canceled: value.canceled,
            sourceAtMs: sourceAt(value.timestamp),
          });
          documents.delete(value.requestId);
        });
      }
      listen("Network.webSocketCreated", (value) => {
        if (
          typeof value.requestId !== "string" ||
          !isDiagnosticHmrSocket(value.url)
        )
          return;
        const id = ++ordinal;
        hmrSockets.set(value.requestId, {
          requestOrdinal: id,
          ...hmrTracker.socketCreated(),
        });
      });
      listen("Network.webSocketHandshakeResponseReceived", (value) => {
        if (typeof value.requestId !== "string") return;
        const id = hmrSockets.get(value.requestId);
        const response = value.response as Record<string, unknown> | undefined;
        if (id === undefined || response?.status !== 101) return;
        emit("hmr-connected", {
          route: "framework-resource",
          ...id,
          hmrKind: "connected",
          status: 101,
          sourceAtMs: sourceAt(value.timestamp),
        });
      });
      listen("Network.webSocketFrameReceived", (value) => {
        if (typeof value.requestId !== "string") return;
        const id = hmrSockets.get(value.requestId);
        if (id === undefined) return;
        const response = value.response as Record<string, unknown> | undefined;
        if (response?.opcode !== 1) return;
        const comparison = hmrTracker.observe(id, response.payloadData);
        for (const hmrKind of classifyHmrPayload(response.payloadData)) {
          emit("hmr-message", {
            route: "framework-resource",
            requestOrdinal: id.requestOrdinal,
            ...comparison,
            hmrKind,
            sourceAtMs: sourceAt(value.timestamp),
          });
        }
      });
      listen("Network.webSocketClosed", (value) => {
        if (typeof value.requestId === "string")
          hmrSockets.delete(value.requestId);
      });
      await session.send("Page.enable");
      await session.send("Network.enable");
      const frameTree = await session.send("Page.getFrameTree");
      mainFrameId = frameTree.frameTree.frame.id;
      fixture = await communityBrowserFixture(page, browser, baseURL);
      workPath = `/${locale}/works/${fixture.work.slug}`;
      phase = "flow";
      emit("fixture-ready");
      emit("work-goto", { route: "public-work" });
      await page.goto(workPath);
      emit("work-loaded", { route: "public-work" });
      emit("discussion-click", { route: "public-discussions" });
      await page
        .getByRole("link", {
          name: communityCopy[locale].discussions,
          exact: true,
        })
        .click();
      emit("discussion-click-complete", { route: "public-discussions" });
      await expect(
        page.getByRole("heading", {
          name: communityCopy[locale].discussions,
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      emit("heading-visible", { route: "public-discussions" });
      if (discussionStatus !== 200)
        throw new Error("BROWSER_DIAGNOSTIC_FAILED");
      flowPassed = true;
    } catch {
      emit("probe-error", { errorClass: "OTHER", success: false });
    } finally {
      phase = "teardown";
      emit("teardown");
      try {
        if (fixture) await fixture.close();
      } catch {
        cleanupPassed = false;
        emit("probe-error", { errorClass: "OTHER", success: false });
      }
      try {
        if (session) await session.detach();
      } catch {
        cleanupPassed = false;
        emit("probe-error", { errorClass: "OTHER", success: false });
      }
      const success =
        flowPassed && cleanupPassed && !observationFailed && dropped === 0;
      rows.push(
        projectBrowserRow({
          locale,
          event: "probe-summary",
          phase,
          atMs: performance.now() - started,
          success,
          droppedRows: dropped,
        }),
      );
      try {
        await writeFile(
          path.join(directory, `browser-${locale}.jsonl`),
          rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
          { flag: "wx", mode: 0o600 },
        );
      } catch {
        throw new Error("BROWSER_DIAGNOSTIC_OUTPUT_FAILED");
      }
      if (!success) throw new Error("BROWSER_DIAGNOSTIC_FAILED");
    }
  });
}
