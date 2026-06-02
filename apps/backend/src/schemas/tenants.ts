import { z } from "zod";
import { validateTenantSlug } from "../lib/tenantSlug";
import { isKnownCguVersion } from "../lib/postLoginRequirements";

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

/**
 * EP14-S02 — corps de POST /api/tenant/accept-cgu.
 *
 * - signatoryName : identite pro du signataire (RM4, saisie obligatoire). Trim
 *   puis min(1) -> une chaine vide ou uniquement des espaces est rejetee en 400
 *   sans muter la ligne Tenant.
 * - cguVersion : doit etre une version CONNUE (anti-downgrade, AC4). Une version
 *   inconnue ou absente est rejetee en 400. La version connue alimente
 *   Tenant.cguVersion ; le gate (RM5) comparera ensuite a la version courante.
 *
 * .strict() : tout champ inattendu (ex: tenantId, slug injectes pour tenter de
 * rediriger l'acceptation vers un autre cabinet) fait echouer le parse -> 400.
 * Le test d'isolation accepte 200 (champ ignore) ou 400 ; on choisit 400 (rejet
 * explicite) pour fermer le mass-assignment, le tenant cible restant de toute
 * facon req.user.tenantId cote handler.
 */
export const acceptCguSchema = z
  .object({
    signatoryName: z.string().trim().min(1, "Le nom du signataire est requis."),
    cguVersion: z.string().refine(isKnownCguVersion, {
      message: "Version CGU inconnue.",
    }),
  })
  .strict();

export type AcceptCguInput = z.infer<typeof acceptCguSchema>;
