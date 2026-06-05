import { env } from "../../config/env";
import { NoopEmailSender, type EmailSender } from "./EmailSender";
import { SmtpEmailSender } from "./SmtpEmailSender";
import { BrevoApiEmailSender } from "./BrevoApiEmailSender";
import { logger } from "../logger";

/**
 * Selectionne l'implementation EmailSender selon MAIL_PROVIDER. Le provider est
 * changeable par variable d'environnement sans toucher au code appelant :
 *  - "brevo-api" -> BrevoApiEmailSender (API HTTP Brevo sur 443). A PRIVILEGIER en
 *    prod : l'hebergeur (Scaleway) bloque les ports SMTP sortants (25/465/587), donc
 *    SmtpEmailSender timeout. L'API HTTP passe par le 443. Necessite BREVO_API_KEY.
 *  - "smtp"      -> SmtpEmailSender (Mailpit en dev local ; relais SMTP si dispo).
 *  - autre       -> NoopEmailSender (aucun envoi : self-service email inactif).
 */
export function createEmailSender(): EmailSender {
  if (env.MAIL_PROVIDER === "brevo-api") {
    if (!env.BREVO_API_KEY) {
      // Pas de cle -> on n'envoie rien plutot que de crasher (meme posture que Noop).
      logger.warn(
        "MAIL_PROVIDER=brevo-api mais BREVO_API_KEY est vide -> NoopEmailSender (aucun envoi).",
      );
      return new NoopEmailSender();
    }
    return new BrevoApiEmailSender({
      apiKey: env.BREVO_API_KEY,
      apiBase: env.BREVO_API_BASE,
      from: env.MAIL_FROM,
    });
  }
  if (env.MAIL_PROVIDER === "smtp") {
    return new SmtpEmailSender({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      from: env.MAIL_FROM,
      user: env.MAIL_USER,
      pass: env.MAIL_PASS,
    });
  }
  return new NoopEmailSender();
}
