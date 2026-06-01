import { z } from "zod";

/**
 * EP15-S02 — schemas de gestion des comptes users intra-cabinet (ADMIN).
 *
 * POURQUOI un enum borne a UserRole { ADMIN, COMMERCIAL } : le niveau editeur
 * est une table separee (PlatformAdmin, ADR-0009 D1) hors de portee de la route
 * tenant. Tout role hors de cet enum (EDITEUR, PLATFORM_ADMIN...) est rejete par
 * le parse -> 400 (errorHandler), ce qui ferme l'escalade de privilege par le
 * corps de requete (un ADMIN ne se promeut pas editeur).
 */
const userRole = z.enum(["ADMIN", "COMMERCIAL"]);

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: userRole,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * PATCH : desactiver/reactiver (active) et/ou changer le role intra-cabinet.
 * Au moins un champ doit etre present (refine) pour eviter un PATCH vide.
 * role est borne au meme enum -> un role plateforme rejete en 400.
 */
export const updateUserSchema = z
  .object({
    active: z.boolean().optional(),
    role: userRole.optional(),
  })
  .refine((data) => data.active !== undefined || data.role !== undefined, {
    message: "At least one of { active, role } is required",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
