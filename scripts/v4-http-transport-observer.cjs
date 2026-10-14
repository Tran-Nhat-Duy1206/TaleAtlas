"use strict";
// OPT-IN SUBSET DIAGNOSTIC ONLY. Never changes HTTP defaults, headers, timers,
// agents, retries or error handling. Synchronous observation has timing cost;
// evidence from this preload is not a transport fix or acceptance proof.
const fs = require("node:fs");
const path = require("node:path");
const dc = require("node:diagnostics_channel");
const { errorMonitor } = require("node:events");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const supplied = process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_DIRECTORY;
const expectedParent = path.join(
  root,
  ".local",
  "v4-http-transport-diagnostic",
);
const enabled =
  process.env.TALEATLAS_V4_HTTP_DIAGNOSTIC_ONLY === "true" &&
  typeof supplied === "string" &&
  path.isAbsolute(supplied) &&
  path.dirname(path.resolve(supplied)) === expectedParent &&
  /^[a-f0-9-]{36}$/.test(path.basename(supplied));

if (enabled) {
  const sockets = new WeakMap();
  const requests = new WeakMap();
  const observedResponses = new WeakSet();
  const descriptors = new Map();
  let socketOrdinal = 0;
  let requestOrdinal = 0;
  const codes = new Set([
    "ECONNRESET",
    "EPIPE",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ERR_STREAM_PREMATURE_CLOSE",
    "ERR_HTTP_REQUEST_TIMEOUT",
    "ERR_SOCKET_CLOSED",
  ]);
  function time() {
    return Math.round(performance.now() * 1000) / 1000;
  }
  function number(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  }
  function errorClass(error) {
    return codes.has(error?.code) ? error.code : "OTHER";
  }
  function category(request) {
    const value =
      typeof request?.path === "string" ? request.path : request?.url;
    if (typeof value !== "string") return "other";
    // Match locally; no raw path, query, target ID, headers or values are retained.
    if (/^\/api\/library\/[^/?]+\/sessions(?:[/?]|$)/.test(value))
      return "private-library-sessions";
    if (/^\/api\/requests(?:[/?]|$)/.test(value))
      return "private-owned-request";
    return "other";
  }
  function record(role, fields) {
    try {
      let fd = descriptors.get(role);
      if (fd === undefined) {
        fd = fs.openSync(
          path.join(supplied, `${process.pid}-${role}.jsonl`),
          "wx",
          0o600,
        );
        descriptors.set(role, fd);
      }
      fs.writeSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          processKind: "node-http",
          role,
          timeOriginMs: performance.timeOrigin,
          atMs: time(),
          ...fields,
        }) + "\n",
      );
    } catch {
      /* Observation must not change application error behavior. */
    }
  }
  function idle(state) {
    return state.lastEnd === null || state.inFlight
      ? null
      : number(time() - state.lastEnd);
  }
  function socketState(socket, role) {
    if (!socket || typeof socket.once !== "function") return null;
    let state = sockets.get(socket);
    if (state) return state;
    state = { ordinal: ++socketOrdinal, lastEnd: null, inFlight: false, role };
    sockets.set(socket, state);
    socket.on(errorMonitor, (error) =>
      record(role, {
        event: "socket-error",
        connection: state.ordinal,
        errorClass: errorClass(error),
        idleAgeMs: idle(state),
      }),
    );
    socket.once("close", (hadError) =>
      record(role, {
        event: "socket-close",
        connection: state.ordinal,
        hadError: !!hadError,
        idleAgeMs: idle(state),
        socketTimeoutMs: number(socket.timeout),
      }),
    );
    return state;
  }
  function startClient(request) {
    if (!request || requests.has(request)) return;
    const state = {
      ordinal: ++requestOrdinal,
      category: category(request),
      connection: null,
      idleAtAssignment: null,
      assignedAt: null,
    };
    requests.set(request, state);
    request.on(errorMonitor, (error) =>
      record("client", {
        event: "request-error",
        request: state.ordinal,
        category: state.category,
        connection: state.connection?.ordinal ?? null,
        errorClass: errorClass(error),
        idleAtAssignmentMs: state.idleAtAssignment,
        requestAgeMs:
          state.assignedAt === null ? null : number(time() - state.assignedAt),
      }),
    );
    function assigned(socket) {
      try {
        if (state.connection) return;
        const connection = socketState(socket, "client");
        state.connection = connection;
        state.idleAtAssignment = connection ? idle(connection) : null;
        state.assignedAt = time();
        if (connection) connection.inFlight = true;
        const agent = request.agent;
        record("client", {
          event: "request-start",
          request: state.ordinal,
          category: state.category,
          connection: connection?.ordinal ?? null,
          reusedSocket: request.reusedSocket === true,
          idleAtAssignmentMs: state.idleAtAssignment,
          agentKeepAlive:
            typeof agent?.keepAlive === "boolean" ? agent.keepAlive : null,
          agentKeepAliveMsecs: number(agent?.keepAliveMsecs),
          agentTimeoutMs: number(agent?.options?.timeout),
          agentKeepAliveTimeoutBufferMs: number(
            agent?.agentKeepAliveTimeoutBuffer ??
              agent?.options?.agentKeepAliveTimeoutBuffer,
          ),
          socketTimeoutMs: number(socket?.timeout),
        });
      } catch {
        /* Passive only. */
      }
    }
    if (request.socket) assigned(request.socket);
    else request.once("socket", assigned);
  }
  function finishClient(message) {
    const request = message?.request;
    const response = message?.response;
    if (!request || !response || observedResponses.has(response)) return;
    observedResponses.add(response);
    const state = requests.get(request);
    if (!state) return;
    record("client", {
      event: "response-observed",
      request: state.ordinal,
      category: state.category,
      connection: state.connection?.ordinal ?? null,
      status: number(response.statusCode),
    });
    // The diagnostics channel is not a readable-body completion boundary.
    // Observe the actual stream end without consuming data or changing flow.
    const ended = () => {
      if (state.connection) {
        state.connection.lastEnd = time();
        state.connection.inFlight = false;
      }
      record("client", {
        event: "response-end",
        request: state.ordinal,
        category: state.category,
        connection: state.connection?.ordinal ?? null,
        status: number(response.statusCode),
        complete: response.complete === true,
      });
    };
    if (response.readableEnded) ended();
    else response.once("end", ended);
  }
  function startServer(message) {
    const request = message?.request;
    const response = message?.response;
    if (!request || !response || requests.has(request)) return;
    const connection = socketState(message.socket ?? request.socket, "server");
    const state = {
      ordinal: ++requestOrdinal,
      category: category(request),
      connection,
    };
    requests.set(request, state);
    const server = message.server ?? request.socket?.server;
    const idleAtStart = connection ? idle(connection) : null;
    if (connection) connection.inFlight = true;
    record("server", {
      event: "request-start",
      request: state.ordinal,
      category: state.category,
      connection: connection?.ordinal ?? null,
      idleAtStartMs: idleAtStart,
      keepAliveTimeoutMs: number(server?.keepAliveTimeout),
      keepAliveTimeoutBufferMs: number(server?.keepAliveTimeoutBuffer),
      requestTimeoutMs: number(server?.requestTimeout),
      headersTimeoutMs: number(server?.headersTimeout),
      serverTimeoutMs: number(server?.timeout),
    });
    response.once("finish", () => {
      if (connection) {
        connection.lastEnd = time();
        connection.inFlight = false;
      }
      record("server", {
        event: "response-finish",
        request: state.ordinal,
        category: state.category,
        connection: connection?.ordinal ?? null,
        status: number(response.statusCode),
      });
    });
  }
  function subscribe(name, handler) {
    dc.subscribe(name, (message) => {
      try {
        handler(message);
      } catch {
        /* Never reject the emitting HTTP operation. */
      }
    });
  }
  subscribe("http.client.request.start", (message) =>
    startClient(message?.request),
  );
  subscribe("http.client.response.finish", finishClient);
  subscribe("http.server.request.start", startServer);
}
