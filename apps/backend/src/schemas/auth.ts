import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * EP17 — login editeur plateforme (PlatformAdmin). Pas de tenantSlug :
 * l'editeur n'appartient a aucun cabinet (ADR-0009 D1). L'email est unique
 * globalement sur PlatformAdmin (lookup direct, distinct du carnet User).
 */
export const editorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type EditorLoginInput = z.infer<typeof editorLoginSchema>;

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

/**
 * EP14-S01 — verification d'un code TOTP. Deux usages :
 *   - setup confirme (authentifie, JWT) : seul `token` est present, la route
 *     active la MFA et renvoie les recovery codes.
 *   - challenge de login (etape 2) : `pendingToken` (emis a l'etape 1) + `token`,
 *     la route emet le JWT d'acces (mfaVerified: true).
 * `pendingToken` est donc optionnel : la route discrimine les deux chemins.
 */
export const twoFactorVerifySchema = z.object({
  token: z.string().min(1),
  pendingToken: z.string().min(1).optional(),
});

export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;

/**
 * EP14-S01 AC6 — usage d'un code de secours one-shot. Toujours via le challenge
 * de login (pendingToken de l'etape 1) : la recovery remplace le code TOTP quand
 * l'authenticator est perdu, elle n'est pas un chemin authentifie nominal.
 */
export const twoFactorRecoverySchema = z.object({
  pendingToken: z.string().min(1),
  recoveryCode: z.string().min(1),
});

export type TwoFactorRecoveryInput = z.infer<typeof twoFactorRecoverySchema>;

/**
 * 2FA par email — etape 2 du login : pendingToken (emis a l'etape 1) + code OTP
 * a 6 chiffres recu par email. La route emet le JWT d'acces sur succes. Le code
 * est strictement 6 chiffres (l'OTP est numerique, cf. lib/emailOtp.ts).
 */
export const twoFactorVerifyEmailSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type TwoFactorVerifyEmailInput = z.infer<typeof twoFactorVerifyEmailSchema>;

/**
 * 2FA par email — renvoi d'un nouveau code OTP (email perdu / code expire).
 * Seul le pendingToken de l'etape 1 est requis : la route regenere et renvoie.
 */
export const twoFactorEmailResendSchema = z.object({
  pendingToken: z.string().min(1),
});

export type TwoFactorEmailResendInput = z.infer<typeof twoFactorEmailResendSchema>;

/**
 * Connexion Google (SSO) — echange serveur-a-serveur. Le serveur NextAuth a deja
 * verifie le jeton Google ; il transmet l'email verifie + le secret partage. Pas
 * d'autre champ : l'identite vient de l'email Google, le tenant est resolu cote
 * backend.
 */
export const googleSsoSchema = z.object({
  email: z.string().email(),
  secret: z.string().min(1),
});

export type GoogleSsoInput = z.infer<typeof googleSsoSchema>;
