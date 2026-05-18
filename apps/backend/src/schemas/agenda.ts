import { z } from "zod";

/**
 * Query GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 * from inclus, to inclus. Les bornes sont converties en DateTime UTC
 * (00:00 et 23:59:59) cote route.
 */
export const agendaQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
});
