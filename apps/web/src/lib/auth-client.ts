"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { getAuth } from "../server/auth";
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<ReturnType<typeof getAuth>>()],
});
