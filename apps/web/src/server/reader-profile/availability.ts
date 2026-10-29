import "server-only";

/** Configuration only: no authentication, request parsing, storage or client flags. */
export function getReaderProfileAvailability(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<{ owner: boolean; public: boolean }> {
  const owner = environment.V6B_PROFILE_OWNER_ENABLED;
  const publicProfile = environment.V6B_PROFILE_PUBLIC_ENABLED;
  const valid = (value: string | undefined) =>
    value === undefined || value === "false" || value === "true";
  if (!valid(owner) || !valid(publicProfile))
    return { owner: false, public: false };
  if (publicProfile === "true" && owner !== "true")
    return { owner: false, public: false };
  return { owner: owner === "true", public: publicProfile === "true" };
}

export function isReaderProfileOwnerEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return getReaderProfileAvailability(environment).owner;
}

export function isReaderProfilePublicEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return getReaderProfileAvailability(environment).public;
}
