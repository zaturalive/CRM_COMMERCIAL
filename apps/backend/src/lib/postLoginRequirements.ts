/**
 * EP14-S02 / ADR-0009 D5 — couche unique "post-login requirements".
 *
 * Source unique, pure et deterministe (aucun acces base) qui derive les "gates"
 * a poser apres le login : changement de mot de passe force (EP15-S04) et
 * acceptation des CGU (EP14-S02). Mutualisee pour que le backend (flag expose au
 * login + garde requireCguAccepted) et le frontend (middleware de redirection)
 * partagent exactement la meme logique, sans divergence.
 *
 * Registre de versions CGU : la version courante provient du texte
 * docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md (deliverable EP14-S07). Une nouvelle
 * version (ex : post-revue juriste) re-force l'acceptation (RM5) : il suffit
 * d'ajouter la nouvelle valeur a KNOWN_CGU_VERSIONS et de pointer
 * CURRENT_CGU_VERSION dessus.
 */

/**
 * Version courante du texte CGU (en-tete cguVersion du document legal). C'est la
 * seule version dont l'acceptation satisfait le gate ; toute autre version
 * acceptee est traitee comme perimee.
 */
export const CURRENT_CGU_VERSION = "2026.06";

/**
 * Versions connues du texte CGU. Sert d'anti-downgrade (AC4) : une acceptation
 * portant une version absente de cet ensemble est refusee a l'ecriture. Pour
 * l'instant une seule version existe ; les versions historiques y seraient
 * ajoutees si l'on voulait pouvoir tracer une acceptation passee, mais seule
 * CURRENT_CGU_VERSION satisfait le gate (isCguSatisfied).
 */
const KNOWN_CGU_VERSIONS: ReadonlySet<string> = new Set([CURRENT_CGU_VERSION]);

/**
 * Vrai uniquement si v est une string correspondant a une version CGU connue.
 * Rejette les entrees non-string, vides et inconnues (anti-downgrade, AC4).
 */
export function isKnownCguVersion(v: unknown): boolean {
  return typeof v === "string" && KNOWN_CGU_VERSIONS.has(v);
}

/**
 * Le gate CGU est satisfait uniquement si le tenant a accepte (timestamp non
 * null) ET que la version acceptee est la version courante. Fail-closed : un
 * timestamp pose sans version coherente (etat incoherent) n'est pas satisfait,
 * et une version perimee re-declenche l'acceptation (RM5).
 */
export function isCguSatisfied(tenant: {
  cguAcceptedAt: Date | null;
  cguVersion: string | null;
}): boolean {
  return (
    tenant.cguAcceptedAt !== null && tenant.cguVersion === CURRENT_CGU_VERSION
  );
}

/**
 * Couche unique : derive les gates a poser apres le login a partir de l'etat du
 * compte (mustChangePassword) et de l'etat CGU du tenant. Expose la prochaine
 * redirection a poser (nextGate) pour que le front ait une source unique.
 *
 * POURQUOI cet ordre : on traite d'abord la securite du compte (mot de passe
 * force), puis le consentement CGU. Si les deux sont dus, la gate change-password
 * passe avant accept-cgu.
 */
export function evaluatePostLoginRequirements(input: {
  mustChangePassword: boolean;
  cguAcceptedAt: Date | null;
  cguVersion: string | null;
}): {
  mustChangePassword: boolean;
  cguAccepted: boolean;
  nextGate: "change-password" | "accept-cgu" | null;
} {
  const cguAccepted = isCguSatisfied({
    cguAcceptedAt: input.cguAcceptedAt,
    cguVersion: input.cguVersion,
  });

  let nextGate: "change-password" | "accept-cgu" | null = null;
  if (input.mustChangePassword) {
    nextGate = "change-password";
  } else if (!cguAccepted) {
    nextGate = "accept-cgu";
  }

  return {
    mustChangePassword: input.mustChangePassword,
    cguAccepted,
    nextGate,
  };
}
