/**
 * EP14-S01 — relais cote client entre l'etape 1 du login (mot de passe) et
 * l'etape 2 (code TOTP).
 *
 * POURQUOI sessionStorage (et non l'URL ni localStorage) : la charge porte le
 * mot de passe et le pendingToken, qui ne doivent ni transiter par la query
 * string (historique navigateur, logs reverse-proxy) ni persister apres la
 * fermeture de l'onglet. sessionStorage est cote client, ephemere, et la page
 * /login/2fa le purge des qu'elle l'a lu.
 */
export const PENDING_2FA_KEY = "crm-commercial:pending-2fa";

/**
 * Prefixe du message d'erreur authorize porteur du pendingToken quand le login
 * requiert un second facteur (EP14-S01 / AC4). Defini ici (module sans
 * dependance serveur) pour etre importable a la fois par lib/auth.ts (serveur,
 * NextAuth) et par les pages client (/login, /login/2fa) sans tirer le code
 * serveur de NextAuth dans le bundle client.
 */
export const TOTP_REQUIRED_PREFIX = "TOTP_REQUIRED:";

/**
 * Variante 2FA par email (OTP) — meme mecanique de relais que TOTP. Le backend
 * repond { step: "email_otp_required" }, authorize encode le pendingToken dans le
 * message d'erreur avec ce prefixe, /login le detecte et bascule vers /login/2fa
 * en mode email (code recu par email + bouton renvoyer), sans appli authenticator.
 */
export const EMAIL_OTP_REQUIRED_PREFIX = "EMAIL_OTP_REQUIRED:";

export interface Pending2faContext {
  email: string;
  password: string;
  tenantSlug: string;
  pendingToken: string;
  callbackUrl: string;
  // Methode du second facteur a saisir sur /login/2fa. Absent => "totp"
  // (retro-compat : l'ancien flux TOTP ne posait pas ce champ).
  method?: "totp" | "email";
}
