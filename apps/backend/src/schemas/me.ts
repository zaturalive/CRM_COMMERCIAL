import { z } from "zod";

/**
 * Mise a jour du PROPRE profil (PATCH /api/me/profile) — self-service.
 *
 * `.strict()` : toute cle hors firstName/lastName (role, active, email,
 * mfaEnabled, id, tenantId...) est rejetee en 400. Anti-mass-assignment /
 * anti-escalade : un user ne peut ni se promouvoir, ni se reactiver, ni changer
 * son email via cette route. L'email reste read-only (gestion ADMIN) ; le role
 * et active relevent de /api/users (ADMIN) et du Back Office.
 */
export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
