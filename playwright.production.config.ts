import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { productionNativeConfig } from "./scripts/native-server-mode";

// Additive HTTPS verification; all original suite and fixture limits remain.
export default defineConfig(productionNativeConfig(base));
