import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "./access.js";
import { transaction } from "./db.js";
import { DomainError } from "./security.js";
import { idempotent } from "./idempotency.js";
import {
  propertyAccess,
  lockLocation,
  roomById,
  auditInventory,
} from "./inventory-service.js";
import {
  blockInput,
  releaseBlockInput,
  interval,
} from "./allocation-schema.js";
import { page } from "./pagination.js";
const roomParams = z.object({ org: z.uuid(), id: z.uuid() });
const key = (req: FastifyRequest) =>
  z.string().min(16).max(128).parse(req.headers["idempotency-key"]);
const projection =
  'id,room_id AS "roomId",property_id AS "propertyId",starts_on::text AS start,ends_on::text AS end,reason,state,version,created_at AS "createdAt",released_at AS "releasedAt",release_reason AS "releaseReason"';
export function registerAllocation(app: FastifyInstance) {
  app.get("/api/v1/organizations/:org/rooms/:id/availability", async (req) => {
    const { org, id } = roomParams.parse(req.params);
    const body = interval.parse(req.query),
      ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      const room = await roomById(db, org, id);
      await propertyAccess(db, ctx.userId, org, room.propertyId);
      const result = await db.query(
        "SELECT EXISTS(SELECT 1 FROM room_allocations WHERE organization_id=$1 AND room_id=$2 AND state='active' AND daterange(starts_on,ends_on,'[)') && daterange($3::date,$4::date,'[)')) AS allocated,EXISTS(SELECT 1 FROM room_presence WHERE organization_id=$1 AND room_id=$2 AND exited_at IS NULL) AS present,clock_timestamp() AS checked_at",
        [org, id, body.start, body.end ?? null],
      );
      const r = result.rows[0],
        reasons: string[] = [];
      if (room.condition !== "ready") reasons.push("ROOM_NOT_READY");
      if (r.allocated) reasons.push("ALLOCATION_CONFLICT");
      if (r.present) reasons.push("ACTIVE_PRESENCE");
      return {
        roomId: id,
        start: body.start,
        end: body.end ?? null,
        condition: room.condition,
        available: reasons.length === 0,
        reasons,
        checkedAt: r.checked_at,
        reservationCreated: false,
      };
    });
  });
  app.get("/api/v1/organizations/:org/rooms/:id/blocks", async (req) => {
    const { org, id } = roomParams.parse(req.params);
    const q = z
      .object({
        after: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(req.query);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      const room = await roomById(db, org, id);
      await propertyAccess(db, ctx.userId, org, room.propertyId);
      const rows = await db.query(
        "SELECT " +
          projection +
          " FROM room_blocks WHERE organization_id=$1 AND room_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4",
        [org, id, q.after ?? null, q.limit + 1],
      );
      return page(rows.rows, q.limit);
    });
  });
  app.post(
    "/api/v1/organizations/:org/rooms/:id/blocks",
    async (req, reply) => {
      const { org, id } = roomParams.parse(req.params);
      const body = blockInput.parse(req.body),
        ctx = await authenticate(req),
        k = key(req);
      return transaction(ctx.userId, org, async (db) => {
        const room = await roomById(db, org, id);
        await propertyAccess(db, ctx.userId, org, room.propertyId, [
          "Owner",
          "Manager",
        ]);
        return idempotent(
          db,
          org,
          ctx.userId,
          "allocation.block.create",
          k,
          { id, ...body },
          async () => {
            await lockLocation(db, org, room.propertyId);
            await db.query(
              "SELECT id FROM rooms WHERE organization_id=$1 AND id=$2 FOR UPDATE",
              [org, id],
            );
            if (
              (
                await db.query(
                  "SELECT 1 FROM room_presence WHERE organization_id=$1 AND room_id=$2 AND exited_at IS NULL",
                  [org, id],
                )
              ).rowCount
            )
              throw new DomainError(409, "ACTIVE_PRESENCE");
            const blockId = randomUUID();
            await db.query(
              "INSERT INTO room_blocks(id,organization_id,property_id,room_id,starts_on,ends_on,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
              [
                blockId,
                org,
                room.propertyId,
                id,
                body.start,
                body.end ?? null,
                body.reason,
                ctx.userId,
              ],
            );
            await db.query(
              "INSERT INTO room_allocations(organization_id,property_id,room_id,kind,starts_on,ends_on,block_id) VALUES($1,$2,$3,'block',$4,$5,$6)",
              [org, room.propertyId, id, body.start, body.end ?? null, blockId],
            );
            await auditInventory(
              db,
              org,
              ctx.userId,
              "room.block_created",
              blockId,
              {
                roomId: id,
                start: body.start,
                end: body.end ?? null,
                reason: body.reason,
              },
            );
            reply.code(201);
            return (
              await db.query(
                "SELECT " + projection + " FROM room_blocks WHERE id=$1",
                [blockId],
              )
            ).rows[0];
          },
        );
      });
    },
  );
  app.post(
    "/api/v1/organizations/:org/room-blocks/:id/release",
    async (req) => {
      const { org, id } = roomParams.parse(req.params);
      const body = releaseBlockInput.parse(req.body),
        ctx = await authenticate(req),
        k = key(req);
      return transaction(ctx.userId, org, async (db) => {
        const found = await db.query(
          "SELECT property_id,room_id FROM room_blocks WHERE organization_id=$1 AND id=$2",
          [org, id],
        );
        if (!found.rowCount) throw new DomainError(404, "NOT_FOUND");
        const b = found.rows[0];
        await propertyAccess(db, ctx.userId, org, b.property_id, [
          "Owner",
          "Manager",
        ]);
        return idempotent(
          db,
          org,
          ctx.userId,
          "allocation.block.release",
          k,
          { id, ...body },
          async () => {
            await lockLocation(db, org, b.property_id);
            await db.query(
              "SELECT id FROM rooms WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [b.room_id, org],
            );
            const updated = await db.query(
              "UPDATE room_blocks SET state='released',version=version+1,released_by=$1,release_reason=$2,released_at=clock_timestamp() WHERE organization_id=$3 AND id=$4 AND version=$5 AND state='active' RETURNING id",
              [ctx.userId, body.reason, org, id, body.version],
            );
            if (!updated.rowCount)
              throw new DomainError(409, "VERSION_CONFLICT");
            const allocation = await db.query(
              "UPDATE room_allocations SET state='released',version=version+1,released_at=clock_timestamp() WHERE organization_id=$1 AND block_id=$2 AND state='active' RETURNING id",
              [org, id],
            );
            if (allocation.rowCount !== 1)
              throw new DomainError(409, "INVALID_STATE");
            await auditInventory(
              db,
              org,
              ctx.userId,
              "room.block_released",
              id,
              { roomId: b.room_id, reason: body.reason },
            );
            return (
              await db.query(
                "SELECT " + projection + " FROM room_blocks WHERE id=$1",
                [id],
              )
            ).rows[0];
          },
        );
      });
    },
  );
}
