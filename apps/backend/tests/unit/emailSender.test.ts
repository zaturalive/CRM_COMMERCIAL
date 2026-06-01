import { describe, it, expect } from "vitest";
import {
  NoopEmailSender,
  type EmailSender,
  type EmailMessage,
} from "../../src/lib/email/EmailSender";

/**
 * EP15-S03 / ADR-0009 D7 — Tests unitaires du port EmailSender et de son
 * implementation par defaut au demarrage (NoopEmailSender).
 *
 * Reference : docs/architecture/decisions/0009-preprod-foundations.md, section
 * D7 ("EmailSender + chemin degrade") ; docs/product/stories/EP15-S03.md, Notes
 * techniques ("interface EmailSender (impl SMTP auto-heberge ou Brevo free,
 * interchangeable)").
 *
 * POURQUOI un port (interface) : la decision verrouillee du brief
 * (BUILD-BRIEF-PREPROD-2026-06-01, section 3) est "email auto-heberge ou Brevo
 * gratuit, pas au demarrage". Le reset self-service ne doit pas bloquer faute
 * d'email configure. On isole donc l'envoi derriere une interface, avec une
 * implementation NoopEmailSender au demarrage qui n'envoie rien reellement (le
 * self-service par email reste inactif), et des implementations SMTP/Brevo
 * branchables ulterieurement sans toucher le code appelant.
 *
 * Phase TDD rouge : src/lib/email/EmailSender.ts n'existe pas encore, l'import
 * echoue tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   interface EmailMessage { to: string; subject: string; text: string;
 *                            html?: string }
 *   interface EmailSender  { send(message: EmailMessage): Promise<void> }
 *   class NoopEmailSender implements EmailSender — ne fait aucun envoi reseau,
 *     expose si possible un compteur/marqueur permettant a un test de verifier
 *     qu'aucun envoi reel n'a eu lieu.
 */

describe("EmailSender (port) + NoopEmailSender (ADR-0009 D7)", () => {
  const sampleMessage: EmailMessage = {
    to: "user@example.test",
    subject: "Reinitialisation de votre mot de passe",
    text: "Lien de reinitialisation: https://app.example.test/reset-password?token=...",
  };

  it("NoopEmailSender satisfait le contrat EmailSender (send -> Promise<void>)", async () => {
    // POURQUOI : le code appelant (route forgot-password) ne depend que de
    // l'interface ; il doit pouvoir consommer NoopEmailSender sans le savoir.
    const sender: EmailSender = new NoopEmailSender();
    const result = sender.send(sampleMessage);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it("NoopEmailSender n'effectue aucun envoi reel (self-service email inactif au demarrage)", async () => {
    // Au demarrage (D7), aucun provider n'est branche : l'implementation par
    // defaut ne doit pas tenter d'envoi reseau. On verifie via un marqueur
    // expose par l'implementation (sentCount / lastMessage) que rien n'est
    // "vraiment" envoye, seulement consigne en memoire/log.
    const sender = new NoopEmailSender();
    await sender.send(sampleMessage);
    // Le contrat de NoopEmailSender expose un compteur des messages consignes,
    // sans qu'aucun appel reseau ne soit declenche.
    expect(sender.sentCount).toBe(1);
    expect(sender.lastMessage?.to).toBe(sampleMessage.to);
  });

  it("NoopEmailSender ne consigne jamais le mot de passe en clair (seulement le lien de reset)", async () => {
    // Defense en profondeur : le canal email transporte un lien avec token, pas
    // un secret en clair. On verifie que le message consigne ne contient pas de
    // motif de hash bcrypt ni un champ "password".
    const sender = new NoopEmailSender();
    await sender.send(sampleMessage);
    const serialized = JSON.stringify(sender.lastMessage ?? {});
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(serialized.toLowerCase()).not.toContain("passwordhash");
  });
});
