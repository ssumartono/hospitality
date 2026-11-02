import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "./access.js";
import { transaction } from "./db.js";
import { idempotent } from "./idempotency.js";
import { DomainError } from "./security.js";
import { propertyAccess, auditInventory } from "./inventory-service.js";
import { pagination, page } from "./pagination.js";
import { policyInput, quoteInput, type Policy } from "./pricing-schema.js";
import { calculateQuote, startOfLocalDate } from "./pricing-domain.js";
const orgParam = z.object({ org: z.uuid() });
const key = (req: FastifyRequest) =>
  z.string().min(16).max(128).parse(req.headers["idempotency-key"]);
const projection =
  'id,property_id AS "propertyId",version,effective_at AS "effectiveAt",base_rent AS "baseRent",config,actor_id AS "actorId",created_at AS "createdAt"';
async function policy(db: pg.PoolClient, row: any) {
  const types = await db.query(
    "SELECT type_id,amount FROM policy_type_rates WHERE policy_id=$1",
    [row.id],
  );
  const rooms = await db.query(
    "SELECT room_id,amount FROM policy_room_rates WHERE policy_id=$1",
    [row.id],
  );
  return {
    ...row,
    baseRent: Number(row.baseRent),
    config: {
      ...row.config,
      typeRates: Object.fromEntries(
        types.rows.map((r) => [r.type_id, Number(r.amount)]),
      ),
      roomRates: Object.fromEntries(
        rooms.rows.map((r) => [r.room_id, Number(r.amount)]),
      ),
    },
  };
}
export function registerPricing(app: FastifyInstance) {
  app.get("/api/v1/organizations/:org/rate-policies", async (req) => {
    const { org } = orgParam.parse(req.params);
    const ctx = await authenticate(req);
    const { propertyId, ...paging } = z
      .object({
        propertyId: z.uuid(),
        after: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(req.query);
    const p = pagination.parse(paging);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, propertyId, [
        "Owner",
        "Manager",
        "Finance",
      ]);
      const rows = await db.query(
        "SELECT " +
          projection +
          " FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4",
        [org, propertyId, p.after ?? null, p.limit + 1],
      );
      const result = page(rows.rows, p.limit);
      return {
        ...result,
        items: await Promise.all(result.items.map((r) => policy(db, r))),
        currentVersion: Number(
          (
            await db.query(
              "SELECT coalesce(max(version),0) AS v FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2",
              [org, propertyId],
            )
          ).rows[0].v,
        ),
      };
    });
  });
  app.post("/api/v1/organizations/:org/rate-policies", async (req, reply) => {
    const { org } = orgParam.parse(req.params);
    const ctx = await authenticate(req);
    const body = policyInput.parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, body.propertyId, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "pricing.policy.create",
        k,
        body,
        async () => {
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["pricing:" + org + ":" + body.propertyId],
          );
          const version = Number(
            (
              await db.query(
                "SELECT coalesce(max(version),0) AS v FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2",
                [org, body.propertyId],
              )
            ).rows[0].v,
          );
          if (version !== body.expectedVersion)
            throw new DomainError(409, "VERSION_CONFLICT");
          for (const id of Object.keys(body.typeRates)) {
            if (
              !(
                await db.query(
                  "SELECT 1 FROM room_types WHERE organization_id=$1 AND property_id=$2 AND id=$3 AND archived_at IS NULL",
                  [org, body.propertyId, id],
                )
              ).rowCount
            )
              throw new DomainError(404, "NOT_FOUND");
          }
          for (const id of Object.keys(body.roomRates)) {
            if (
              !(
                await db.query(
                  "SELECT 1 FROM rooms WHERE organization_id=$1 AND property_id=$2 AND id=$3 AND archived_at IS NULL",
                  [org, body.propertyId, id],
                )
              ).rowCount
            )
              throw new DomainError(404, "NOT_FOUND");
          }
          const {
            propertyId,
            expectedVersion,
            effectiveAt,
            baseRent,
            typeRates,
            roomRates,
            ...config
          } = body;
          const id = randomUUID();
          await db.query(
            "INSERT INTO rate_policy_versions(id,organization_id,property_id,version,effective_at,base_rent,config,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              id,
              org,
              propertyId,
              version + 1,
              effectiveAt,
              baseRent,
              JSON.stringify(config),
              ctx.userId,
            ],
          );
          for (const [typeId, amount] of Object.entries(typeRates))
            await db.query(
              "INSERT INTO policy_type_rates(organization_id,property_id,policy_id,type_id,amount) VALUES($1,$2,$3,$4,$5)",
              [org, propertyId, id, typeId, amount],
            );
          for (const [roomId, amount] of Object.entries(roomRates))
            await db.query(
              "INSERT INTO policy_room_rates(organization_id,property_id,policy_id,room_id,amount) VALUES($1,$2,$3,$4,$5)",
              [org, propertyId, id, roomId, amount],
            );
          await auditInventory(
            db,
            org,
            ctx.userId,
            "pricing.policy_created",
            id,
            { propertyId, version: version + 1, effectiveAt },
          );
          reply.code(201);
          return policy(
            db,
            (
              await db.query(
                "SELECT " +
                  projection +
                  " FROM rate_policy_versions WHERE id=$1",
                [id],
              )
            ).rows[0],
          );
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/quotes", async (req, reply) => {
    const { org } = orgParam.parse(req.params);
    const ctx = await authenticate(req);
    const body = quoteInput.parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      const r = await db.query(
        "SELECT id,property_id,type_id,capacity,version FROM rooms WHERE organization_id=$1 AND id=$2 AND archived_at IS NULL",
        [org, body.roomId],
      );
      if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
      const room = r.rows[0];
      const property = await propertyAccess(
        db,
        ctx.userId,
        org,
        room.property_id,
        ["Owner", "Manager"],
      );
      return idempotent(
        db,
        org,
        ctx.userId,
        "pricing.quote.create",
        k,
        body,
        async () => {
          if (body.occupantCount > room.capacity)
            throw new DomainError(422, "CAPACITY_EXCEEDED");
          const effective = startOfLocalDate(body.start, property.timezone);
          const found = await db.query(
            "SELECT " +
              projection +
              " FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2 AND effective_at<=$3 ORDER BY effective_at DESC,version DESC LIMIT 1",
            [org, room.property_id, effective],
          );
          if (!found.rowCount)
            throw new DomainError(409, "POLICY_NOT_CONFIGURED");
          const selected = await policy(db, found.rows[0]);
          const p: Policy = {
            ...selected.config,
            propertyId: room.property_id,
            expectedVersion: selected.version - 1,
            effectiveAt: new Date(selected.effectiveAt).toISOString(),
            baseRent: selected.baseRent,
          };
          const roomOverride = p.roomRates[room.id],
            typeOverride = p.typeRates[room.type_id];
          const rate = roomOverride ?? typeOverride ?? p.baseRent;
          const source =
            roomOverride !== undefined
              ? "room"
              : typeOverride !== undefined
                ? "type"
                : "property";
          const snapshot = {
            ...calculateQuote(p, rate, body.start, body.end),
            policyId: selected.id,
            policyVersion: selected.version,
            policyEffectiveAt: selected.effectiveAt,
            policy: p,
            roomId: room.id,
            roomVersion: room.version,
            propertyId: room.property_id,
            timezone: property.timezone,
            occupantCount: body.occupantCount,
            resolvedRent: rate,
            rateSource: source,
          };
          const id = randomUUID();
          const saved = await db.query(
            'INSERT INTO pricing_quotes(id,organization_id,property_id,room_id,policy_id,actor_id,request,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING expires_at AS "expiresAt",created_at AS "createdAt"',
            [
              id,
              org,
              room.property_id,
              room.id,
              selected.id,
              ctx.userId,
              JSON.stringify(body),
              JSON.stringify(snapshot),
            ],
          );
          await auditInventory(
            db,
            org,
            ctx.userId,
            "pricing.quote_created",
            id,
            {
              policyId: selected.id,
              policyVersion: selected.version,
              roomId: room.id,
            },
          );
          reply.code(201);
          return { id, ...saved.rows[0], snapshot };
        },
      );
    });
  });
  app.get("/api/v1/organizations/:org/quotes/:id", async (req) => {
    const { org, id } = z
      .object({ org: z.uuid(), id: z.uuid() })
      .parse(req.params);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      const r = await db.query(
        'SELECT id,property_id,snapshot,expires_at AS "expiresAt",created_at AS "createdAt",expires_at<=now() AS expired FROM pricing_quotes WHERE organization_id=$1 AND id=$2 AND actor_id=$3',
        [org, id, ctx.userId],
      );
      if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
      await propertyAccess(db, ctx.userId, org, r.rows[0].property_id, [
        "Owner",
        "Manager",
      ]);
      const { property_id, ...out } = r.rows[0];
      return out;
    });
  });
}
