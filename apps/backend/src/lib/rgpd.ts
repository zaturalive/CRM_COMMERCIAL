import { isLastActiveAdmin, type TenantUserSnapshot } from "./userManagement";

/**
 * Regles metier pures du self-service RGPD (EP14-S06).
 *
 * POURQUOI un module pur (sans HTTP ni base) : la regle d'anonymisation (quels
 * champs sont ecrases par la sentinelle, AC3) et la garde "dernier admin actif"
 * (AC4, A-guard) sont deterministes pour une meme entree, donc testables
 * unitairement (tests/unit/rgpd.test.ts) independamment du transport. Les routes
 * (src/routes/clients.ts pour l'anonymisation, src/routes/me.ts pour la
 * suppression de compte) et le test de bout en bout
 * (tests/security/rgpd-self-service.test.ts) consomment ces memes fonctions —
 * source unique, pas de divergence de regle.
 *
 * La garde dernier admin reutilise la meme semantique que EP15-S02
 * (src/lib/userManagement.ts : isLastActiveAdmin) : un dernier ADMIN actif ne
 * peut pas se retirer du tenant. Ici la cible est le compte du token lui-meme
 * (auto-suppression DELETE /api/me), pas un autre compte gere par l'ADMIN.
 */

// Sentinelle d'anonymisation (AC3 : firstName/lastName/email/phone -> "ANONYMISE").
// Contrat stable, partage avec les tests et la projection des routes.
export const ANONYMIZED_VALUE = "ANONYMISE" as const;

// Re-export pour que la garde A-guard partage exactement le type de snapshot de
// userManagement (source unique du modele de decompte admin).
export type { TenantUserSnapshot };

/**
 * Contact identifiant d'un client (les 4 champs cibles de l'anonymisation, AC3).
 * email est optionnel cote schema (Client.email String?) ; phone est requis.
 */
export interface ClientContact {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
}

/**
 * Patch d'anonymisation : uniquement les 4 champs identifiants, tous ecrases par
 * la sentinelle. POURQUOI ne contenir QUE ces 4 champs : la route applique ce
 * patch en update partiel, donc les agregats (montants, dates, CA) ne sont jamais
 * touches (AC3 : anonymisation != suppression dure, on conserve la valeur
 * statistique). Un email null devient la sentinelle : l'identite est uniformement
 * neutralisee, on ne re-emet pas un null exploitable.
 */
export interface ClientAnonymizationPatch {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function buildClientAnonymization(
  _contact: ClientContact,
): ClientAnonymizationPatch {
  // POURQUOI ignorer l'entree : la sortie est constante (les 4 champs valent la
  // sentinelle quelle que soit la valeur d'origine). On ne reconduit donc aucune
  // donnee personnelle d'origine, et l'operation est idempotente (re-anonymiser
  // une valeur deja anonymisee redonne la sentinelle).
  return {
    firstName: ANONYMIZED_VALUE,
    lastName: ANONYMIZED_VALUE,
    email: ANONYMIZED_VALUE,
    phone: ANONYMIZED_VALUE,
  };
}

/**
 * AC4 (A-guard) : leve une erreur (status 409) si le compte qui demande sa propre
 * suppression est le DERNIER ADMIN ACTIF du tenant (sinon le tenant n'aurait plus
 * aucun acces ADMIN). Reutilise isLastActiveAdmin (EP15-S02) : un COMMERCIAL, ou
 * un ADMIN qui laisse au moins un autre ADMIN actif, passe sans erreur. Un ADMIN
 * inactif ne compte pas comme garant (il ne peut pas se connecter).
 */
export function assertCanDeleteOwnAccount(
  userId: string,
  tenantUsers: TenantUserSnapshot[],
): void {
  if (isLastActiveAdmin(userId, tenantUsers)) {
    const err = new Error(
      "Cannot delete the last active admin of the tenant",
    ) as Error & { status: number };
    // POURQUOI 409 : conflit d'etat (le tenant ne peut pas rester sans admin
    // actif), coherent avec le 409 de PATCH /api/users/:id (EP15-S02).
    err.status = 409;
    throw err;
  }
}
