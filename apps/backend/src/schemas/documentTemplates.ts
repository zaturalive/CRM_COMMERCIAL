import { z } from "zod";

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

/**
 * EP10 simplifie : un DocumentTemplate = un PDF uploade (kind=PDF_UPLOADED
 * implicite). Le commercial telecharge le PDF tel quel pour l'envoyer au
 * patient hors-CRM. Pas de rendu HTML→PDF avec variables — KISS.
 *
 * `fileUrl` est rempli apres upload via la route POST /upload (Multer).
 * `bodyHtml` reste dans le schema Prisma (champ existant) mais n'est plus
 * alimente — laisse pour migration backward-compat.
 */
export const createDocumentTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  fileUrl: z.string().min(1).max(500),
  isActive: z.boolean().optional(),
});

export const updateDocumentTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  fileUrl: z.string().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});

export const listDocumentTemplatesQuerySchema = z.object({
  active: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const bindInterventionDocumentTemplateSchema = z.object({
  documentTemplateId: idSchema,
  order: z.number().int().min(0).optional(),
});
