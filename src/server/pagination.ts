import { z } from "zod";
export const pagination = z
  .object({
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}
