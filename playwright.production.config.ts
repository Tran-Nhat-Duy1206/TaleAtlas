import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { productionWebServers } from "./scripts/native-server-mode";

// Maintainer-approved local production verification; original config untouched.
export default defineConfig({ ...base, webServer: productionWebServers(base) });
