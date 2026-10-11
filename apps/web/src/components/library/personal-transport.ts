import {
  personalHttpDetailsSchema,
  personalHttpMutationResponseSchema,
} from "@/features/library/personal-http-contracts";
export class PersonalRequestError extends Error {
  constructor(
    public status: number,
    public ambiguous: boolean,
  ) {
    super("Personal request failed");
  }
}
async function personalRequest(
  url: string,
  body?: string,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new PersonalRequestError(0, true);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new PersonalRequestError(
      response.ok ? 0 : response.status,
      response.ok || response.status >= 500,
    );
  }
  if (!response.ok)
    throw new PersonalRequestError(response.status, response.status >= 500);
  const parsed = (
    body === undefined
      ? personalHttpDetailsSchema
      : personalHttpMutationResponseSchema
  ).safeParse(value);
  if (!parsed.success) throw new PersonalRequestError(0, true);
  return parsed.data;
}
export function personalLoad(url: string, signal: AbortSignal) {
  return personalRequest(url, undefined, signal);
}
export function personalCommand(url: string, body: string) {
  return personalRequest(url, body);
}
