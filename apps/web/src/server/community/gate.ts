import "server-only";
import { HttpError } from "../http";

/** Server authority only. Never infer enablement from a client flag. */
export function isCommunityEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.V4_COMMUNITIES_ENABLED === "true";
}

/** Call before reading a payload, authenticating, or accessing community storage. */
export function requireCommunityEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!isCommunityEnabled(environment))
    throw new HttpError(404, "COMMUNITY_UNAVAILABLE");
}
