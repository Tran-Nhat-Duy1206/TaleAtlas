import "server-only";
import { AuthorizationError, requireSession } from "../session";

/** Serialize only participation eligibility, never a session/user/private-library DTO. */
export async function communityParticipation(headers: Headers) {
  try {
    const principal = await requireSession(headers);
    return principal.user.emailVerified
      ? ("VERIFIED" as const)
      : ("UNVERIFIED" as const);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      return "ANONYMOUS" as const;
    throw error;
  }
}
