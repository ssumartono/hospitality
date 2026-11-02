import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { policyInput, quoteInput } from "../src/server/pricing-schema.js";
const responses = {
  200: { description: "Response scoped; exact projections below" },
  201: { description: "Created; idempotent replay may return 200" },
  401: { description: "AUTH_REQUIRED" },
  403: { description: "FORBIDDEN / CSRF / role denied" },
  404: { description: "NOT_FOUND including other tenant/location" },
  409: {
    description:
      "VERSION_CONFLICT, IDEMPOTENCY_MISMATCH or POLICY_NOT_CONFIGURED",
  },
  422: {
    description:
      "VALIDATION_ERROR, CAPACITY_EXCEEDED, QUOTE_RANGE_TOO_LONG, BOOKING_MINIMUM_EXCEEDS_INITIAL",
  },
};
const org = {
  name: "org",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
};
const path = (roles: string[], schema?: string) => ({
  security: [{ SessionCookie: [] }],
  "x-roles": roles,
  parameters: [org, ...(schema ? [key] : [])],
  responses,
  ...(schema
    ? {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/" + schema },
            },
          },
        },
      }
    : {}),
});
const doc = {
  openapi: "3.1.0",
  info: { title: "KostHospitality internal pricing API", version: "0.4.0" },
  description:
    "Internal authenticated preview only. No availability reservation/payment/consent. Dates are location business dates. All money integer IDR. Policies immutable; append complete version with expectedVersion. Quote stored snapshot expires in 15 minutes. GET expired snapshot remains historical; acceptance is not implemented.",
  paths: {
    "/api/v1/organizations/{org}/rate-policies": {
      get: {
        ...path(["Owner", "Manager", "Finance"]),
        parameters: [
          org,
          {
            name: "propertyId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "after",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        description:
          "Returns {items: PolicyVersion[],nextCursor: uuid|null,currentVersion: integer}. Version projection: {id,propertyId,version,effectiveAt,baseRent,config,actorId,createdAt}. Config contains all policy fields except IDs/effective/base/expectedVersion, and typeRates/roomRates maps. Sort by id cursor, UI may sort loaded versions.",
      },
      post: {
        ...path(["Owner", "Manager"], "RatePolicyRequest"),
        description:
          "Atomically append full policy + overrides + audit + idempotency. Unknown/cross-property override IDs return404. No PUT/PATCH/DELETE.",
      },
    },
    "/api/v1/organizations/{org}/quotes": {
      post: {
        ...path(["Owner", "Manager"], "QuoteRequest"),
        description:
          "Returns {id,createdAt,expiresAt,snapshot}. Snapshot contains policyId/version/effectiveAt/policy (full input), propertyId/timezone, roomId/version, occupantCount, resolvedRent/rateSource, currency/start/end/initialPeriodOnly, lines[{kind,code,label,amount,start,end,days,periodDays,refundable}],total,initialTotal,bookingMinimum,remainingAfterBooking,checkinMinimum,electricityMode,availabilityChecked:false. End null previews first period only, finite quote capped24periods. Policy selected at local midnight start, then room→type→base (including zero). Retry returns identical original expiry/snapshot.",
      },
    },
    "/api/v1/organizations/{org}/quotes/{id}": {
      get: {
        ...path(["Owner", "Manager"]),
        parameters: [
          org,
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        description:
          "Actor-only quote, returns {id,createdAt,expiresAt,expired,snapshot}. Historic snapshot unchanged after policy edits. No consent/booking action implemented.",
      },
    },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: "apiKey", in: "cookie", name: "session" },
    },
    schemas: {
      RatePolicyRequest: z.toJSONSchema(policyInput, {
        unrepresentable: "any",
      }),
      QuoteRequest: z.toJSONSchema(quoteInput, { unrepresentable: "any" }),
    },
  },
};
const out = doc as any;
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", additionalProperties: false, properties, required });
const uuid = { type: "string", format: "uuid" },
  stamp = { type: "string", format: "date-time" },
  day = { type: "string", format: "date" },
  integer = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const input = z.toJSONSchema(policyInput, { unrepresentable: "any" }) as any;
const configProps = { ...input.properties };
for (const k of ["propertyId", "expectedVersion", "effectiveAt", "baseRent"])
  delete configProps[k];
const config = object(configProps);
const version = object({
  id: uuid,
  propertyId: uuid,
  version: { type: "integer", minimum: 1 },
  effectiveAt: stamp,
  baseRent: input.properties.baseRent,
  config,
  actorId: uuid,
  createdAt: stamp,
});
const line = object({
  kind: { enum: ["rent", "fee", "deposit"] },
  code: { type: "string" },
  label: { type: "string" },
  amount: integer,
  start: day,
  end: day,
  days: integer,
  periodDays: { type: "integer", minimum: 1 },
  refundable: { type: "boolean" },
});
const snapshot = object({
  policyId: uuid,
  policyVersion: { type: "integer", minimum: 1 },
  policyEffectiveAt: stamp,
  policy: input,
  propertyId: uuid,
  timezone: { type: "string" },
  roomId: uuid,
  roomVersion: { type: "integer", minimum: 1 },
  occupantCount: { type: "integer", minimum: 1 },
  resolvedRent: integer,
  rateSource: { enum: ["room", "type", "property"] },
  currency: { const: "IDR" },
  start: day,
  end: day,
  initialPeriodOnly: { type: "boolean" },
  lines: { type: "array", items: line },
  total: integer,
  initialTotal: integer,
  bookingMinimum: integer,
  remainingAfterBooking: integer,
  checkinMinimum: integer,
  electricityMode: input.properties.electricityMode,
  availabilityChecked: { const: false },
});
const createdQuote = object({
  id: uuid,
  createdAt: stamp,
  expiresAt: stamp,
  snapshot,
});
out.components.schemas.PolicyVersion = version;
out.components.schemas.QuoteSnapshot = snapshot;
out.components.schemas.CreatedQuote = createdQuote;
out.components.schemas.HistoricalQuote = object({
  ...createdQuote.properties,
  expired: { type: "boolean" },
});
const jsonResponse = (schema: unknown, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const listPath = out.paths["/api/v1/organizations/{org}/rate-policies"];
listPath.get.responses[200] = jsonResponse(
  object({
    items: { type: "array", items: version },
    nextCursor: { type: ["string", "null"], format: "uuid" },
    currentVersion: integer,
  }),
  "Paginated immutable policy versions",
);
listPath.post.responses[201] = jsonResponse(version, "Created version");
listPath.post.responses[200] = jsonResponse(
  version,
  "Identical idempotent replay",
);
for (const code of [200, 201])
  out.paths["/api/v1/organizations/{org}/quotes"].post.responses[code] =
    jsonResponse(createdQuote, "Saved internal quote; not booking or payment");
out.paths["/api/v1/organizations/{org}/quotes/{id}"].get.responses[200] =
  jsonResponse(
    out.components.schemas.HistoricalQuote,
    "Actor-owned historical snapshot including expiry flag",
  );
out.components.schemas.RatePolicyRequest["x-invariants"] = [
  "deposit off requires amount0",
  "penalty off requires amount/cap/grace0; on amount>0 and cap>=amount",
  "fee codes case-insensitive unique; rent/deposit reserved",
  "override IDs must belong to same tenant/property",
  "expectedVersion must equal current max",
  "anniversary always full period; actual prorata calendar only",
];
await writeFile(
  "api/pricing.openapi.json",
  JSON.stringify(doc, null, 2) + "\n",
);
