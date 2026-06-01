import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const switchRoleSchema = z.object({
  role: z.enum(["ADMIN", "COMMERCIAL"]),
});

/**
 * EP15-S04 / ADR-0009 D5 : changement de mot de passe du compte authentifie.
 * Aucun identifiant de cible n'est accepte ici : la cible est toujours
 * req.user.userId (protection anti-mass-assignment). Les champs inattendus
 * eventuellement injectes (userId, email...) sont simplement ignores par le
 * parse, la robustesse du nouveau mot de passe est verifiee par passwordPolicy
 * dans la route (pas ici) pour pouvoir renvoyer des messages d'erreur clairs.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
