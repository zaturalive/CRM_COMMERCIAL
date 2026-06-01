import { describe, it, expect } from "vitest";
import {
  parseAuditLogFilters,
  buildAuditLogWhere,
  computeAuditLogAggregates,
  toCsv,
} from "../../src/services/auditLogViewer";

/**
 * Tests unitaires des regles metier du viewer de logs d'audit (EP17-S05).
 *
 * Reference : docs/product/stories/EP17-S05.md (AC1, AC2, AC6, AC7) + ADR-0009
 * D3 (AuditLog append-only, bodyHash uniquement, pas de donnee metier en clair).
 *
 * Phase TDD rouge : src/services/auditLogViewer.ts n'existe pas encore, donc
 * l'import echoue tant que la feature n'est pas implementee. On teste ici les
 * fonctions pures (parsing/validation des filtres, construction du where Prisma,
 * agregats, serialisation CSV) isolement, sans toucher a la base ni au reseau.
 *
 * Contrat attendu (derive des AC + ADR-0009 D3) :
 *   - parseAuditLogFilters(query) : normalise/valide les filtres de la query
 *       (tenantId, userId, method, path, from, to, statusCode) + pagination
 *       (limit borne, cursor) + tri (par date). Rejette les valeurs invalides
 *       (statusCode non numerique, dates non parseables, limit hors borne).
 *   - buildAuditLogWhere(filters) : compose le where Prisma a partir des filtres
 *       normalises (egalite tenantId/userId/method, contains path, plage occurredAt,
 *       egalite statusCode). N'invente aucun champ hors modele AuditLog.
 *   - computeAuditLogAggregates(rows) : agregats simples (AC6) — mutations par
 *       tenant, echecs de login, pics d'activite — calcul pur sur des lignes deja
 *       chargees, sans sur-conception (Mantra #37).
 *   - toCsv(rows) : serialise un sous-ensemble de lignes en CSV (AC7), sans fuiter
 *       de donnee metier en clair (les lignes ne portent que bodyHash).
 */

type AuditLogRow = {
  id: string;
  userId: string | null;
  actorId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  action: string | null;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  bodyHash: string | null;
  occurredAt: Date;
};

function row(partial: Partial<AuditLogRow>): AuditLogRow {
  return {
    id: partial.id ?? "00000000-0000-0000-0000-000000000000",
    userId: partial.userId ?? null,
    actorId: partial.actorId ?? null,
    tenantId: partial.tenantId ?? null,
    method: partial.method ?? "GET",
    path: partial.path ?? "/api/clients",
    action: partial.action ?? null,
    statusCode: partial.statusCode ?? 200,
    ip: partial.ip ?? null,
    userAgent: partial.userAgent ?? null,
    bodyHash: partial.bodyHash ?? null,
    occurredAt: partial.occurredAt ?? new Date("2026-06-01T10:00:00.000Z"),
  };
}

describe("auditLogViewer.parseAuditLogFilters (EP17-S05 AC1/AC2)", () => {
  it("normalise les filtres egalite (tenantId, userId, method, statusCode)", () => {
    const f = parseAuditLogFilters({
      tenantId: "tenant-a",
      userId: "user-1",
      method: "post",
      statusCode: "201",
    });
    expect(f.tenantId).toBe("tenant-a");
    expect(f.userId).toBe("user-1");
    // La methode est normalisee en majuscules (egalite cote DB sur method stocke).
    expect(f.method).toBe("POST");
    expect(f.statusCode).toBe(201);
  });

  it("parse la plage de dates from/to en Date", () => {
    const f = parseAuditLogFilters({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T00:00:00.000Z",
    });
    expect(f.from instanceof Date).toBe(true);
    expect(f.to instanceof Date).toBe(true);
    expect((f.from as Date).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("borne la pagination : limit par defaut applique et plafonne une valeur excessive", () => {
    const def = parseAuditLogFilters({});
    expect(typeof def.limit).toBe("number");
    expect(def.limit).toBeGreaterThan(0);

    const capped = parseAuditLogFilters({ limit: "100000" });
    // Volume potentiellement eleve (note technique) : la page ne grossit pas sans
    // borne. La valeur exacte du plafond est un parametre du service.
    expect(capped.limit).toBeLessThanOrEqual(def.limit >= 100000 ? capped.limit : 1000);
    expect(capped.limit).toBeLessThan(100000);
  });

  it("rejette un statusCode non numerique", () => {
    expect(() => parseAuditLogFilters({ statusCode: "abc" })).toThrow();
  });

  it("rejette une date from non parseable", () => {
    expect(() => parseAuditLogFilters({ from: "pas-une-date" })).toThrow();
  });

  it("tolere une query vide sans lever d'erreur", () => {
    expect(() => parseAuditLogFilters({})).not.toThrow();
  });

  it("conserve le filtre path (recherche par sous-chaine, AC2)", () => {
    const f = parseAuditLogFilters({ path: "/api/clients" });
    expect(f.path).toBe("/api/clients");
  });
});

describe("auditLogViewer.buildAuditLogWhere (EP17-S05 AC1)", () => {
  it("compose une egalite sur tenantId / userId / method / statusCode", () => {
    const where = buildAuditLogWhere({
      tenantId: "tenant-a",
      userId: "user-1",
      method: "POST",
      statusCode: 201,
      limit: 50,
    });
    expect(where.tenantId).toBe("tenant-a");
    expect(where.userId).toBe("user-1");
    expect(where.method).toBe("POST");
    expect(where.statusCode).toBe(201);
  });

  it("compose une plage occurredAt (gte/lte) a partir de from/to", () => {
    const from = new Date("2026-06-01T00:00:00.000Z");
    const to = new Date("2026-06-02T00:00:00.000Z");
    const where = buildAuditLogWhere({ from, to, limit: 50 });
    expect(where.occurredAt).toMatchObject({ gte: from, lte: to });
  });

  it("compose un contains pour le filtre path (recherche par sous-chaine)", () => {
    const where = buildAuditLogWhere({ path: "/api/clients", limit: 50 });
    expect(where.path).toMatchObject({ contains: "/api/clients" });
  });

  it("ne pose aucune cle de filtre absente (where vide si aucun filtre)", () => {
    const where = buildAuditLogWhere({ limit: 50 });
    expect(where).not.toHaveProperty("tenantId");
    expect(where).not.toHaveProperty("userId");
    expect(where).not.toHaveProperty("method");
    expect(where).not.toHaveProperty("statusCode");
    expect(where).not.toHaveProperty("occurredAt");
    expect(where).not.toHaveProperty("path");
  });
});

describe("auditLogViewer.computeAuditLogAggregates (EP17-S05 AC6)", () => {
  const rows: AuditLogRow[] = [
    // Tenant A : 2 mutations (POST, DELETE) + 1 GET (non mutation).
    row({ tenantId: "A", method: "POST", path: "/api/clients", statusCode: 201 }),
    row({ tenantId: "A", method: "DELETE", path: "/api/clients/1", statusCode: 200 }),
    row({ tenantId: "A", method: "GET", path: "/api/clients/export", statusCode: 200 }),
    // Tenant B : 1 mutation (PATCH).
    row({ tenantId: "B", method: "PATCH", path: "/api/processes/1/stage", statusCode: 200 }),
    // Echecs de login : POST /api/auth/login avec statusCode 401.
    row({ tenantId: "A", method: "POST", path: "/api/auth/login", statusCode: 401 }),
    row({ tenantId: "A", method: "POST", path: "/api/auth/login", statusCode: 401 }),
  ];

  it("compte les mutations par tenant (POST/PUT/PATCH/DELETE)", () => {
    const agg = computeAuditLogAggregates(rows);
    const byTenant = Object.fromEntries(
      agg.mutationsByTenant.map((m) => [m.tenantId, m.count])
    );
    // Tenant A : POST client + DELETE client + POST login (echec) = 3 mutations.
    // Tenant B : PATCH = 1 mutation. Le GET export n'est pas une mutation.
    expect(byTenant["A"]).toBe(3);
    expect(byTenant["B"]).toBe(1);
  });

  it("compte les echecs de login (POST /api/auth/login avec statusCode >= 400)", () => {
    const agg = computeAuditLogAggregates(rows);
    expect(agg.loginFailures).toBe(2);
  });

  it("expose des pics d'activite (agregat par fenetre temporelle), structure simple", () => {
    const agg = computeAuditLogAggregates(rows);
    expect(Array.isArray(agg.activityPeaks)).toBe(true);
  });

  it("tolere un ensemble vide sans lever d'erreur", () => {
    expect(() => computeAuditLogAggregates([])).not.toThrow();
    const agg = computeAuditLogAggregates([]);
    expect(agg.loginFailures).toBe(0);
    expect(agg.mutationsByTenant).toEqual([]);
  });
});

describe("auditLogViewer.toCsv (EP17-S05 AC7, ADR-0009 D3)", () => {
  it("serialise les lignes en CSV avec une ligne d'entete", () => {
    const csv = toCsv([
      row({
        id: "id-1",
        tenantId: "A",
        userId: "u1",
        method: "POST",
        path: "/api/clients",
        statusCode: 201,
        bodyHash: "a".repeat(64),
      }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2); // entete + 1 ligne
    expect(lines[0].toLowerCase()).toContain("method");
    expect(lines[1]).toContain("POST");
    expect(lines[1]).toContain("/api/clients");
  });

  it("n'expose que bodyHash et aucune donnee metier en clair (le modele ne porte que des metadonnees)", () => {
    // ADR-0009 D3 : AuditLog ne stocke pas le corps en clair. Le CSV reflete le
    // modele : il contient bodyHash mais aucun champ firstName/email/phone (qui
    // n'existent pas sur AuditLog). On verifie que la serialisation ne fabrique
    // pas de colonne de contenu.
    const csv = toCsv([row({ bodyHash: "b".repeat(64) })]);
    expect(csv.toLowerCase()).not.toContain("firstname");
    expect(csv.toLowerCase()).not.toContain("password");
    expect(csv).toContain("b".repeat(64));
  });

  it("echappe les valeurs contenant une virgule pour ne pas casser le format", () => {
    const csv = toCsv([row({ userAgent: "Mozilla/5.0, Gecko" })]);
    // Une valeur avec virgule est entre guillemets (RFC 4180 section 2.6).
    expect(csv).toContain('"Mozilla/5.0, Gecko"');
  });
});
