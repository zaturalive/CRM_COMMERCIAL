import { z } from "zod";

export const MESSAGE_KINDS = ["MAIL", "SMS_WHATSAPP", "VIDEO"] as const;
export const FOLLOWUP_SUB_STAGES = [
  "J0",
  "J1",
  "J3",
  "J7",
  "J14",
  "J30",
  "ABANDON",
] as const;

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

/**
 * Validation conditionnelle :
 *   - kind=MAIL → subject requis
 *   - kind=VIDEO → mediaUrl requis (URL valide)
 */
export const createMessageTemplateSchema = z
  .object({
    name: z.string().min(1).max(200),
    kind: z.enum(MESSAGE_KINDS),
    subject: z.string().max(500).optional().nullable(),
    body: z.string().min(1).max(10_000),
    mediaUrl: z.string().url().optional().nullable(),
    previewImageUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "MAIL" && (!v.subject || v.subject.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Objet requis pour un template MAIL",
      });
    }
    if (v.kind === "VIDEO" && !v.mediaUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "URL video requise pour un template VIDEO",
      });
    }
  });

export const updateMessageTemplateSchema = createMessageTemplateSchema
  .innerType()
  .partial();

export const listMessageTemplatesQuerySchema = z.object({
  kind: z.enum(MESSAGE_KINDS).optional(),
  active: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const bindInterventionMessageTemplateSchema = z.object({
  messageTemplateId: idSchema,
  targetSubStage: z.enum(FOLLOWUP_SUB_STAGES).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

export const updateInterventionMessageTemplateSchema = z.object({
  targetSubStage: z.enum(FOLLOWUP_SUB_STAGES).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

/**
 * Envoi de message (mode demo no-op).
 * Le commercial peut envoyer un template existant (avec customizations) ou
 * un message ad-hoc (sans messageTemplateId).
 */
export const sendMessageSchema = z.object({
  messageTemplateId: idSchema.optional().nullable(),
  kind: z.enum(MESSAGE_KINDS),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).max(10_000),
  mediaUrl: z.string().url().optional().nullable(),
});
