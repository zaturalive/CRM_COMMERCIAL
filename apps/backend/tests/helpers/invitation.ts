import type { Express } from "express";
import request from "supertest";
import type { EmailMessage, EmailSender } from "../../src/lib/email/EmailSender";

/**
 * Helper de test pour le provisioning par INVITATION email (EP15, decision D1).
 *
 * Les routes de creation / reinitialisation n'affichent plus de mot de passe :
 * elles envoient un lien /set-password (token) par email. Pour tester le flux
 * complet, on injecte ce RecordingEmailSender dans buildApp({ emailSender }), on
 * recupere le token capture, et on definit le mot de passe via
 * POST /api/auth/reset-password (le meme endpoint que la page /set-password).
 */
export class RecordingEmailSender implements EmailSender {
  public messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  get last(): EmailMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /** Dernier message envoye a un destinataire donne (les emails de test sont uniques). */
  lastFor(to: string): EmailMessage | undefined {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      if (this.messages[i].to === to) return this.messages[i];
    }
    return undefined;
  }

  reset(): void {
    this.messages.length = 0;
  }
}

/**
 * Extrait le token du lien ...?token=... contenu dans l'email (texte ou html).
 * Marche pour /set-password (invitation) comme pour /reset-password (oubli).
 */
export function extractTokenFromEmail(
  message: EmailMessage | undefined,
): string | null {
  if (!message) return null;
  const body = `${message.text ?? ""} ${message.html ?? ""}`;
  const match = body.match(/[?&]token=([^&\s"']+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Active un compte cree par invitation : recupere le token du dernier email
 * envoye a `email`, definit le mot de passe via /api/auth/reset-password, et
 * renvoie le mot de passe pose (pour un login ulterieur). Throw si pas de token
 * capture ou si le set echoue (le test echoue explicitement, pas en silence).
 */
export async function activateViaInvitation(
  app: Express,
  recorder: RecordingEmailSender,
  email: string,
  password = "Activate!Pass123",
): Promise<string> {
  const token = extractTokenFromEmail(recorder.lastFor(email));
  if (!token) {
    throw new Error(`Aucun token d'invitation capture pour ${email}`);
  }
  const res = await request(app)
    .post("/api/auth/reset-password")
    .send({ token, newPassword: password });
  if (res.status !== 200) {
    throw new Error(
      `set-password (reset-password) a echoue [${res.status}] pour ${email}`,
    );
  }
  return password;
}
