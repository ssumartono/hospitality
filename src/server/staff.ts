import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate, requireMembership, requireVerified } from "./access.js";
import { transaction } from "./db.js";
import { digest, opaque, DomainError } from "./security.js";
import { seal } from "./crypto.js";
import { consumeReauth } from "./mfa.js";
import { idempotent } from "./idempotency.js";
import { pagination, page } from "./pagination.js";
const role = z.enum(["Owner", "Manager", "Finance", "Operations"]);
const scopes = z
  .array(z.uuid())
  .max(1000)
  .refine((v) => new Set(v).size === v.length);
const key = (req: FastifyRequest) =>
  z.string().min(16).max(128).parse(req.headers["idempotency-key"]);
const reauth = (req: FastifyRequest) =>
  z.string().optional().parse(req.headers["x-reauth-token"]);
const reason = z.string().trim().min(3).max(500);
async function validateScopes(
  db: pg.PoolClient,
  org: string,
  value: { role: string; propertyIds: string[] },
) {
  if (
    (value.role === "Owner" && value.propertyIds.length) ||
    (value.role !== "Owner" && !value.propertyIds.length)
  )
    throw new DomainError(422, "VALIDATION_ERROR");
  const found = await db.query(
    "SELECT id FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[])",
    [org, value.propertyIds],
  );
  if (found.rowCount !== value.propertyIds.length)
    throw new DomainError(404, "NOT_FOUND");
}
export function registerStaff(app: FastifyInstance) {
  app.get("/api/v1/organizations/:org/memberships", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const { after, limit } = pagination.parse(req.query);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      return page(
        (
          await db.query(
            'SELECT m.id,m.user_id AS "userId",u.email,m.role,ARRAY(SELECT a.property_id FROM location_access a WHERE a.organization_id=m.organization_id AND a.membership_id=m.id ORDER BY a.property_id) AS "propertyIds" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.revoked_at IS NULL AND ($2::uuid IS NULL OR m.id>$2) ORDER BY m.id LIMIT $3',
            [org, after ?? null, limit + 1],
          )
        ).rows,
        limit,
      );
    });
  });
  app.get("/api/v1/organizations/:org/invitations", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const { after, limit } = pagination.parse(req.query);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      return page(
        (
          await db.query(
            "SELECT i.id,i.email,i.role,i.created_at AS \"createdAt\",i.expires_at AS \"expiresAt\",CASE WHEN i.state='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.state END AS state,ARRAY(SELECT property_id FROM invitation_locations l WHERE l.organization_id=i.organization_id AND l.invitation_id=i.id ORDER BY property_id) AS \"propertyIds\",CASE WHEN e.sent_at IS NOT NULL THEN 'smtp_accepted' WHEN e.failed_at IS NOT NULL THEN 'failed' ELSE 'pending' END AS \"emailStatus\" FROM invitations i LEFT JOIN invitation_email_outbox e ON e.organization_id=i.organization_id AND e.invitation_id=i.id WHERE i.organization_id=$1 AND ($2::uuid IS NULL OR i.id>$2) ORDER BY i.id LIMIT $3",
            [org, after ?? null, limit + 1],
          )
        ).rows,
        limit,
      );
    });
  });
  app.post("/api/v1/organizations/:org/invitations", async (req, reply) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const body = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        role,
        propertyIds: scopes,
      })
      .strict()
      .parse(req.body);
    const idempotencyKey = key(req);
    const result = await transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      await requireVerified(db, ctx.userId);
      return idempotent(
        db,
        org,
        ctx.userId,
        "staff.invite",
        idempotencyKey,
        body,
        async () => {
          await consumeReauth(db, ctx, reauth(req), "staff.invite", org, null);
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["staff:" + org],
          );
          await requireMembership(db, ctx.userId, org, ["Owner"]);
          await db.query("SELECT assert_entitlement_quota($1,0,0,1)", [org]);
          await validateScopes(db, org, body);
          if (
            (
              await db.query(
                "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.email=$2 AND m.revoked_at IS NULL",
                [org, body.email],
              )
            ).rowCount
          )
            throw new DomainError(409, "ALREADY_MEMBER");
          await db.query(
            "UPDATE invitations SET state='expired' WHERE organization_id=$1 AND email=$2 AND state='pending' AND expires_at<=now()",
            [org, body.email],
          );
          const id = randomUUID(),
            token = opaque();
          const invite = await db.query(
            "INSERT INTO invitations(id,organization_id,email,role,token_hash,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING expires_at",
            [id, org, body.email, body.role, digest(token), ctx.userId],
          );
          for (const property of body.propertyIds)
            await db.query(
              "INSERT INTO invitation_locations(organization_id,invitation_id,property_id) VALUES($1,$2,$3)",
              [org, id, property],
            );
          const organization = (
            await db.query("SELECT name FROM organizations WHERE id=$1", [org])
          ).rows[0];
          await db.query(
            "INSERT INTO invitation_email_outbox(organization_id,invitation_id,email,organization_name,token_cipher) VALUES($1,$2,$3,$4,$5)",
            [
              org,
              id,
              body.email,
              organization.name,
              await seal(token, "invitation:" + org + ":" + id),
            ],
          );
          await db.query(
            "INSERT INTO audit_logs(organization_id,actor_id,action,object_id,details) VALUES($1,$2,'invitation.created',$3,$4)",
            [
              org,
              ctx.userId,
              id,
              JSON.stringify({
                role: body.role,
                propertyIds: body.propertyIds,
              }),
            ],
          );
          return {
            id,
            email: body.email,
            role: body.role,
            propertyIds: body.propertyIds,
            expiresAt: invite.rows[0].expires_at,
            state: "pending",
            emailStatus: "pending",
          };
        },
      );
    });
    return reply.code(201).send(result);
  });
  app.post("/api/v1/organizations/:org/invitations/:id/accept", async (req) => {
    const { org, id } = z
      .object({ org: z.uuid(), id: z.uuid() })
      .parse(req.params);
    const ctx = await authenticate(req);
    const body = z
      .object({ token: z.string().min(32).max(128) })
      .strict()
      .parse(req.body);
    const idempotencyKey = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireVerified(db, ctx.userId);
      return idempotent(
        db,
        org,
        ctx.userId,
        "invitation.accept",
        idempotencyKey,
        { id, tokenHash: digest(body.token) },
        async () => {
          const member = await db.query(
            "SELECT accept_staff_invitation($1,$2,$3) AS id",
            [org, id, digest(body.token)],
          );
          return {
            membershipId: member.rows[0].id,
            organizationId: org,
            state: "accepted",
          };
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/invitations/:id/revoke", async (req) => {
    const { org, id } = z
      .object({ org: z.uuid(), id: z.uuid() })
      .parse(req.params);
    const ctx = await authenticate(req);
    const body = z.object({ reason }).strict().parse(req.body);
    const idempotencyKey = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "invitation.revoke",
        idempotencyKey,
        { id, ...body },
        async () => {
          await consumeReauth(
            db,
            ctx,
            reauth(req),
            "invitation.revoke",
            org,
            id,
          );
          const r = await db.query(
            "UPDATE invitations SET state='revoked',revoked_at=now() WHERE organization_id=$1 AND id=$2 AND state='pending' RETURNING id",
            [org, id],
          );
          if (!r.rowCount) throw new DomainError(409, "INVALID_STATE");
          await db.query(
            "INSERT INTO audit_logs(organization_id,actor_id,action,object_id,details) VALUES($1,$2,'invitation.revoked',$3,$4)",
            [org, ctx.userId, id, JSON.stringify({ reason: body.reason })],
          );
          return { id, state: "revoked" };
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/memberships/:id/scope", async (req) => {
    const { org, id } = z
      .object({ org: z.uuid(), id: z.uuid() })
      .parse(req.params);
    const ctx = await authenticate(req);
    const body = z
      .object({
        role,
        propertyIds: scopes,
        reauthToken: z.string().min(32).max(128),
        reason,
      })
      .strict()
      .parse(req.body);
    const idempotencyKey = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      const { reauthToken, ...payload } = body;
      return idempotent(
        db,
        org,
        ctx.userId,
        "staff.scope",
        idempotencyKey,
        { id, ...payload },
        async () => {
          await consumeReauth(db, ctx, reauthToken, "staff.scope", org, id);
          await validateScopes(db, org, body);
          await db.query(
            "SELECT mutate_staff_membership($1,$2,$3,$4,false,$5)",
            [org, id, body.role, body.propertyIds, body.reason],
          );
          return { id, role: body.role, propertyIds: body.propertyIds };
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/memberships/:id/revoke", async (req) => {
    const { org, id } = z
      .object({ org: z.uuid(), id: z.uuid() })
      .parse(req.params);
    const ctx = await authenticate(req);
    const body = z.object({ reason }).strict().parse(req.body);
    const idempotencyKey = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "staff.revoke",
        idempotencyKey,
        { id, ...body },
        async () => {
          await consumeReauth(db, ctx, reauth(req), "staff.revoke", org, id);
          await db.query(
            "SELECT mutate_staff_membership($1,$2,NULL,ARRAY[]::uuid[],true,$3)",
            [org, id, body.reason],
          );
          return { id, state: "revoked" };
        },
      );
    });
  });
}
