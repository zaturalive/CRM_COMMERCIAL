import { env } from "../../config/env";
import { NoopEmailSender, type EmailSender } from "./EmailSender";
import { SmtpEmailSender } from "./SmtpEmailSender";

/**
 * Selectionne l'implementation EmailSender selon MAIL_PROVIDER. Le provider est
 * changeable par variable d'environnement sans toucher au code appelant :
 *  - "smtp"  -> SmtpEmailSender (Mailpit en dev, relais auto-heberge / Brevo en prod)
 *  - autre   -> NoopEmailSender (aucun envoi : le self-service par email reste inactif)
 */
export function createEmailSender(): EmailSender {
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
