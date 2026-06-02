import { describe, it, expect } from "vitest";
import {
  buildClientAnonymization,
  assertCanDeleteOwnAccount,
  ANONYMIZED_VALUE,
  type ClientContact,
  type TenantUserSnapshot,
} from "../../src/lib/rgpd";

/**
 * EP14-S06 — Tests unitaires des regles metier pures du self-service RGPD.
 *
 * POURQUOI un module pur (sans HTTP ni base) : la regle d'anonymisation (quels
 * champs sont ecrases par la sentinelle, AC3) et la garde "dernier admin actif"
 * (AC4, A-guard) sont deterministes pour une meme entree, donc testables
 * unitairement independamment du transport. Les routes (src/routes RGPD) et le
 * test de bout en bout (tests/security/rgpd-self-service.test.ts) consomment ces
 * memes fonctions — source unique, pas de divergence de regle.
 *
 * La garde dernier admin reutilise la meme semantique que EP15-S02
 * (src/lib/userManagement.ts) : un dernier ADMIN actif ne peut pas se retirer.
 * Ici la cible est le compte du token lui-meme (auto-suppression).
 *
 * Phase TDD rouge : le module src/lib/rgpd.ts n'existe pas encore. Ces tests
 * echouent a l'import tant que la feature n'est pas implementee.
 */

describe("EP14-S06 — buildClientAnonymization (AC3)", () => {
  const contact: ClientContact = {
    firstName: "Alice",
    lastName: "Martin",
    email: "alice.martin@example.test",
    phone: "+33600000001",
  };

  it("remplace firstName/lastName/email/phone par la sentinelle ANONYMISE", () => {
    const result = buildClientAnonymization(contact);
    expect(result.firstName).toBe(ANONYMIZED_VALUE);
    expect(result.lastName).toBe(ANONYMIZED_VALUE);
    expect(result.email).toBe(ANONYMIZED_VALUE);
    expect(result.phone).toBe(ANONYMIZED_VALUE);
  });

  it("la sentinelle vaut exactement ANONYMISE (AC3, contrat stable)", () => {
    expect(ANONYMIZED_VALUE).toBe("ANONYMISE");
  });

  it("ne reconduit aucune donnee personnelle d'origine dans la sortie", () => {
    const result = buildClientAnonymization(contact);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Alice");
    expect(serialized).not.toContain("Martin");
    expect(serialized).not.toContain("alice.martin@example.test");
    expect(serialized).not.toContain("+33600000001");
  });

  it("ne contient QUE les champs identifiants (pas de montant ni de date)", () => {
    // L'anonymisation porte sur l'identite ; les agregats (montants/dates) sont
    // conserves par la route en NE les incluant PAS dans le patch. Le service
    // pur ne doit donc emettre que les 4 champs identifiants.
    const result = buildClientAnonymization(contact);
    expect(Object.keys(result).sort()).toEqual(
      ["email", "firstName", "lastName", "phone"].sort(),
    );
  });

  it("est idempotent : anonymiser une valeur deja anonymisee redonne la sentinelle", () => {
    const already: ClientContact = {
      firstName: ANONYMIZED_VALUE,
      lastName: ANONYMIZED_VALUE,
      email: ANONYMIZED_VALUE,
      phone: ANONYMIZED_VALUE,
    };
    const result = buildClientAnonymization(already);
    expect(result.firstName).toBe(ANONYMIZED_VALUE);
    expect(result.email).toBe(ANONYMIZED_VALUE);
  });

  it("anonymise meme si l'email est absent (champ optionnel cote schema)", () => {
    const noEmail: ClientContact = {
      firstName: "Bob",
      lastName: "Durand",
      email: null,
      phone: "+33600000002",
    };
    const result = buildClientAnonymization(noEmail);
    // Un email null devient la sentinelle : pas de re-emission d'un null
    // exploitable, l'identite est uniformement neutralisee.
    expect(result.email).toBe(ANONYMIZED_VALUE);
    expect(result.phone).toBe(ANONYMIZED_VALUE);
  });
});

describe("EP14-S06 — assertCanDeleteOwnAccount (AC4, A-guard)", () => {
  const tenant: TenantUserSnapshot[] = [
    { id: "admin-1", role: "ADMIN", active: true },
    { id: "admin-2", role: "ADMIN", active: true },
    { id: "commercial-1", role: "COMMERCIAL", active: true },
    { id: "admin-inactive", role: "ADMIN", active: false },
  ];

  it("autorise un COMMERCIAL a supprimer son propre compte", () => {
    expect(() =>
      assertCanDeleteOwnAccount("commercial-1", tenant),
    ).not.toThrow();
  });

  it("autorise un ADMIN a se supprimer s'il reste un autre ADMIN actif", () => {
    expect(() => assertCanDeleteOwnAccount("admin-1", tenant)).not.toThrow();
  });

  it("refuse la suppression du DERNIER ADMIN actif (status 409)", () => {
    const soloAdmin: TenantUserSnapshot[] = [
      { id: "admin-solo", role: "ADMIN", active: true },
      { id: "commercial-1", role: "COMMERCIAL", active: true },
      { id: "admin-old", role: "ADMIN", active: false },
    ];
    try {
      assertCanDeleteOwnAccount("admin-solo", soloAdmin);
      expect.unreachable("doit lever pour le dernier admin actif");
    } catch (err) {
      expect((err as { status?: number }).status).toBe(409);
    }
  });

  it("un ADMIN inactif n'est pas compte comme garant : le dernier ADMIN actif reste bloque", () => {
    // admin-inactive ne garantit pas l'acces (ne peut pas se connecter), donc
    // si le SEUL admin actif tente de se supprimer, la garde s'applique.
    const oneActiveAdmin: TenantUserSnapshot[] = [
      { id: "admin-active", role: "ADMIN", active: true },
      { id: "admin-inactive", role: "ADMIN", active: false },
    ];
    expect(() =>
      assertCanDeleteOwnAccount("admin-active", oneActiveAdmin),
    ).toThrow();
  });
});
