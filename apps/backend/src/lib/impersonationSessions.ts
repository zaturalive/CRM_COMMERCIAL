/**
 * EP17-S04 — Registre de revocation des sessions d'observation editeur.
 *
 * ADR-0009 D2 : le jeton d'impersonation est un JWT autoportant signe (kind
 * "impersonation", editorId, tenantId, scope, exp). Il n'y a donc pas d'etat
 * serveur necessaire pour l'authentifier. La revocation (AC2 : "revocable a tout
 * moment") exige en revanche un point d'etat : on ne peut pas "annuler" un JWT
 * deja emis sans une liste de revocation cote serveur.
 *
 * POURQUOI une DENYLIST et non une ALLOWLIST : un jeton d'impersonation signe
 * avec le secret serveur (issu de /enter, ou forge legitimement avec le secret)
 * doit donner acces en lecture au tenant qu'il porte, sans qu'on ait a tracer
 * chaque emission. On ne refuse un jeton que s'il a ete explicitement revoque.
 * La cle de revocation est (editorId, tenantId) : un /leave coupe la session de
 * CET editeur sur CE tenant, sans toucher ses sessions sur d'autres tenants.
 *
 * On compare l'instant de revocation a l'iat du jeton (en ms). Un jeton emis
 * AVANT la revocation est refuse ; une nouvelle entree (/enter) posterieure
 * efface la revocation pour repartir d'une session fraiche.
 *
 * Stockage en memoire process : suffisant pour le perimetre socle/MVP (Mantra
 * #37). Une persistance (Redis / table) serait un durcissement ulterieur si la
 * revocation doit survivre a un redemarrage ou couvrir plusieurs instances.
 */

function sessionKey(editorId: string, tenantId: string): string {
  return `${editorId}:${tenantId}`;
}

// Cle -> instant de revocation (epoch ms). Un jeton dont iat*1000 <= revokedAt
// est considere revoque.
const revokedAt = new Map<string, number>();

/**
 * Ouvre (ou re-ouvre) une session d'observation. Efface une eventuelle
 * revocation anterieure pour cette cle, afin qu'un nouveau jeton emis juste
 * apres un /leave precedent ne soit pas faussement considere revoque.
 */
export function openImpersonationSession(editorId: string, tenantId: string): void {
  revokedAt.delete(sessionKey(editorId, tenantId));
}

/**
 * Revoque la session d'observation de l'editeur sur ce tenant (AC2). Tout jeton
 * deja emis pour cette cle est refuse a partir de maintenant.
 */
export function revokeImpersonationSession(editorId: string, tenantId: string): void {
  revokedAt.set(sessionKey(editorId, tenantId), Date.now());
}

/**
 * Indique si un jeton d'impersonation est revoque. iatSeconds est la claim iat
 * du JWT (en secondes epoch). Le jeton est revoque s'il a ete emis a ou avant
 * l'instant de revocation enregistre pour sa cle.
 */
export function isImpersonationRevoked(
  editorId: string,
  tenantId: string,
  iatSeconds: number,
): boolean {
  const revoked = revokedAt.get(sessionKey(editorId, tenantId));
  if (revoked === undefined) return false;
  return iatSeconds * 1000 <= revoked;
}

/**
 * Reinitialise le registre — usage test uniquement (isolation entre suites).
 */
export function _resetImpersonationSessions(): void {
  revokedAt.clear();
}
