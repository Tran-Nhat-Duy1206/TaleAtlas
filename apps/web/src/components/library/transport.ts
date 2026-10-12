import { z } from "zod";
import { statuses } from "./copy";
const stateFields = {
  id: z.uuid(),
  revision: z.number().int().min(1),
  status: z.enum(statuses),
  favorite: z.boolean(),
  archived: z.boolean(),
};
export const ownStateSchema = z.object(stateFields);
export const mutationResultSchema = z.object({
  ...stateFields,
  workId: z.uuid(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  hasCompletedRead: z.boolean(),
  currentSession: z
    .object({
      id: z.uuid(),
      state: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]),
      kind: z.enum(["FIRST_READ", "REREAD"]),
    })
    .nullable(),
  work: z.discriminatedUnion("available", [
    z.object({ available: z.literal(false), id: z.uuid() }).strict(),
    z
      .object({
        available: z.literal(true),
        id: z.uuid(),
        slug: z.string().min(1),
        displayTitle: z.string().min(1),
      })
      .passthrough(),
  ]),
});
export type OwnState = z.infer<typeof ownStateSchema>;
export class LibraryRequestError extends Error {
  constructor(
    public status: number,
    public ambiguous = false,
  ) {
    super("Library request failed");
  }
}
export async function libraryCommand(
  url: string,
  method: string,
  payload: string,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch {
    throw new LibraryRequestError(0, true);
  }
  if (!response.ok)
    throw new LibraryRequestError(response.status, response.status >= 500);
  try {
    return mutationResultSchema.parse(await response.json());
  } catch {
    throw new LibraryRequestError(0, true);
  }
}
