/**
 * Parsing de l'en-tete Host -> slug de cabinet (EP14-S03 AC3/AC6).
 *
 * Consomme par middleware.ts pour pre-remplir le tenant au login a partir du
 * sous-domaine. Fonction pure, extraite du middleware pour etre testable en
 * isolation (le middleware NextAuth lui-meme exige un runtime Next).
 *
 * L'isolation des donnees ne change pas (ADR-0009) : ce parsing ne fait que
 * choisir le cabinet a afficher/pre-remplir. Le backend tranche sur le JWT.
 *
 * Miroir front de resolveTenantFromHost cote backend (apps/backend/src/lib/
 * tenantSlug.ts) : meme contrat, pour que la resolution local (.localhost,
 * RFC 6761 6.3) et prod (.com) soit identique des deux cotes.
 */

// Etiquette RFC 1035 (section 2.3.1) : minuscules, chiffres, tirets internes ;
// ne commence ni ne finit par un tiret, pas d'underscore.
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_MAX_LENGTH = 63;

/**
 * @param host       valeur de l'en-tete Host (peut porter un port ; null/undefined
 *                   si l'en-tete est absent)
 * @param baseDomain domaine racine du deploiement, injecte pour rester testable
 *                   sans DNS ("vencor-crm.localhost" en local, "vencor-crm.com"
 *                   en prod)
 * @returns le slug de cabinet si l'hote est un sous-domaine DIRECT (un seul label)
 *          distinct de www, sinon null (apex, www, hote hors base, multi-niveaux,
 *          Host absent -> fallback formulaire 3 champs)
 */
export function parseTenantSubdomain(
  host: string | null | undefined,
  baseDomain: string,
): string | null {
  if (typeof host !== "string" || host.length === 0) {
    return null;
  }

  // RFC 4343 : noms DNS insensibles a la casse. Le port (dev Next :3000) ne fait
  // pas partie du nom d'hote.
  const hostname = host.toLowerCase().split(":")[0];
  const base = baseDomain.toLowerCase();

  // Apex -> fallback formulaire 3 champs.
  if (hostname === base) {
    return null;
  }

  // Sous-domaine direct : se termine par ".<baseDomain>". Le point separateur
  // explicite evite qu'un suffixe trompeur (attaquant.notvencor-crm.localhost)
  // soit lu comme sous-domaine de la base.
  const suffix = `.${base}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  // Un seul label de cabinet (un slug = un label DNS). Un hote multi-niveaux
  // (a.b.vencor-crm.localhost) n'est pas un cabinet legitime -> fallback.
  const label = hostname.slice(0, -suffix.length);
  if (label.length === 0 || label.includes(".")) {
    return null;
  }

  // www n'est pas un cabinet.
  if (label === "www") {
    return null;
  }

  // Le label doit etre un slug RFC 1035 valide.
  if (label.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(label)) {
    return null;
  }

  return label;
}
