import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * EP17-S04 — Tests de securite : acces editeur autonome a un tenant
 * (impersonation / observation).
 *
 * Reference : docs/product/stories/EP17-S04.md (section "Tests de securite
 * (obligatoires)") + Acceptance Criteria.
 * Decisions d'architecture : ADR-0009 D1 (PlatformAdmin + requireEditor), D2
 * (jeton d'impersonation { kind: "impersonation", editorId, tenantId, scope,
 * expiresAt }, scope read par defaut, reconnu par requireJWT), D3 (audit global :
 * la trace porte actorId = editorId reel).
 *
 * Phase TDD rouge : la route POST /api/admin/tenants/:tenantId/enter, la garde de
 * scope lecture (refus des mutations tant que scope !== "write") et la revocation
 * de session d'impersonation n'existent pas encore. Le socle (Vague 1) ne livre
 * que la reconnaissance du kind "impersonation" dans requireJWT et la propagation
 * editorId -> audit ; il ne borne pas encore le scope ni n'offre de revocation.
 * Ces tests echouent tant que la feature EP17-S04 n'est pas implementee.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009 D2) :
 *  - POST /api/admin/tenants/:tenantId/enter  (editeur)
 *      body optionnel { scope?: "read" } -> 201
 *      { data: { token, scope: "read", expiresAt, tenant: { id, name } } }
 *      Ouvre une session d'observation : emet un jeton d'impersonation borne
 *      (kind "impersonation", editorId reel, tenantId cible, scope read, TTL
 *      court) SANS creer de compte User dans le tenant (AC1, AC6).
 *  - Le jeton d'impersonation, presente sur une route tenant nominale (/api/*),
 *      donne acces en LECTURE au tenant cible uniquement, via getTenantPrisma
 *      (meme filtre d'isolation que les users du tenant ; pas de fuite cross-tenant
 *      AC + ADR-0009 D2). Les actions sont tracees avec l'identite de l'editeur
 *      reel (actorId = editorId) et non un compte anonyme (AC5).
 *  - Scope lecture par defaut (moindre privilege, AC4) : les methodes mutantes
 *      (POST/PUT/PATCH/DELETE) sur les routes tenant sont refusees (403) tant que
 *      le scope vaut "read".
 *  - Revocation / TTL (AC2, AC7) : un jeton revoque ou expire est refuse (401/403)
 *      sur les routes tenant. Endpoint de revocation cote BO editeur attendu :
 *      POST /api/admin/tenants/:tenantId/leave  (ou equivalent) qui coupe la
 *      session active de l'editeur sur ce tenant.
 *  - Non-editeur appelant /enter -> 403 (requireEditor en amont) ou 401 sans token.
 *
 * On forge les jetons exactement comme le code cible les produira (HS256 avec le
 * secret serveur). Cela ne contourne aucune verification de signature ; c'est la
 * representation legitime des tokens editeur / impersonation. Un PlatformAdmin
 * reel est cree en base pour que l'audit (actorId -> PlatformAdmin) reference une
 * ligne existante et reste coherent avec le modele.
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-ep17s04@platform.test";

// Tenants de test (cleanup deterministe en afterAll).
const SLUG_OBS = "cabinet-obs-s04"; // tenant observe par l'editeur
const SLUG_OTHER = "cabinet-autre-s04"; // tenant non observe (verif anti-fuite)

/** Jeton editeur nominal (kind "editor"), conforme ADR-0009 D1. */
function signEditorToken(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

/**
 * Jeton d'impersonation conforme ADR-0009 D2. Utilise pour les cas qui ne passent
 * pas par /enter (TTL deja expire, scope force). L'expiration est exprimee en
 * secondes epoch via la claim standard exp.
 */
function signImpersonationToken(opts: {
  editorId: string;
  tenantId: string;
  scope: "read" | "write";
  expiresInSeconds: number;
}): string {
  return jwt.sign(
    {
      kind: "impersonation",
      editorId: opts.editorId,
      tenantId: opts.tenantId,
      scope: opts.scope,
    },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: opts.expiresInSeconds },
  );
}

describe("Security — Acces editeur a un tenant (impersonation, EP17-S04)", () => {
  let editorId: string;
  let editorJwt: string;
  let obsTenantId: string;
  let otherTenantId: string;
  let clientObsId: string;
  let clientOtherId: string;
  let tenantAdminJwt: string;

  beforeAll(async () => {
    // PlatformAdmin reel (editeur) : pas de FK Tenant (ADR-0009 D1).
    const editor = await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      update: {},
      create: {
        email: EDITOR_EMAIL,
        passwordHash: hashSync("editor-temp-password-123!", 10),
        firstName: "Edith",
        lastName: "Teur",
      },
    });
    editorId = editor.id;
    editorJwt = signEditorToken(editorId);

    // Tenant observe + son ADMIN + un client (donnee metier a lire en observation).
    await teardownTestTenant(SLUG_OBS);
    const obs = await prisma.tenant.create({
      data: { name: "Cabinet Observe", slug: SLUG_OBS },
    });
    obsTenantId = obs.id;
    await prisma.user.create({
      data: {
        tenantId: obs.id,
        email: `admin-${SLUG_OBS}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "Obs",
      },
    });
    const loginObs = await request(app).post("/api/auth/login").send({
      email: `admin-${SLUG_OBS}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_OBS,
    });
    tenantAdminJwt = loginObs.body.data.jwt;
    const clientObs = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${tenantAdminJwt}`)
      .send({ firstName: "Obs", lastName: "Client", phone: "0612345601" });
    clientObsId = clientObs.body.data?.id;

    // Tenant tiers (non observe) + un client : sert a verifier qu'un jeton
    // d'impersonation sur le tenant observe ne lit pas le tenant tiers.
    await teardownTestTenant(SLUG_OTHER);
    const other = await prisma.tenant.create({
      data: { name: "Cabinet Autre", slug: SLUG_OTHER },
    });
    otherTenantId = other.id;
    await prisma.user.create({
      data: {
        tenantId: other.id,
        email: `admin-${SLUG_OTHER}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "Autre",
      },
    });
    const loginOther = await request(app).post("/api/auth/login").send({
      email: `admin-${SLUG_OTHER}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_OTHER,
    });
    const clientOther = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${loginOther.body.data.jwt}`)
      .send({ firstName: "Autre", lastName: "Client", phone: "0612345602" });
    clientOtherId = clientOther.body.data?.id;
  });

  afterAll(async () => {
    for (const slug of [SLUG_OBS, SLUG_OTHER]) {
      await teardownTestTenant(slug);
    }
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  /**
   * Helper : ouvre une session d'observation via /enter et retourne le token
   * d'impersonation emis. Echoue le test si la route ne renvoie pas 201.
   */
  async function enterTenant(
    tenantId: string,
    body: Record<string, unknown> = {},
  ): Promise<{ token: string; status: number; data: Record<string, unknown> }> {
    const res = await request(app)
      .post(`/api/admin/tenants/${tenantId}/enter`)
      .set("Authorization", `Bearer ${editorJwt}`)
      .send(body);
    return { token: res.body.data?.token, status: res.status, data: res.body.data };
  }

  describe("AC : l'editeur entre dans un tenant (session lecture, action tracee)", () => {
    it("POST /enter (editeur) -> 201, emet un jeton d'impersonation scope read borne dans le temps", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/enter`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({});

      expect(res.status).toBe(201);
      const data = res.body.data as {
        token: string;
        scope: string;
        expiresAt: string;
        tenant: { id: string };
      };
      // Scope lecture par defaut (moindre privilege, AC4).
      expect(data.scope).toBe("read");
      expect(typeof data.token).toBe("string");
      // Session bornee dans le temps (AC2) : expiresAt dans le futur.
      expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      // Le jeton emis porte le tenant cible et le scope read (ADR-0009 D2).
      const decoded = jwt.verify(data.token, env.JWT_SECRET, {
        algorithms: ["HS256"],
      }) as { kind: string; editorId: string; tenantId: string; scope: string };
      expect(decoded.kind).toBe("impersonation");
      expect(decoded.editorId).toBe(editorId);
      expect(decoded.tenantId).toBe(obsTenantId);
      expect(decoded.scope).toBe("read");
    });

    it("le jeton d'impersonation lit les donnees du tenant observe (GET /api/clients) -> 200", async () => {
      const { token, status } = await enterTenant(obsTenantId);
      expect(status).toBe(201);

      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      // L'editeur observe bien les clients du tenant cible.
      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(clientObsId);
    });

    it("chaque action de la session porte l'identite de l'editeur reel (actorId = editorId), pas un compte anonyme (AC5)", async () => {
      const { token } = await enterTenant(obsTenantId);

      // Une action mutante refusee (scope read) reste une action tracee : on
      // verifie l'identite de l'acteur, pas le succes metier. On cible une
      // tentative d'ecriture pour generer une entree d'audit attribuable.
      await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${token}`)
        .send({ firstName: "Trace", lastName: "Editeur", phone: "0612345699" });

      // L'audit (D3) capture en res.on("finish") : on laisse l'event loop tourner.
      await new Promise((r) => setTimeout(r, 150));

      const logs = await prisma.auditLog.findMany({
        where: { actorId: editorId, tenantId: obsTenantId },
        orderBy: { occurredAt: "desc" },
        take: 5,
      });
      expect(logs.length).toBeGreaterThan(0);
      // La trace porte l'identite reelle de l'editeur (PlatformAdmin), pas un
      // userId de compte cree dans le tenant.
      expect(logs[0].actorId).toBe(editorId);
    });
  });

  describe("AC : apres TTL ou revocation, l'acces est coupe (401/403)", () => {
    it("un jeton d'impersonation expire (TTL ecoule) est refuse sur les routes tenant (401/403)", async () => {
      // expiresIn negatif : le token est deja expire a l'emission (exp < now).
      const expired = signImpersonationToken({
        editorId,
        tenantId: obsTenantId,
        scope: "read",
        expiresInSeconds: -10,
      });
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${expired}`);
      expect([401, 403]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it("apres revocation de la session, le jeton emis ne donne plus acces (401/403)", async () => {
      const { token, status } = await enterTenant(obsTenantId);
      expect(status).toBe(201);

      // Le jeton fonctionne avant revocation.
      const before = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${token}`);
      expect(before.status).toBe(200);

      // Revocation depuis le BO editeur (AC2). Endpoint cible : /leave.
      const revoke = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/leave`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({});
      expect([200, 204]).toContain(revoke.status);

      // Apres revocation, le meme jeton (non expire) est refuse.
      const after = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${token}`);
      expect([401, 403]).toContain(after.status);
      expect(after.status).not.toBe(200);
    });
  });

  describe("AC : un non-editeur ne peut pas ouvrir de session d'observation", () => {
    it("ADMIN de cabinet appelant /enter -> 403 (requireEditor)", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/enter`)
        .set("Authorization", `Bearer ${tenantAdminJwt}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("appel /enter sans token -> 401 (requireJWT en amont)", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/enter`)
        .send({});
      expect(res.status).toBe(401);
    });
  });

  describe("AC : ecriture refusee tant qu'elle n'est pas activee + justifiee (moindre privilege)", () => {
    it("avec un jeton scope read, une mutation (POST /api/clients) est refusee -> 403", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${token}`)
        .send({ firstName: "Inter", lastName: "Dit", phone: "0612345603" });
      expect(res.status).toBe(403);
    });

    it("avec un jeton scope read, une mise a jour (PATCH /api/clients/:id) est refusee -> 403", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .patch(`/api/clients/${clientObsId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ lastName: "Modifie" });
      expect(res.status).toBe(403);
    });

    it("avec un jeton scope read, une suppression (DELETE /api/clients/:id) est refusee -> 403", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .delete(`/api/clients/${clientObsId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("la mutation refusee ne modifie aucune donnee du tenant observe", async () => {
      const { token } = await enterTenant(obsTenantId);
      await request(app)
        .patch(`/api/clients/${clientObsId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ lastName: "NeDoitPasPasser" });

      // Le client reste inchange (lecture via l'ADMIN du tenant).
      const check = await request(app)
        .get(`/api/clients/${clientObsId}`)
        .set("Authorization", `Bearer ${tenantAdminJwt}`);
      expect(check.status).toBe(200);
      expect(check.body.data.lastName).toBe("Client");
    });
  });

  describe("AC : l'entree ne cree pas de compte persistant dans le tenant (autonomie)", () => {
    it("apres /enter, aucun User additionnel n'est cree dans le tenant observe", async () => {
      const before = await prisma.user.count({ where: { tenantId: obsTenantId } });

      const { status } = await enterTenant(obsTenantId);
      expect(status).toBe(201);

      const after = await prisma.user.count({ where: { tenantId: obsTenantId } });
      // AC1/AC6 : observation par jeton d'impersonation, pas de compte cree.
      expect(after).toBe(before);
    });

    it("aucun User du tenant observe ne porte l'email de l'editeur", async () => {
      await enterTenant(obsTenantId);
      const ghost = await prisma.user.findFirst({
        where: { tenantId: obsTenantId, email: EDITOR_EMAIL },
      });
      expect(ghost).toBeNull();
    });
  });

  describe("AC : l'editeur n'accede qu'au tenant ou il est entre (pas de fuite cross-tenant)", () => {
    it("un jeton d'impersonation sur le tenant observe ne liste pas les clients d'un autre tenant", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      // Le client du tenant tiers n'apparait pas (isolation via getTenantPrisma).
      expect(ids).not.toContain(clientOtherId);
      expect(ids).toContain(clientObsId);
    });

    it("un jeton d'impersonation sur le tenant observe ne lit pas un client precis d'un autre tenant (404, pas de fuite)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get(`/api/clients/${clientOtherId}`)
        .set("Authorization", `Bearer ${token}`);
      // Le filtre d'isolation borne l'editeur au tenant observe : la ressource
      // d'un autre tenant n'est pas trouvee (pas de confirmation d'existence
      // hors scope). Jamais 200.
      expect(res.status).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    });

    it("le tenantId du jeton vient du jeton signe (path /enter), pas manipulable par le corps de requete", async () => {
      // ADR-0009 D2 : le tenantId observe provient du jeton signe. Forger un
      // jeton vers le tenant tiers donne acces au tenant tiers uniquement, ce qui
      // confirme que l'isolation suit le tenantId du jeton et non un parametre
      // arbitraire. On verifie qu'un jeton tenant-observe ne voit pas le tiers,
      // et reciproquement.
      const tokenOther = signImpersonationToken({
        editorId,
        tenantId: otherTenantId,
        scope: "read",
        expiresInSeconds: 3600,
      });
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${tokenOther}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(clientOtherId);
      expect(ids).not.toContain(clientObsId);
    });
  });

  /**
   * SECURITE — remediation escalade cross-tenant (reviewers compliance).
   *
   * INTENTION ADR-0009 D2 : un jeton d'impersonation donne a l'editeur un acces
   * LECTURE aux donnees NOMINALES du tenant cible (routes /api/* tenant-scope),
   * SANS atteindre la surface Back Office cross-tenant /api/admin/*, et SANS
   * pouvoir muter (scope read).
   *
   * DEFAUT corrige : requireEditor ne testait que `if (!req.editor)`, et
   * requireJWT peuple req.editor AUSSI pour kind "impersonation". Un jeton
   * d'impersonation passait donc requireEditor et atteignait /api/admin/* :
   *   - POST /enter -> il forgeait un nouveau jeton d'impersonation vers un autre
   *     tenant (escalade cross-tenant) ;
   *   - GET /audit-logs(/stats|/export|/:id) -> il lisait les AuditLog de TOUS
   *     les tenants (fuite cross-tenant).
   *
   * Contrat cible : la surface BO /api/admin/* exige kind "editor" (vrai
   * editeur). Un jeton d'impersonation y est refuse en 403. L'acces LECTURE du
   * jeton d'impersonation aux routes tenant nominales reste intact (verifie plus
   * haut).
   */
  describe("SEC : un jeton d'impersonation ne franchit PAS la surface BO /api/admin/*", () => {
    it("impersonation -> POST /enter vers le MEME tenant => 403 (ne peut pas forger un nouveau jeton)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/enter`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("impersonation (tenant observe) -> POST /enter vers un AUTRE tenant => 403 (pas d'escalade cross-tenant)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .post(`/api/admin/tenants/${otherTenantId}/enter`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
      // Aucun jeton d'impersonation vers le tenant tiers n'est emis.
      expect(res.body.data?.token).toBeUndefined();
    });

    it("impersonation -> POST /leave (BO) => 403 (pas d'action de gestion de session cross-tenant)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .post(`/api/admin/tenants/${otherTenantId}/leave`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("impersonation -> GET /api/admin/tenants => 403 (et ne liste pas les cabinets cross-tenant)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      // La liste cross-tenant des cabinets n'est jamais renvoyee a une session
      // d'observation (qui est bornee a un seul tenant via req.user).
      expect(res.body.data).toBeUndefined();
    });

    it("impersonation -> GET /api/admin/tenants/:id (autre tenant) => 403 (pas de detail cross-tenant)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get(`/api/admin/tenants/${otherTenantId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("impersonation -> GET /api/admin/tenants/:id/users (autre tenant) => 403 (pas de fuite des comptes)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get(`/api/admin/tenants/${otherTenantId}/users`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("impersonation -> POST /api/admin/tenants (creation cabinet) => 403", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${token}`)
        .send({
          slug: "ne-doit-pas-se-creer-s04",
          name: "Forge",
          admin: { email: "x@x.fr", firstName: "X", lastName: "Y" },
        });
      expect(res.status).toBe(403);
    });

    it("impersonation -> GET /api/admin/audit-logs => 403 (pas de lecture cross-tenant des journaux)", async () => {
      const { token } = await enterTenant(obsTenantId);
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      // Surtout : aucune ligne d'audit (d'un autre tenant ou non) n'est exposee.
      expect(res.body.data).toBeUndefined();
    });
  });

  describe("SEC : non-regression — un vrai jeton editeur garde l'acces complet au BO", () => {
    it("editeur -> GET /api/admin/tenants => 200 (acces cross-tenant preserve)", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("editeur -> POST /enter => 201 (emission de jeton d'impersonation preservee)", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${obsTenantId}/enter`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({});
      expect(res.status).toBe(201);
      expect(typeof res.body.data?.token).toBe("string");
    });

    it("editeur -> GET /api/admin/audit-logs => 200 (lecture cross-tenant preservee)", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
