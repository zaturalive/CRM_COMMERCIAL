import { hashSync } from "bcryptjs";
import { generateTempPassword } from "./tempPassword";

/**
 * Regles metier pures de la gestion des comptes users intra-cabinet (EP15-S02).
 *
 * POURQUOI un module pur (sans HTTP ni base) : la garde "dernier admin" (AC6) et
 * la construction d'un compte provisionne (AC2 + ADR-0009 D5) sont deterministes
 * pour une meme entree, donc testables unitairement (tests/unit/userManagement
 * .test.ts) independamment du transport. Les routes (src/routes/users.ts) et le
 * test de bout en bout (tests/security/user-management.test.ts) consomment ces
 * memes fonctions — source unique, pas de divergence de regle.
 */

export type ManagedRole = "ADMIN" | "COMMERCIAL";

export interface TenantUserSnapshot {
  id: string;
  role: ManagedRole;
  active: boolean;
}

export interface UserChange {
  active?: boolean;
  role?: ManagedRole;
}

export interface CreateAccountInput {
  email: string;
  firstName: string;
  lastName: string;
  role: ManagedRole;
}

export interface BuiltAccount {
  email: string;
  firstName: string;
  lastName: string;
  role: ManagedRole;
  mustChangePassword: boolean;
  tempPassword: string;
  passwordHash: string;
}

/**
 * AC6 : la cible est-elle le DERNIER ADMIN ACTIF du tenant ? true seulement si la
 * cible est elle-meme un ADMIN actif et qu'aucun autre ADMIN actif ne subsiste.
 * Un ADMIN inactif ne compte pas (il ne peut pas se connecter, il ne garantit pas
 * l'acces). Une cible COMMERCIAL ou deja inactive renvoie false (hors garde).
 */
export function isLastActiveAdmin(
  targetUserId: string,
  tenantUsers: TenantUserSnapshot[],
): boolean {
  const target = tenantUsers.find((u) => u.id === targetUserId);
  if (!target || target.role !== "ADMIN" || !target.active) {
    return false;
  }
  const otherActiveAdmins = tenantUsers.filter(
    (u) => u.id !== targetUserId && u.role === "ADMIN" && u.active,
  );
  return otherActiveAdmins.length === 0;
}

/**
 * AC3 + AC6 : leve une erreur (status 409) si le changement retirerait le dernier
 * ADMIN actif du tenant, soit en le desactivant (active=false), soit en le
 * retrogradant (role != ADMIN). Ne leve pas dans les autres cas (desactivation
 * d'un COMMERCIAL, reactivation, promotion, ou s'il reste un autre ADMIN actif).
 */
export function assertCanChangeUser(
  change: UserChange,
  targetUserId: string,
  tenantUsers: TenantUserSnapshot[],
): void {
  const removesAdmin =
    change.active === false ||
    (change.role !== undefined && change.role !== "ADMIN");
  if (!removesAdmin) {
    return;
  }
  if (isLastActiveAdmin(targetUserId, tenantUsers)) {
    const err = new Error(
      "Cannot remove the last active admin of the tenant",
    ) as Error & { status: number };
    // POURQUOI 409 : conflit d'etat (le tenant ne peut pas rester sans admin
    // actif), distinct d'un 400 de validation de payload.
    err.status = 409;
    throw err;
  }
}

/**
 * AC2 + ADR-0009 D5/D7 : construit les donnees d'un compte provisionne. Le role
 * est borne a l'enum UserRole (ADMIN | COMMERCIAL) — un role plateforme (EDITEUR,
 * PLATFORM_ADMIN) leve une erreur (escalade fermee, ADR-0009 D1). Mot de passe
 * temporaire conforme a la policy (source unique D5), hash bcrypt, mustChange
 * Password=true. Le clair (tempPassword) est renvoye une fois pour le chemin
 * degrade (D7) ; il differe du hash bcrypt.
 */
const ALLOWED_ROLES: ReadonlySet<ManagedRole> = new Set<ManagedRole>([
  "ADMIN",
  "COMMERCIAL",
]);

export function buildCreatedUserAccount(
  input: CreateAccountInput,
): BuiltAccount {
  if (!ALLOWED_ROLES.has(input.role)) {
    const err = new Error(
      `Invalid role: ${String(input.role)}`,
    ) as Error & { status: number };
    err.status = 400;
    throw err;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = hashSync(tempPassword, 10);

  return {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    mustChangePassword: true,
    tempPassword,
    passwordHash,
  };
}
