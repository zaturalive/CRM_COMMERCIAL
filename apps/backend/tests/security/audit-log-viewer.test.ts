import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * EP17-S05 — Tests de securite : visualisation et analyse des logs d'audit (BO).
 *
 * Reference : docs/product/stories/EP17-S05.md (section "Tests de securite
 * (obligatoires)") + Acceptance Criteria.
 * Decisions d'architecture : ADR-0009 D1 (PlatformAdmin + requireEditor sur
 * /api/admin/*), D3 (AuditLog append-only, hors TENANT_BOUND_MODELS, bodyHash
 * uniquement — pas de donnee metier en clair).
 *
 * Dependance : cette story LIT les lignes produites par EP14-S04 ; elle n'en
 * produit aucune (lecture seule). Les lignes consultees existent deja en base
 * (le middleware d'audit global les ecrit sur toute mutation).
 *
 * Phase TDD rouge : la route GET /api/admin/audit-logs (liste filtrable, paginee,
 * cross-tenant editeur), la route detail GET /api/admin/audit-logs/:id, les
 * agregats GET /api/admin/audit-logs/stats et l'export GET
 * /api/admin/audit-logs/export n'existent pas encore dans src/routes/admin.ts.
 * Ces tests echouent tant que la feature EP17-S05 n'est pas implementee.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009 D1/D3) :
 *  - GET /api/admin/audit-logs (editeur) -> 200
 *      { success, data: AuditLogRow[], pagination: { nextCursor, hasMore } }
 *      Liste paginee, cross-tenant (toutes les lignes, tous tenants), triable par
 *      date, filtrable par tenant / userId / method / path / plage de dates /
 *      statusCode (AC1, AC2).
 *  - GET /api/admin/audit-logs/:id (editeur) -> 200 { success, data: AuditLogRow }
 *      Vue detail : tous les champs (qui/quoi/ou/comment/quand + bodyHash) (AC3).
 *  - GET /api/admin/audit-logs/stats (editeur) -> 200
 *      { success, data: { mutationsByTenant, loginFailures, activityPeaks } }
 *      Agregats simples (AC6).
 *  - GET /api/admin/audit-logs/export?format=csv|json (editeur) -> 200
 *      Export d'un sous-ensemble filtre (AC7).
 *  - Toutes ces routes sont sous /api/admin/* : requireEditor en amont renvoie 403
 *      a tout acteur tenant (ADMIN/COMMERCIAL) et 401 sans token (AC4).
 *  - Lecture seule : aucune route DELETE/UPDATE/PUT/PATCH/POST sur audit-logs
 *      n'est exposee (append-only respecte cote API, AC5).
 *  - Les lignes renvoyees ne contiennent pas de donnee metier en clair : seul
 *      bodyHash (SHA-256), aucun firstName/lastName/email/phone/password (AC5,
 *      coherent avec la sanitization EP14-S04).
 *
 * On forge le jeton editeur exactement comme signEditorJWT le produit (HS256 avec
 * le secret serveur) : c'est la representation legitime d'un token editeur, aucun
 * contournement de signature. Un PlatformAdmin reel est cree en base pour rester
 * coherent avec le modele (actorId -> PlatformAdmin).
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-ep17s05@platform.test";

// Tenants de test (cleanup deterministe en afterAll).
const SLUG_A = "test-audit-viewer-a";
const SLUG_B = "test-audit-viewer-b";

/** Jeton editeur nominal (kind "editor"), conforme ADR-0009 D1. */
function signEditorToken(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

// POURQUOI : l'ecriture d'audit est fire-and-forget en res.on("finish") (ADR-0009
// D3). On laisse un court delai au flush avant de lire/consulter les lignes.
async function waitForFlush(ms = 250): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
  occurredAt: string;
};

describe("Security — Audit log viewer /api/admin/audit-logs (EP17-S05)", () => {
  let editorId: string;
  let editorJwt: string;
  let adminAJwt: string;
  let commercialAJwt: string;
  let tenantAId: string;
  let userAId: string;
  let adminBJwt: string;
  let tenantBId: string;

  // Marqueurs uniques injectes via des champs sensibles (firstName/lastName/phone)
  // d'un client cree avant les tests. Ils ne doivent JAMAIS reapparaitre en clair
  // dans une reponse du viewer (la sanitization EP14-S04 ne stocke que bodyHash).
  const SECRET_FIRST = "PrenomQuiNeDoitPasFuirS05";
  const SECRET_LAST = "NomQuiNeDoitPasFuirS05";
  const SECRET_PHONE = "0699112233";

  beforeAll(async () => {
    // Editeur reel (PlatformAdmin, hors modele Tenant — ADR-0009 D1).
    const editor = await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      // EP14-S01 (editeur) / AC7 : enrole en 2FA email par defaut pour passer le gate
      // requireEditor2faEnrolled (le JWT editeur est forge, le gate relit la base).
      update: { mfaEmailEnabled: true },
      create: {
        mfaEmailEnabled: true,
        email: EDITOR_EMAIL,
        passwordHash: hashSync("editor-temp-password-123!", 10),
        firstName: "Edith",
        lastName: "Teur",
      },
    });
    editorId = editor.id;
    editorJwt = signEditorToken(editorId);

    // Tenant A + admin + commercial + une mutation (genere des lignes d'audit).
    await teardownTestTenant(SLUG_A);
    const tenantA = await prisma.tenant.create({
      data: { name: "Cabinet Viewer A", slug: SLUG_A },
    });
    tenantAId = tenantA.id;
    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `admin-${SLUG_A}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "ViewerA",
      },
    });
    userAId = adminA.id;
    await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `commercial-${SLUG_A}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "COMMERCIAL",
        firstName: "Commercial",
        lastName: "ViewerA",
      },
    });
    const loginAdminA = await request(app).post("/api/auth/login").send({
      email: `admin-${SLUG_A}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_A,
    });
    adminAJwt = loginAdminA.body.data.jwt;
    const loginCommA = await request(app).post("/api/auth/login").send({
      email: `commercial-${SLUG_A}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_A,
    });
    commercialAJwt = loginCommA.body.data.jwt;

    // Mutation cote A avec des marqueurs sensibles -> ligne d'audit (bodyHash only).
    await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminAJwt}`)
      .send({ firstName: SECRET_FIRST, lastName: SECRET_LAST, phone: SECRET_PHONE });

    // Tenant B + admin + une mutation (sert a verifier le cross-tenant editeur et
    // l'isolation d'un ADMIN, qui ne doit pas voir cette route du tout).
    await teardownTestTenant(SLUG_B);
    const tenantB = await prisma.tenant.create({
      data: { name: "Cabinet Viewer B", slug: SLUG_B },
    });
    tenantBId = tenantB.id;
    await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `admin-${SLUG_B}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "ViewerB",
      },
    });
    const loginAdminB = await request(app).post("/api/auth/login").send({
      email: `admin-${SLUG_B}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_B,
    });
    adminBJwt = loginAdminB.body.data.jwt;
    await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminBJwt}`)
      .send({ firstName: "TenantB", lastName: "Mutation", phone: "0612340000" });

    await waitForFlush();
  });

  afterAll(async () => {
    for (const slug of [SLUG_A, SLUG_B]) {
      await teardownTestTenant(slug);
    }
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC : editeur accede a /api/admin/audit-logs (liste filtrable, cross-tenant)", () => {
    it("editeur GET /api/admin/audit-logs -> 200, liste paginee", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("la liste editeur est cross-tenant : elle contient des lignes des tenants A ET B", async () => {
      // L'editeur lit tous les tenants (AC4, cross-tenant). On pagine large pour
      // ne pas dependre de la taille de page par defaut.
      const res = await request(app)
        .get("/api/admin/audit-logs?limit=200")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      const tenantIds = new Set(rows.map((r) => r.tenantId));
      expect(tenantIds.has(tenantAId)).toBe(true);
      expect(tenantIds.has(tenantBId)).toBe(true);
    });

    it("filtre par tenant : ne renvoie que les lignes du tenant demande (AC1)", async () => {
      const res = await request(app)
        .get(`/api/admin/audit-logs?tenantId=${tenantAId}&limit=200`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tenantId).toBe(tenantAId);
      }
      // Aucune ligne du tenant B ne fuit dans un filtre tenant=A.
      expect(rows.some((r) => r.tenantId === tenantBId)).toBe(false);
    });

    it("filtre par methode : method=POST ne renvoie que des POST (AC1)", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs?method=POST&limit=200")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.method).toBe("POST");
      }
    });

    it("filtre par userId : ne renvoie que les lignes de l'utilisateur demande (AC1)", async () => {
      const res = await request(app)
        .get(`/api/admin/audit-logs?userId=${userAId}&limit=200`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      for (const row of rows) {
        expect(row.userId).toBe(userAId);
      }
    });

    it("filtre par plage de dates : occurredAt borne dans l'intervalle demande (AC1)", async () => {
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .get(`/api/admin/audit-logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      for (const row of rows) {
        const t = new Date(row.occurredAt).getTime();
        expect(t).toBeGreaterThanOrEqual(new Date(from).getTime());
        expect(t).toBeLessThanOrEqual(new Date(to).getTime());
      }
    });

    it("tri par date decroissant par defaut (AC2) : occurredAt non croissant", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs?limit=200")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      for (let i = 1; i < rows.length; i++) {
        const prev = new Date(rows[i - 1].occurredAt).getTime();
        const cur = new Date(rows[i].occurredAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(cur);
      }
    });

    it("pagination : limit borne la taille de page et expose un curseur (AC2)", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs?limit=1")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      expect(rows.length).toBeLessThanOrEqual(1);
      // Contrat de pagination keyset : la reponse expose un bloc pagination.
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe("AC : vue detail d'une entree (tous les champs)", () => {
    it("editeur GET /api/admin/audit-logs/:id -> 200 avec tous les champs qui/quoi/ou/comment/quand + bodyHash (AC3)", async () => {
      const list = await request(app)
        .get("/api/admin/audit-logs?limit=1")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(list.status).toBe(200);
      const first = (list.body.data as AuditLogRow[])[0];
      expect(first).toBeDefined();

      const res = await request(app)
        .get(`/api/admin/audit-logs/${first.id}`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const row = res.body.data as AuditLogRow;
      // Tous les champs du modele sont presents (cles definies, valeur eventuellement null).
      for (const key of [
        "id",
        "userId",
        "actorId",
        "tenantId",
        "method",
        "path",
        "action",
        "statusCode",
        "ip",
        "userAgent",
        "bodyHash",
        "occurredAt",
      ]) {
        expect(row).toHaveProperty(key);
      }
    });

    it("GET /api/admin/audit-logs/:id sur un id inconnu -> 404 (pas de fuite d'existence)", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(404);
    });
  });

  describe("AC : ADMIN de cabinet et COMMERCIAL n'accedent pas a la vue (BO reserve editeur)", () => {
    it("ADMIN de cabinet appelle GET /api/admin/audit-logs -> 403", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(403);
    });

    it("COMMERCIAL appelle GET /api/admin/audit-logs -> 403", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${commercialAJwt}`);
      expect(res.status).toBe(403);
    });

    it("appel sans token -> 401 (requireJWT en amont)", async () => {
      const res = await request(app).get("/api/admin/audit-logs");
      expect(res.status).toBe(401);
    });

    it("un ADMIN ne lit aucune ligne d'audit via cette route (pas de 200, donc pas de fuite cross-tenant)", async () => {
      // La route est reservee a l'editeur (AC4). Un ADMIN n'a pas de chemin viewer :
      // il est refuse en amont (403). Aucune ligne du tenant B (ni d'un autre) ne
      // peut donc fuiter vers un ADMIN de A par cette route.
      const res = await request(app)
        .get(`/api/admin/audit-logs?tenantId=${tenantBId}`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(403);
    });
  });

  describe("AC : lecture seule — aucune route de modification/suppression de log (append-only)", () => {
    it("DELETE /api/admin/audit-logs/:id (editeur) -> jamais 2xx", async () => {
      const res = await request(app)
        .delete("/api/admin/audit-logs/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("PATCH /api/admin/audit-logs/:id (editeur) -> jamais 2xx", async () => {
      const res = await request(app)
        .patch("/api/admin/audit-logs/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ statusCode: 200 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("PUT /api/admin/audit-logs/:id (editeur) -> jamais 2xx", async () => {
      const res = await request(app)
        .put("/api/admin/audit-logs/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ statusCode: 200 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("POST /api/admin/audit-logs (editeur) -> jamais 2xx (pas de creation manuelle de log)", async () => {
      const res = await request(app)
        .post("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ method: "POST", path: "/forge", statusCode: 200 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("le code source ne contient aucun auditLog.update / auditLog.delete (convention append-only)", async () => {
      // ADR-0009 D3 : append-only par convention de code. EP17-S05 etant la story
      // de LECTURE, on refute toute ecriture mutante introduite par sa route.
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

  describe("AC : les logs affiches ne revelent aucune donnee metier en clair (coherent EP14-S04)", () => {
    it("la liste editeur ne contient ni firstName/lastName/phone d'un client cree, ni mot de passe", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs?limit=200")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const serialized = JSON.stringify(res.body.data);
      // Les marqueurs injectes dans le body de creation client n'apparaissent pas :
      // seul bodyHash est conserve (ADR-0009 D3, sanitization EP14-S04).
      expect(serialized).not.toContain(SECRET_FIRST);
      expect(serialized).not.toContain(SECRET_LAST);
      expect(serialized).not.toContain(SECRET_PHONE);
      expect(serialized).not.toContain("test-password-123");
    });

    it("les bodyHash exposes sont des SHA-256 hex (jamais le corps en clair)", async () => {
      const res = await request(app)
        .get(`/api/admin/audit-logs?tenantId=${tenantAId}&method=POST&limit=200`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      const rows = res.body.data as AuditLogRow[];
      const withHash = rows.filter((r) => r.bodyHash !== null && r.bodyHash !== "");
      expect(withHash.length).toBeGreaterThan(0);
      for (const row of withHash) {
        expect(row.bodyHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe("AC : agregats simples (AC6) et export (AC7)", () => {
    it("GET /api/admin/audit-logs/stats (editeur) -> 200 avec agregats simples", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs/stats")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Agregats de base, sans sur-conception (Mantra #37) : mutations par tenant,
      // echecs de login, pics d'activite.
      expect(res.body.data).toHaveProperty("mutationsByTenant");
      expect(res.body.data).toHaveProperty("loginFailures");
      expect(res.body.data).toHaveProperty("activityPeaks");
    });

    it("GET /api/admin/audit-logs/stats : ADMIN de cabinet -> 403 (BO reserve editeur)", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs/stats")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(403);
    });

    it("GET /api/admin/audit-logs/export?format=json (editeur) -> 200, sous-ensemble filtre", async () => {
      const res = await request(app)
        .get(`/api/admin/audit-logs/export?format=json&tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      // L'export filtre par tenant ne contient pas de donnee metier en clair non plus.
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(SECRET_FIRST);
      expect(serialized).not.toContain(SECRET_PHONE);
    });

    it("GET /api/admin/audit-logs/export?format=csv (editeur) -> 200, content-type CSV", async () => {
      const res = await request(app)
        .get(`/api/admin/audit-logs/export?format=csv&tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      // Le CSV ne fuite pas non plus les marqueurs sensibles.
      expect(res.text).not.toContain(SECRET_FIRST);
      expect(res.text).not.toContain(SECRET_PHONE);
    });

    it("GET /api/admin/audit-logs/export : ADMIN de cabinet -> 403", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs/export?format=json")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(403);
    });
  });
});
