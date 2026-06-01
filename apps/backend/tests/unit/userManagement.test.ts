import { describe, it, expect } from "vitest";
import {
  isLastActiveAdmin,
  assertCanChangeUser,
  buildCreatedUserAccount,
} from "../../src/lib/userManagement";
import { validatePassword } from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires des regles metier de la gestion des comptes intra-cabinet
 * (EP15-S02 AC2, AC3, AC6).
 *
 * Ces regles sont extraites dans un service pur (src/lib/userManagement.ts,
 * note technique de la story : "factoriser un service createUserAccount") afin
 * d'etre testables sans HTTP ni base : verdict deterministe pour une meme
 * entree. Les tests de bout en bout (HTTP + isolation tenant) sont dans
 * tests/security/user-management.test.ts.
 *
 * Phase TDD rouge : src/lib/userManagement.ts n'existe pas encore, l'import
 * echoue tant que la feature n'est pas implementee.
 *
 * Contrat cible (derive des AC + ADR-0009 D5) :
 *   - isLastActiveAdmin(targetUserId, tenantUsers): boolean
 *       true si la cible est un ADMIN actif et qu'aucun autre ADMIN actif
 *       n'existe dans le tenant (garde "dernier admin", AC6).
 *   - assertCanChangeUser(change, targetUserId, tenantUsers): void | throw
 *       leve une erreur (status 409) si le changement desactive ou retrograde
 *       le dernier ADMIN actif. Ne leve pas sinon.
 *   - buildCreatedUserAccount(input): { email, role, mustChangePassword,
 *       tempPassword, passwordHash } — un compte cree part toujours avec
 *       mustChangePassword=true et un mot de passe temporaire conforme a la
 *       policy partagee (AC2 + D5).
 */

type Role = "ADMIN" | "COMMERCIAL";

interface TenantUser {
  id: string;
  role: Role;
  active: boolean;
}

function users(...list: TenantUser[]): TenantUser[] {
  return list;
}

describe("userManagement.isLastActiveAdmin (EP15-S02 AC6)", () => {
  it("true : un seul ADMIN actif, la cible est cet admin", () => {
    const list = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "c1", role: "COMMERCIAL", active: true },
    );
    expect(isLastActiveAdmin("a1", list)).toBe(true);
  });

  it("false : deux ADMIN actifs, desactiver l'un en laisse un", () => {
    const list = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "a2", role: "ADMIN", active: true },
    );
    expect(isLastActiveAdmin("a1", list)).toBe(false);
    expect(isLastActiveAdmin("a2", list)).toBe(false);
  });

  it("true : un ADMIN actif et un ADMIN deja inactif (l'inactif ne compte pas)", () => {
    // Un second admin desactive ne garantit pas l'acces : il ne peut pas se
    // connecter. La garde doit donc l'ignorer dans le decompte des admins actifs.
    const list = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "a2", role: "ADMIN", active: false },
    );
    expect(isLastActiveAdmin("a1", list)).toBe(true);
  });

  it("false : la cible est un COMMERCIAL (la garde ne concerne que les ADMIN)", () => {
    const list = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "c1", role: "COMMERCIAL", active: true },
    );
    expect(isLastActiveAdmin("c1", list)).toBe(false);
  });

  it("false : la cible est un ADMIN deja inactif", () => {
    const list = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "a2", role: "ADMIN", active: false },
    );
    expect(isLastActiveAdmin("a2", list)).toBe(false);
  });
});

describe("userManagement.assertCanChangeUser (EP15-S02 AC3 + AC6)", () => {
  const soleAdmin = users(
    { id: "a1", role: "ADMIN", active: true },
    { id: "c1", role: "COMMERCIAL", active: true },
  );

  it("leve (409) si on desactive le dernier ADMIN actif", () => {
    expect(() =>
      assertCanChangeUser({ active: false }, "a1", soleAdmin),
    ).toThrow();
  });

  it("leve (409) si on retrograde le dernier ADMIN actif en COMMERCIAL", () => {
    expect(() =>
      assertCanChangeUser({ role: "COMMERCIAL" }, "a1", soleAdmin),
    ).toThrow();
  });

  it("expose un status 409 sur l'erreur de garde dernier admin", () => {
    try {
      assertCanChangeUser({ active: false }, "a1", soleAdmin);
      throw new Error("aurait du lever la garde dernier admin");
    } catch (err) {
      // POURQUOI 409 : conflit d'etat (on ne peut pas laisser le tenant sans
      // admin actif), distinct d'un 400 de validation de payload.
      expect((err as { status?: number }).status).toBe(409);
    }
  });

  it("ne leve pas si on desactive un COMMERCIAL", () => {
    expect(() =>
      assertCanChangeUser({ active: false }, "c1", soleAdmin),
    ).not.toThrow();
  });

  it("ne leve pas si un autre ADMIN actif subsiste", () => {
    const twoAdmins = users(
      { id: "a1", role: "ADMIN", active: true },
      { id: "a2", role: "ADMIN", active: true },
    );
    expect(() =>
      assertCanChangeUser({ active: false }, "a1", twoAdmins),
    ).not.toThrow();
    expect(() =>
      assertCanChangeUser({ role: "COMMERCIAL" }, "a1", twoAdmins),
    ).not.toThrow();
  });

  it("ne leve pas pour un changement de role qui n'enleve pas le dernier admin (promotion COMMERCIAL -> ADMIN)", () => {
    expect(() =>
      assertCanChangeUser({ role: "ADMIN" }, "c1", soleAdmin),
    ).not.toThrow();
  });

  it("ne leve pas pour une reactivation (active=true) du seul admin", () => {
    // Reactiver ne peut pas faire passer le tenant sous le seuil d'admins actifs.
    expect(() =>
      assertCanChangeUser({ active: true }, "a1", soleAdmin),
    ).not.toThrow();
  });
});

describe("userManagement.buildCreatedUserAccount (EP15-S02 AC2 + ADR-0009 D5)", () => {
  it("force mustChangePassword=true a la creation", () => {
    const account = buildCreatedUserAccount({
      email: "commercial@cabinet.fr",
      firstName: "Carla",
      lastName: "Commercial",
      role: "COMMERCIAL",
    });
    expect(account.mustChangePassword).toBe(true);
  });

  it("genere un mot de passe temporaire conforme a la policy partagee (D5)", () => {
    for (let i = 0; i < 20; i += 1) {
      const account = buildCreatedUserAccount({
        email: `c${i}@cabinet.fr`,
        firstName: "C",
        lastName: "C",
        role: "COMMERCIAL",
      });
      expect(typeof account.tempPassword).toBe("string");
      expect(validatePassword(account.tempPassword).valid).toBe(true);
    }
  });

  it("ne renvoie pas le mot de passe en clair dans le hash (le hash est bcrypt, distinct du clair)", () => {
    const account = buildCreatedUserAccount({
      email: "c@cabinet.fr",
      firstName: "C",
      lastName: "C",
      role: "COMMERCIAL",
    });
    expect(typeof account.passwordHash).toBe("string");
    // Le hash bcrypt commence par $2 ; il n'est pas le mot de passe en clair.
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(account.passwordHash).not.toBe(account.tempPassword);
  });

  it("conserve le role demande (COMMERCIAL ou ADMIN)", () => {
    const commercial = buildCreatedUserAccount({
      email: "x@cabinet.fr",
      firstName: "X",
      lastName: "Y",
      role: "COMMERCIAL",
    });
    const admin = buildCreatedUserAccount({
      email: "z@cabinet.fr",
      firstName: "Z",
      lastName: "W",
      role: "ADMIN",
    });
    expect(commercial.role).toBe("COMMERCIAL");
    expect(admin.role).toBe("ADMIN");
  });

  it("deux comptes provisionnes ne partagent pas le meme mot de passe temporaire", () => {
    const a = buildCreatedUserAccount({
      email: "a@cabinet.fr",
      firstName: "A",
      lastName: "A",
      role: "COMMERCIAL",
    });
    const b = buildCreatedUserAccount({
      email: "b@cabinet.fr",
      firstName: "B",
      lastName: "B",
      role: "COMMERCIAL",
    });
    expect(a.tempPassword).not.toBe(b.tempPassword);
  });

  it("ne permet pas de creer un niveau hors UserRole (pas d'escalade vers editeur)", () => {
    // AC : le role est borne a l'enum UserRole (ADMIN | COMMERCIAL). Un role
    // hors enum (ex. "EDITEUR" / "PLATFORM_ADMIN") est refuse (escalade
    // plateforme hors de portee de l'admin de cabinet, ADR-0009 D1).
    expect(() =>
      buildCreatedUserAccount({
        email: "evil@cabinet.fr",
        firstName: "E",
        lastName: "V",
        // @ts-expect-error : role hors UserRole, doit etre refuse a l'execution.
        role: "EDITEUR",
      }),
    ).toThrow();
  });
});
