import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opaque,
  digest,
  hashPassword,
  verifyPassword,
} from "../src/server/security.js";
test("Argon2id uses independent salts and rejects incorrect passwords", async () => {
  const a = await hashPassword("synthetic-password-123");
  const b = await hashPassword("synthetic-password-123");
  assert.notEqual(a, b);
  assert.match(a, /argon2id/);
  assert.equal(await verifyPassword(a, "synthetic-password-123"), true);
  assert.equal(await verifyPassword(a, "incorrect-password"), false);
});
test("session tokens have high entropy and only digest is persisted", () => {
  const a = opaque();
  assert.notEqual(a, opaque());
  assert.equal(Buffer.from(a, "base64url").length, 32);
  assert.equal(digest(a).length, 64);
  assert.notEqual(a, digest(a));
});

import { validatePrivateFile } from "../src/server/storage.js";
test("private upload validation rejects executable, empty, SVG and oversize payloads", async () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('<svg onload="alert(1)"></svg>'),
    Buffer.from("MZsynthetic-executable"),
    Buffer.alloc(10485761),
  ])
    await assert.rejects(() => validatePrivateFile(bytes));
  assert.equal(
    await validatePrivateFile(Buffer.from("%PDF-1.4\n%%EOF")),
    "application/pdf",
  );
});

import { seal, open } from "../src/server/crypto.js";
import { matchedCounter, totp } from "../src/server/mfa.js";
import { Secret, TOTP } from "otpauth";
test("AES-GCM secret encryption uses random IVs and binds ciphertext to its intended record", async () => {
  const a = await seal("synthetic-secret", "context:A"),
    b = await seal("synthetic-secret", "context:A");
  assert.notEqual(a, b);
  assert.equal(await open(a, "context:A"), "synthetic-secret");
  await assert.rejects(() => open(a, "context:B"));
  const parts = a.split(":");
  const tampered = Buffer.from(parts[3], "base64url");
  tampered[0] ^= 1;
  parts[3] = tampered.toString("base64url");
  await assert.rejects(() => open(parts.join(":"), "context:A"));
});
test("TOTP matches RFC6238 vector and rejects invalid codes/windows", () => {
  const secret = Secret.fromUTF8("12345678901234567890");
  assert.equal(
    new TOTP({ secret, algorithm: "SHA1", digits: 8, period: 30 }).generate({
      timestamp: 59000,
    }),
    "94287082",
  );
  assert.equal(matchedCounter(secret.base32, "287082", 59000), 1);
  assert.equal(matchedCounter(secret.base32, "invalid", 59000), null);
  assert.equal(matchedCounter(secret.base32, "287082", 300000), null);
});
