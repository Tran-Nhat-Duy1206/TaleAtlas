import { defineConfig } from "@playwright/test";
import base from "./playwright.community.config";
import { productionWebServers } from "./scripts/native-server-mode";

// Same complete enabled suite, masks, assertions and retry0; prebuilt server only.
export default defineConfig({ ...base, webServer: productionWebServers(base) });
