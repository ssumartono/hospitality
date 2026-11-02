import { writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  intakeInput,
  refreshInput,
  decisionInput,
} from "../src/server/booking-schema.js";
const uuid = { type: "string", format: "uuid" };
const parameters = [
  { name: "org", in: "path", required: true, schema: uuid },
  { name: "id", in: "path", required: true, schema: uuid },
];
const get = {
  security: [{ SessionCookie: [] }],
  parameters,
  responses: {
    200: {
      description:
        "Scoped paginated resource {items,nextCursor}; projections below",
    },
    401: { description: "AUTH_REQUIRED" },
    403: { description: "FORBIDDEN" },
    404: { description: "NOT_FOUND including other organization/location" },
    422: { description: "VALIDATION_ERROR" },
  },
};
const post = (schema: any) => ({
  ...get,
  parameters: [
    ...parameters,
    {
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 16, maxLength: 128 },
    },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { unrepresentable: "any" }),
      },
    },
  },
  responses: {
    ...get.responses,
    201: { description: "Created resource" },
    409: {
      description:
        "VERSION_CONFLICT, QUOTE_CHANGED, QUOTE_EXPIRED, ROOM_NOT_READY, AVAILABILITY_CONFLICT, SUBSCRIPTION_RESTRICTED or IDEMPOTENCY_MISMATCH",
    },
  },
});
const list = {
  ...get,
  parameters: [
    parameters[0],
    { name: "propertyId", in: "query", required: true, schema: uuid },
    { name: "after", in: "query", schema: uuid },
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    },
  ],
};
const doc = {
  openapi: "3.1.0",
  info: {
    title: "KostHospitality staff booking and initial invoice",
    version: "0.6.0",
  },
  description:
    "Staff-recorded consent is not resident account agreement acceptance. Pending requests do not reserve. Accept creates allocation+immutable invoice+audit+outbox atomically; minimum0 confirmed without payment receipt. Future price/room or expiry requires refresh with new consent. No payment verification/proof/check-in API here. Internal worker processes expiry and in-app; customer transactional business email not configured.",
  paths: {
    "/api/v1/organizations/{org}/rooms/{id}/initial-ready": {
      post: {
        ...post(decisionInput),
        description:
          "Initial readiness only: inspection, verified Owner/Manager, complete recorded checklist, no occupancy/lease history, no open blocking work order, no block covering local today. Future allocations remain enforced. Returns room projection from inventory API.",
      },
    },
    "/api/v1/organizations/{org}/customers": {
      get: {
        ...list,
        description:
          "Owner/Manager/Finance location. Customer projection {id,name,phone,email}; private tenant and customer_locations scope.",
      },
    },
    "/api/v1/organizations/{org}/bookings": {
      get: list,
      post: {
        ...post(intakeInput),
        parameters: [parameters[0], post(intakeInput).parameters[2]],
        description:
          "Owner/Manager. Exactly one of customer/new object or customerId. quote actor must be current staff. Contact and booking/consent/audit are atomic; returns Booking projection.",
      },
    },
    "/api/v1/organizations/{org}/bookings/{id}/refresh-quote": {
      post: {
        ...post(refreshInput),
        description:
          "Pending only, same room/start/end/occupants; requires new actor quote and staff-recorded confirmation, version increments; consent append-only.",
      },
    },
    "/api/v1/organizations/{org}/bookings/{id}/accept": {
      post: {
        ...post(decisionInput),
        description:
          "Owner/Manager assigned location, returns {booking:Booking,invoice:{id,number}}. Pending CAS, fresh snapshot, active entitlement, physical checklist/ready/presence and exclusion validation. All changes rollback on conflict.",
      },
    },
    "/api/v1/organizations/{org}/bookings/{id}/reject": {
      post: {
        ...post(decisionInput),
        description:
          "Pending only. Retains reason/history, no allocations or invoices created.",
      },
    },
    "/api/v1/organizations/{org}/invoices": {
      get: {
        ...list,
        description:
          "Owner/Manager/Finance location. Read only immutable original invoice and lines. No UI/API paid flag or payment acceptance.",
      },
    },
    "/api/v1/organizations/{org}/notifications": {
      get: {
        ...get,
        parameters: [parameters[0], ...list.parameters.slice(2)],
        description:
          "Actor-only membership/location-scoped in-app, paginated. {id,title,bookingId,createdAt,readAt}. Worker event+recipient dedupe, not external email delivery.",
      },
    },
  },
  "x-projections": {
    Booking: [
      "id",
      "propertyId",
      "roomId",
      "roomCode",
      "customerId",
      "customerName",
      "state",
      "version",
      "start",
      "end",
      "plannedMonths",
      "occupantCount",
      "snapshot",
      "quoteExpiresAt",
      "holdDeadline",
      "acceptedAt",
      "decisionReason",
      "createdAt",
    ],
    Invoice: [
      "id",
      "bookingId",
      "number",
      "state",
      "total",
      "dueAt",
      "issuedAt",
      "voidReason",
      "billTo",
      "snapshot",
      "balance",
      "paymentStatus",
      "verifiedReceived",
      "lines[{id,kind,code,label,amount,start,end,refundable}]",
    ],
    "snapshot-contract":
      "{schemaVersion:1,quoteId,roomId,propertyId,requestedStart,requestedEnd:null|date,occupantCount,pricing:QuoteSnapshot,initialInvoiceLines:QuoteLine[]}; QuoteSnapshot defined api/pricing.openapi.json",
    "payment-state":
      "verifiedReceived currently0 because payment module disabled; balance issued total, void0; paid only when total0, no receipt. Adjustments schema exists but no command/grant; future ledger must replace projection before enabling payment.",
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: "apiKey", in: "cookie", name: "session" },
    },
  },
};
const out = doc as any;
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const nullableStamp = { type: ["string", "null"], format: "date-time" },
  stamp = { type: "string", format: "date-time" },
  date = { type: "string", format: "date" },
  str = { type: "string" },
  integer = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const initialLine = {
  $ref: "./pricing.openapi.json#/components/schemas/QuoteSnapshot/properties/lines/items",
};
const snapshot = object({
  schemaVersion: { const: 1 },
  quoteId: uuid,
  roomId: uuid,
  propertyId: uuid,
  requestedStart: date,
  requestedEnd: { type: ["string", "null"], format: "date" },
  occupantCount: { type: "integer", minimum: 1 },
  pricing: { $ref: "./pricing.openapi.json#/components/schemas/QuoteSnapshot" },
  initialInvoiceLines: { type: "array", items: initialLine },
});
const booking = object({
  id: uuid,
  propertyId: uuid,
  roomId: uuid,
  roomCode: str,
  customerId: uuid,
  customerName: str,
  state: {
    enum: [
      "pending",
      "held",
      "confirmed",
      "rejected",
      "expired",
      "cancelled",
      "checked_in",
      "checked_out",
    ],
  },
  version: { type: "integer", minimum: 1 },
  start: date,
  end: { type: ["string", "null"], format: "date" },
  plannedMonths: { type: "integer", minimum: 1, maximum: 60 },
  occupantCount: { type: "integer", minimum: 1 },
  snapshot,
  quoteExpiresAt: stamp,
  holdDeadline: nullableStamp,
  acceptedAt: nullableStamp,
  decisionReason: { type: ["string", "null"] },
  createdAt: stamp,
});
const customer = object({
  id: uuid,
  name: str,
  phone: str,
  email: { type: ["string", "null"], format: "email" },
});
const invoiceLine = object({
  id: uuid,
  kind: { enum: ["rent", "fee", "deposit"] },
  code: str,
  label: str,
  amount: integer,
  start: date,
  end: date,
  refundable: { type: "boolean" },
});
const invoice = object({
  id: uuid,
  bookingId: uuid,
  number: str,
  state: { enum: ["issued", "void"] },
  total: integer,
  dueAt: stamp,
  issuedAt: stamp,
  voidReason: { type: ["string", "null"] },
  billTo: object({
    name: str,
    phone: str,
    email: { type: ["string", "null"], format: "email" },
  }),
  snapshot,
  balance: integer,
  paymentStatus: { enum: ["unpaid", "paid", "overdue", "void"] },
  verifiedReceived: { const: 0 },
  overdue: { type: "boolean" },
  lines: { type: "array", items: invoiceLine },
});
const notification = object({
  id: uuid,
  title: str,
  bookingId: uuid,
  createdAt: stamp,
  readAt: nullableStamp,
});
out.components.schemas = {
  Booking: booking,
  Customer: customer,
  InitialInvoice: invoice,
  BookingPricingSnapshot: snapshot,
  Notification: notification,
};
const response = (schema: unknown) => ({
  description: "Typed scoped resource",
  content: { "application/json": { schema } },
});
const collection = (item: unknown) =>
  object({
    items: { type: "array", items: item },
    nextCursor: { type: ["string", "null"], format: "uuid" },
  });
for (const [name, schema] of [
  ["customers", customer],
  ["bookings", booking],
  ["invoices", invoice],
  ["notifications", notification],
] as const)
  out.paths["/api/v1/organizations/{org}/" + name].get.responses[200] =
    response(collection(schema));
for (const code of [200, 201])
  out.paths["/api/v1/organizations/{org}/bookings"].post.responses[code] =
    response(booking);
for (const action of ["refresh-quote", "reject"])
  out.paths[
    "/api/v1/organizations/{org}/bookings/{id}/" + action
  ].post.responses[200] = response(booking);
out.paths[
  "/api/v1/organizations/{org}/bookings/{id}/accept"
].post.responses[200] = response(
  object({ booking, invoice: object({ id: uuid, number: str }) }),
);
await writeFile(
  "api/booking.openapi.json",
  JSON.stringify(doc, null, 2) + "\n",
);
