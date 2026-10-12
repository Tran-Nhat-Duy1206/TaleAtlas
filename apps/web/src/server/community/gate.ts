import "server-only";
import { HttpError } from "../http";

import { isCommunityEnabled } from "./availability";
export { isCommunityEnabled } from "./availability";

/** Call before reading a payload, authenticating, or accessing community storage. */
export function requireCommunityEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!isCommunityEnabled(environment))
    throw new HttpError(404, "COMMUNITY_UNAVAILABLE");
}
