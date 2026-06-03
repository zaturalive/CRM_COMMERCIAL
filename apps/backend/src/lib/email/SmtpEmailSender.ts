import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailSender } from "./EmailSender";
import { logger } from "../logger";

/**
 * EmailSender SMTP (nodemailer). Branche un serveur SMTP : Mailpit en dev local
 * (capture les mails + UI web), un relais auto-heberge ou Brevo en prod. ADR-0009 D7.
 *
 * Le canal transporte un lien avec token (reset / set-password), pas un secret en
 * clair ni un hash : c'est le port d'envoi, le contenu reste de la responsabilite
 * de l'appelant (route forgot-password / admin reset).
 */
export interface SmtpConfig {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
}

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // secure=false : STARTTLS opportuniste. Mailpit ecoute en clair sur le reseau
      // docker interne ; en prod le relais peut negocier TLS.
      secure: false,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    logger.info(
      { to: message.to, subject: message.subject },
      "SmtpEmailSender: email envoye",
    );
  }
}
