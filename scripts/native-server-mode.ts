import type { PlaywrightTestConfig } from "@playwright/test";

export function nativeServerMode(
  environment: Readonly<Record<string, string | undefined>>,
): "development" | "production" {
  const mode = environment.TALEATLAS_TEST_NATIVE_SERVER_MODE;
  if (mode === undefined || mode === "development") return "development";
  if (mode === "production") return "production";
  throw new Error("Invalid isolated native server mode");
}

/** Additive production verification: preserve every inherited test/fixture limit. */
export function productionWebServers(
  base: PlaywrightTestConfig,
): PlaywrightTestConfig["webServer"] {
  const servers = Array.isArray(base.webServer)
    ? base.webServer
    : [base.webServer];
  let replaced = 0;
  const result = servers.map((server) => {
    if (!server)
      throw new Error("Original fixture server configuration required");
    if (!server.command.startsWith("pnpm --filter @taleatlas/web dev "))
      return server;
    const match =
      /^pnpm --filter @taleatlas\/web dev --hostname 127\.0\.0\.1 --port ([0-9]{4,5})$/.exec(
        server.command,
      );
    if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535)
      throw new Error("Original isolated web command required");
    replaced++;
    return {
      ...server,
      command: `pnpm --filter @taleatlas/web start --hostname 127.0.0.1 --port ${match[1]}`,
      env: { ...server.env, NODE_ENV: "production" },
    };
  });
  if (replaced !== 1)
    throw new Error("Exactly one original isolated web server required");
  return result;
}
