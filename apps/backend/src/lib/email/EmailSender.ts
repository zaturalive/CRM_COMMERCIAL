/**
 * Port d'envoi d'email — ADR-0009 D7.
 *
 * POURQUOI un port (interface) : la decision verrouillee du brief est "email
 * auto-heberge ou Brevo gratuit, pas au demarrage". Le reset self-service ne
 * doit pas bloquer faute d'email configure. On isole l'envoi derriere cette
 * interface ; l'implementation par defaut (NoopEmailSender) n'effectue aucun
 * envoi reseau au demarrage, et des implementations SMTP/Brevo se branchent
 * ulterieurement sans toucher le code appelant (route forgot-password).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

import { logger } from "../logger";

/**
 * Implementation par defaut au demarrage (ADR-0009 D7). N'effectue aucun envoi
 * reseau : le self-service par email reste inactif tant qu'un provider reel
 * (SMTP auto-heberge ou Brevo) n'est pas branche. Le message est seulement
 * consigne en memoire (compteur) et journalise au niveau debug pour permettre
 * un diagnostic, sans canal sortant.
 *
 * Defense en profondeur : le canal email transporte un lien avec token, jamais
 * un secret en clair ni un hash. Le message consigne ne doit donc pas contenir
 * de motif de hash bcrypt ni de champ secret.
 */
export class NoopEmailSender implements EmailSender {
  public sentCount = 0;
  public lastMessage: EmailMessage | null = null;

  async send(message: EmailMessage): Promise<void> {
    this.sentCount += 1;
    this.lastMessage = message;
    // POURQUOI debug et pas info : au demarrage, l'absence de provider est
    // attendue ; on trace l'evenement sans bruit, sans le corps complet.
    logger.debug(
      { to: message.to, subject: message.subject },
      "NoopEmailSender: email non envoye (aucun provider branche)",
    );
  }
}
