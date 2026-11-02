import { TOTP, Secret } from "otpauth";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { digest, DomainError } from "./security.js";
import { open } from "./crypto.js";
import type { AuthContext } from "./access.js";
export const totp = (secret: string, label = "account") =>
  new TOTP({
    issuer: "Kost Hospitality",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
export const newMfaSecret = () => new Secret({ size: 20 }).base32;
export function matchedCounter(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({
    token: code,
    timestamp: now,
    window: 1,
  });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
export function recoveryCode() {
  return randomBytes(12)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,6}/g)!
    .join("-");
}
export const recoveryHash = (code: string) =>
  digest(code.replace(/[\s-]/g, "").toUpperCase());
export async function consumeMfa(
  db: pg.PoolClient,
  user: string,
  code: string,
) {
  const r = await db.query(
    "SELECT secret_cipher,last_counter FROM mfa_methods WHERE user_id=$1 AND enabled_at IS NOT NULL FOR UPDATE",
    [user],
  );
  if (!r.rowCount) return false;
  if (/^\d{6}$/.test(code)) {
    const secret = await open(r.rows[0].secret_cipher, "mfa:" + user);
    const counter = matchedCounter(secret, code);
    if (counter === null || counter <= Number(r.rows[0].last_counter))
      return false;
    await db.query("UPDATE mfa_methods SET last_counter=$1 WHERE user_id=$2", [
      counter,
      user,
    ]);
    return true;
  }
  const used = await db.query(
    "UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id",
    [user, recoveryHash(code)],
  );
  return Boolean(used.rowCount);
}
export async function consumeReauth(
  db: pg.PoolClient,
  context: AuthContext,
  token: string | undefined,
  action: string,
  org: string | null,
  target: string | null,
) {
  if (!token) throw new DomainError(403, "REAUTH_REQUIRED");
  const r = await db.query(
    "UPDATE reauth_tokens SET used_at=now() WHERE token_hash=$1 AND user_id=$2 AND session_hash=$3 AND action=$4 AND organization_id IS NOT DISTINCT FROM $5::uuid AND target_id IS NOT DISTINCT FROM $6::uuid AND expires_at>now() AND used_at IS NULL AND EXISTS(SELECT 1 FROM sessions s WHERE s.token_hash=reauth_tokens.session_hash AND s.revoked_at IS NULL AND s.expires_at>now()) RETURNING token_hash",
    [digest(token), context.userId, context.sessionHash, action, org, target],
  );
  if (!r.rowCount) throw new DomainError(403, "REAUTH_REQUIRED");
}
