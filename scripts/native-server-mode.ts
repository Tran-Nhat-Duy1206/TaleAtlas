import type { PlaywrightTestConfig } from "@playwright/test";
import { productionTlsSettings } from "./native-production-tls";

export function nativeServerMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): "development" | "production" {
  const mode = environment.TALEATLAS_TEST_NATIVE_SERVER_MODE;
  if (mode === undefined || mode === "development") return "development";
  if (mode === "production") return "production";
  throw new Error("Invalid isolated native server mode");
}

/** Preserve suite limits; approved HTTPS web and STARTTLS inbox exceptions only. */
export function productionNativeConfig(
  base: PlaywrightTestConfig,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PlaywrightTestConfig {
  const tls = productionTlsSettings(environment);
  const originMatch = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})$/.exec(
    base.use?.baseURL ?? "",
  );
  if (
    !originMatch ||
    originMatch[0] !== base.use?.baseURL ||
    Number(originMatch[1]) < 1024 ||
    Number(originMatch[1]) > 65535
  )
    throw new Error("Original isolated HTTP origin required");
  const port = originMatch[1];
  const origin = `https://127.0.0.1:${port}`;
  const servers = Array.isArray(base.webServer)
    ? base.webServer
    : [base.webServer];
  let replaced = 0;
  let mailReplaced = 0;
  const webServer = servers.map((server) => {
    if (!server || typeof server.command !== "string")
      throw new Error("Original fixture server configuration required");
    if (server.command === "node --import tsx scripts/test-mail.ts") {
      if (
        server.url !== "http://127.0.0.1:1026/health" ||
        server.timeout !== 30000 ||
        server.reuseExistingServer !== false
      )
        throw new Error("Original isolated mail fixture required");
      mailReplaced++;
      return {
        ...server,
        command: "node --import tsx scripts/test-production-mail.ts",
        env: { ...server.env, NODE_ENV: "development" },
      };
    }
    if (!server.command.startsWith("pnpm --filter @taleatlas/web dev"))
      throw new Error("Original isolated fixture commands required");
    if (
      server.command !==
      `pnpm --filter @taleatlas/web dev --hostname 127.0.0.1 --port ${port}`
    )
      throw new Error("Original isolated web command required");
    replaced++;
    return {
      ...server,
      command: `node --import tsx scripts/test-production-server.ts --port ${port}`,
      url: `${origin}/api/health`,
      env: { ...server.env, NODE_ENV: "production", APP_ORIGIN: origin },
    };
  });
  if (replaced !== 1)
    throw new Error("Exactly one original isolated web server required");
  if (mailReplaced !== 1)
    throw new Error("Exactly one original isolated mail server required");
  return {
    ...base,
    use: {
      ...base.use,
      baseURL: origin,
      launchOptions: {
        ...base.use?.launchOptions,
        args: [
          ...(base.use?.launchOptions?.args ?? []),
          `--ignore-certificate-errors-spki-list=${tls.spki}`,
        ],
      },
    },
    webServer,
  };
}
