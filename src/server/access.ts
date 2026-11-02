import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { pool, transaction } from "./db.js";
import { digest, DomainError } from "./security.js";
export type AuthContext = {
  userId: string;
  sessionHash: string;
  csrfToken: string;
  mfaVerifiedAt: Date | null;
};
export async function authenticate(
  req: FastifyRequest,
  allowPendingMfa = false,
): Promise<AuthContext> {
  const token = req.cookies.session;
  if (!token) throw new DomainError(401, "AUTH_REQUIRED");
  const sessionHash = digest(token);
  const r = await pool.query(
    "UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' RETURNING user_id,csrf_token,mfa_verified_at",
    [sessionHash],
  );
  if (!r.rowCount) throw new DomainError(401, "AUTH_REQUIRED");
  const row = r.rows[0];
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-csrf-token"] !== row.csrf_token
  )
    throw new DomainError(403, "FORBIDDEN");
  if (!allowPendingMfa && !row.mfa_verified_at) {
    const enabled = await transaction(row.user_id, null, (db) =>
      db.query(
        "SELECT enabled_at FROM mfa_methods WHERE user_id=$1 AND enabled_at IS NOT NULL",
        [row.user_id],
      ),
    );
    if (enabled.rowCount) throw new DomainError(403, "MFA_REQUIRED");
  }
  return {
    userId: row.user_id,
    sessionHash,
    csrfToken: row.csrf_token,
    mfaVerifiedAt: row.mfa_verified_at,
  };
}
export async function requireMembership(
  db: pg.PoolClient,
  actor: string,
  org: string,
  roles?: string[],
) {
  const r = await db.query(
    "SELECT id,role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL",
    [org, actor],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  if (roles && !roles.includes(r.rows[0].role))
    throw new DomainError(403, "FORBIDDEN");
  return r.rows[0] as { id: string; role: string };
}
export async function authorizeTenant(
  req: FastifyRequest,
  org: string,
  roles?: string[],
) {
  const context = await authenticate(req);
  await transaction(context.userId, org, (db) =>
    requireMembership(db, context.userId, org, roles),
  );
  return context;
}
export async function requireVerified(db: pg.PoolClient, actor: string) {
  const r = await db.query("SELECT verified_at FROM users WHERE id=$1", [
    actor,
  ]);
  if (!r.rows[0]?.verified_at) throw new DomainError(403, "EMAIL_NOT_VERIFIED");
}
