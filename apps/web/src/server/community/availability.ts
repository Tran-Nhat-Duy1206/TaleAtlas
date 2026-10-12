import "server-only";

/** Pure server authority: no HTTP, authentication, storage or client flag dependencies. */
export function isCommunityEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.V4_COMMUNITIES_ENABLED === "true";
}
