import type pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { z } from "zod";
import { DomainError } from "./security.js";
import { requireMembership } from "./access.js";
import { bulkInput } from "./inventory-schema.js";
export async function propertyAccess(
  db: pg.PoolClient,
  actor: string,
  org: string,
  id: string,
  roles?: string[],
) {
  await requireMembership(db, actor, org, roles);
  const r = await db.query(
    'SELECT id,name,city,timezone,code,floors,segment,address,contact_phone AS "contactPhone",contact_email AS "contactEmail",version FROM properties WHERE organization_id=$1 AND id=$2 AND archived_at IS NULL',
    [org, id],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  return r.rows[0];
}
export const lockLocation = (db: pg.PoolClient, org: string, id: string) =>
  db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "inventory-location:" + org + ":" + id,
  ]);
export async function quota(
  db: pg.PoolClient,
  org: string,
  rooms = 0,
  properties = 0,
  staff = 0,
) {
  await db.query("SELECT assert_entitlement_quota($1,$2,$3,$4)", [
    org,
    rooms,
    properties,
    staff,
  ]);
}
export async function auditInventory(
  db: pg.PoolClient,
  org: string,
  actor: string,
  action: string,
  id: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO audit_logs(organization_id,actor_id,action,object_id,details) VALUES($1,$2,$3,$4,$5)",
    [org, actor, action, id, JSON.stringify(details)],
  );
}
export async function typeForRoom(
  db: pg.PoolClient,
  org: string,
  property: string,
  id: string,
) {
  const r = await db.query(
    'SELECT id,name,default_capacity AS "defaultCapacity",default_facilities AS "defaultFacilities",version FROM room_types WHERE organization_id=$1 AND property_id=$2 AND id=$3 AND archived_at IS NULL',
    [org, property, id],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  return r.rows[0];
}
export function requireProfile(property: {
  code: string | null;
  floors: number | null;
  segment: string | null;
}) {
  if (!property.code || !property.floors || !property.segment)
    throw new DomainError(409, "PROPERTY_CONFIGURATION_REQUIRED");
}
export type ResolvedRoom = {
  code: string;
  floor: number;
  capacity: number;
  facilities: string[];
  typeId: string;
  typeVersion: number;
};
export const roomProjection =
  'r.id,r.property_id AS "propertyId",r.code,r.floor,r.type_id AS "typeId",r.type_version AS "typeVersion",r.capacity,r.facilities,r.condition,r.version,t.name AS "typeName",c.version AS "checklistVersion",c.water,c.electric,c.lock,c.furniture,c.clean,c.recorded_at AS "checklistRecordedAt",(c.water AND c.electric AND c.lock AND c.furniture AND c.clean) AS "checklistComplete"';
export async function insertRoom(
  db: pg.PoolClient,
  org: string,
  actor: string,
  property: string,
  row: ResolvedRoom,
  batch: string | null = null,
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO rooms(id,organization_id,property_id,code,floor,type_id,type_version,capacity,facilities,condition,batch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'inspection',$10)",
    [
      id,
      org,
      property,
      row.code,
      row.floor,
      row.typeId,
      row.typeVersion,
      row.capacity,
      row.facilities,
      batch,
    ],
  );
  await auditInventory(db, org, actor, "room.created", id, {
    propertyId: property,
    code: row.code,
    batchId: batch,
  });
  return id;
}
export async function roomById(db: pg.PoolClient, org: string, id: string) {
  const r = await db.query(
    "SELECT " +
      roomProjection +
      " FROM rooms r JOIN room_types t ON t.organization_id=r.organization_id AND t.property_id=r.property_id AND t.id=r.type_id JOIN room_checklists c ON c.organization_id=r.organization_id AND c.property_id=r.property_id AND c.room_id=r.id WHERE r.organization_id=$1 AND r.id=$2 AND r.archived_at IS NULL",
    [org, id],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  return r.rows[0];
}
export async function resolveBulk(
  input: z.infer<typeof bulkInput>,
  type: {
    id: string;
    version: number;
    defaultCapacity: number;
    defaultFacilities: string[];
  },
  floors: number,
): Promise<ResolvedRoom[]> {
  let rows: { code: string; floor: number }[];
  if (input.mode === "pilot") {
    if (input.rooms) rows = input.rooms;
    else {
      const csv = await readFile(
        new URL(
          "../../project-docs/kost-v1/fixtures/PILOT_ROOMS.csv",
          import.meta.url,
        ),
        "utf8",
      );
      rows = csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => {
          const col = line.split(",");
          return { code: col[1], floor: Number(col[2]) };
        });
    }
  } else if (input.mode === "manual") rows = input.rooms;
  else
    rows = Array.from({ length: input.count }, (_, index) => ({
      code:
        input.prefix +
        String(input.startNumber + index).padStart(input.padding, "0"),
      floor: input.floor,
    }));
  if (rows.some((r) => r.floor > floors || r.code.length > 32))
    throw new DomainError(422, "VALIDATION_ERROR");
  if (
    new Set(rows.map((r) => r.code.toLocaleLowerCase("id"))).size !==
    rows.length
  )
    throw new DomainError(409, "DUPLICATE_ROOM_CODE");
  return rows.map((row) => ({
    ...row,
    capacity: type.defaultCapacity,
    facilities: [...type.defaultFacilities],
    typeId: type.id,
    typeVersion: type.version,
  }));
}
export function previewChecksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
