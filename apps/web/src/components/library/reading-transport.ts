import type { z } from "zod";
import { readingMutationResponseSchema } from "@/features/library/reading-http-contracts";
export class ReadingRequestError extends Error {
  constructor(
    public status: number,
    public ambiguous: boolean,
  ) {
    super("Reading request failed");
  }
}
export async function readingRequest<T>(
  url: string,
  schema: z.ZodType<T>,
  body?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body }),
    });
  } catch {
    throw new ReadingRequestError(0, true);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ReadingRequestError(
      response.ok ? 0 : response.status,
      response.ok || response.status >= 500,
    );
  }
  if (!response.ok)
    throw new ReadingRequestError(response.status, response.status >= 500);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ReadingRequestError(0, true);
  return parsed.data;
}
export function readingCommand(url: string, body: string) {
  return readingRequest(url, readingMutationResponseSchema, body);
}
