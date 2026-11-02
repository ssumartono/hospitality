import { z } from "zod";
import { writeFile } from "node:fs/promises";
import {
  blockInput,
  releaseBlockInput,
  interval,
} from "../src/server/allocation-schema.js";
const uuid = { type: "string", format: "uuid" },
  date = { type: "string", format: "date" },
  stamp = { type: "string", format: "date-time" },
  nullableDate = { type: ["string", "null"], format: "date" };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const block = obj({
  id: uuid,
  roomId: uuid,
  propertyId: uuid,
  start: date,
  end: nullableDate,
  reason: { type: "string" },
  state: { enum: ["active", "released"] },
  version: { type: "integer", minimum: 1 },
  createdAt: stamp,
  releasedAt: { type: ["string", "null"], format: "date-time" },
  releaseReason: { type: ["string", "null"] },
});
const availability = obj({
  roomId: uuid,
  start: date,
  end: nullableDate,
  condition: {
    enum: ["inspection", "ready", "dirty", "maintenance", "inactive"],
  },
  available: { type: "boolean" },
  reasons: {
    type: "array",
    items: {
      enum: ["ROOM_NOT_READY", "ALLOCATION_CONFLICT", "ACTIVE_PRESENCE"],
    },
  },
  checkedAt: stamp,
  reservationCreated: { const: false },
});
const idParams = [
  { name: "org", in: "path", required: true, schema: uuid },
  { name: "id", in: "path", required: true, schema: uuid },
];
const response = (schema: unknown) => ({
  description: "Scoped response",
  content: { "application/json": { schema } },
});
const get = (schema: unknown) => ({
  security: [{ SessionCookie: [] }],
  parameters: idParams,
  responses: {
    200: response(schema),
    401: { description: "AUTH_REQUIRED" },
    404: { description: "NOT_FOUND including other tenant/location" },
    422: { description: "VALIDATION_ERROR" },
  },
});
const post = (schema: unknown) => ({
  ...get(block),
  "x-roles": ["Owner", "Manager"],
  parameters: [
    ...idParams,
    {
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 16, maxLength: 128 },
    },
  ],
  requestBody: { required: true, content: { "application/json": { schema } } },
  responses: {
    ...get(block).responses,
    201: response(block),
    403: { description: "FORBIDDEN / Origin / CSRF / role denied" },
    409: {
      description:
        "AVAILABILITY_CONFLICT, ACTIVE_PRESENCE, VERSION_CONFLICT, INVALID_STATE or IDEMPOTENCY_MISMATCH",
    },
  },
});
const doc = {
  openapi: "3.1.0",
  info: { title: "KostHospitality allocation/block API", version: "0.5.0" },
  description:
    "Internal operational block/query only. All dates location date-only, intervals[start,end), end omitted/null is infinity. Availability is advisory at checkedAt and does not reserve. Inspection is never available. No mark-ready/archive or booking acceptance/check-in API yet. Active physical presence remains a blocker independently of allocation end. Block creation/release audited atomically with allocation; restricted SaaS does not prevent managing existing operational obligations.",
  paths: {
    "/api/v1/organizations/{org}/rooms/{id}/blocks": {
      get: {
        ...get(
          obj({
            items: { type: "array", items: block },
            nextCursor: { type: ["string", "null"], format: "uuid" },
          }),
        ),
        parameters: [
          ...idParams,
          { name: "after", in: "query", schema: uuid },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        "x-roles": ["Owner", "Manager", "Finance", "Operations"],
      },
      post: post(z.toJSONSchema(blockInput, { unrepresentable: "any" })),
    },
    "/api/v1/organizations/{org}/room-blocks/{id}/release": {
      post: {
        ...post(z.toJSONSchema(releaseBlockInput, { unrepresentable: "any" })),
        description:
          "id is blockId. Only active/version-matching block can transition to released. Retry key returns original result; no delete/reactivate, no room condition change.",
      },
    },
    "/api/v1/organizations/{org}/rooms/{id}/availability": {
      get: {
        ...get(availability),
        parameters: [
          ...idParams,
          { name: "start", in: "query", required: true, schema: date },
          { name: "end", in: "query", schema: date },
        ],
        "x-roles": ["Owner", "Manager", "Finance", "Operations"],
      },
    },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: "apiKey", in: "cookie", name: "session" },
    },
    schemas: {
      Block: block,
      Availability: availability,
      Interval: z.toJSONSchema(interval, { unrepresentable: "any" }),
    },
  },
};
await writeFile(
  "api/allocation.openapi.json",
  JSON.stringify(doc, null, 2) + "\n",
);
