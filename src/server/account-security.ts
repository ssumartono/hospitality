import { queueTokenEmail } from "./token-email.js";
import type pg from "pg";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { opaque, digest, verifyPassword, DomainError } from "./security.js";
import { transaction } from "./db.js";
import {
  authenticate,
  requireMembership,
  requireVerified,
  type AuthContext,
} from "./access.js";
import { seal, open } from "./crypto.js";
import {
  consumeMfa,
  consumeReauth,
  newMfaSecret,
  matchedCounter,
  totp,
  recoveryCode,
  recoveryHash,
} from "./mfa.js";
export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 43200,
  });
  reply.header("Cache-Control", "no-store");
}
const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
async function lockAccountSession(db: pg.PoolClient, ctx: AuthContext) {
  await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [ctx.userId]);
  const s = await db.query(
    "SELECT token_hash FROM sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
    [ctx.sessionHash, ctx.userId],
  );
  if (!s.rowCount) throw new DomainError(401, "AUTH_REQUIRED");
}
export function registerAccountSecurity(app: FastifyInstance) {
  app.post(
    "/api/v1/auth/verification/resend",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const ctx = await authenticate(req);
      z.object({}).strict().parse(req.body);
      await transaction(ctx.userId, null, async (db) => {
        await lockAccountSession(db, ctx);
        const user = await db.query(
          "SELECT verified_at FROM users WHERE id=$1",
          [ctx.userId],
        );
        if (user.rows[0].verified_at) return;
        await db.query(
          "UPDATE verification_tokens SET used_at=coalesce(used_at,now()) WHERE user_id=$1 AND kind='verify'",
          [ctx.userId],
        );
        const token = opaque();
        await db.query(
          "INSERT INTO verification_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'verify',now()+interval '24 hours')",
          [digest(token), ctx.userId],
        );
        await queueTokenEmail(db, ctx.userId, "verify", token);
        await db.query(
          "INSERT INTO security_events(user_id,action) VALUES($1,'email.verification_resent')",
          [ctx.userId],
        );
      });
      return reply.code(202).send({
        message:
          "Jika email belum terverifikasi, tautan baru masuk antrean email. Gunakan tautan terbaru.",
      });
    },
  );
  app.get("/api/v1/auth/security", async (req) => {
    const ctx = await authenticate(req);
    return transaction(ctx.userId, null, async (db) => {
      const m = await db.query(
        "SELECT enabled_at FROM mfa_methods WHERE user_id=$1",
        [ctx.userId],
      );
      const codes = await db.query(
        "SELECT count(*)::int AS count FROM mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL",
        [ctx.userId],
      );
      return {
        mfaEnabled: Boolean(m.rows[0]?.enabled_at),
        recoveryCodesRemaining: codes.rows[0].count,
      };
    });
  });
  app.post("/api/v1/auth/reauth", limited, async (req, reply) => {
    const ctx = await authenticate(req);
    const body = z
      .object({
        password: z.string().min(1).max(128),
        mfaCode: z.string().min(6).max(100).optional(),
        action: z.enum([
          "mfa.enroll",
          "mfa.disable",
          "staff.invite",
          "staff.revoke",
          "staff.scope",
          "invitation.revoke",
        ]),
        organizationId: z.uuid().optional(),
        targetId: z.uuid().optional(),
      })
      .strict()
      .parse(req.body);
    const mfaAction = body.action.startsWith("mfa.");
    if (
      (mfaAction && body.organizationId) ||
      (!mfaAction && !body.organizationId) ||
      (["staff.revoke", "staff.scope", "invitation.revoke"].includes(
        body.action,
      ) &&
        !body.targetId) ||
      (body.action === "staff.invite" && body.targetId)
    )
      throw new DomainError(422, "VALIDATION_ERROR");
    const target = mfaAction ? ctx.userId : (body.targetId ?? null);
    if (mfaAction && body.targetId && body.targetId !== ctx.userId)
      throw new DomainError(403, "FORBIDDEN");
    const token = opaque();
    const result = await transaction(
      ctx.userId,
      body.organizationId ?? null,
      async (db) => {
        await lockAccountSession(db, ctx);
        if (body.organizationId)
          await requireMembership(db, ctx.userId, body.organizationId, [
            "Owner",
          ]);
        const user = await db.query(
          "SELECT password_hash FROM users WHERE id=$1",
          [ctx.userId],
        );
        if (!(await verifyPassword(user.rows[0].password_hash, body.password)))
          return null;
        const enabled = await db.query(
          "SELECT enabled_at FROM mfa_methods WHERE user_id=$1 AND enabled_at IS NOT NULL",
          [ctx.userId],
        );
        if (
          enabled.rowCount &&
          (!body.mfaCode || !(await consumeMfa(db, ctx.userId, body.mfaCode)))
        )
          return null;
        const row = await db.query(
          "INSERT INTO reauth_tokens(token_hash,user_id,session_hash,action,organization_id,target_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes') RETURNING expires_at",
          [
            digest(token),
            ctx.userId,
            ctx.sessionHash,
            body.action,
            body.organizationId ?? null,
            target,
          ],
        );
        await db.query(
          "INSERT INTO security_events(user_id,action) VALUES($1,'reauth.succeeded')",
          [ctx.userId],
        );
        return row.rows[0];
      },
    );
    if (!result) throw new DomainError(401, "INVALID_CREDENTIALS");
    return reply
      .header("Cache-Control", "no-store")
      .send({ reauthToken: token, expiresAt: result.expires_at });
  });
  app.post("/api/v1/auth/mfa/enroll", limited, async (req, reply) => {
    const ctx = await authenticate(req);
    z.object({}).strict().parse(req.body);
    const token = z.string().optional().parse(req.headers["x-reauth-token"]);
    const secret = newMfaSecret();
    const result = await transaction(ctx.userId, null, async (db) => {
      await lockAccountSession(db, ctx);
      await requireVerified(db, ctx.userId);
      await consumeReauth(db, ctx, token, "mfa.enroll", null, ctx.userId);
      const challenge = await db.query(
        "INSERT INTO mfa_challenges(user_id,session_hash,purpose,expires_at) VALUES($1,$2,'enroll',now()+interval '10 minutes') RETURNING id,expires_at",
        [ctx.userId, ctx.sessionHash],
      );
      const method = await db.query(
        "INSERT INTO mfa_methods(user_id,pending_secret_cipher,pending_created_at,pending_challenge_id) VALUES($1,$2,now(),$3) ON CONFLICT(user_id) DO UPDATE SET pending_secret_cipher=EXCLUDED.pending_secret_cipher,pending_created_at=now(),pending_challenge_id=EXCLUDED.pending_challenge_id WHERE mfa_methods.enabled_at IS NULL RETURNING user_id",
        [
          ctx.userId,
          await seal(secret, "mfa-pending:" + ctx.userId),
          challenge.rows[0].id,
        ],
      );
      if (!method.rowCount) throw new DomainError(409, "MFA_ALREADY_ENABLED");
      const email = (
        await db.query("SELECT email FROM users WHERE id=$1", [ctx.userId])
      ).rows[0].email;
      await db.query(
        "INSERT INTO security_events(user_id,action) VALUES($1,'mfa.enrollment_started')",
        [ctx.userId],
      );
      return { ...challenge.rows[0], email };
    });
    return reply.header("Cache-Control", "no-store").send({
      secret,
      otpauthUri: totp(secret, result.email).toString(),
      challengeId: result.id,
      expiresAt: result.expires_at,
    });
  });
  app.post("/api/v1/auth/mfa/verify", limited, async (req, reply) => {
    const ctx = await authenticate(req, true);
    const body = z
      .object({ code: z.string().min(6).max(100), challengeId: z.uuid() })
      .strict()
      .parse(req.body);
    const result = await transaction(ctx.userId, null, async (db) => {
      await lockAccountSession(db, ctx);
      const challenge = await db.query(
        "SELECT purpose,expires_at,used_at,attempts FROM mfa_challenges WHERE id=$1 AND user_id=$2 AND session_hash=$3 FOR UPDATE",
        [body.challengeId, ctx.userId, ctx.sessionHash],
      );
      if (
        !challenge.rowCount ||
        challenge.rows[0].used_at ||
        new Date(challenge.rows[0].expires_at).getTime() <= Date.now() ||
        challenge.rows[0].attempts >= 5
      )
        return null;
      const purpose = challenge.rows[0].purpose;
      let recoveryCodes: string[] | undefined;
      if (purpose === "enroll") {
        const m = await db.query(
          "SELECT pending_secret_cipher,pending_challenge_id,enabled_at FROM mfa_methods WHERE user_id=$1 FOR UPDATE",
          [ctx.userId],
        );
        if (
          !m.rowCount ||
          m.rows[0].enabled_at ||
          m.rows[0].pending_challenge_id !== body.challengeId
        )
          return null;
        const secret = await open(
          m.rows[0].pending_secret_cipher,
          "mfa-pending:" + ctx.userId,
        );
        const counter = matchedCounter(secret, body.code);
        if (counter === null) {
          await db.query(
            "UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1",
            [body.challengeId],
          );
          return null;
        }
        await db.query(
          "UPDATE mfa_methods SET secret_cipher=$1,pending_secret_cipher=NULL,pending_challenge_id=NULL,pending_created_at=NULL,enabled_at=now(),last_counter=$2 WHERE user_id=$3",
          [await seal(secret, "mfa:" + ctx.userId), counter, ctx.userId],
        );
        await db.query("DELETE FROM mfa_recovery_codes WHERE user_id=$1", [
          ctx.userId,
        ]);
        recoveryCodes = Array.from({ length: 10 }, () => recoveryCode());
        for (const code of recoveryCodes)
          await db.query(
            "INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)",
            [ctx.userId, recoveryHash(code)],
          );
        await db.query(
          "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL",
          [ctx.userId, ctx.sessionHash],
        );
        await db.query(
          "UPDATE sessions SET mfa_verified_at=now() WHERE token_hash=$1",
          [ctx.sessionHash],
        );
      } else {
        if (!(await consumeMfa(db, ctx.userId, body.code))) {
          await db.query(
            "UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1",
            [body.challengeId],
          );
          return null;
        }
      }
      await db.query("UPDATE mfa_challenges SET used_at=now() WHERE id=$1", [
        body.challengeId,
      ]);
      await db.query(
        "INSERT INTO security_events(user_id,action) VALUES($1,$2)",
        [
          ctx.userId,
          purpose === "enroll" ? "mfa.enabled" : "mfa.login_verified",
        ],
      );
      if (purpose === "enroll") return { enabled: true, recoveryCodes };
      const token = opaque(),
        csrfToken = opaque();
      await db.query(
        "UPDATE sessions SET revoked_at=now() WHERE token_hash=$1",
        [ctx.sessionHash],
      );
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,mfa_verified_at) VALUES($1,$2,$3,now()+interval '12 hours',now())",
        [digest(token), ctx.userId, csrfToken],
      );
      return { token, csrfToken };
    });
    if (!result) throw new DomainError(401, "INVALID_MFA_CODE");
    if ("token" in result) {
      setSessionCookie(reply, result.token!);
      return { csrfToken: result.csrfToken, mfaRequired: false };
    }
    return reply.header("Cache-Control", "no-store").send(result);
  });
  app.post("/api/v1/auth/mfa/disable", limited, async (req, reply) => {
    const ctx = await authenticate(req);
    z.object({}).strict().parse(req.body);
    await transaction(ctx.userId, null, async (db) => {
      await lockAccountSession(db, ctx);
      await consumeReauth(
        db,
        ctx,
        z.string().optional().parse(req.headers["x-reauth-token"]),
        "mfa.disable",
        null,
        ctx.userId,
      );
      await db.query(
        "UPDATE mfa_methods SET secret_cipher=NULL,enabled_at=NULL,pending_secret_cipher=NULL,pending_challenge_id=NULL,pending_created_at=NULL,last_counter=-1 WHERE user_id=$1",
        [ctx.userId],
      );
      await db.query("DELETE FROM mfa_recovery_codes WHERE user_id=$1", [
        ctx.userId,
      ]);
      await db.query(
        "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL",
        [ctx.userId, ctx.sessionHash],
      );
      await db.query(
        "UPDATE sessions SET mfa_verified_at=NULL WHERE token_hash=$1",
        [ctx.sessionHash],
      );
      await db.query(
        "INSERT INTO security_events(user_id,action) VALUES($1,'mfa.disabled')",
        [ctx.userId],
      );
    });
    return reply
      .header("Cache-Control", "no-store")
      .send({ mfaEnabled: false });
  });
}
