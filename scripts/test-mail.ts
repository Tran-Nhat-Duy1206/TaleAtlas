import { SMTPServer } from "smtp-server";
import { createServer } from "node:http";

// Synthetic tests only: a loopback inbox, never installed in the deployed application.
if (process.env.NODE_ENV === "production")
  throw new Error("Test inbox must not run in production");
const smtpPort = Number(process.env.TEST_SMTP_PORT ?? "1025");
if (!Number.isInteger(smtpPort) || smtpPort < 1024 || smtpPort > 65535)
  throw new Error("Invalid isolated test SMTP port");
const messages: { recipients: string[]; text: string }[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: 1024 * 1024,
  onData(stream, session, callback) {
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
});
const http = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/health") {
    response.end('{"status":"ok"}');
    return;
  }
  if (request.url === "/messages") {
    response.end(JSON.stringify(messages));
    return;
  }
  response.writeHead(404);
  response.end("{}");
});
smtp.listen(smtpPort, "127.0.0.1");
http.listen(1026, "127.0.0.1", () =>
  console.log(`Synthetic test inbox ready on loopback ports ${smtpPort}/1026`),
);
const stop = () => {
  smtp.close();
  http.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
