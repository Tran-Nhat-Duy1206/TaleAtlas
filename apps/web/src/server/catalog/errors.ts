import "server-only";
export class CatalogError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "CatalogError";
  }
}
export function sanitizeCatalogError(error: unknown): CatalogError {
  if (error instanceof CatalogError) return error;
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403 || status === 503)
    return new CatalogError(
      status,
      status === 401
        ? "UNAUTHENTICATED"
        : status === 403
          ? "FORBIDDEN"
          : "UNAVAILABLE",
    );
  return new CatalogError(503, "UNAVAILABLE");
}
