import { registerBooking } from "./booking.js";
import { registerAllocation } from "./allocation.js";
import { registerPricing } from "./pricing.js";
import { idempotent } from "./idempotency.js";
import { registerInventory } from "./inventory.js";
import { authenticate, authorizeTenant } from "./access.js";
import { registerAccountSecurity } from "./account-security.js";
import { registerStaff } from "./staff.js";
import { queueTokenEmail } from "./token-email.js";
import { pagination, page } from "./pagination.js";
import { registerPasswordReset } from "./password-reset.js";
import multipart from "@fastify/multipart";
import {
  validatePrivateFile,
  storeObject,
  readObject,
  removeObject,
  scanBytes,
} from "./storage.js";
import { createHash } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import {
  digest,
  opaque,
  hashPassword,
  verifyPassword,
  DomainError,
} from "./security.js";
const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((x) => x.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const uuid = z.uuid();
export async function buildApp(
  options: { testRateLimitMultiplier?: number } = {},
) {
  const multiplier = options.testRateLimitMultiplier ?? 1;
  if (
    !Number.isInteger(multiplier) ||
    multiplier < 1 ||
    multiplier > 100 ||
    (multiplier !== 1 && process.env.NODE_ENV !== "test")
  )
    throw Error("Rate limit overrides are restricted to the test harness");
  const unknownAccountHash = await hashPassword(opaque());
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "req.headers.x-csrf-token",
              "res.headers.set-cookie",
            ],
          },
    bodyLimit: 65536,
  });
  await app.register(multipart, {
    limits: { fileSize: 10485760, files: 1, parts: 1 },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 100 * multiplier,
    timeWindow: "1 minute",
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { code?: string; statusCode?: number };
    let status = 500,
      code = "INTERNAL_ERROR";
    if (e instanceof DomainError) {
      status = e.status;
      code = e.code;
    } else if (e instanceof ZodError) {
      status = 422;
      code = "VALIDATION_ERROR";
    } else if (["P0403", "P0404", "P0409", "P0422"].includes(e.code ?? "")) {
      status = Number(e.code!.slice(1));
      code = [
        "NOT_FOUND",
        "EMAIL_NOT_VERIFIED",
        "ALREADY_MEMBER",
        "INVALID_INVITATION",
        "VALIDATION_ERROR",
        "ENTITLEMENT_NOT_CONFIGURED",
        "QUOTA_EXCEEDED",
        "SUBSCRIPTION_RESTRICTED",
        "PROPERTY_CONFIGURATION_REQUIRED",
        "FLOOR_IN_USE",
        "VERSION_CONFLICT",
        "READINESS_WORKFLOW_REQUIRED",
        "INVALID_STATE",
        "ROOM_NOT_READY",
        "QUOTE_CHANGED",
        "BALANCE_CONFLICT",
      ].includes(e.message)
        ? e.message
        : "FORBIDDEN";
    } else if (e.code === "23514" && e.message === "LAST_OWNER_REQUIRED") {
      status = 409;
      code = "LAST_OWNER_REQUIRED";
    } else if (e.code === "23P01") {
      status = 409;
      code = "AVAILABILITY_CONFLICT";
    } else if (e.code === "23505") {
      status = 409;
      code = "VERSION_CONFLICT";
    } else if (e.statusCode === 429) {
      status = 429;
      code = "RATE_LIMITED";
    } else if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      status = e.statusCode;
      code = "VALIDATION_ERROR";
    }
    if (status === 500)
      req.log.error(
        { code: "code" in e ? e.code : undefined },
        "Request failed",
      );
    reply.code(status).send({ error: { code, requestId: req.id } });
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.addHook("onRequest", async (req) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers.origin !==
        (process.env.APP_ORIGIN ?? "http://localhost:5173")
      )
        throw new DomainError(403, "FORBIDDEN");
    }
  });
  const auth = async (req: FastifyRequest) => (await authenticate(req)).userId;
  const tenant = async (req: FastifyRequest, org: string, roles?: string[]) =>
    (await authorizeTenant(req, org, roles)).userId;
  app.get("/api/v1/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", build: "0.6.0", productionReady: false };
  });
  app.post(
    "/api/v1/auth/register",
    { config: { rateLimit: { max: 5 * multiplier, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = credentials.parse(req.body);
      const passwordHash = await hashPassword(body.password);
      await transaction(null, null, async (db) => {
        const existing = await db.query("SELECT id FROM users WHERE email=$1", [
          body.email,
        ]);
        if (existing.rowCount) return;
        const user = await db.query(
          "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
          [body.email, passwordHash],
        );
        const token = opaque();
        await db.query(
          "INSERT INTO verification_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'verify',now()+interval '24 hours')",
          [digest(token), user.rows[0].id],
        );
        await queueTokenEmail(db, user.rows[0].id, "verify", token);
      });
      return reply.code(202).send({
        message:
          "Jika email dapat didaftarkan, tautan verifikasi akan dikirim.",
      });
    },
  );
  app.post("/api/v1/auth/verify-email", async (req) => {
    const body = z
      .object({ token: z.string().min(32).max(128) })
      .strict()
      .parse(req.body);
    await transaction(null, null, async (db) => {
      const row = await db.query(
        "UPDATE verification_tokens SET used_at=now() WHERE token_hash=$1 AND kind='verify' AND used_at IS NULL AND expires_at>now() RETURNING user_id",
        [digest(body.token)],
      );
      if (!row.rowCount) throw new DomainError(422, "INVALID_TOKEN");
      await db.query(
        "UPDATE users SET verified_at=coalesce(verified_at,now()) WHERE id=$1",
        [row.rows[0].user_id],
      );
    });
    return { message: "Email berhasil diverifikasi." };
  });
  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: { max: 10 * multiplier, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = credentials.parse(req.body);
      const user = await pool.query(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [body.email],
      );
      const passwordValid = await verifyPassword(
        user.rows[0]?.password_hash ?? unknownAccountHash,
        body.password,
      );
      if (!user.rowCount || !passwordValid)
        throw new DomainError(401, "INVALID_CREDENTIALS");
      const token = opaque(),
        csrf = opaque();
      const challenge = await transaction(user.rows[0].id, null, async (db) => {
        const locked = await db.query(
          "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
          [user.rows[0].id],
        );
        if (locked.rows[0].password_hash !== user.rows[0].password_hash)
          throw new DomainError(401, "INVALID_CREDENTIALS");
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
          [digest(token), user.rows[0].id, csrf],
        );
        const m = await db.query(
          "SELECT enabled_at FROM mfa_methods WHERE user_id=$1 AND enabled_at IS NOT NULL",
          [user.rows[0].id],
        );
        await db.query(
          "INSERT INTO security_events(user_id,action) VALUES($1,'login.password_verified')",
          [user.rows[0].id],
        );
        if (!m.rowCount) return null;
        const challenge = await db.query(
          "INSERT INTO mfa_challenges(user_id,session_hash,purpose,expires_at) VALUES($1,$2,'login',now()+interval '5 minutes') RETURNING id",
          [user.rows[0].id, digest(token)],
        );
        return challenge.rows[0].id as string;
      });
      reply.setCookie("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });
      return {
        csrfToken: csrf,
        mfaRequired: Boolean(challenge),
        ...(challenge ? { challengeId: challenge } : {}),
      };
    },
  );
  app.get("/api/v1/auth/session", async (req) => {
    const actor = await auth(req);
    const r = await pool.query(
      "SELECT u.id,u.email,u.verified_at,s.csrf_token FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.token_hash=$2",
      [actor, digest(req.cookies.session!)],
    );
    return {
      user: {
        id: r.rows[0].id,
        email: r.rows[0].email,
        verifiedAt: r.rows[0].verified_at,
      },
      csrfToken: r.rows[0].csrf_token,
    };
  });
  app.post("/api/v1/auth/logout", async (req, reply) => {
    await auth(req);
    await pool.query(
      "UPDATE sessions SET revoked_at=now() WHERE token_hash=$1",
      [digest(req.cookies.session!)],
    );
    reply.clearCookie("session", { path: "/" });
    return { message: "Anda telah keluar." };
  });
  app.get("/api/v1/organizations", async (req) => {
    const actor = await auth(req);
    const { after, limit } = pagination.parse(req.query);
    return transaction(actor, null, async (db) =>
      page(
        (
          await db.query(
            "SELECT o.id,o.name,o.slug,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.revoked_at IS NULL AND ($1::uuid IS NULL OR o.id>$1) ORDER BY o.id LIMIT $2",
            [after ?? null, limit + 1],
          )
        ).rows,
        limit,
      ),
    );
  });
  app.post("/api/v1/organizations", async (req, reply) => {
    const actor = await auth(req);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .min(3)
          .max(60),
      })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await transaction(actor, id, async (db) => {
      await db.query(
        "INSERT INTO organizations(id,name,slug,created_by) VALUES($1,$2,$3,$4)",
        [id, body.name, body.slug, actor],
      );
      await db.query(
        "INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'Owner')",
        [id, actor],
      );
      await db.query(
        "INSERT INTO audit_logs(organization_id,actor_id,action,object_id) VALUES($1,$2,'organization.created',$1)",
        [id, actor],
      );
      await db.query("SELECT provision_organization_entitlement($1)", [id]);
    });
    return reply.code(201).send({ id, ...body });
  });
  app.get("/api/v1/organizations/:org/properties", async (req) => {
    const { org } = z.object({ org: uuid }).parse(req.params);
    const actor = await tenant(req, org);
    const { after, limit } = pagination.parse(req.query);
    return transaction(actor, org, async (db) =>
      page(
        (
          await db.query(
            "SELECT id,name,city,timezone FROM properties WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2",
            [after ?? null, limit + 1],
          )
        ).rows,
        limit,
      ),
    );
  });
  app.post("/api/v1/organizations/:org/properties", async (req, reply) => {
    const { org } = z.object({ org: uuid }).parse(req.params);
    const actor = await tenant(req, org, ["Owner"]);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        city: z.string().trim().min(1).max(120),
        timezone: z
          .string()
          .max(80)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat("id", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
      })
      .strict()
      .parse(req.body);
    const requestKey = z
      .string()
      .min(16)
      .max(128)
      .optional()
      .parse(req.headers["idempotency-key"]);
    const row = await transaction(actor, org, async (db) => {
      const create = async () => {
        const r = await db.query(
          "INSERT INTO properties(organization_id,name,city,timezone) VALUES($1,$2,$3,$4) RETURNING id,name,city,timezone",
          [org, body.name, body.city, body.timezone],
        );
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action,object_id) VALUES($1,$2,'property.created',$3)",
          [org, actor, r.rows[0].id],
        );
        return r.rows[0];
      };
      return requestKey
        ? idempotent(
            db,
            org,
            actor,
            "property.create",
            requestKey,
            body,
            create,
          )
        : create();
    });
    return reply.code(201).send(row);
  });

  app.post("/api/v1/organizations/:org/files", async (req, reply) => {
    const { org } = z.object({ org: uuid }).parse(req.params);
    const actor = await tenant(req, org, ["Owner"]);
    const part = await req.file();
    if (!part) throw new DomainError(422, "VALIDATION_ERROR");
    const bytes = await part.toBuffer();
    const mime = await validatePrivateFile(bytes);
    const id = randomUUID(),
      key = org + "/" + id;
    await storeObject(key, bytes, mime);
    try {
      await transaction(actor, org, async (db) => {
        await db.query(
          "INSERT INTO private_files(id,organization_id,uploaded_by,object_key,mime,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            org,
            actor,
            key,
            mime,
            bytes.length,
            createHash("sha256").update(bytes).digest("hex"),
          ],
        );
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action,object_id) VALUES($1,$2,'file.quarantined',$3)",
          [org, actor, id],
        );
      });
    } catch (e) {
      await removeObject(key).catch(() => {});
      throw e;
    }
    return reply
      .code(201)
      .send({ id, mime, sizeBytes: bytes.length, state: "quarantined" });
  });
  app.post("/api/v1/organizations/:org/files/:id/scan", async (req) => {
    const { org, id } = z.object({ org: uuid, id: uuid }).parse(req.params);
    const actor = await tenant(req, org, ["Owner"]);
    return transaction(actor, org, async (db) => {
      const r = await db.query(
        "SELECT object_key,state FROM private_files WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
      if (r.rows[0].state !== "quarantined")
        return { id, state: r.rows[0].state };
      const state = await scanBytes(await readObject(r.rows[0].object_key));
      await db.query(
        "UPDATE private_files SET state=$1,scan_at=now() WHERE id=$2",
        [state, id],
      );
      await db.query(
        "INSERT INTO audit_logs(organization_id,actor_id,action,object_id) VALUES($1,$2,$3,$4)",
        [org, actor, "file.scan." + state, id],
      );
      return { id, state };
    });
  });
  app.get(
    "/api/v1/organizations/:org/files/:id/download",
    async (req, reply) => {
      const { org, id } = z.object({ org: uuid, id: uuid }).parse(req.params);
      const actor = await tenant(req, org, ["Owner"]);
      const file = await transaction(actor, org, async (db) => {
        const r = await db.query(
          "SELECT object_key,mime,state FROM private_files WHERE id=$1",
          [id],
        );
        if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
        if (r.rows[0].state !== "clean")
          throw new DomainError(423, "FILE_QUARANTINED");
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action,object_id) VALUES($1,$2,'file.download',$3)",
          [org, actor, id],
        );
        return r.rows[0];
      });
      const bytes = await readObject(file.object_key);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Disposition", 'attachment; filename="document"')
        .type(file.mime)
        .send(bytes);
    },
  );
  registerPasswordReset(app);
  registerAccountSecurity(app);
  registerStaff(app);
  registerInventory(app);
  registerPricing(app);
  registerAllocation(app);
  registerBooking(app);
  return app;
}
