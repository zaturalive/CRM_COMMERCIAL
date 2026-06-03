import { basePrisma } from "./prisma";
import { env } from "../config/env";
import type { EmailSender } from "./email/EmailSender";
import {
  generateResetToken,
  hashResetToken,
  INVITE_TOKEN_TTL_MS,
} from "./passwordResetToken";

/**
 * Invitation / provisioning par email (EP15 — remplace le mot de passe temporaire
 * affiche au front, decision D1).
 *
 * POURQUOI ce module : a la creation d'un utilisateur (ADMIN cabinet ou editeur
 * back-office) et lors d'un "renvoyer l'invitation / reinitialiser l'acces", on
 * ne montre JAMAIS de mot de passe. On cree un token (reutilise le modele
 * PasswordResetToken : meme machinerie one-shot/expiry que le reset, source
 * unique) et on envoie un lien /set-password?token=... par email. Le token ne
 * transite QUE par l'email, jamais par la reponse HTTP.
 *
 * La page /set-password consomme POST /api/auth/reset-password (token -> nouveau
 * mot de passe, mustChangePassword:false) : pas de nouvel endpoint a maintenir.
 */
export interface InvitationTarget {
  id: string;
  email: string;
  firstName?: string | null;
}

export type InvitationKind = "invitation" | "reset";

/**
 * Cree le token d'invitation et envoie l'email. Retourne true si l'email est
 * parti, false sinon (envoi en echec ou aucun provider branche). L'appelant
 * decide quoi en faire : ici on ne bloque pas la creation, on remonte le statut
 * pour que le front puisse proposer "renvoyer l'invitation" (chemin de secours
 * sans mot de passe en clair, decision D1).
 *
 * Securite : token 32 octets CSPRNG, stocke hashe (SHA-256), one-shot + expiry
 * geres par la machinerie passwordResetToken (reutilisee). Jamais le token ni un
 * mot de passe en reponse HTTP.
 */
export async function sendUserInvitation(
  emailSender: EmailSender,
  target: InvitationTarget,
  kind: InvitationKind = "invitation",
): Promise<boolean> {
  const token = generateResetToken();
  await basePrisma.passwordResetToken.create({
    data: {
      userId: target.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    },
  });

  const url = `${env.FRONTEND_URL}/set-password?token=${encodeURIComponent(token)}`;
  const isReset = kind === "reset";
  const subject = isReset
    ? "Reinitialisation de votre acces"
    : "Bienvenue — definissez votre mot de passe";
  const intro = isReset
    ? "La reinitialisation de votre acces a ete demandee."
    : "Un compte vient d'etre cree pour vous.";

  try {
    await emailSender.send({
      to: target.email,
      subject,
      text: `${intro}\n\nPour definir votre mot de passe, ouvrez ce lien (valable 7 jours) :\n${url}`,
      html: `<p>${intro}</p><p>Pour definir votre mot de passe, cliquez sur ce lien (valable 7 jours) :</p><p><a href="${url}">${url}</a></p>`,
    });
    return true;
  } catch {
    // Non-bloquant : l'utilisateur est cree, l'admin pourra "renvoyer
    // l'invitation". On ne renvoie aucun mot de passe en secours (D1).
    return false;
  }
}
