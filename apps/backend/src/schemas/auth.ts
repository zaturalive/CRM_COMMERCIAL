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

/**
 * EP15-S03 : demande de reset de mot de passe oublie.
 * tenantSlug est requis : un email peut exister dans plusieurs cabinets (User
 * est @@unique([tenantId, email]), pas unique globalement). On resout l'user par
 * (tenant, email). La reponse reste identique que le compte existe ou non (AC2).
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * EP15-S03 : consommation du token de reset. La robustesse de newPassword est
 * verifiee par passwordPolicy dans la route (pas ici), pour renvoyer un message
 * d'erreur clair (AC3) et ne pas consommer le token sur un echec de policy.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
