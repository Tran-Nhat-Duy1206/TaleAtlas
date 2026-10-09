import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthorizationError, requireRole } from "@/server/session";
import type { Locale } from "@/lib/i18n";
export async function adminGuard(locale: Locale) {
  const requestHeaders = await headers();
  try {
    await requireRole(["admin"], requestHeaders);
    return requestHeaders;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.status === 401) redirect(`/${locale}/login`);
      return null;
    }
    throw error;
  }
}
