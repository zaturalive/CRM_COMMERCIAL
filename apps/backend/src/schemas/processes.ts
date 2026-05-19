import { z } from "zod";

export const PROCESS_STAGES = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
  "EFFECTUEE",
  "NON_QUALIFIE",
  "FOLLOWUP",
  "ANNULEE",
] as const;

export const PIPELINE_STAGES = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
] as const;

export const FOLLOWUP_REASONS = ["TEMPS", "ARGENT", "HESITATION", "AUTRE"] as const;

// ID : UUID (prod) OU prefixe seed/fake (dev only : seed-c-01, fake-p-007).
// L'isolation reste assuree par Prisma extended (tenant filter) qui 404
// si l'ID n'existe pas dans le tenant courant.
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

export const createProcessSchema = z.object({
  clientId: idSchema,
  interventionIds: z.array(idSchema).optional().default([]),
  budget: z.number().int().min(0).optional().nullable(),
});

export const stageTransitionSchema = z.object({
  targetStage: z.enum(PIPELINE_STAGES),
  force: z.boolean().optional().default(false),
});

export const nonQualifieSchema = z.object({
  reason: z.string().min(1, "Raison requise").max(200),
});

export const followupSchema = z.object({
  reason: z.enum(FOLLOWUP_REASONS),
  detail: z.string().max(500).optional().nullable(),
});

export const consultationDateSchema = z.object({
  consultationDate: z
    .string()
    .datetime({ message: "ISO datetime requis" })
    .nullable(),
});

export const qualificationSchema = z.object({
  isQualified: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
  intensity: z.number().int().min(1).max(10).optional().nullable(),
});

/**
 * Notes : ADR-0002 retire le role CHIRURGIEN et la noteMedecin.
 * Le COMMERCIAL et l'ADMIN ecrivent noteCommerciale.
 */
export const notesSchema = z.object({
  noteCommerciale: z.string().max(20_000).nullable(),
});

export const addInterventionSchema = z.object({
  interventionId: idSchema,
});
