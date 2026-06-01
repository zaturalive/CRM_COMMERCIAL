import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { basePrisma } from "../../src/lib/prisma";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S04 — Tests de securite du journal d'audit append-only.
 *
 * Reference : docs/product/stories/EP14-S04.md (section "Tests de securite (obligatoires)")
 * Decision d'architecture : ADR-0009 D3.
 *
 * Phase TDD rouge : le modele Prisma `AuditLog` et le middleware d'audit
 * (src/middleware/auditLog.ts) n'existent pas encore. Ces tests echouent tant
 * que la feature n'est pas implementee.
 *
 * Cas couverts (les 5 tests obligatoires de la story) :
 *  1. POST/PATCH/DELETE sur une route mutation -> 1 entree AuditLog avec
 *     userId/tenantId/method/path/statusCode/occurredAt.
 *  2. Body contenant un password / une donnee client -> seul le bodyHash est
 *     stocke, zero plain text.
 *  3. Echec d'insertion AuditLog (DB indispo simulee) -> la requete metier
 *     renvoie quand meme sa reponse normale (non-bloquant, AC5).
 *  4. Un ADMIN tenant A ne peut pas lire les AuditLog du tenant B (isolation,
 *     route de lecture EP17-S05 ; teste en best-effort si la route existe).
 *  5. Aucune route n'expose de DELETE/UPDATE sur AuditLog (append-only verifie).
 *
 * On lit les lignes AuditLog directement via le client Prisma de base (pas
 * l'extension tenant) car l'audit n'est pas un modele tenant-bound : c'est le
 * comportement attendu (ADR-0009 D3). Le modele n'etant pas encore genere, on
 * accede a la delegation via un cast jusqu'a ce que la migration `add_audit_log`
 * soit appliquee.
 */

const app = buildApp();
const prisma = new PrismaClient();

// Acces a la delegation AuditLog avant generation du modele (phase rouge).
// Une fois la migration appliquee, prisma.auditLog est typé et ce cast disparait.
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
type AuditLogDelegate = {
  findMany: (args?: unknown) => Promise<AuditLogRow[]>;
  findFirst: (args?: unknown) => Promise<AuditLogRow | null>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
};
function auditLogDelegate(client: unknown): AuditLogDelegate {
  return (client as { auditLog: AuditLogDelegate }).auditLog;
}

const TENANT_A = "test-audit-a";
const TENANT_B = "test-audit-b";

// POURQUOI : l'ecriture audit est asynchrone (fire-and-forget en res.on("finish"),
// ADR-0009 D3). On laisse un court delai au flush avant de lire la ligne.
async function waitForFlush(ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Security — AuditLog append-only middleware (EP14-S04)", () => {
  let adminAJwt: string;
  let tenantAId: string;
  let userAId: string;
  let adminBJwt: string;
  let tenantBId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TENANT_A);
    adminAJwt = A.admin.jwt;
    tenantAId = A.admin.tenantId;
    userAId = A.admin.userId;

    const B = await setupTestTenant(app, TENANT_B);
    adminBJwt = B.admin.jwt;
    tenantBId = B.admin.tenantId;

    // Purge des lignes d'audit des deux tenants pour partir d'un etat connu.
    await auditLogDelegate(prisma).deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
  });

  afterAll(async () => {
    await auditLogDelegate(prisma).deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC : une mutation produit une entree AuditLog (qui/quoi/ou/comment/quand)", () => {
    it("POST /api/clients -> 1 entree avec userId/tenantId/method/path/statusCode/occurredAt", async () => {
      const before = new Date();
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: "Audit", lastName: "Create", phone: "0612345600" });
      expect(res.status).toBe(201);
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId, method: "POST", path: { contains: "/api/clients" } },
        orderBy: { occurredAt: "desc" },
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const entry = rows[0];
      // Qui
      expect(entry.userId).toBe(userAId);
      expect(entry.tenantId).toBe(tenantAId);
      // Quoi
      expect(entry.method).toBe("POST");
      expect(entry.path).toContain("/api/clients");
      // Comment
      expect(entry.statusCode).toBe(201);
      // Quand
      expect(entry.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it("PATCH sur une route mutation -> entree AuditLog method=PATCH", async () => {
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: "Audit", lastName: "Patch", phone: "0612345601" });
      expect(created.status).toBe(201);
      const clientId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ city: "Lyon" });
      expect(res.status).toBe(200);
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId, method: "PATCH", path: { contains: clientId } },
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].statusCode).toBe(200);
    });

    it("DELETE sur une route mutation -> entree AuditLog method=DELETE", async () => {
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: "Audit", lastName: "Delete", phone: "0612345602" });
      expect(created.status).toBe(201);
      const clientId = created.body.data.id;

      const res = await request(app)
        .delete(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect([200, 204]).toContain(res.status);
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId, method: "DELETE", path: { contains: clientId } },
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it("les GET de listing courants ne sont PAS logues (scope volume, AC3)", async () => {
      await auditLogDelegate(prisma).deleteMany({
        where: { tenantId: tenantAId, method: "GET", path: "/api/clients" },
      });
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(200);
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId, method: "GET", path: "/api/clients" },
      });
      expect(rows.length).toBe(0);
    });
  });

  describe("AC : body sensible -> seul le bodyHash est stocke, zero plain text (AC4)", () => {
    it("un POST avec un client (firstName/lastName/phone) ne stocke aucun champ en clair", async () => {
      const SECRET_FIRST = "PlaintextPrenomNeDoitPasFuir";
      const SECRET_PHONE = "0699998888";
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: SECRET_FIRST, lastName: "Hashonly", phone: SECRET_PHONE });
      expect(res.status).toBe(201);
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId, method: "POST", path: { contains: "/api/clients" } },
        orderBy: { occurredAt: "desc" },
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const entry = rows[0];

      // Seul le hash est conserve.
      expect(entry.bodyHash).toBeTruthy();
      expect(entry.bodyHash).toMatch(/^[a-f0-9]{64}$/);

      // Aucun champ sensible en clair, dans aucune colonne serialisable.
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(SECRET_FIRST);
      expect(serialized).not.toContain(SECRET_PHONE);
      expect(serialized).not.toContain("Hashonly");
    });

    it("aucune ligne AuditLog du tenant ne contient de valeur de mot de passe en clair", async () => {
      // Un POST login echoue (mauvais mdp) ; meme si la route etait auditee, le
      // password ne doit jamais apparaitre en clair dans une ligne d'audit.
      const PW = "SECRET-PW-NEVER-STORED-12345";
      await request(app).post("/api/auth/login").send({
        email: `admin-${TENANT_A}@test.fr`,
        password: PW,
        tenantSlug: TENANT_A,
      });
      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId },
      });
      const allSerialized = JSON.stringify(rows);
      expect(allSerialized).not.toContain(PW);
    });
  });

  describe("AC : echec d'insertion AuditLog -> requete metier non bloquee (AC5)", () => {
    it("DB audit indispo simulee -> POST /api/clients renvoie quand meme 201", async () => {
      // ADR-0009 D3 : l'ecriture audit est en .catch() best-effort via basePrisma.
      // On simule l'indisponibilite en faisant rejeter l'insertion ; la reponse
      // metier ne doit pas changer. On espionne basePrisma.auditLog.create.
      const spy = vi
        .spyOn(auditLogDelegate(basePrisma) as unknown as { create: () => Promise<unknown> }, "create")
        .mockRejectedValue(new Error("DB audit indisponible (simulee)"));

      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: "NonBloquant", lastName: "Test", phone: "0612345603" });

      // La requete metier reussit malgre l'echec d'audit.
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();

      await waitForFlush();
      spy.mockRestore();
    });
  });

  describe("AC : append-only — aucune route n'expose DELETE/UPDATE sur AuditLog", () => {
    it("aucune route /api/audit-log* mutante n'est exposee (PUT/PATCH/DELETE -> jamais 2xx)", async () => {
      const targets = ["/api/audit-logs", "/api/audit-log", "/api/admin/audit-logs"];
      for (const path of targets) {
        for (const verb of ["delete", "put", "patch"] as const) {
          const res = await request(app)
            [verb](`${path}/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${adminAJwt}`);
          // Une route append-only ne doit jamais accepter une mutation : pas de 2xx.
          expect(res.status).toBeGreaterThanOrEqual(400);
        }
      }
    });

    it("le code source ne contient aucun auditLog.update / auditLog.delete (convention append-only)", async () => {
      // ADR-0009 D3 : append-only par convention de code (pas de trigger SQL au
      // socle). On refute toute ecriture mutante sur le modele dans src/.
      const { readFileSync, readdirSync, statSync } = await import("node:fs");
      const { join } = await import("node:path");
      const srcDir = join(__dirname, "../../src");

      function walk(dir: string): string[] {
        const out: string[] = [];
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) out.push(...walk(full));
          else if (full.endsWith(".ts")) out.push(full);
        }
        return out;
      }

      const offending: string[] = [];
      for (const file of walk(srcDir)) {
        const content = readFileSync(file, "utf8");
        if (/auditLog\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/.test(content)) {
          offending.push(file);
        }
      }
      expect(offending).toEqual([]);
    });
  });

  describe("AC : isolation multi-tenant des AuditLog (lecture)", () => {
    it("un ADMIN tenant A ne lit pas les AuditLog du tenant B via la route de consultation (si exposee)", async () => {
      // Genere une ligne d'audit cote tenant B.
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminBJwt}`)
        .send({ firstName: "TenantB", lastName: "Audit", phone: "0612345604" });
      expect(created.status).toBe(201);
      await waitForFlush();

      // La route de consultation (EP17-S05) peut ne pas encore exister : si elle
      // n'existe pas, l'appel renvoie 404 (acceptable). Si elle existe, un ADMIN
      // de A ne doit voir aucune ligne du tenant B.
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${adminAJwt}`);

      if (res.status === 200 && Array.isArray(res.body.data)) {
        const leak = res.body.data.filter(
          (row: { tenantId?: string }) => row.tenantId === tenantBId
        );
        expect(leak).toHaveLength(0);
      } else {
        // Route non encore exposee a l'ADMIN de cabinet : pas de fuite possible.
        expect([401, 403, 404]).toContain(res.status);
      }
    });
  });
});
