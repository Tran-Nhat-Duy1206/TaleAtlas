"use strict";
// OPT-IN EXPANDED PASSIVE DIAGNOSTIC ONLY. Never changes HTTP defaults, headers, timers,
// agents, retries or error handling. Synchronous observation has timing cost;
// evidence from this preload is not a transport fix or acceptance proof.
const fs = require("node:fs");
const path = require("node:path");
const dc = require("node:diagnostics_channel");
const { errorMonitor } = require("node:events");
const { performance } = require("node:perf_hooks");
const { isIP } = require("node:net");

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
  function method(request) {
    // Closed enum only: never retain an unknown or caller-supplied raw token.
    const value = request?.method;
    switch (value) {
      case "GET":
      case "POST":
      case "PUT":
      case "PATCH":
      case "DELETE":
      case "HEAD":
      case "OPTIONS":
        return value;
      default:
        return "UNKNOWN";
    }
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
    if (
      /^\/api\/community\/works\/[^/?#]+\/contents\/[^/?#]+\/moderation(?:\?[^#]*)?$/.test(
        value,
      )
    )
      return "community-moderation-command";
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
  function passive(callback) {
    return (...args) => {
      try {
        callback(...args);
      } catch {
        /* Never change the emitting operation. */
      }
    };
  }
  function port(value) {
    return Number.isInteger(value) && value >= 1 && value <= 65535
      ? value
      : null;
  }
  function addressFacts(value) {
    if (typeof value !== "string") return { family: "unknown", loopback: null };
    const kind = isIP(value);
    if (kind === 4)
      return { family: "IPv4", loopback: value.startsWith("127.") };
    // Mapped/embedded IPv4 is deliberately not normalized into an exact pair.
    if (kind === 6 && !value.includes(".")) {
      const halves = value.toLowerCase().split("::");
      const left = halves[0].split(":").filter(Boolean);
      const right =
        halves.length === 2 ? halves[1].split(":").filter(Boolean) : [];
      const groups =
        halves.length === 2
          ? [
              ...left,
              ...Array(8 - left.length - right.length).fill("0"),
              ...right,
            ]
          : left;
      const words = groups.map((part) => Number.parseInt(part, 16));
      if (
        words.length === 8 &&
        !(words.slice(0, 5).every((part) => part === 0) && words[5] === 65535)
      )
        return {
          family: "IPv6",
          loopback:
            words.slice(0, 7).every((part) => part === 0) && words[7] === 1,
        };
    }
    return { family: "unknown", loopback: null };
  }
  function tupleFields(state) {
    return {
      localPort: state?.tuple?.localPort ?? null,
      remotePort: state?.tuple?.remotePort ?? null,
      loopback: state?.tuple?.loopback ?? null,
      family: state?.tuple?.family ?? "unknown",
      tupleCapturedAtMs: state?.tuple?.tupleCapturedAtMs ?? null,
      observedFrom: state?.observedFrom ?? "unknown",
    };
  }
  function captureTuple(socket, state) {
    if (state.tuple !== null) return;
    const localPort = port(socket.localPort),
      remotePort = port(socket.remotePort);
    if (localPort === null || remotePort === null) return;
    // Addresses are inspected locally ONLY; never recorded, hashed or returned.
    const local = addressFacts(socket.localAddress),
      remote = addressFacts(socket.remoteAddress);
    const family = local.family === remote.family ? local.family : "unknown";
    const loopback =
      local.loopback === false || remote.loopback === false
        ? false
        : local.loopback === true && remote.loopback === true
          ? true
          : null;
    state.tuple = Object.freeze({
      localPort,
      remotePort,
      loopback,
      family,
      tupleCapturedAtMs: time(),
    });
  }
  function socketState(socket, role) {
    if (!socket || typeof socket.once !== "function") return null;
    let state = sockets.get(socket);
    if (state) return state;
    state = {
      ordinal: ++socketOrdinal,
      lastEnd: null,
      inFlight: false,
      role,
      tuple: null,
      observedFrom:
        role === "client" ? "client-assignment" : "server-http-request",
    };
    sockets.set(socket, state);
    if (!socket.connecting) captureTuple(socket, state);
    record(role, {
      event: "socket-observed",
      connection: state.ordinal,
      ...tupleFields(state),
    });
    // This is observation time, NOT a wire-handshake timestamp. Server sockets
    // are first observed at HTTP request start, never before their first HTTP.
    if (role === "client" && socket.connecting) {
      socket.once(
        "connect",
        passive(() => {
          captureTuple(socket, state);
          record(role, {
            event: "socket-connected",
            connection: state.ordinal,
            ...tupleFields(state),
          });
        }),
      );
    }
    socket.on(
      errorMonitor,
      passive((error) =>
        record(role, {
          event: "socket-error",
          connection: state.ordinal,
          ...tupleFields(state),
          errorClass: errorClass(error),
          idleAgeMs: idle(state),
        }),
      ),
    );
    socket.once(
      "close",
      passive((hadError) =>
        record(role, {
          event: "socket-close",
          connection: state.ordinal,
          ...tupleFields(state),
          hadError: !!hadError,
          idleAgeMs: idle(state),
          socketTimeoutMs: number(socket.timeout),
        }),
      ),
    );
    return state;
  }
  function startClient(request) {
    if (!request || requests.has(request)) return;
    const state = {
      ordinal: ++requestOrdinal,
      category: category(request),
      method: method(request),
      connection: null,
      idleAtAssignment: null,
      assignedAt: null,
    };
    requests.set(request, state);
    request.on(
      errorMonitor,
      passive((error) =>
        record("client", {
          event: "request-error",
          request: state.ordinal,
          category: state.category,
          method: state.method,
          connection: state.connection?.ordinal ?? null,
          ...tupleFields(state.connection),
          errorClass: errorClass(error),
          idleAtAssignmentMs: state.idleAtAssignment,
          requestAgeMs:
            state.assignedAt === null
              ? null
              : number(time() - state.assignedAt),
        }),
      ),
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
          method: state.method,
          connection: connection?.ordinal ?? null,
          ...tupleFields(connection),
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
      method: state.method,
      connection: state.connection?.ordinal ?? null,
      ...tupleFields(state.connection),
      status: number(response.statusCode),
    });
    // The diagnostics channel is not a readable-body completion boundary.
    // Observe the actual stream end without consuming data or changing flow.
    const ended = passive(() => {
      if (state.connection) {
        state.connection.lastEnd = time();
        state.connection.inFlight = false;
      }
      record("client", {
        event: "response-end",
        request: state.ordinal,
        category: state.category,
        method: state.method,
        connection: state.connection?.ordinal ?? null,
        ...tupleFields(state.connection),
        status: number(response.statusCode),
        complete: response.complete === true,
      });
    });
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
      method: method(request),
      connection,
    };
    requests.set(request, state);
    request.on(
      errorMonitor,
      passive((error) =>
        record("server", {
          event: "request-error",
          request: state.ordinal,
          category: state.category,
          method: state.method,
          connection: connection?.ordinal ?? null,
          ...tupleFields(connection),
          errorClass: errorClass(error),
        }),
      ),
    );
    const server = message.server ?? request.socket?.server;
    const idleAtStart = connection ? idle(connection) : null;
    if (connection) connection.inFlight = true;
    record("server", {
      event: "request-start",
      request: state.ordinal,
      category: state.category,
      method: state.method,
      connection: connection?.ordinal ?? null,
      ...tupleFields(connection),
      idleAtStartMs: idleAtStart,
      keepAliveTimeoutMs: number(server?.keepAliveTimeout),
      keepAliveTimeoutBufferMs: number(server?.keepAliveTimeoutBuffer),
      requestTimeoutMs: number(server?.requestTimeout),
      headersTimeoutMs: number(server?.headersTimeout),
      serverTimeoutMs: number(server?.timeout),
    });
    response.once(
      "finish",
      passive(() => {
        if (connection) {
          connection.lastEnd = time();
          connection.inFlight = false;
        }
        record("server", {
          event: "response-finish",
          request: state.ordinal,
          category: state.category,
          method: state.method,
          connection: connection?.ordinal ?? null,
          ...tupleFields(connection),
          status: number(response.statusCode),
        });
      }),
    );
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
