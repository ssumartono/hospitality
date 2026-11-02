import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate, requireMembership } from "./access.js";
import { transaction } from "./db.js";
import { DomainError } from "./security.js";
import { idempotent } from "./idempotency.js";
import {
  propertyAccess,
  lockLocation,
  roomById,
  auditInventory,
  quota,
} from "./inventory-service.js";
import { prepareBookingPricingSnapshot } from "./booking-snapshot.js";
import { startOfLocalDate } from "./pricing-domain.js";
import {
  intakeInput,
  refreshInput,
  decisionInput,
  readyInput,
} from "./booking-schema.js";
import { issueInitialInvoice } from "./invoice-service.js";
import { page } from "./pagination.js";
const key = (r: FastifyRequest) =>
  z.string().min(16).max(128).parse(r.headers["idempotency-key"]);
const params = z.object({ org: z.uuid(), id: z.uuid() });
const paging = z
  .object({
    propertyId: z.uuid(),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const projection =
  'b.id,b.property_id AS "propertyId",b.room_id AS "roomId",r.code AS "roomCode",b.customer_id AS "customerId",c.name AS "customerName",b.state,b.version,b.starts_on::text AS start,b.ends_on::text AS end,b.planned_months AS "plannedMonths",b.occupant_count AS "occupantCount",b.pricing_snapshot AS snapshot,b.quote_expires_at AS "quoteExpiresAt",b.hold_deadline AS "holdDeadline",b.accepted_at AS "acceptedAt",b.decision_reason AS "decisionReason",b.created_at AS "createdAt"';
async function bookingRow(db: any, org: string, id: string) {
  const r = await db.query(
    "SELECT b.*,b.starts_on::text AS start_text,b.ends_on::text AS end_text FROM bookings b WHERE b.organization_id=$1 AND b.id=$2 AND b.origin='staff'",
    [org, id],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  return r.rows[0];
}
async function bookingView(db: any, org: string, id: string) {
  const r = await db.query(
    "SELECT " +
      projection +
      " FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN customers c ON c.id=b.customer_id WHERE b.organization_id=$1 AND b.id=$2",
    [org, id],
  );
  if (!r.rowCount) throw new DomainError(404, "NOT_FOUND");
  return r.rows[0];
}
async function consent(
  db: any,
  org: string,
  b: any,
  actor: string,
  note: string,
) {
  await db.query(
    "INSERT INTO booking_consents(organization_id,property_id,booking_id,quote_id,booking_version,actor_id,note)VALUES($1,$2,$3,$4,$5,$6,$7)",
    [org, b.property_id, b.id, b.quote_id, b.version, actor, note],
  );
}
export function registerBooking(app: FastifyInstance) {
  app.post(
    "/api/v1/organizations/:org/rooms/:id/initial-ready",
    async (req) => {
      const { org, id } = params.parse(req.params),
        body = readyInput.parse(req.body),
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
          "room.initial_ready",
          k,
          { id, ...body },
          async () => {
            await db.query("SELECT mark_initial_room_ready($1,$2,$3,$4)", [
              org,
              id,
              body.version,
              body.reason,
            ]);
            return roomById(db, org, id);
          },
        );
      });
    },
  );
  app.get("/api/v1/organizations/:org/customers", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params),
      q = paging.parse(req.query),
      ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, q.propertyId, [
        "Owner",
        "Manager",
        "Finance",
      ]);
      return page(
        (
          await db.query(
            "SELECT c.id,c.name,c.phone,c.email FROM customers c JOIN customer_locations l ON l.organization_id=c.organization_id AND l.customer_id=c.id WHERE c.organization_id=$1 AND l.property_id=$2 AND($3::uuid IS NULL OR c.id>$3)ORDER BY c.id LIMIT $4",
            [org, q.propertyId, q.after ?? null, q.limit + 1],
          )
        ).rows,
        q.limit,
      );
    });
  });
  app.get("/api/v1/organizations/:org/bookings", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params),
      q = paging.parse(req.query),
      ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, q.propertyId, [
        "Owner",
        "Manager",
        "Finance",
      ]);
      return page(
        (
          await db.query(
            "SELECT " +
              projection +
              " FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN customers c ON c.id=b.customer_id WHERE b.organization_id=$1 AND b.property_id=$2 AND($3::uuid IS NULL OR b.id>$3)ORDER BY b.id LIMIT $4",
            [org, q.propertyId, q.after ?? null, q.limit + 1],
          )
        ).rows,
        q.limit,
      );
    });
  });
  app.post("/api/v1/organizations/:org/bookings", async (req, reply) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params),
      body = intakeInput.parse(req.body),
      ctx = await authenticate(req),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, ["Owner", "Manager"]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "booking.intake",
        k,
        body,
        async () => {
          await quota(db, org);
          const snapshot = await prepareBookingPricingSnapshot(
            db,
            ctx.userId,
            org,
            body.quoteId,
          );
          const property = snapshot.propertyId;
          let customerId = body.customerId;
          if (customerId) {
            if (
              !(
                await db.query(
                  "SELECT id FROM customers WHERE organization_id=$1 AND id=$2",
                  [org, customerId],
                )
              ).rowCount
            )
              throw new DomainError(404, "NOT_FOUND");
          } else {
            customerId = randomUUID();
            await db.query(
              "INSERT INTO customers(id,organization_id,created_property_id,name,phone,email,created_by)VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                customerId,
                org,
                property,
                body.customer!.name,
                body.customer!.phone,
                body.customer!.email ?? null,
                ctx.userId,
              ],
            );
          }
          await db.query(
            "INSERT INTO customer_locations(organization_id,property_id,customer_id)VALUES($1,$2,$3)ON CONFLICT DO NOTHING",
            [org, property, customerId],
          );
          const id = randomUUID();
          const b = (
            await db.query(
              "INSERT INTO bookings(id,organization_id,property_id,room_id,origin,customer_id,quote_id,quote_expires_at,planned_months,occupant_count,created_by,state,starts_on,ends_on,pricing_snapshot)VALUES($1,$2,$3,$4,'staff',$5,$6,(SELECT expires_at FROM pricing_quotes WHERE id=$6),$7,$8,$9,'pending',$10,$11,$12) RETURNING *",
              [
                id,
                org,
                property,
                snapshot.roomId,
                customerId,
                body.quoteId,
                body.plannedMonths,
                snapshot.occupantCount,
                ctx.userId,
                snapshot.requestedStart,
                snapshot.requestedEnd,
                JSON.stringify(snapshot),
              ],
            )
          ).rows[0];
          await consent(db, org, b, ctx.userId, body.consentNote);
          await auditInventory(db, org, ctx.userId, "booking.requested", id, {
            roomId: snapshot.roomId,
            quoteId: body.quoteId,
            consentKind: "staff_recorded",
          });
          reply.code(201);
          return bookingView(db, org, id);
        },
      );
    });
  });
  app.post(
    "/api/v1/organizations/:org/bookings/:id/refresh-quote",
    async (req) => {
      const { org, id } = params.parse(req.params),
        body = refreshInput.parse(req.body),
        ctx = await authenticate(req),
        k = key(req);
      return transaction(ctx.userId, org, async (db) => {
        const first = await bookingRow(db, org, id);
        await propertyAccess(db, ctx.userId, org, first.property_id, [
          "Owner",
          "Manager",
        ]);
        return idempotent(
          db,
          org,
          ctx.userId,
          "booking.refresh_quote",
          k,
          { id, ...body },
          async () => {
            const snapshot = await prepareBookingPricingSnapshot(
              db,
              ctx.userId,
              org,
              body.quoteId,
            );
            const b = await bookingRow(db, org, id);
            if (b.state !== "pending" || b.version !== body.version)
              throw new DomainError(409, "VERSION_CONFLICT");
            if (
              snapshot.roomId !== b.room_id ||
              snapshot.requestedStart !== b.start_text ||
              snapshot.requestedEnd !== b.end_text ||
              snapshot.occupantCount !== b.occupant_count
            )
              throw new DomainError(422, "VALIDATION_ERROR");
            await db.query(
              "UPDATE bookings SET pricing_snapshot=$1,quote_id=$2,quote_expires_at=(SELECT expires_at FROM pricing_quotes WHERE id=$2),version=version+1 WHERE organization_id=$3 AND id=$4",
              [JSON.stringify(snapshot), body.quoteId, org, id],
            );
            await consent(
              db,
              org,
              { ...b, version: b.version + 1, quote_id: body.quoteId },
              ctx.userId,
              body.consentNote,
            );
            await auditInventory(
              db,
              org,
              ctx.userId,
              "booking.quote_refreshed",
              id,
              { quoteId: body.quoteId },
            );
            return bookingView(db, org, id);
          },
        );
      });
    },
  );
  app.post("/api/v1/organizations/:org/bookings/:id/accept", async (req) => {
    const { org, id } = params.parse(req.params),
      body = decisionInput.parse(req.body),
      ctx = await authenticate(req),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      const first = await bookingRow(db, org, id);
      await propertyAccess(db, ctx.userId, org, first.property_id, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "booking.accept",
        k,
        { id, ...body },
        async () => {
          await quota(db, org);
          await lockLocation(db, org, first.property_id);
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["pricing:" + org + ":" + first.property_id],
          );
          const room = (
            await db.query(
              "SELECT * FROM rooms WHERE organization_id=$1 AND id=$2 FOR UPDATE",
              [org, first.room_id],
            )
          ).rows[0];
          const b = (
            await db.query(
              "SELECT *,quote_expires_at<=clock_timestamp() AS expired,starts_on::text AS start_text FROM bookings WHERE organization_id=$1 AND id=$2 FOR UPDATE",
              [org, id],
            )
          ).rows[0];
          if (b.state !== "pending" || b.version !== body.version)
            throw new DomainError(409, "VERSION_CONFLICT");
          if (b.expired) throw new DomainError(409, "QUOTE_EXPIRED");
          const s = b.pricing_snapshot;
          const current = (
            await db.query(
              "SELECT id FROM rate_policy_versions WHERE organization_id=$1 AND property_id=$2 AND effective_at<=$3 ORDER BY effective_at DESC,version DESC LIMIT 1",
              [
                org,
                b.property_id,
                startOfLocalDate(b.start_text, s.pricing.timezone),
              ],
            )
          ).rows[0];
          if (
            room.version !== s.pricing.roomVersion ||
            current?.id !== s.pricing.policyId
          )
            throw new DomainError(409, "QUOTE_CHANGED");
          if (
            room.archived_at ||
            room.condition !== "ready" ||
            room.capacity < b.occupant_count
          )
            throw new DomainError(409, "ROOM_NOT_READY");
          const held = s.pricing.bookingMinimum > 0;
          const due = (
            await db.query(
              "SELECT clock_timestamp()+make_interval(hours=>$1) AS deadline",
              [s.pricing.policy.holdHours],
            )
          ).rows[0].deadline;
          const updated = (
            await db.query(
              "UPDATE bookings SET state=$1,version=version+1,accepted_at=clock_timestamp(),hold_deadline=$2,decision_reason=$3 WHERE organization_id=$4 AND id=$5 RETURNING *",
              [
                held ? "held" : "confirmed",
                held ? due : null,
                body.reason,
                org,
                id,
              ],
            )
          ).rows[0];
          const invoice = await issueInitialInvoice(
            db,
            org,
            updated,
            held ? due : startOfLocalDate(b.start_text, s.pricing.timezone),
          );
          await db.query("SELECT reserve_booking_allocation($1,$2)", [org, id]);
          await db.query(
            "INSERT INTO booking_events_outbox(organization_id,property_id,booking_id,event)VALUES($1,$2,$3,'accepted')",
            [org, b.property_id, id],
          );
          await auditInventory(db, org, ctx.userId, "booking.accepted", id, {
            invoiceId: invoice.id,
            state: updated.state,
            reason: body.reason,
          });
          return { booking: await bookingView(db, org, id), invoice };
        },
      );
    });
  });
  app.post("/api/v1/organizations/:org/bookings/:id/reject", async (req) => {
    const { org, id } = params.parse(req.params),
      body = decisionInput.parse(req.body),
      ctx = await authenticate(req),
      k = key(req);
    return transaction(ctx.userId, org, async (db) => {
      const b = await bookingRow(db, org, id);
      await propertyAccess(db, ctx.userId, org, b.property_id, [
        "Owner",
        "Manager",
      ]);
      return idempotent(
        db,
        org,
        ctx.userId,
        "booking.reject",
        k,
        { id, ...body },
        async () => {
          await lockLocation(db, org, b.property_id);
          const updated = await db.query(
            "UPDATE bookings SET state='rejected',version=version+1,decision_reason=$1 WHERE organization_id=$2 AND id=$3 AND version=$4 AND state='pending' RETURNING id",
            [body.reason, org, id, body.version],
          );
          if (!updated.rowCount) throw new DomainError(409, "VERSION_CONFLICT");
          await auditInventory(db, org, ctx.userId, "booking.rejected", id, {
            reason: body.reason,
          });
          return bookingView(db, org, id);
        },
      );
    });
  });
  app.get("/api/v1/organizations/:org/invoices", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params),
      q = paging.parse(req.query),
      ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await propertyAccess(db, ctx.userId, org, q.propertyId, [
        "Owner",
        "Manager",
        "Finance",
      ]);
      const rows = (
        await db.query(
          'SELECT id,booking_id AS "bookingId",number,state,total,due_at AS "dueAt",issued_at AS "issuedAt",void_reason AS "voidReason",bill_to AS "billTo",pricing_snapshot AS snapshot,clock_timestamp()>due_at AS overdue FROM invoices WHERE organization_id=$1 AND property_id=$2 AND($3::uuid IS NULL OR id>$3)ORDER BY id LIMIT $4',
          [org, q.propertyId, q.after ?? null, q.limit + 1],
        )
      ).rows;
      const result = page(rows, q.limit);
      for (const i of result.items) {
        i.total = Number(i.total);
        i.balance = i.state === "void" ? 0 : i.total;
        i.paymentStatus =
          i.state === "void"
            ? "void"
            : i.total === 0
              ? "paid"
              : i.overdue
                ? "overdue"
                : "unpaid";
        i.verifiedReceived = 0;
        i.lines = (
          await db.query(
            "SELECT id,kind,code,label,amount,starts_on::text AS start,ends_on::text AS end,refundable FROM invoice_lines WHERE organization_id=$1 AND invoice_id=$2 ORDER BY position",
            [org, i.id],
          )
        ).rows.map((l) => ({ ...l, amount: Number(l.amount) }));
      }
      return result;
    });
  });
  app.get("/api/v1/organizations/:org/notifications", async (req) => {
    const { org } = z.object({ org: z.uuid() }).parse(req.params),
      q = z
        .object({
          after: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        })
        .strict()
        .parse(req.query),
      ctx = await authenticate(req);
    return transaction(ctx.userId, org, async (db) => {
      await requireMembership(db, ctx.userId, org, [
        "Owner",
        "Manager",
        "Finance",
      ]);
      return page(
        (
          await db.query(
            'SELECT id,title,booking_id AS "bookingId",created_at AS "createdAt",read_at AS "readAt" FROM in_app_notifications WHERE organization_id=$1 AND user_id=$2 AND($3::uuid IS NULL OR id>$3)ORDER BY id LIMIT $4',
            [org, ctx.userId, q.after ?? null, q.limit + 1],
          )
        ).rows,
        q.limit,
      );
    });
  });
}
