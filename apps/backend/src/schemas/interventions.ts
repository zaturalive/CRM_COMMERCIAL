import { z } from "zod";

const price = z.number().int().min(0);

export const createInterventionSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(["CHIRURGIE", "MED_ESTH", "SOIN"]),
  duration: z.number().int().min(1),
  priceHonoraires: price,
  marginCoeff: z.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateInterventionSchema = createInterventionSchema.partial();

// ─── InterventionFee ────────────────────────────────────────────────────────

export const interventionFeeSchema = z.object({
  label: z.string().min(1).max(255),
  defaultPrice: price,
  defaultQuantity: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateInterventionFeeSchema = interventionFeeSchema.partial();
