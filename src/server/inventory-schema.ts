import { z } from "zod";
export const pgInt = z.number().int().min(1).max(2147483647);
export const code = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[^\p{C}]+$/u);
export const facilities = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\p{C}]+$/u),
  )
  .max(50)
  .refine(
    (v) => new Set(v.map((s) => s.toLocaleLowerCase("id"))).size === v.length,
  );
export const condition = z.enum([
  "inspection",
  "dirty",
  "maintenance",
  "inactive",
]);
export const typeInput = z
  .object({
    propertyId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    defaultCapacity: pgInt,
    defaultFacilities: facilities.default([]),
  })
  .strict();
export const roomInput = z
  .object({
    propertyId: z.uuid(),
    code,
    floor: pgInt,
    typeId: z.uuid(),
    capacity: pgInt.optional(),
    facilities: facilities.optional(),
    condition: z.literal("inspection").default("inspection"),
  })
  .strict();
export const profileInput = z
  .object({
    version: pgInt,
    code,
    floors: pgInt,
    segment: z.enum(["Mahasiswi", "Karyawati", "Mahasiswi & karyawati"]),
    address: z.string().trim().max(1000).nullable().optional(),
    contactPhone: z.string().trim().max(60).nullable().optional(),
    contactEmail: z
      .union([z.email().max(254), z.literal(""), z.null()])
      .optional(),
  })
  .strict();
const row = z.object({ code, floor: pgInt }).strict();
export const bulkInput = z.union([
  z
    .object({
      mode: z.literal("sequence").optional(),
      propertyId: z.uuid(),
      typeId: z.uuid(),
      prefix: z
        .string()
        .trim()
        .max(24)
        .regex(/^[^\p{C}]*$/u),
      startNumber: pgInt,
      count: z.number().int().min(1).max(100),
      floor: pgInt,
      padding: z.number().int().min(1).max(12).default(1),
    })
    .strict(),
  z
    .object({
      mode: z.literal("pilot"),
      propertyId: z.uuid(),
      typeId: z.uuid(),
      rooms: z.array(row).length(12).optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("manual"),
      propertyId: z.uuid(),
      typeId: z.uuid(),
      rooms: z.array(row).min(1).max(100),
    })
    .strict(),
]);
export const commitInput = z
  .object({
    propertyId: z.uuid(),
    previewChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    confirmCodes: z.literal(true),
    confirmLayout: z.literal(true),
  })
  .strict();
export const updateRoomInput = z
  .object({
    version: pgInt,
    code,
    floor: pgInt,
    typeId: z.uuid(),
    capacity: pgInt,
    facilities,
    condition,
    applyTypeDefaults: z.boolean().default(false),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const checklistInput = z
  .object({
    version: pgInt,
    roomVersion: pgInt,
    water: z.boolean(),
    electric: z.boolean(),
    lock: z.boolean(),
    furniture: z.boolean(),
    clean: z.boolean(),
  })
  .strict();
