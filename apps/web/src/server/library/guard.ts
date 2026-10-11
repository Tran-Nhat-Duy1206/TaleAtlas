import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthorizationError, requireSession } from "../session";
import { requestSignInReturn } from "@/lib/request-return";
import type { Locale } from "@/lib/i18n";
export async function libraryGuard(locale: Locale, destination: string) {
  const h = await headers();
  try {
    const session = await requireSession(h);
    if (!session.user.emailVerified) return null;
    return h;
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect(
        `/${locale}/login?callbackURL=${encodeURIComponent(requestSignInReturn(destination, locale))}`,
      );
    return null;
  }
}
