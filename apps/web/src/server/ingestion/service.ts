import "server-only";
import { z } from "zod";
import { requireRole, requireSession } from "../session";
import { limitCatalogMutation } from "../http";
import {
  submitRequestSchema,
  updateRequestSchema,
  cancelRequestSchema,
  requestPageSchema,
  requestModerationSchema,
} from "../../features/ingestion/contracts";
import * as repository from "./requests";

export async function createStoryRequest(input: unknown, headers: Headers) {
  const session = await requireSession(headers);
  await limitCatalogMutation(session.user.id);
  const value = submitRequestSchema.parse(input);
  return repository.submitRequest(
    session.user.id,
    value.submitKey,
    value.details,
  );
}
export async function myStoryRequests(input: unknown, headers: Headers) {
  const session = await requireSession(headers);
  const value = requestPageSchema.parse(input);
  return repository.listOwnedRequests(
    session.user.id,
    value.page,
    value.pageSize,
  );
}
export async function myStoryRequest(requestId: string, headers: Headers) {
  const session = await requireSession(headers);
  return repository.getRequest(z.uuid().parse(requestId), session.user.id);
}
export async function amendStoryRequest(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireSession(headers);
  await limitCatalogMutation(session.user.id);
  const value = updateRequestSchema.parse(input);
  return repository.amendRequest(
    z.uuid().parse(requestId),
    session.user.id,
    value.revision,
    value.details,
  );
}
export async function cancelStoryRequest(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireSession(headers);
  await limitCatalogMutation(session.user.id);
  const value = cancelRequestSchema.parse(input);
  return repository.cancelRequest(
    z.uuid().parse(requestId),
    session.user.id,
    value.revision,
  );
}
export async function adminStoryRequest(requestId: string, headers: Headers) {
  await requireRole(["admin"], headers);
  return repository.getRequest(z.uuid().parse(requestId));
}
export async function moderateStoryRequest(
  requestId: string,
  input: unknown,
  headers: Headers,
) {
  const session = await requireRole(["admin"], headers);
  await limitCatalogMutation(session.user.id);
  const value = requestModerationSchema.parse(input);
  return repository.moderateRequest(
    z.uuid().parse(requestId),
    session.user.id,
    value.revision,
    value.state,
    value.reason,
  );
}
