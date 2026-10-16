import { spawnSync } from "node:child_process";
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { requireTestDatabase } from "../tests/helpers/test-database";

export type NativeProductionTls = {
  certificatePath: string;
  keyPath: string;
  caPath: string;
  spki: string;
};

const invalidSettings = () =>
  new Error("Invalid isolated native production TLS settings");

/** Pure validation: no filesystem access, implicit trust settings, or environment writes. */
export function productionTlsSettings(
  env: Readonly<Record<string, string | undefined>>,
  cwd = process.cwd(),
): NativeProductionTls {
  const directory = env.TALEATLAS_TEST_TLS_DIRECTORY;
  const spki = env.TALEATLAS_TEST_TLS_SPKI;
  if (
    !directory ||
    !isAbsolute(directory) ||
    directory !== resolve(directory) ||
    dirname(directory) !== resolve(cwd, ".local") ||
    basename(directory).length !== "native-production-tls-".length + 36 ||
    !/^native-production-tls-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      basename(directory),
    ) ||
    !spki ||
    !/^[A-Za-z0-9+/]{43}=$/.test(spki)
  )
    throw invalidSettings();
  const digest = Buffer.from(spki, "base64");
  if (digest.length !== 32 || digest.toString("base64") !== spki)
    throw invalidSettings();
  return {
    certificatePath: join(directory, "server-cert.pem"),
    keyPath: join(directory, "server-key.pem"),
    caPath: join(directory, "ca-cert.pem"),
    spki,
  };
}

/** Creates trust material only for an explicitly isolated, loopback test database. */
export async function prepareNativeProductionTls(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd = process.cwd(),
): Promise<NativeProductionTls> {
  // This existing guard deliberately reads process.env, not the pure settings argument.
  try {
    requireTestDatabase();
  } catch {
    throw new Error(
      "Isolated test database required for native production TLS",
    );
  }
  if (
    env.TALEATLAS_TEST_TLS_DIRECTORY !== undefined ||
    env.TALEATLAS_TEST_TLS_SPKI !== undefined ||
    env.NODE_EXTRA_CA_CERTS !== undefined ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw invalidSettings();

  let ownedDirectory: string | undefined;
  try {
    const local = resolve(cwd, ".local");
    await mkdir(local, { recursive: true, mode: 0o700 });
    // Never generate or clean up through an operator-controlled .local symlink.
    if (
      (await lstat(local)).isSymbolicLink() ||
      (await realpath(local)) !== join(await realpath(cwd), ".local")
    )
      throw invalidSettings();
    const directory = join(local, `native-production-tls-${randomUUID()}`);
    await mkdir(directory, { mode: 0o700 });
    ownedDirectory = directory;
    // POSIX permission intent only; chmod does not guarantee Windows ACL isolation.
    await chmod(directory, 0o700);

    const openssl =
      process.platform === "win32"
        ? [
            "C:\\msys64\\ucrt64\\bin\\openssl.exe",
            "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
          ].find(existsSync)
        : "openssl";
    if (!openssl) throw invalidSettings();
    const run = (args: string[]) => {
      const result = spawnSync(openssl, args, {
        cwd: directory,
        shell: false,
        stdio: "ignore",
        timeout: 30_000,
        windowsHide: true,
      });
      if (result.error || result.signal || result.status !== 0)
        throw invalidSettings();
    };
    const rootKey = join(directory, "ca-key.pem");
    const caPath = join(directory, "ca-cert.pem");
    const keyPath = join(directory, "server-key.pem");
    const certificatePath = join(directory, "server-cert.pem");
    const csr = join(directory, "server.csr");
    const extensions = join(directory, "server.ext");
    const serial = join(directory, "ca-cert.srl");
    // OpenSSL truncates these owned files; pre-create them with restrictive modes.
    for (const file of [rootKey, caPath, keyPath, certificatePath, csr]) {
      await writeFile(file, "", { mode: 0o600, flag: "wx" });
    }
    await writeFile(
      extensions,
      [
        "basicConstraints=critical,CA:FALSE",
        "keyUsage=critical,digitalSignature",
        "extendedKeyUsage=serverAuth",
        "subjectAltName=IP:127.0.0.1,DNS:localhost",
        "subjectKeyIdentifier=hash",
        "authorityKeyIdentifier=keyid,issuer",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    run([
      "genpkey",
      "-algorithm",
      "EC",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-out",
      rootKey,
    ]);
    await chmod(rootKey, 0o600);
    run([
      "req",
      "-new",
      "-x509",
      "-key",
      rootKey,
      "-out",
      caPath,
      "-days",
      "2",
      "-sha256",
      "-subj",
      "/CN=TaleAtlas isolated native test CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
    run([
      "genpkey",
      "-algorithm",
      "EC",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-out",
      keyPath,
    ]);
    await chmod(keyPath, 0o600);
    run([
      "req",
      "-new",
      "-key",
      keyPath,
      "-out",
      csr,
      "-subj",
      "/CN=localhost",
      "-sha256",
    ]);
    run([
      "x509",
      "-req",
      "-in",
      csr,
      "-CA",
      caPath,
      "-CAkey",
      rootKey,
      "-CAserial",
      serial,
      "-CAcreateserial",
      "-out",
      certificatePath,
      "-days",
      "2",
      "-sha256",
      "-extfile",
      extensions,
    ]);
    for (const file of [caPath, certificatePath, csr, serial, extensions])
      await chmod(file, 0o600);
    const certificate = new X509Certificate(await readFile(certificatePath));
    const spki = createHash("sha256")
      .update(certificate.publicKey.export({ type: "spki", format: "der" }))
      .digest("base64");
    return productionTlsSettings(
      {
        TALEATLAS_TEST_TLS_DIRECTORY: directory,
        TALEATLAS_TEST_TLS_SPKI: spki,
      },
      cwd,
    );
  } catch {
    if (ownedDirectory) {
      try {
        await rm(ownedDirectory, { recursive: true, force: true });
      } catch {
        /* Never expose filesystem paths or underlying tool errors. */
      }
    }
    throw new Error("Unable to prepare isolated native production TLS");
  }
}
