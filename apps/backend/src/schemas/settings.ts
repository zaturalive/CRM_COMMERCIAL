import { z } from "zod";

/**
 * Template de devis : mentions legales/commerciales du cabinet, pre-remplies une
 * fois et appliquees a chaque devis (PDF). Stocke dans Tenant.settings.legal.
 * Tous les champs sont optionnels — `resolveLegalMentions` fournit des fallbacks.
 */
export const devisLegalSchema = z
  .object({
    raisonSociale: z.string().max(255).optional(),
    siret: z.string().max(50).optional(),
    adresse: z.string().max(500).optional(),
    telephone: z.string().max(50).optional(),
    email: z.string().max(255).optional(),
    validiteJours: z.number().int().min(1).max(365).optional(),
    cgvReference: z.string().max(500).optional(),
    // Couleur d'accent du devis (bandeaux PDF). Format hex #RRGGBB.
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB)")
      .optional(),
  })
  .strict();

export const updateSettingsSchema = z.object({
  acompteDefaultAmount: z
    .number()
    .int()
    .min(0, "Montant doit etre >= 0 centimes")
    .max(100_000_000, "Montant doit etre <= 1 000 000 €")
    .optional(),
  name: z.string().min(1).max(255).optional(),
  // F8 : si true, les process avancent automatiquement quand
  // canTransitionTo() est OK pour le stage suivant.
  autoAdvanceProcesses: z.boolean().optional(),
  // Template de devis (mentions legales) -> merge dans Tenant.settings.legal.
  legal: devisLegalSchema.optional(),
});
