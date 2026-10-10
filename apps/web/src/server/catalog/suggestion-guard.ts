import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminGuard } from "@/components/catalog/AdminGuard";
import { AuthorizationError, requireSession } from "../session";
import type { Locale } from "@/lib/i18n";

// Authority is established before any private suggestion query.
export async function suggestionGuard(locale: Locale, admin = false) {
  let requestHeaders: Headers | null;
  if (admin) {
    // Keep existing admin role and anonymous redirect behavior.
    requestHeaders = await adminGuard(locale);
    if (!requestHeaders) return null;
  } else requestHeaders = await headers();
  try {
    const session = await requireSession(requestHeaders);
    if (!session.user.emailVerified) throw new AuthorizationError(403);
    return requestHeaders;
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect(`/${locale}/login`);
    // No database/auth error text or private content reaches the denial render.
    return null;
  }
}
