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
