import { z } from "zod";

// Accepte UUID et prefixes seed/fake (isolation par Prisma tenant).
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

export const createDocumentLabelSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  isRequiredByDefault: z.boolean().default(true),
  documentTemplateId: idSchema.optional().nullable(),
});

export const updateDocumentLabelSchema = createDocumentLabelSchema.partial();

// ─── Association Intervention ↔ DocumentLabel ───────────────────────────────
// Payload UNION : soit un label existant par id, soit creation inline.
// Cf CDCT v1.5 §5.4.

export const attachLabelSchema = z.union([
  z.object({
    documentLabelId: idSchema,
    isRequired: z.boolean().optional(),
    order: z.number().int().optional(),
  }),
  z.object({
    newLabel: z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional().nullable(),
      isRequiredByDefault: z.boolean().default(true),
    }),
    isRequired: z.boolean().optional(),
    order: z.number().int().optional(),
  }),
]);

export const updateAssocSchema = z.object({
  isRequired: z.boolean().optional(),
  order: z.number().int().optional(),
});
