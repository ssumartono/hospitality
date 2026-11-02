import { z } from "zod";
export const money = z.number().int().min(0).max(1000000000000);
export const fee = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,40}$/),
    label: z.string().trim().min(1).max(120),
    amount: money,
    frequency: z.enum(["once", "monthly"]),
    refundable: z.boolean(),
  })
  .strict();
export const policyInput = z
  .object({
    propertyId: z.uuid(),
    expectedVersion: z.number().int().min(0),
    effectiveAt: z.iso.datetime({ offset: true }),
    baseRent: money,
    typeRates: z.record(z.uuid(), money),
    roomRates: z.record(z.uuid(), money),
    depositEnabled: z.boolean(),
    depositAmount: money,
    fees: z.array(fee).max(30),
    cycle: z.enum(["anniversary", "calendar"]),
    prorata: z.enum(["none", "actual"]),
    dueDay: z.number().int().min(1).max(28),
    invoiceLeadDays: z.number().int().min(0).max(30),
    bookingMinimum: money,
    checkinMinimumPercent: z.number().int().min(1).max(100),
    holdHours: z.number().int().min(1).max(168),
    reviewHours: z.number().int().min(1).max(168),
    noticeDays: z.number().int().min(0).max(3650),
    cancellationDays: z.number().int().min(0).max(3650),
    refundBeforePercent: z.number().int().min(0).max(100),
    refundLatePercent: z.number().int().min(0).max(100),
    noShowRefundPercent: z.number().int().min(0).max(100),
    penaltyEnabled: z.boolean(),
    penaltyAmount: money,
    penaltyCap: money,
    graceDays: z.number().int().min(0).max(3650),
    electricityMode: z.enum(["prepaid_per_room", "included", "manual"]),
    notes: z.string().trim().max(4000),
  })
  .strict()
  .superRefine((p, c) => {
    if (!p.depositEnabled && p.depositAmount !== 0)
      c.addIssue({ code: "custom", message: "Disabled deposit must be zero" });
    if (!p.penaltyEnabled && (p.penaltyAmount || p.penaltyCap || p.graceDays))
      c.addIssue({ code: "custom", message: "Disabled penalty must be zero" });
    if (
      p.penaltyEnabled &&
      (!p.penaltyAmount || p.penaltyCap < p.penaltyAmount)
    )
      c.addIssue({ code: "custom", message: "Invalid penalty cap" });
    if (p.fees.some((f) => ["rent", "deposit"].includes(f.code.toLowerCase())))
      c.addIssue({ code: "custom", message: "Reserved fee code" });
    if (new Set(p.fees.map((f) => f.code.toLowerCase())).size !== p.fees.length)
      c.addIssue({ code: "custom", message: "Duplicate fee code" });
  });
export type Policy = z.infer<typeof policyInput>;
export const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((x) => {
    const d = new Date(x + "T00:00:00Z");
    return (
      Number.isFinite(+d) &&
      d.toISOString().slice(0, 10) === x &&
      +x.slice(0, 4) >= 2000 &&
      +x.slice(0, 4) <= 2199
    );
  }, "Invalid business date");
export const quoteInput = z
  .object({
    roomId: z.uuid(),
    start: businessDate,
    end: businessDate.nullable().optional(),
    occupantCount: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((x) => !x.end || x.end > x.start, "End must be after start");
