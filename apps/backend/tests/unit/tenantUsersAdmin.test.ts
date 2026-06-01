import { describe, it, expect } from "vitest";
import {
  isLastActiveAdmin,
  assertCanChangeUser,
  buildCreatedUserAccount,
} from "../../src/lib/userManagement";
import { validatePassword } from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires des regles metier du CRUD users CROSS-TENANT depuis le Back
 * Office editeur (EP17-S03 AC2, AC3, AC5).
 *
 * Reutilisation (story EP17-S03, note technique) : "service createUserAccount
 * commun avec EP15-S02 et EP17-S02". Les regles pures vivent donc dans le service
 * partage src/lib/userManagement.ts (source unique, deja testee pour EP15-S02
 * dans tests/unit/userManagement.test.ts). Ce fichier verifie la SPECIFICITE
 * EP17-S03 : la "difference de garde" enoncee par la story — ici le scope tenant
 * est passe en PARAMETRE (verifie editeur) et non deduit du JWT de l'admin. La
 * garde "dernier admin" doit donc se calculer sur le snapshot DU TENANT CIBLE
 * uniquement ; un ADMIN actif d'un autre tenant ne doit jamais servir de filet de
 * securite au tenant cible (sinon l'editeur pourrait laisser un tenant sans admin
 * en s'appuyant a tort sur l'admin d'un cabinet voisin).
 *
 * Phase TDD rouge : tant que le service partage et son contrat ne couvrent pas le
 * cas cross-tenant attendu par EP17-S03, ces tests echouent.
 *
 * Contrat cible (derive des AC EP17-S03 + ADR-0009 D1/D5) :
 *   - isLastActiveAdmin / assertCanChangeUser operent sur un snapshot DEJA borne
 *     au tenant cible (l'appelant — la route /api/admin/tenants/:tenantId/users —
 *     ne passe QUE les users du tenantId du path). Le decompte d'admins actifs ne
 *     melange jamais deux tenants.
 *   - buildCreatedUserAccount borne le role a UserRole { ADMIN, COMMERCIAL } :
 *     l'editeur ne cree pas un niveau plateforme (PlatformAdmin) via le CRUD des
 *     users d'un tenant (escalade fermee, ADR-0009 D1).
 */

type Role = "ADMIN" | "COMMERCIAL";

interface TenantUser {
  id: string;
  role: Role;
  active: boolean;
}

/**
 * Simule la projection que la route /api/admin/tenants/:tenantId/users construit :
 * un snapshot deja FILTRE par le tenantId du path. C'est le point cle de la
 * "difference de garde" EP17-S03 — la fonction pure ne reçoit que les users du
 * tenant cible.
 */
function targetTenantSnapshot(...list: TenantUser[]): TenantUser[] {
  return list;
}

describe("EP17-S03 — garde dernier admin calculee sur le tenant cible (scope en parametre)", () => {
  it("isLastActiveAdmin : true si la cible est le seul ADMIN actif DU TENANT CIBLE", () => {
    const cibleSnapshot = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
      { id: "target-com", role: "COMMERCIAL", active: true },
    );
    expect(isLastActiveAdmin("target-admin", cibleSnapshot)).toBe(true);
  });

  it("assertCanChangeUser : refus (409) de desactiver le dernier ADMIN actif du tenant cible", () => {
    const cibleSnapshot = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
      { id: "target-com", role: "COMMERCIAL", active: true },
    );
    expect(() =>
      assertCanChangeUser({ active: false }, "target-admin", cibleSnapshot),
    ).toThrow();
    try {
      assertCanChangeUser({ active: false }, "target-admin", cibleSnapshot);
    } catch (err) {
      // 409 : conflit d'etat (un tenant sans admin actif), distinct d'un 400.
      expect((err as { status?: number }).status).toBe(409);
    }
  });

  it("assertCanChangeUser : refus (409) de retrograder le dernier ADMIN actif du tenant cible", () => {
    const cibleSnapshot = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
    );
    expect(() =>
      assertCanChangeUser({ role: "COMMERCIAL" }, "target-admin", cibleSnapshot),
    ).toThrow();
  });

  it("le snapshot ne contient QUE le tenant cible : un second ADMIN actif autorise la desactivation du premier (200)", () => {
    // Quand la route passe deux ADMIN actifs DU MEME tenant cible, la garde se leve.
    const cibleSnapshot = targetTenantSnapshot(
      { id: "target-admin-1", role: "ADMIN", active: true },
      { id: "target-admin-2", role: "ADMIN", active: true },
    );
    expect(() =>
      assertCanChangeUser({ active: false }, "target-admin-1", cibleSnapshot),
    ).not.toThrow();
  });

  it("un ADMIN deja inactif du tenant cible ne compte pas comme filet de securite", () => {
    const cibleSnapshot = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
      { id: "target-admin-off", role: "ADMIN", active: false },
    );
    // Le seul ADMIN actif reste "target-admin" : la garde se declenche.
    expect(isLastActiveAdmin("target-admin", cibleSnapshot)).toBe(true);
    expect(() =>
      assertCanChangeUser({ active: false }, "target-admin", cibleSnapshot),
    ).toThrow();
  });

  it("difference de garde EP17-S03 : un ADMIN d'un AUTRE tenant ne doit pas figurer dans le snapshot du tenant cible", () => {
    // POURQUOI ce test : la route /api/admin/tenants/:tenantId/users doit borner
    // le snapshot au tenantId du path. Si — par erreur — un ADMIN actif d'un
    // autre tenant etait inclus dans la liste, la garde croirait a tort qu'un
    // admin de secours existe et autoriserait de laisser le tenant cible sans
    // admin actif. On modelise la regle correcte : le snapshot du tenant cible
    // n'a qu'un ADMIN actif, donc la garde refuse — peu importe ce qui se passe
    // dans les autres tenants. La fonction pure ne reçoit JAMAIS d'admin d'un
    // autre tenant (c'est le contrat d'appel de la route).
    const cibleSnapshotCorrect = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
    );
    expect(isLastActiveAdmin("target-admin", cibleSnapshotCorrect)).toBe(true);
    expect(() =>
      assertCanChangeUser({ active: false }, "target-admin", cibleSnapshotCorrect),
    ).toThrow();

    // Contre-exemple defensif : si un snapshot melangeait deux tenants (bug
    // d'implementation a eviter), un faux "admin de secours" leverait la garde a
    // tort. Ce test documente que ce melange ne doit PAS se produire : la garde
    // ne tient que si l'appelant borne correctement au tenant cible.
    const cibleSnapshotPollue = targetTenantSnapshot(
      { id: "target-admin", role: "ADMIN", active: true },
      { id: "OTHER-tenant-admin", role: "ADMIN", active: true },
    );
    // Avec un snapshot pollue, la garde ne se declencherait pas (faux negatif) :
    // d'ou l'exigence que la route filtre par tenantId AVANT d'appeler la garde.
    expect(isLastActiveAdmin("target-admin", cibleSnapshotPollue)).toBe(false);
  });
});

describe("EP17-S03 — provisioning d'un user dans un tenant cible (reuse buildCreatedUserAccount)", () => {
  it("force mustChangePassword=true a la creation (D5)", () => {
    const account = buildCreatedUserAccount({
      email: "commercial@target.fr",
      firstName: "Cyril",
      lastName: "Cree",
      role: "COMMERCIAL",
    });
    expect(account.mustChangePassword).toBe(true);
  });

  it("genere un mot de passe temporaire conforme a la policy partagee (D5/D7)", () => {
    for (let i = 0; i < 20; i += 1) {
      const account = buildCreatedUserAccount({
        email: `c${i}@target.fr`,
        firstName: "C",
        lastName: "C",
        role: "COMMERCIAL",
      });
      expect(validatePassword(account.tempPassword).valid).toBe(true);
    }
  });

  it("le hash bcrypt n'est pas le mot de passe en clair", () => {
    const account = buildCreatedUserAccount({
      email: "c@target.fr",
      firstName: "C",
      lastName: "C",
      role: "ADMIN",
    });
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(account.passwordHash).not.toBe(account.tempPassword);
  });

  it("l'editeur ne cree pas un niveau plateforme via le CRUD tenant (role hors UserRole -> erreur, ADR-0009 D1)", () => {
    expect(() =>
      buildCreatedUserAccount({
        email: "evil@target.fr",
        firstName: "E",
        lastName: "V",
        // @ts-expect-error : role plateforme hors UserRole, refuse a l'execution.
        role: "EDITEUR",
      }),
    ).toThrow();
    expect(() =>
      buildCreatedUserAccount({
        email: "evil2@target.fr",
        firstName: "E",
        lastName: "V",
        // @ts-expect-error : role plateforme hors UserRole, refuse a l'execution.
        role: "PLATFORM_ADMIN",
      }),
    ).toThrow();
  });

  it("deux comptes provisionnes par l'editeur ne partagent pas le meme mot de passe temporaire", () => {
    const a = buildCreatedUserAccount({
      email: "a@target.fr",
      firstName: "A",
      lastName: "A",
      role: "COMMERCIAL",
    });
    const b = buildCreatedUserAccount({
      email: "b@target.fr",
      firstName: "B",
      lastName: "B",
      role: "COMMERCIAL",
    });
    expect(a.tempPassword).not.toBe(b.tempPassword);
  });
});
