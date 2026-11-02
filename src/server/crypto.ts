import "dotenv/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
let keyPromise: Promise<Buffer> | undefined;
export async function encryptionKey(): Promise<Buffer> {
  return (keyPromise ??= loadKey());
}
async function loadKey() {
  const configured = process.env.APP_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32)
      throw Error("APP_ENCRYPTION_KEY must contain 32 random bytes in base64");
    return key;
  }
  if (process.env.NODE_ENV === "production")
    throw Error("Production requires APP_ENCRYPTION_KEY");
  await mkdir(".local", { recursive: true });
  try {
    await writeFile(".local/encryption.key", randomBytes(32), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const key = await readFile(".local/encryption.key");
  if (key.length !== 32) throw Error("Invalid local encryption key");
  return key;
}
export async function seal(secret: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}
export async function open(sealed: string, context: string) {
  const [version, iv, tag, encrypted, ...extra] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted || extra.length)
    throw Error("Invalid encrypted envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
