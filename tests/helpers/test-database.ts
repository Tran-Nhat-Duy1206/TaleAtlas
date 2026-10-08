export function requireTestDatabase(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "TEST_DATABASE_URL required; tests never fall back to application/production credentials",
    );
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  ) {
    throw new Error(
      "Integration tests require a loopback database whose name ends in _test",
    );
  }
  return value;
}
