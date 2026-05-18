import { z } from "zod";

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
});
