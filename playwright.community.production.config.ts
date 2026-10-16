import { defineConfig } from "@playwright/test";
import base from "./playwright.community.config";
import { productionNativeConfig } from "./scripts/native-server-mode";

// Same enabled suite and retry0, with only the owned web listener using HTTPS.
export default defineConfig(productionNativeConfig(base));
