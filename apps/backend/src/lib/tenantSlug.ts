/**
 * Validation du slug de tenant — source unique (EP17-S02 AC6).
 *
 * Fonction pure : aucun acces base ni reseau, verdict deterministe pour une meme
 * entree. Le controle d'unicite du slug n'est PAS ici (il releve de la contrainte
 * DB @unique, traduite en 409 par errorHandler) ; cette fonction ne couvre que le
 * format.
 *
 * Regle (story EP17-S02 AC6) : format RFC 1035 (section 2.3.1, labels de nom de
 * domaine) — minuscules, chiffres et tirets internes, pas d'underscore, ne
 * commence ni ne finit par un tiret. La longueur d'un label DNS est bornee a 63
 * octets.
 */

// Etiquette RFC 1035 : commence/finit par [a-z0-9], tirets internes autorises.
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_MAX_LENGTH = 63;

export interface SlugValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTenantSlug(slug: string): SlugValidationResult {
  const errors: string[] = [];

  if (typeof slug !== "string" || slug.length === 0) {
    errors.push("Le slug est requis.");
    return { valid: false, errors };
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    errors.push(`Le slug ne doit pas depasser ${SLUG_MAX_LENGTH} caracteres.`);
  }

  if (!SLUG_PATTERN.test(slug)) {
    errors.push(
      "Slug invalide : minuscules, chiffres et tirets uniquement (pas d'underscore, ni de tiret en debut/fin)."
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Resolution host -> slug de tenant (EP14-S03 AC3/AC6).
 *
 * Fonction pure : aucun acces base ni reseau. Elle ne decide PAS qu'un tenant
 * existe — seulement quel slug un hote designe. La validite (tenant actif) est
 * tranchee par la base (GET /api/tenant/by-slug/:slug) et l'autorite reste le
 * JWT (ADR-0009). Le sous-domaine ne fait que pre-remplir le cabinet au login.
 *
 * @param host       valeur de l'en-tete Host (peut porter un port)
 * @param baseDomain domaine racine du deploiement, injecte pour rester testable
 *                   sans DNS (ex "vencor-crm.localhost" en local, "vencor-crm.com"
 *                   en prod). Le suffixe .localhost (RFC 6761 6.3) exerce le
 *                   chemin sous-domaine en local sans wildcard DNS ni certificat.
 * @returns le slug de cabinet si l'hote est un sous-domaine DIRECT (un seul
 *          label) distinct de www, sinon null (apex, www, hote hors base,
 *          multi-niveaux, Host absent -> fallback formulaire 3 champs).
 */
export function resolveTenantFromHost(
  host: string,
  baseDomain: string,
): string | null {
  if (typeof host !== "string" || host.length === 0) {
    return null;
  }

  // RFC 4343 : les noms DNS sont insensibles a la casse -> on normalise. Le port
  // (en-tete Host en dev Next sur :3000) ne fait pas partie du nom d'hote.
  const hostname = host.toLowerCase().split(":")[0];
  const base = baseDomain.toLowerCase();

  // L'apex (host === base) n'est pas un cabinet : fallback formulaire 3 champs.
  if (hostname === base) {
    return null;
  }

  // Un sous-domaine direct se termine par ".<baseDomain>". Le point separateur
  // explicite evite qu'un suffixe trompeur (attaquant.notvencor-crm.localhost)
  // soit lu comme sous-domaine de la base.
  const suffix = `.${base}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  // Label restant une fois le suffixe retire. Le modele de la story est un label
  // unique de cabinet (un slug = un label DNS, RFC 1035) : un hote multi-niveaux
  // (a.b.vencor-crm.localhost) n'est pas un cabinet legitime -> fallback.
  const label = hostname.slice(0, -suffix.length);
  if (label.length === 0 || label.includes(".")) {
    return null;
  }

  // www n'est pas un cabinet (pas de tenant nomme "www").
  if (label === "www") {
    return null;
  }

  // Le label doit etre un slug RFC 1035 valide (meme regle que validateTenantSlug).
  if (!validateTenantSlug(label).valid) {
    return null;
  }

  return label;
}
