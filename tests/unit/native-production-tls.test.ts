import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { productionTlsSettings } from "../../scripts/native-production-tls";

const cwd = resolve("synthetic-owned-clone");
const name = "native-production-tls-12345678-1234-4123-8123-123456789abc";
const directory = join(cwd, ".local", name);
const spki = Buffer.alloc(32, 1).toString("base64");
const settings = (
  path: string | undefined = directory,
  pin: string | undefined = spki,
) =>
  Object.freeze({
    TALEATLAS_TEST_TLS_DIRECTORY: path,
    TALEATLAS_TEST_TLS_SPKI: pin,
  });
const invalid = new Error("Invalid isolated native production TLS settings");

describe("pure isolated native production TLS settings", () => {
  it("derives only the three owned fixture paths and canonical SHA-256 pin", () => {
    expect(productionTlsSettings(settings(), cwd)).toEqual({
      certificatePath: join(directory, "server-cert.pem"),
      keyPath: join(directory, "server-key.pem"),
      caPath: join(directory, "ca-cert.pem"),
      spki,
    });
  });

  it("defaults to the current clone without reading fixture files", () => {
    const path = join(process.cwd(), ".local", name);
    expect(productionTlsSettings(settings(path)).keyPath).toBe(
      join(path, "server-key.pem"),
    );
  });

  it("does not mutate frozen input or process environment", () => {
    const before = { ...process.env };
    const input = settings();
    productionTlsSettings(input, cwd);
    expect(input).toEqual(settings());
    expect(process.env).toEqual(before);
  });

  it("validates only the explicit fixture directory and pin", () => {
    const input = Object.freeze({
      ...settings(),
      NODE_EXTRA_CA_CERTS: "synthetic-operator-path",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      UNRELATED: "synthetic-sensitive-value",
    });
    expect(productionTlsSettings(input, cwd)).toEqual(
      productionTlsSettings(settings(), cwd),
    );
  });

  it.each([
    {},
    { TALEATLAS_TEST_TLS_DIRECTORY: directory },
    { TALEATLAS_TEST_TLS_SPKI: spki },
  ])(
    "requires both explicit settings without implicit environment fallback %#",
    (input) => {
      expect(() => productionTlsSettings(Object.freeze(input), cwd)).toThrow(
        invalid,
      );
    },
  );

  const paths = [
    "",
    "synthetic-sensitive-operator-path",
    join(".local", name),
    join(cwd, name),
    join(cwd, ".local-other", name),
    join(cwd, ".local", "nested", name),
    join(cwd, ".local", name, "nested"),
    join(resolve("other-owned-clone"), ".local", name),
    join(cwd, ".local", "native-production-tls-not-a-uuid"),
    join(
      cwd,
      ".local",
      "native-production-tls-12345678-1234-4123-8123-123456789abz",
    ),
    join(
      cwd,
      ".local",
      "native-production-tls-12345678-1234-4123-8123-123456789abc-extra",
    ),
    `${directory}/`,
    `${directory}/../${name}`,
    `${directory}\u0000`,
    `${directory}\n`,
    `${directory}\r`,
  ].map((path, index) => ({ path, label: `path form ${index + 1}` }));
  it.each(paths)("rejects $label with no operator value echoed", ({ path }) => {
    expect(() => productionTlsSettings(settings(path), cwd)).toThrow(invalid);
  });

  const pins = [
    "",
    "synthetic-sensitive-pin",
    " ",
    `${spki} `,
    ` ${spki}`,
    `${spki}\n`,
    spki.slice(0, -1),
    `${spki}=`,
    Buffer.alloc(31).toString("base64"),
    Buffer.alloc(33).toString("base64"),
    "A".repeat(44),
    `${"A".repeat(42)}B=`,
    `${"-".repeat(43)}=`,
    `${"_".repeat(43)}=`,
    `${"Ａ".repeat(43)}=`,
    `${spki}\u0000`,
  ].map((pin, index) => ({ pin, label: `pin form ${index + 1}` }));
  it.each(pins)("rejects $label with generic redaction", ({ pin }) => {
    expect(() => productionTlsSettings(settings(directory, pin), cwd)).toThrow(
      invalid,
    );
  });

  it.each([0, 127, 255])(
    "accepts canonical 32-byte digests (byte %i)",
    (byte) => {
      const pin = Buffer.alloc(32, byte).toString("base64");
      expect(productionTlsSettings(settings(directory, pin), cwd).spki).toBe(
        pin,
      );
    },
  );
});
