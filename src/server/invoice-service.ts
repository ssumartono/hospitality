import type pg from "pg";
import { randomUUID } from "node:crypto";
export async function issueInitialInvoice(
  db: pg.PoolClient,
  org: string,
  booking: any,
  dueAt: Date,
) {
  const snapshot = booking.pricing_snapshot,
    lines = snapshot.initialInvoiceLines;
  const customer = (
    await db.query(
      "SELECT name,phone,email FROM customers WHERE organization_id=$1 AND id=$2",
      [org, booking.customer_id],
    )
  ).rows[0];
  const id = randomUUID(),
    number = (
      await db.query("SELECT next_invoice_number($1,$2) AS number", [
        org,
        booking.property_id,
      ])
    ).rows[0].number;
  await db.query(
    "INSERT INTO invoices(id,organization_id,property_id,customer_id,booking_id,number,total,due_at,pricing_snapshot,bill_to)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      org,
      booking.property_id,
      booking.customer_id,
      booking.id,
      number,
      snapshot.pricing.initialTotal,
      dueAt,
      JSON.stringify(snapshot),
      JSON.stringify(customer),
    ],
  );
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.query(
      "INSERT INTO invoice_lines(organization_id,property_id,invoice_id,position,kind,code,label,amount,starts_on,ends_on,refundable)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        org,
        booking.property_id,
        id,
        i + 1,
        l.kind,
        l.code,
        l.label,
        l.amount,
        l.start,
        l.end,
        l.refundable,
      ],
    );
  }
  return { id, number };
}
