import { X509Certificate, createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { SMTPServer } from "smtp-server";
import { requireTestDatabase } from "../tests/helpers/test-database";
import { productionTlsSettings } from "./native-production-tls";
import {
  productionMailOptions,
  type NativeProductionMessage,
} from "./native-production-mail";

async function main(): Promise<void> {
  // No environment validation, filesystem access, or listener before this guard.
  requireTestDatabase();
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.argv.length !== 2
  )
    throw new Error("Isolated development inbox environment required");
  const portValue = process.env.TEST_SMTP_PORT;
  const smtpPort = Number(portValue);
  if (
    !portValue ||
    !/^[1-9][0-9]{3,4}$/.test(portValue) ||
    String(smtpPort) !== portValue ||
    smtpPort < 1024 ||
    smtpPort > 65535 ||
    smtpPort === 1026
  )
    throw new Error("Explicit isolated SMTP port required");
  const tls = productionTlsSettings(process.env);
  if (process.env.NODE_EXTRA_CA_CERTS !== tls.caPath)
    throw new Error("Isolated startup CA configuration required");
  const [certificate, key, ca] = await Promise.all([
    readFile(tls.certificatePath),
    readFile(tls.keyPath),
    readFile(tls.caPath),
  ]);
  const leaf = new X509Certificate(certificate);
  const root = new X509Certificate(ca);
  const now = Date.now();
  const publicKey = leaf.publicKey.export({ type: "spki", format: "der" });
  if (
    leaf.ca ||
    leaf.checkIP("127.0.0.1") !== "127.0.0.1" ||
    !(Date.parse(leaf.validFrom) <= now && now <= Date.parse(leaf.validTo)) ||
    !root.ca ||
    !(Date.parse(root.validFrom) <= now && now <= Date.parse(root.validTo)) ||
    !leaf.checkIssued(root) ||
    !leaf.verify(root.publicKey) ||
    createHash("sha256").update(publicKey).digest("base64") !== tls.spki ||
    !publicKey.equals(
      createPublicKey(key).export({ type: "spki", format: "der" }),
    )
  )
    throw new Error("Invalid isolated production certificate");

  const messages: NativeProductionMessage[] = [];
  const chain = Buffer.from(
    `${certificate.toString("utf8").trim()}\n${ca.toString("utf8").trim()}\n`,
  );
  const smtp = new SMTPServer(productionMailOptions(key, chain, messages));
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
  let smtpListening = false;
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await Promise.all([
      smtpListening
        ? new Promise<void>((accept) => smtp.close(accept))
        : Promise.resolve(),
      http.listening
        ? new Promise<void>((accept, reject) =>
            http.close((error) => (error ? reject(error) : accept())),
          )
        : Promise.resolve(),
    ]);
  };
  const fail = (): void => {
    console.error("Isolated STARTTLS inbox failed");
    process.exitCode = 1;
    void shutdown().catch(() => {
      console.error("Isolated STARTTLS inbox shutdown failed");
      process.exitCode = 1;
    });
  };
  try {
    await new Promise<void>((accept, reject) => {
      smtp.once("error", reject);
      smtp.listen(smtpPort, "127.0.0.1", () => {
        smtpListening = true;
        smtp.removeListener("error", reject);
        accept();
      });
    });
    smtp.on("error", fail);
    await new Promise<void>((accept, reject) => {
      http.once("error", reject);
      http.listen(1026, "127.0.0.1", () => {
        http.removeListener("error", reject);
        accept();
      });
    });
    http.on("error", fail);
    const stop = (): void => {
      void shutdown().catch(fail);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {
    await shutdown();
    throw new Error("Isolated STARTTLS inbox startup failed");
  }
}

void main().catch(() => {
  console.error("Isolated STARTTLS inbox startup failed");
  process.exitCode = 1;
});
