import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate, requireMembership } from "./access.js";
import { transaction } from "./db.js";
import { idempotent } from "./idempotency.js";
import { DomainError } from "./security.js";
import { pagination, page } from "./pagination.js";
import {
  typeInput,
  roomInput,
  profileInput,
  bulkInput,
  commitInput,
  updateRoomInput,
  checklistInput,
  condition,
} from "./inventory-schema.js";
import {
  propertyAccess,
  lockLocation,
  quota,
  auditInventory,
  typeForRoom,
  requireProfile,
  resolveBulk,
  previewChecksum,
  insertRoom,
  roomById,
  roomProjection,
  type ResolvedRoom,
} from "./inventory-service.js";
const key = (req: FastifyRequest) =>
  z.string().min(16).max(128).parse(req.headers["idempotency-key"]);
const params = z.object({ org: z.uuid(), id: z.uuid() });
export function registerInventory(app: FastifyInstance) {
  app.get("/api/v1/organizations/:org/subscriptions", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner"]);
      return (
        await db.query("SELECT inventory_entitlement_summary($1) AS summary", [
          org,
        ])
      ).rows[0].summary;
    });
  });
  app.get("/api/v1/organizations/:org/properties/:id", async (req) => {
    const { org, id } = params.parse(req.params);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, (db) =>
      propertyAccess(db, ctx.userId, org, id),
    );
  });
  app.post("/api/v1/organizations/:org/properties/:id/profile", async (req) => {
    const { org, id } = params.parse(req.params);
    const ctx = await authenticate(req);
    const body = profileInput.parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, id, ["Owner"]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "property.profile",
        k,
        { id, ...body },
        async () => {
          await lockLocation(db, org, id);
          const updated = await db.query(
            "UPDATE properties SET code=$1,floors=$2,segment=$3,address=$4,contact_phone=$5,contact_email=$6,version=version+1 WHERE organization_id=$7 AND id=$8 AND version=$9 RETURNING id",
            [
              body.code,
              body.floors,
              body.segment,
              body.address || null,
              body.contactPhone || null,
              body.contactEmail || null,
              org,
              id,
              body.version,
            ],
          );
          if (!updated.rowCount) throw new DomainError(409, "VERSION_CONFLICT");
          await auditInventory(
            db,
            org,
            ctx.userId,
            "property.profile_updated",
            id,
            {
              version: body.version + 1,
              fields: [
                "code",
                "floors",
                "segment",
                "address",
                "contactPhone",
                "contactEmail",
              ],
            },
          );
          return propertyAccess(db, ctx.userId, org, id);
        },
      );
    });
  });
  app.get("/api/v1/organizations/:org/room-types", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const { propertyId, after, limit } = pagination
      .extend({ propertyId: z.uuid() })
      .parse(req.query);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, propertyId);
      return page(
        (
          await db.query(
            'SELECT id,property_id AS "propertyId",name,default_capacity AS "defaultCapacity",default_facilities AS "defaultFacilities",version FROM room_types WHERE organization_id=$1 AND property_id=$2 AND archived_at IS NULL AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4',
            [org, propertyId, after ?? null, limit + 1],
          )
        ).rows,
        limit,
      );
    });
  });
  app.post("/api/v1/organizations/:org/room-types", async (req, reply) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const body = typeInput.parse(req.body),
      k = key(req);
    const result = await transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, body.propertyId, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "room-type.create",
        k,
        body,
        async () => {
          await lockLocation(db, org, body.propertyId);
          const row = await db.query(
            'INSERT INTO room_types(organization_id,property_id,name,default_capacity,default_facilities) VALUES($1,$2,$3,$4,$5) RETURNING id,name,property_id AS "propertyId",default_capacity AS "defaultCapacity",default_facilities AS "defaultFacilities",version',
            [
              org,
              body.propertyId,
              body.name,
              body.defaultCapacity,
              body.defaultFacilities,
            ],
          );
          await auditInventory(
            db,
            org,
            ctx.userId,
            "room_type.created",
            row.rows[0].id,
            { propertyId: body.propertyId },
          );
          return row.rows[0];
        },
      );
    });
    return reply.code(201).send(result);
  });
  app.post("/api/v1/organizations/:org/room-types/:id/update", async (req) => {
    const { org, id } = params.parse(req.params);
    const ctx = await authenticate(req);
    const body = typeInput
        .omit({ propertyId: true })
        .extend({ version: z.number().int().positive() })
        .parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner", "Manager"]);
      const current = (
        await db.query(
          "SELECT property_id FROM room_types WHERE organization_id=$1 AND id=$2 AND archived_at IS NULL",
          [org, id],
        )
      ).rows[0];
      if (!current) throw new DomainError(404, "NOT_FOUND");
      await propertyAccess(db, ctx.userId, org, current.property_id, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "room-type.update",
        k,
        { id, ...body },
        async () => {
          await lockLocation(db, org, current.property_id);
          const r = await db.query(
            'UPDATE room_types SET name=$1,default_capacity=$2,default_facilities=$3,version=version+1 WHERE organization_id=$4 AND id=$5 AND version=$6 RETURNING id,property_id AS "propertyId",name,default_capacity AS "defaultCapacity",default_facilities AS "defaultFacilities",version',
            [
              body.name,
              body.defaultCapacity,
              body.defaultFacilities,
              org,
              id,
              body.version,
            ],
          );
          if (!r.rowCount) throw new DomainError(409, "VERSION_CONFLICT");
          await auditInventory(db, org, ctx.userId, "room_type.updated", id, {
            version: body.version + 1,
          });
          return r.rows[0];
        },
      );
    });
  });
  app.get("/api/v1/organizations/:org/rooms", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const { propertyId, after, limit, search, state } = pagination
      .extend({
        propertyId: z.uuid(),
        search: z.string().trim().max(32).optional(),
        state: z
          .enum(["inspection", "ready", "dirty", "maintenance", "inactive"])
          .optional(),
      })
      .parse(req.query);
    const ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, propertyId);
      return page(
        (
          await db.query(
            "SELECT " +
              roomProjection +
              " FROM rooms r JOIN room_types t ON t.organization_id=r.organization_id AND t.property_id=r.property_id AND t.id=r.type_id JOIN room_checklists c ON c.organization_id=r.organization_id AND c.property_id=r.property_id AND c.room_id=r.id WHERE r.organization_id=$1 AND r.property_id=$2 AND r.archived_at IS NULL AND ($3::uuid IS NULL OR r.id>$3) AND ($4::text IS NULL OR position(lower($4) in lower(r.code))>0) AND ($5::text IS NULL OR r.condition=$5) ORDER BY r.id LIMIT $6",
            [
              org,
              propertyId,
              after ?? null,
              search || null,
              state ?? null,
              limit + 1,
            ],
          )
        ).rows,
        limit,
      );
    });
  });
  app.post("/api/v1/organizations/:org/rooms", async (req, reply) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const body = roomInput.parse(req.body),
      k = key(req);
    const result = await transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, body.propertyId, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "room.create",
        k,
        body,
        async () => {
          await quota(db, org, 1);
          await lockLocation(db, org, body.propertyId);
          const p = await propertyAccess(db, ctx.userId, org, body.propertyId, [
            "Owner",
            "Manager",
          ]);
          requireProfile(p);
          if (body.floor > p.floors)
            throw new DomainError(422, "VALIDATION_ERROR");
          const t = await typeForRoom(db, org, body.propertyId, body.typeId);
          const id = await insertRoom(db, org, ctx.userId, body.propertyId, {
            code: body.code,
            floor: body.floor,
            typeId: t.id,
            typeVersion: t.version,
            capacity: body.capacity ?? t.defaultCapacity,
            facilities: body.facilities ?? t.defaultFacilities,
          });
          return roomById(db, org, id);
        },
      );
    });
    return reply.code(201).send(result);
  });
  app.post("/api/v1/organizations/:org/rooms/bulk-preview", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params);
    const ctx = await authenticate(req);
    const body = bulkInput.parse(req.body);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, body.propertyId, [
        "Owner",
        "Manager",
      ]);
      if (body.mode === "pilot") {
        const done = await db.query(
          "SELECT id FROM inventory_batches WHERE organization_id=$1 AND property_id=$2 AND seed_key='pilot-example-v1'",
          [org, body.propertyId],
        );
        if (done.rowCount)
          return { alreadyApplied: true, batchId: done.rows[0].id, rooms: [] };
      }
      await quota(
        db,
        org,
        body.mode === "pilot"
          ? 12
          : body.mode === "manual"
            ? body.rooms.length
            : body.count,
      );
      await lockLocation(db, org, body.propertyId);
      const p = await propertyAccess(db, ctx.userId, org, body.propertyId, [
        "Owner",
        "Manager",
      ]);
      requireProfile(p);
      if (body.mode === "pilot") {
        const existing = await db.query(
          "SELECT id FROM inventory_batches WHERE organization_id=$1 AND property_id=$2 AND seed_key='pilot-example-v1'",
          [org, body.propertyId],
        );
        if (existing.rowCount)
          return {
            alreadyApplied: true,
            batchId: existing.rows[0].id,
            rooms: [],
          };
      }
      const t = await typeForRoom(db, org, body.propertyId, body.typeId);
      const rooms = await resolveBulk(body, t, p.floors);
      const duplicate = await db.query(
        "SELECT code FROM rooms WHERE organization_id=$1 AND property_id=$2 AND lower(code)=ANY($3::text[])",
        [
          org,
          body.propertyId,
          rooms.map((r) => r.code.toLocaleLowerCase("id")),
        ],
      );
      if (duplicate.rowCount) throw new DomainError(409, "DUPLICATE_ROOM_CODE");
      /* Preview does not reserve capacity; commit rechecks quota under its lock. */ const id =
          randomUUID(),
        mode = body.mode ?? "sequence",
        snapshot = {
          mode,
          rooms,
          typeId: t.id,
          seedKey: mode === "pilot" ? "pilot-example-v1" : null,
        };
      const checksum = previewChecksum({
        id,
        org,
        actor: ctx.userId,
        property: body.propertyId,
        propertyVersion: p.version,
        typeVersion: t.version,
        snapshot,
      });
      const r = await db.query(
        "INSERT INTO room_previews(id,organization_id,property_id,actor_id,checksum,payload,type_version,property_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING expires_at",
        [
          id,
          org,
          body.propertyId,
          ctx.userId,
          checksum,
          JSON.stringify(snapshot),
          t.version,
          p.version,
        ],
      );
      return {
        alreadyApplied: false,
        previewChecksum: checksum,
        propertyId: body.propertyId,
        typeName: t.name,
        rooms,
        expiresAt: r.rows[0].expires_at,
      };
    });
  });
  app.post(
    "/api/v1/organizations/:org/rooms/bulk-commit",
    async (req, reply) => {
      const { org } = z.object({ org: z.uuid() }).parse(req.params);
      const ctx = await authenticate(req);
      const body = commitInput.parse(req.body),
        k = key(req);
      const result = await transaction(ctx.userId, org, async (db) => {
        await propertyAccess(db, ctx.userId, org, body.propertyId, [
          "Owner",
          "Manager",
        ]);
        return idempotent(
          db,
          org,
          ctx.userId,
          "room.bulk-commit",
          k,
          body,
          async () => {
            await quota(db, org, 0);
            await lockLocation(db, org, body.propertyId);
            const preview = await db.query(
              "SELECT * FROM room_previews WHERE organization_id=$1 AND property_id=$2 AND actor_id=$3 AND checksum=$4 FOR UPDATE",
              [org, body.propertyId, ctx.userId, body.previewChecksum],
            );
            if (!preview.rowCount)
              throw new DomainError(409, "PREVIEW_INVALID");
            const v = preview.rows[0];
            if (v.consumed_at)
              throw new DomainError(409, "PREVIEW_ALREADY_COMMITTED");
            if (new Date(v.expires_at).getTime() <= Date.now())
              throw new DomainError(409, "PREVIEW_EXPIRED");
            const snapshot = v.payload as {
              mode: string;
              rooms: ResolvedRoom[];
              typeId: string;
              seedKey: string | null;
            };
            const p = await propertyAccess(
              db,
              ctx.userId,
              org,
              body.propertyId,
              ["Owner", "Manager"],
            );
            const t = await typeForRoom(
              db,
              org,
              body.propertyId,
              snapshot.typeId,
            );
            if (
              p.version !== v.property_version ||
              t.version !== v.type_version
            )
              throw new DomainError(409, "VERSION_CONFLICT");
            await quota(db, org, snapshot.rooms.length);
            if (
              snapshot.seedKey &&
              (
                await db.query(
                  "SELECT id FROM inventory_batches WHERE organization_id=$1 AND property_id=$2 AND seed_key=$3",
                  [org, body.propertyId, snapshot.seedKey],
                )
              ).rowCount
            )
              throw new DomainError(409, "PILOT_ALREADY_APPLIED");
            const batch = randomUUID();
            await db.query(
              "INSERT INTO inventory_batches(id,organization_id,property_id,actor_id,seed_key) VALUES($1,$2,$3,$4,$5)",
              [batch, org, body.propertyId, ctx.userId, snapshot.seedKey],
            );
            const rooms = [];
            for (const row of snapshot.rooms) {
              const id = await insertRoom(
                db,
                org,
                ctx.userId,
                body.propertyId,
                row,
                batch,
              );
              rooms.push(await roomById(db, org, id));
            }
            await db.query(
              "UPDATE room_previews SET consumed_at=clock_timestamp(),batch_id=$1 WHERE id=$2",
              [batch, v.id],
            );
            await auditInventory(
              db,
              org,
              ctx.userId,
              "room.batch_created",
              batch,
              {
                propertyId: body.propertyId,
                count: rooms.length,
                mode: snapshot.mode,
              },
            );
            return { batchId: batch, created: rooms.length, rooms };
          },
        );
      });
      return reply.code(201).send(result);
    },
  );
  app.post("/api/v1/organizations/:org/rooms/:id/update", async (req) => {
    const { org, id } = params.parse(req.params);
    const ctx = await authenticate(req);
    const body = updateRoomInput.parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner", "Manager"]);
      const current = await roomById(db, org, id);
      await propertyAccess(db, ctx.userId, org, current.propertyId, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "room.update",
        k,
        { id, ...body },
        async () => {
          await lockLocation(db, org, current.propertyId);
          const p = await propertyAccess(
            db,
            ctx.userId,
            org,
            current.propertyId,
            ["Owner", "Manager"],
          );
          if (body.floor > p.floors)
            throw new DomainError(422, "VALIDATION_ERROR");
          const t = await typeForRoom(db, org, current.propertyId, body.typeId);
          const typeVersion =
            body.applyTypeDefaults || body.typeId !== current.typeId
              ? t.version
              : current.typeVersion;
          const r = await db.query(
            "UPDATE rooms SET code=$1,floor=$2,type_id=$3,type_version=$4,capacity=$5,facilities=$6,condition=$7,version=version+1 WHERE organization_id=$8 AND id=$9 AND version=$10 RETURNING id",
            [
              body.code,
              body.floor,
              body.typeId,
              typeVersion,
              body.applyTypeDefaults ? t.defaultCapacity : body.capacity,
              body.applyTypeDefaults ? t.defaultFacilities : body.facilities,
              body.condition,
              org,
              id,
              body.version,
            ],
          );
          if (!r.rowCount) throw new DomainError(409, "VERSION_CONFLICT");
          await db.query(
            "UPDATE room_checklists SET water=false,electric=false,lock=false,furniture=false,clean=false,recorded_by=NULL,recorded_at=NULL,version=version+1 WHERE room_id=$1",
            [id],
          );
          await auditInventory(db, org, ctx.userId, "room.updated", id, {
            reason: body.reason,
            version: body.version + 1,
            appliedTypeDefaults: body.applyTypeDefaults,
          });
          return roomById(db, org, id);
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/rooms/:id/checklist", async (req) => {
    const { org, id } = params.parse(req.params);
    const ctx = await authenticate(req);
    const body = checklistInput.parse(req.body),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, [
        "Owner",
        "Manager",
        "Operations",
      ]);
      const room = await roomById(db, org, id);
      await propertyAccess(db, ctx.userId, org, room.propertyId, [
        "Owner",
        "Manager",
        "Operations",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "room.checklist",
        k,
        { id, ...body },
        async () => {
          await lockLocation(db, org, room.propertyId);
          const latest = await roomById(db, org, id);
          if (latest.version !== body.roomVersion)
            throw new DomainError(409, "VERSION_CONFLICT");
          const r = await db.query(
            "UPDATE room_checklists SET water=$1,electric=$2,lock=$3,furniture=$4,clean=$5,version=version+1,recorded_by=$6,recorded_at=clock_timestamp() WHERE room_id=$7 AND version=$8 RETURNING version",
            [
              body.water,
              body.electric,
              body.lock,
              body.furniture,
              body.clean,
              ctx.userId,
              id,
              body.version,
            ],
          );
          if (!r.rowCount) throw new DomainError(409, "VERSION_CONFLICT");
          await db.query(
            "INSERT INTO room_checklist_events(organization_id,property_id,room_id,room_version,water,electric,lock,furniture,clean,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            [
              org,
              room.propertyId,
              id,
              body.roomVersion,
              body.water,
              body.electric,
              body.lock,
              body.furniture,
              body.clean,
              ctx.userId,
            ],
          );
          await auditInventory(
            db,
            org,
            ctx.userId,
            "room.checklist_saved",
            id,
            { roomVersion: body.roomVersion },
          );
          return roomById(db, org, id);
        },
      );
    });
  });
}
