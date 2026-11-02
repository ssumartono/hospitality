import type pg from "pg";
import { DomainError } from "./security.js";
import { propertyAccess, lockLocation } from "./inventory-service.js";
import { startOfLocalDate } from "./pricing-domain.js";
/** Called inside booking command transaction; does not imply customer consent or allocate a room. */
export async function prepareBookingPricingSnapshot(
  db: pg.PoolClient,
  actor: string,
  org: string,
  quoteId: string,
) {
  const q = (
    await db.query(
      "SELECT room_id,property_id,policy_id,request,snapshot,expires_at<=clock_timestamp() AS expired FROM pricing_quotes WHERE organization_id=$1 AND id=$2 AND actor_id=$3",
      [org, quoteId, actor],
    )
  ).rows[0];
  if (!q) throw new DomainError(404, "NOT_FOUND");
  await propertyAccess(db, actor, org, q.property_id, ["Owner", "Manager"]);
  await lockLocation(db, org, q.property_id);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "pricing:" + org + ":" + q.property_id,
  ]);
  const room = (
    await db.query(
      "SELECT version,archived_at FROM rooms WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [org, q.room_id],
    )
  ).rows[0];
  if (!room || room.archived_at) throw new DomainError(404, "NOT_FOUND");
  if (
    (
      await db.query(
        "SELECT expires_at<=clock_timestamp() AS expired FROM pricing_quotes WHERE organization_id=$1 AND id=$2",
        [org, quoteId],
      )
    ).rows[0].expired
  )
    throw new DomainError(409, "QUOTE_EXPIRED");
  if (room.version !== q.snapshot.roomVersion)
    throw new DomainError(409, "QUOTE_CHANGED");
  const current = (
    await db.query(
      "SELECT id FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2 AND effective_at<=$3 ORDER BY effective_at DESC,version DESC LIMIT 1",
      [
        org,
        q.property_id,
        startOfLocalDate(q.request.start, q.snapshot.timezone),
      ],
    )
  ).rows[0];
  if (current?.id !== q.policy_id) throw new DomainError(409, "QUOTE_CHANGED");
  return structuredClone({
    schemaVersion: 1,
    quoteId,
    roomId: q.room_id,
    propertyId: q.property_id,
    requestedStart: q.request.start,
    requestedEnd: q.request.end ?? null,
    occupantCount: q.request.occupantCount,
    pricing: q.snapshot,
    initialInvoiceLines: q.snapshot.lines.filter(
      (l: { start: string }) => l.start === q.request.start,
    ),
  });
}
