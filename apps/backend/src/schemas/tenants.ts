import { z } from "zod";
import { validateTenantSlug } from "../lib/tenantSlug";

/**
 * EP17-S02 — validation des entrees du CRUD tenants (Back Office editeur).
 *
 * AC6 : slug unique (contrainte DB, traduite en 409 par errorHandler) + format
 * slug RFC 1035 (minuscules, chiffres, tirets ; pas d'underscore ; ne commence
 * ni ne finit par un tiret) + email admin valide. Toute violation de format est
 * une ZodError -> 400 par errorHandler, donc aucune creation partielle.
 *
 * Le format du slug est delegue a validateTenantSlug (source unique, lib pure et
 * testee unitairement) plutot que dedoubler le regex ici.
 */
const slugSchema = z.string().superRefine((value, ctx) => {
  const verdict = validateTenantSlug(value);
  if (!verdict.valid) {
    for (const message of verdict.errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  }
});

export const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
  admin: z.object({
    email: z.string().email(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
  }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

/**
 * PATCH : modification du nom et/ou du statut (AC3). Les deux champs sont
 * optionnels mais au moins un est requis (sinon rien a modifier). Le statut est
 * borne a l'enum TenantStatus (ACTIVE | SUSPENDED) — aucune autre valeur n'est
 * acceptee, donc pas d'etat arbitraire injecte.
 */
export const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((data) => data.name !== undefined || data.status !== undefined, {
    message: "Au moins un champ (name ou status) doit etre fourni.",
  });

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
