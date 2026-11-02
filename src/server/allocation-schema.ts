import { z } from "zod";
import { businessDate } from "./pricing-schema.js";
export const interval = z
  .object({ start: businessDate, end: businessDate.nullable().optional() })
  .strict()
  .refine((v) => !v.end || v.end > v.start, "End must be after start");
export const blockInput = z
  .object({
    start: businessDate,
    end: businessDate.nullable().optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict()
  .refine((v) => !v.end || v.end > v.start, "End must be after start");
export const releaseBlockInput = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export function intervalsOverlap(
  a: { start: string; end?: string | null },
  b: { start: string; end?: string | null },
) {
  return (!b.end || a.start < b.end) && (!a.end || b.start < a.end);
}
