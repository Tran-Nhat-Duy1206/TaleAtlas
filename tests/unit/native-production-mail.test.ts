import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { SMTPServerDataStream, SMTPServerSession } from "smtp-server";
import {
  productionMailOptions,
  type NativeProductionMessage,
} from "../../scripts/native-production-mail";

// Pure callback tests only: no SMTPServer, network, files, certificates or auth mocks.
const key = Buffer.from("synthetic-key-metadata");
const chain = Buffer.from("synthetic-certificate-chain-metadata");
function session(secure: boolean): SMTPServerSession {
  return {
    secure,
    envelope: {
      mailFrom: { address: "sender@example.invalid", args: {} },
      rcptTo: [
        { address: "one@example.invalid", args: {} },
        { address: "two@example.invalid", args: {} },
      ],
    },
  } as SMTPServerSession;
}
function stream(): SMTPServerDataStream {
  return Object.assign(new PassThrough(), {
    byteLength: 0,
    sizeExceeded: false,
  });
}
function deliver(messages: NativeProductionMessage[], chunks: Buffer[]) {
  const options = productionMailOptions(key, chain, messages);
  const data = stream();
  const callback = vi.fn();
  options.onData!(data, session(true), callback);
  for (const chunk of chunks) data.emit("data", chunk);
  data.emit("end");
  return callback;
}

describe("isolated STARTTLS inbox pure options", () => {
  it("offers STARTTLS with only AUTH disabled and scoped key/chain", () => {
    const messages: NativeProductionMessage[] = [];
    const options = productionMailOptions(key, chain, messages);
    expect(options.authOptional).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.disabledCommands).toEqual(["AUTH"]);
    expect(options.minVersion).toBe("TLSv1.2");
    expect(options.size).toBe(1024 * 1024);
    expect(options.key).toBe(key);
    expect(options.cert).toBe(chain);
    expect(options).not.toHaveProperty("rejectUnauthorized");
    expect(options).not.toHaveProperty("onAuth");
    expect(messages).toEqual([]);
  });
  it.each([false, undefined])(
    "rejects MAIL FROM before plaintext data for secure=%s",
    (secure) => {
      const messages: NativeProductionMessage[] = [];
      const options = productionMailOptions(key, chain, messages);
      const callback = vi.fn();
      const current = session(false);
      Object.assign(current, { secure });
      options.onMailFrom!(
        { address: "synthetic-secret@example.invalid", args: {} },
        current,
        callback,
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({
        message: "TLS required",
        responseCode: 530,
      });
      expect(callback.mock.calls[0][0].message).not.toContain(
        "synthetic-secret",
      );
      expect(messages).toEqual([]);
    },
  );
  it("accepts MAIL FROM only after secure session", () => {
    const callback = vi.fn();
    productionMailOptions(key, chain, []).onMailFrom!(
      { address: "sender@example.invalid", args: {} },
      session(true),
      callback,
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith();
  });
  it("rejects plaintext DATA before any stream subscription or body consumption", () => {
    const messages: NativeProductionMessage[] = [];
    const data = stream();
    const callback = vi.fn();
    productionMailOptions(key, chain, messages).onData!(
      data,
      session(false),
      callback,
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({
      message: "TLS required",
      responseCode: 530,
    });
    expect(data.listenerCount("data")).toBe(0);
    expect(data.listenerCount("end")).toBe(0);
    data.emit("data", Buffer.from("synthetic-secret-plaintext-body"));
    data.emit("end");
    expect(messages).toEqual([]);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("preserves secure recipients, UTF8, CRLF/LF dequote and =3D decoding", () => {
    const messages: NativeProductionMessage[] = [];
    const callback = deliver(messages, [
      Buffer.from(
        "Subject: tést\r\n\r\nhttps://127.0.0.1:3110/verify?token=3Dabc=\r\n",
      ),
      Buffer.from("def=\nghi\r\n"),
    ]);
    expect(callback).toHaveBeenCalledExactlyOnceWith();
    expect(messages).toEqual([
      {
        recipients: ["one@example.invalid", "two@example.invalid"],
        text: "Subject: tést\r\n\r\nhttps://127.0.0.1:3110/verify?token=abcdefghi\r\n",
      },
    ]);
  });
  it("accepts exactly the original 1MiB boundary", () => {
    const messages: NativeProductionMessage[] = [];
    const callback = deliver(messages, [Buffer.alloc(1024 * 1024, 97)]);
    expect(callback).toHaveBeenCalledExactlyOnceWith();
    expect(messages[0].text.length).toBe(1024 * 1024);
  });
  it.each([true, false])(
    "rejects oversize secure DATA, singleChunk=%s",
    (singleChunk) => {
      const messages: NativeProductionMessage[] = [
        { recipients: ["prior@example.invalid"], text: "prior" },
      ];
      const before = structuredClone(messages);
      const chunks = singleChunk
        ? [Buffer.alloc(1024 * 1024 + 1)]
        : [Buffer.alloc(1024 * 1024), Buffer.from("x")];
      const callback = deliver(messages, chunks);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({
        message: "Message too large",
      });
      expect(messages).toEqual(before);
    },
  );
  it("retains original queue cap100 and removes only oldest secure message", () => {
    const messages: NativeProductionMessage[] = Array.from(
      { length: 100 },
      (_, index) => ({
        recipients: ["prior@example.invalid"],
        text: `prior-${index}`,
      }),
    );
    const retained = messages[1];
    expect(
      deliver(messages, [Buffer.from("new")]),
    ).toHaveBeenCalledExactlyOnceWith();
    expect(messages).toHaveLength(100);
    expect(messages[0]).toBe(retained);
    expect(messages[99].text).toBe("new");
  });
  it("accepts empty secure message with same original recipient semantics", () => {
    const messages: NativeProductionMessage[] = [];
    expect(deliver(messages, [])).toHaveBeenCalledExactlyOnceWith();
    expect(messages).toEqual([
      { recipients: ["one@example.invalid", "two@example.invalid"], text: "" },
    ]);
  });
});
