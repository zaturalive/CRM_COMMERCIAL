import { z } from "zod";

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Couleur attendue au format #RRGGBB");

// ─── BlockingPointTag (templates par cabinet) ──────────────────────────────

export const createBlockingPointTagSchema = z.object({
  label: z.string().min(1).max(120),
  color: colorSchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateBlockingPointTagSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    color: colorSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });

// ─── ProcessBlockingPoint (instance attachee a un process) ─────────────────

export const attachBlockingPointSchema = z.object({
  tagId: idSchema,
  note: z.string().max(2000).optional().nullable(),
});

export const updateBlockingPointSchema = z
  .object({
    note: z.string().max(2000).optional().nullable(),
    resolved: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });
