import type { EmailMessage, EmailSender } from "./EmailSender";
import { logger } from "../logger";

/**
 * EmailSender via l'API HTTP de Brevo (POST /v3/smtp/email, port 443). ADR-0009 D7.
 *
 * POURQUOI l'API HTTP plutot que le SMTP (SmtpEmailSender) : l'hebergeur (Scaleway)
 * bloque les ports SMTP SORTANTS (25/465/587) au niveau reseau (anti-spam), donc le
 * SMTP timeout en prod (meme avec UFW grand ouvert). L'API HTTP passe par le 443
 * (jamais bloque) et reste robuste. Meme contrat que les autres senders : le canal
 * transporte un lien/OTP, jamais un secret en clair ni un hash.
 *
 * La cle API ne transite que dans l'en-tete `api-key` et n'apparait dans aucun log
 * (les erreurs ne consignent que le code HTTP + le corps tronque renvoye par Brevo).
 */
export interface BrevoApiConfig {
  apiKey: string;
  apiBase: string; // ex: https://api.brevo.com/v3
  from: string; // "email@domaine" ou "Nom <email@domaine>"
}

/**
 * Parse un from "Nom <email>" ou "email" vers le format attendu par Brevo
 * ({ email, name? }). Brevo exige un sender verifie (domaine authentifie SPF/DKIM).
 */
export function parseSender(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m && m[2]) {
    const name = m[1]?.trim();
    return name ? { email: m[2].trim(), name } : { email: m[2].trim() };
  }
  return { email: from.trim() };
}

export class BrevoApiEmailSender implements EmailSender {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly sender: { email: string; name?: string };

  constructor(config: BrevoApiConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = `${config.apiBase.replace(/\/+$/, "")}/smtp/email`;
    this.sender = parseSender(config.from);
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      }),
      // Borne dure : l'envoi est appele en fire-and-forget au login, mais on evite
      // qu'une requete pendante traine cote serveur si Brevo ne repond pas. 20s large.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      // Le corps d'erreur Brevo ({code,message}) ne contient pas de secret -> tronque
      // pour le diagnostic. La cle API n'apparait jamais dans le message.
      const body = await res.text().catch(() => "");
      throw new Error(`Brevo API HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    logger.info(
      { to: message.to, subject: message.subject },
      "BrevoApiEmailSender: email envoye (API HTTP)",
    );
  }
}
