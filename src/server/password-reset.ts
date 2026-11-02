import { queueTokenEmail } from "./token-email.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { transaction } from "./db.js";
import { digest, opaque, hashPassword, DomainError } from "./security.js";
export function registerPasswordReset(app: FastifyInstance) {
  app.post(
    "/api/v1/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { email } = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((x) => x.toLowerCase()),
        })
        .strict()
        .parse(req.body);
      await transaction(null, null, async (db) => {
        const user = await db.query("SELECT id FROM users WHERE email=$1", [
          email,
        ]);
        if (!user.rowCount) return;
        const token = opaque();
        await db.query(
          "INSERT INTO verification_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '15 minutes')",
          [digest(token), user.rows[0].id],
        );
        await queueTokenEmail(db, user.rows[0].id, "reset", token);
      });
      return reply.code(202).send({
        message: "Jika akun tersedia, tautan reset dikirim ke email Anda.",
      });
    },
  );
  app.post(
    "/api/v1/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const body = z
        .object({
          token: z.string().min(32).max(128),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(req.body);
      const hash = await hashPassword(body.password);
      await transaction(null, null, async (db) => {
        const token = await db.query(
          "UPDATE verification_tokens SET used_at=now() WHERE token_hash=$1 AND kind='reset' AND used_at IS NULL AND expires_at>now() RETURNING user_id",
          [digest(body.token)],
        );
        if (!token.rowCount) throw new DomainError(422, "INVALID_TOKEN");
        const user = token.rows[0].user_id;
        await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          hash,
          user,
        ]);
        await db.query(
          "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [user],
        );
        await db.query(
          "UPDATE verification_tokens SET used_at=coalesce(used_at,now()) WHERE user_id=$1 AND kind='reset'",
          [user],
        );
      });
      return { message: "Kata sandi diperbarui. Silakan masuk kembali." };
    },
  );
}
