/**
 * Politique de robustesse de mot de passe — source unique (ADR-0009 D5).
 *
 * Consommee par change-password (EP15-S04), reset (EP15-S03) et le
 * provisioning (EP17-S02). Fonction pure : aucun acces base ni reseau, verdict
 * deterministe pour une meme entree.
 *
 * Reference de la regle : OWASP ASVS v4.0.3, controle V2.1 (Password Security
 * Requirements). La longueur minimale est le levier principal ; on n'impose pas
 * de regle de composition arbitraire (pas de "doit contenir exactement tel
 * symbole"), mais une diversite minimale de classes pour ecarter les chaines a
 * faible entropie (ex. que des minuscules).
 */

/**
 * Longueur minimale. Parametre documente (ADR-0009 D5) : 12 caracteres, aligne
 * sur OWASP ASVS V2.1. Ajustable ici sans toucher aux appelants.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Nombre minimal de classes de caracteres distinctes (parmi minuscule,
 * majuscule, chiffre, symbole). Ecarte les chaines mono-classe a faible
 * entropie sans imposer la presence d'une classe precise.
 */
export const PASSWORD_MIN_CHAR_CLASSES = 3;

/**
 * Liste courte de mots de passe trivialement faibles refuses meme s'ils
 * satisfont longueur et classes. Couvre les creds de demo et motifs evidents.
 * POURQUOI : neutraliser le mot de passe "demo" du seed (EP15-S04 contexte) et
 * quelques motifs notoires, sans pretendre a un dictionnaire exhaustif.
 */
const TRIVIALLY_WEAK = new Set([
  "demo",
  "password",
  "passwordpassword",
  "motdepasse",
  "azertyuiop",
  "qwertyuiop",
  "123456789012",
  "administrator",
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

function countCharClasses(pw: string): number {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes += 1;
  if (/[A-Z]/.test(pw)) classes += 1;
  if (/[0-9]/.test(pw)) classes += 1;
  // Tout ce qui n'est ni lettre ASCII ni chiffre compte comme symbole.
  if (/[^a-zA-Z0-9]/.test(pw)) classes += 1;
  return classes;
}

/**
 * Valide un mot de passe candidat contre la politique partagee.
 * Retourne toujours { valid, errors } : errors liste les contraintes violees
 * (vide si valid). Les messages sont en clair, exploitables tels quels par le
 * front pour afficher des erreurs comprehensibles (EP15-S04 AC4).
 */
export function validatePassword(pw: string): PasswordValidationResult {
  const errors: string[] = [];

  if (typeof pw !== "string" || pw.length < PASSWORD_MIN_LENGTH) {
    errors.push(
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caracteres.`
    );
  }

  if (countCharClasses(pw) < PASSWORD_MIN_CHAR_CLASSES) {
    errors.push(
      `Le mot de passe doit combiner au moins ${PASSWORD_MIN_CHAR_CLASSES} types de caracteres parmi minuscules, majuscules, chiffres et symboles.`
    );
  }

  if (TRIVIALLY_WEAK.has(pw.toLowerCase())) {
    errors.push("Ce mot de passe est trop courant. Choisissez-en un autre.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Decision de seed pour mustChangePassword (EP15-S04 AC5 / ADR-0009 D5).
 *
 * Source unique, fonction pure, consommee par le seed. Un tenant de demo
 * (vitrine) conserve le comportement de demo (mot de passe "demo", pas de
 * gate) ; tout autre tenant est traite comme un vrai cabinet et part en
 * force-change au premier login.
 *
 * POURQUOI le defaut securitaire (true hors liste) : ne jamais livrer un compte
 * au mot de passe initial public et non force a changer. Un slug non
 * explicitement de demo est donc force a changer.
 */
export function mustChangePasswordForSeed(
  tenantSlug: string,
  demoSlugs: string[]
): boolean {
  return !demoSlugs.includes(tenantSlug);
}

/**
 * Decision de ciblage du seed de donnees de demo (EP15-S05 AC5 / ADR-0009).
 *
 * Source unique, fonction pure : `true` si le tenant est un tenant de demo
 * (vitrine) et peut donc recevoir les donnees/labels de demo (load-fake-data) ;
 * `false` sinon (tenant destine a un vrai cabinet -> aucune donnee de demo).
 *
 * POURQUOI le complement exact de mustChangePasswordForSeed sur la meme liste :
 * un tenant ne doit jamais etre "demo" pour une regle et "reel" pour l'autre.
 * Le defaut securitaire (false hors liste) garantit qu'un slug inconnu est
 * traite comme un cabinet reel et ne recoit aucune surface de demo (AC4 : la
 * surface de demo doit etre absente, pas seulement masquee).
 */
export function isDemoDataSeedTarget(
  tenantSlug: string,
  demoSlugs: string[]
): boolean {
  return demoSlugs.includes(tenantSlug);
}
