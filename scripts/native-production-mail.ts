import type { SMTPServerOptions } from "smtp-server";

export type NativeProductionMessage = { recipients: string[]; text: string };

function requireTlsError(): Error & { responseCode: number } {
  return Object.assign(new Error("TLS required"), { responseCode: 530 });
}

/** Pure STARTTLS inbox options; never creates a listener or reads trust material. */
export function productionMailOptions(
  key: Buffer,
  certificateChain: Buffer,
  messages: NativeProductionMessage[],
): SMTPServerOptions {
  return {
    authOptional: true,
    secure: false,
    disabledCommands: ["AUTH"],
    minVersion: "TLSv1.2",
    key,
    cert: certificateChain,
    size: 1024 * 1024,
    onMailFrom(_address, session, callback) {
      if (!session.secure) {
        callback(requireTlsError());
        return;
      }
      callback();
    },
    onData(stream, session, callback) {
      if (!session.secure) {
        callback(requireTlsError());
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 1024 * 1024) chunks.push(chunk);
      });
      stream.on("end", () => {
        if (size > 1024 * 1024) {
          callback(new Error("Message too large"));
          return;
        }
        messages.push({
          recipients: session.envelope.rcptTo.map(
            (recipient) => recipient.address,
          ),
          text: Buffer.concat(chunks)
            .toString("utf8")
            .replace(/=\r?\n/g, "")
            .replace(/=3D/g, "="),
        });
        if (messages.length > 100) messages.shift();
        callback();
      });
    },
  };
}
