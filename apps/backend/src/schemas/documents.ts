import { z } from "zod";

/**
 * Schemas ProcessDocument (EP06-S01).
 * - createManualSchema : ajout d'un document ad-hoc (sans label)
 * - patchStatusSchema : avancer le statut (EN_ATTENTE → RECU → VALIDE)
 * - patchNotesSchema : commentaire libre
 */

/**
 * Creation d'un ProcessDocument. 2 modes exclusifs :
 *   - Manuel : { name } seul → document ad-hoc (documentLabelId = null)
 *   - Depuis label : { documentLabelId } seul → name copie depuis le label
 */
export const createManualDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  documentLabelId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide").optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (b) => Boolean(b.name) !== Boolean(b.documentLabelId),
  "Fournir soit name (doc ad-hoc) soit documentLabelId (depuis catalogue), pas les deux"
);

/**
 * Batch attach : importer plusieurs labels du catalogue d'un coup.
 * Plus efficace que N calls createManualDocument en UI.
 */
export const attachLabelsSchema = z.object({
  labelIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide"))
    .min(1)
    .max(50),
});

export const patchDocumentSchema = z.object({
  status: z.enum(["EN_ATTENTE", "RECU", "VALIDE"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
});
