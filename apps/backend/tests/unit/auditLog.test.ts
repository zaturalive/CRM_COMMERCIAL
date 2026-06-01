import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  sanitizeBody,
  hashBody,
  deriveAction,
  shouldAudit,
} from "../../src/middleware/auditLog";

/**
 * Tests unitaires des regles metier du middleware d'audit (EP14-S04, ADR-0009 D3).
 *
 * Reference : docs/product/stories/EP14-S04.md (AC 2-5) + ADR-0009 D3.
 *
 * Phase TDD rouge : src/middleware/auditLog.ts n'existe pas encore, donc l'import
 * echoue tant que la feature n'est pas implementee. On teste ici les fonctions
 * pures (sanitization, hash, derivation d'action, scope) isolement, sans toucher
 * a la base ni au reseau.
 *
 * Les quatre fonctions sous test (contrat attendu, ADR-0009 D3) :
 *   - sanitizeBody(body)  : retire les cles de la denylist avant hash et avant log.
 *   - hashBody(body)      : SHA-256 du JSON du body sanitize ; le corps n'est jamais
 *                           stocke en clair. Champ AuditLog.bodyHash.
 *   - deriveAction(method, path) : mappe method+routePattern vers une action lisible
 *                           (ex "process.stage_change"), undefined si non mappe.
 *   - shouldAudit(method, path)  : true pour POST/PUT/PATCH/DELETE et les GET sensibles
 *                           declares ; false pour les GET de listing courants (volume).
 */

// ADR-0009 D3 : denylist de cles retirees avant hash et avant tout log.
const DENY_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "totpSecret",
  "firstName",
  "lastName",
  "email",
  "phone",
];

describe("auditLog.sanitizeBody (EP14-S04 AC4)", () => {
  it("retire chaque cle de la denylist du body", () => {
    const body = {
      password: "p4ssw0rd-secret",
      newPassword: "n3w-secret",
      currentPassword: "old-secret",
      token: "jwt-or-reset-token",
      totpSecret: "BASE32SECRET",
      firstName: "Jean",
      lastName: "Dupont",
      email: "jean.dupont@example.fr",
      phone: "0612345678",
      stage: "QUALIFICATION",
    };
    const out = sanitizeBody(body);
    for (const key of DENY_KEYS) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it("conserve les cles non sensibles (ex stage metier)", () => {
    const out = sanitizeBody({ stage: "QUALIFICATION", targetStage: "DEVIS" });
    expect(out).toMatchObject({ stage: "QUALIFICATION", targetStage: "DEVIS" });
  });

  it("ne fuit aucune valeur sensible une fois serialise en JSON", () => {
    const body = {
      password: "DO-NOT-LEAK-pw",
      email: "leak@example.fr",
      phone: "0699887766",
      firstName: "Secret",
      note: "champ-non-sensible",
    };
    const serialized = JSON.stringify(sanitizeBody(body));
    expect(serialized).not.toContain("DO-NOT-LEAK-pw");
    expect(serialized).not.toContain("leak@example.fr");
    expect(serialized).not.toContain("0699887766");
    expect(serialized).not.toContain("Secret");
    // Le champ non sensible reste present.
    expect(serialized).toContain("champ-non-sensible");
  });

  it("est non destructif : ne mute pas l'objet d'entree", () => {
    const body = { password: "keep-in-original", stage: "CONTACT" };
    sanitizeBody(body);
    expect(body.password).toBe("keep-in-original");
  });

  it("tolere un body vide ou undefined sans lever d'erreur", () => {
    expect(() => sanitizeBody({})).not.toThrow();
    expect(() => sanitizeBody(undefined)).not.toThrow();
  });
});

describe("auditLog.hashBody (EP14-S04 AC4, ADR-0009 D3)", () => {
  it("retourne un SHA-256 (64 caracteres hex) du body sanitize", () => {
    const hash = hashBody({ stage: "QUALIFICATION" });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashe le body SANS les cles sensibles (hash du JSON sanitize)", () => {
    // POURQUOI : le hash doit etre celui du corps sanitize, sinon une valeur
    // sensible influencerait le hash et un attaquant pourrait la deviner par
    // comparaison. On reproduit le contrat attendu : sanitize puis SHA-256.
    const withSecret = { password: "s3cr3t", stage: "DEVIS" };
    const expected = createHash("sha256")
      .update(JSON.stringify({ stage: "DEVIS" }))
      .digest("hex");
    expect(hashBody(withSecret)).toBe(expected);
  });

  it("ne contient jamais le corps en clair (le hash n'est pas reversible textuellement)", () => {
    const hash = hashBody({ password: "PLAINTEXT-DO-NOT-APPEAR", stage: "CONTACT" });
    expect(hash).not.toContain("PLAINTEXT-DO-NOT-APPEAR");
    expect(hash).not.toContain("CONTACT");
  });

  it("est deterministe : meme body sanitize -> meme hash", () => {
    const a = hashBody({ stage: "DEVIS", note: "x" });
    const b = hashBody({ stage: "DEVIS", note: "x" });
    expect(a).toBe(b);
  });
});

describe("auditLog.deriveAction (EP14-S04 AC2, ADR-0009 D3)", () => {
  it("derive process.stage_change pour PATCH /api/processes/:id/stage", () => {
    // ADR-0009 D3 cite explicitement cet exemple de mapping.
    expect(deriveAction("PATCH", "/api/processes/123/stage")).toBe(
      "process.stage_change"
    );
  });

  it("derive une action create pour POST /api/clients", () => {
    expect(deriveAction("POST", "/api/clients")).toBe("client.create");
  });

  it("derive une action delete pour DELETE /api/clients/:id", () => {
    expect(deriveAction("DELETE", "/api/clients/123")).toBe("client.delete");
  });

  it("retourne undefined pour une route non mappee (pas de crash)", () => {
    expect(deriveAction("POST", "/api/route-inconnue")).toBeUndefined();
  });
});

describe("auditLog.shouldAudit — scope (EP14-S04 AC3, ADR-0009 D3)", () => {
  it("logue par defaut les mutations POST/PUT/PATCH/DELETE", () => {
    expect(shouldAudit("POST", "/api/clients")).toBe(true);
    expect(shouldAudit("PUT", "/api/clients/123")).toBe(true);
    expect(shouldAudit("PATCH", "/api/processes/1/stage")).toBe(true);
    expect(shouldAudit("DELETE", "/api/clients/123")).toBe(true);
  });

  it("exclut les GET de listing courants (volume)", () => {
    expect(shouldAudit("GET", "/api/clients")).toBe(false);
    expect(shouldAudit("GET", "/api/processes")).toBe(false);
  });

  it("est insensible a la casse de la methode HTTP", () => {
    expect(shouldAudit("post", "/api/clients")).toBe(true);
    expect(shouldAudit("get", "/api/clients")).toBe(false);
  });
});
