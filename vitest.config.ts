import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      "next/headers": fileURLToPath(
        new URL("./apps/web/node_modules/next/headers.js", import.meta.url),
      ),
      "next/navigation": fileURLToPath(
        new URL("./apps/web/node_modules/next/navigation.js", import.meta.url),
      ),
      "next/link": fileURLToPath(
        new URL("./apps/web/node_modules/next/link.js", import.meta.url),
      ),
      "next-themes": fileURLToPath(
        new URL(
          "./apps/web/node_modules/next-themes/dist/index.mjs",
          import.meta.url,
        ),
      ),
      "server-only": fileURLToPath(
        new URL("./tests/helpers/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
    maxWorkers: 2,
  },
});
