import { z } from "zod";
export const customerInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(5).max(40),
    email: z.email().max(254).optional(),
  })
  .strict();
export const intakeInput = z
  .object({
    quoteId: z.uuid(),
    plannedMonths: z.number().int().min(1).max(60),
    policyAccepted: z.literal(true),
    consentNote: z.string().trim().min(3).max(1000),
    customer: customerInput.optional(),
    customerId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.customer) !== Boolean(v.customerId),
    "Choose new or existing customer",
  );
export const refreshInput = z
  .object({
    version: z.number().int().min(1),
    quoteId: z.uuid(),
    policyAccepted: z.literal(true),
    consentNote: z.string().trim().min(3).max(1000),
  })
  .strict();
export const decisionInput = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export const readyInput = decisionInput;
