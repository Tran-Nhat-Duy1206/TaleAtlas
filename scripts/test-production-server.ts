import { X509Certificate, createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireTestDatabase } from "../tests/helpers/test-database";
import { productionTlsSettings } from "./native-production-tls";

async function main(): Promise<void> {
  // The database guard must run before environment validation, files, or servers.
  const databaseURL = requireTestDatabase();
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.DATABASE_URL !== databaseURL
  )
    throw new Error("Isolated production server environment required");
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== "--port" ||
    !/^[1-9][0-9]{3,4}$/.test(args[1] ?? "")
  )
    throw new Error("Explicit isolated production port required");
  const port = Number(args[1]);
  if (port < 1024 || port > 65535 || String(port) !== args[1])
    throw new Error("Invalid isolated production port");
  if (process.env.APP_ORIGIN !== `https://127.0.0.1:${port}`)
    throw new Error("Exact isolated HTTPS origin required");
  const tls = productionTlsSettings(process.env);
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.NODE_EXTRA_CA_CERTS !== tls.caPath
  )
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

  const dir = resolve(process.cwd(), "apps/web");
  const requireWeb = createRequire(resolve(dir, "package.json"));
  // Resolve the actual SDK from the web workspace, never a root/global install.
  const next = requireWeb("next") as (options: {
    dev: false;
    dir: string;
    hostname: string;
    port: number;
  }) => {
    prepare(): Promise<void>;
    close(): Promise<void>;
    getRequestHandler(): (
      request: IncomingMessage,
      response: ServerResponse,
    ) => Promise<void>;
  };
  const app = next({ dev: false, dir, hostname: "127.0.0.1", port });
  let server: ReturnType<typeof createServer> | undefined;
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (server?.listening)
      await new Promise<void>((accept, reject) =>
        server!.close((error) => (error ? reject(error) : accept())),
      );
    await app.close();
  };
  const onSignal = (): void => {
    void shutdown().catch(() => {
      console.error("Isolated production server shutdown failed");
      process.exitCode = 1;
    });
  };
  try {
    // Production prepare consumes the already-built .next; no dev/type generator.
    await app.prepare();
    const handler = app.getRequestHandler();
    server = createServer(
      {
        key,
        cert: `${certificate.toString("utf8").trim()}\n${ca.toString("utf8").trim()}\n`,
        minVersion: "TLSv1.2",
      },
      (request, response) => {
        void handler(request, response).catch(() => {
          if (!response.headersSent) {
            response.statusCode = 500;
            response.end("Internal server error");
          } else response.destroy();
        });
      },
    );
    await new Promise<void>((accept, reject) => {
      server!.once("error", reject);
      server!.listen(port, "127.0.0.1", () => {
        server!.removeListener("error", reject);
        accept();
      });
    });
    server.on("error", () => {
      console.error("Isolated production server failed");
      process.exitCode = 1;
      onSignal();
    });
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  } catch {
    await shutdown();
    throw new Error("Isolated production server startup failed");
  }
}

void main().catch(() => {
  console.error("Isolated production server startup failed");
  process.exitCode = 1;
});
