import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { validatePassword } from "../../src/lib/passwordPolicy";

/**
 * EP17-S03 — Tests de securite du CRUD users cross-tenant depuis le Back Office
 * editeur.
 *
 * Reference : docs/product/stories/EP17-S03.md (section "Tests de securite
 * (obligatoires)" + fichier cible tenant-users-admin.test.ts). Decisions
 * d'architecture liees : ADR-0009 D1 (PlatformAdmin + requireEditor + basePrisma
 * sur /api/admin/*), D2 (l'editeur n'herite PAS implicitement d'un acces aux
 * donnees metier d'un tenant : un jeton editeur nominal n'a pas de contexte
 * tenant), D3 (audit global, actorId =
 * editorId), D5 (mustChangePassword + password policy partagee), D7 (reset
 * degrade : mot de passe temporaire renvoye, sans dependance email).
 *
 * Distinction avec EP15-S02 (story EP17-S03, section Contexte) : EP15-S02 permet
 * a l'ADMIN d'un cabinet de gerer SES propres users (tenant deduit du JWT, routes
 * /api/users tenant-scope). Ici, l'EDITEUR agit CROSS-TENANT depuis le BO sur les
 * users de N'IMPORTE QUEL tenant, le scope tenant etant passe en PARAMETRE
 * (/api/admin/tenants/:tenantId/users) et verifie par requireEditor. Memes
 * operations, acteur et perimetre differents (note technique de la story :
 * "ici le scope tenant est passe en parametre, alors qu'en EP15-S02 il est deduit
 * du JWT de l'admin").
 *
 * Phase TDD rouge : les routes /api/admin/tenants/:tenantId/users (GET liste,
 * POST creation, PATCH desactiver/reactiver/changer role, POST reset-password)
 * n'existent pas encore. Ces tests echouent tant que la feature n'est pas
 * implementee.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009) :
 *  - GET  /api/admin/tenants/:tenantId/users        (editeur) -> 200 liste des
 *        users du tenant cible. 404 si le tenant n'existe pas. Jamais de hash.
 *  - POST /api/admin/tenants/:tenantId/users        body { email, firstName,
 *        lastName, role } -> 201 { user: { id, email, role, active },
 *        tempPassword } ; cree le compte DANS le tenant cible avec
 *        mustChangePassword=true et un mot de passe temporaire conforme a la
 *        policy (D5/D7). Role borne a UserRole (ADMIN | COMMERCIAL) ; un role
 *        plateforme (EDITEUR...) -> 400 (escalade fermee, D1).
 *  - PATCH /api/admin/tenants/:tenantId/users/:id   body { active?, role? }
 *        -> 200 ; desactive/reactive et/ou change le role. 409 si l'operation
 *        retire le dernier ADMIN actif du tenant (garde AC5). 404 si l'id
 *        n'appartient pas au tenant cible (pas de modification cross-tenant
 *        accidentelle).
 *  - POST /api/admin/tenants/:tenantId/users/:id/reset-password (editeur)
 *        -> 200 ; reset degrade D7 (nouveau hash + mustChangePassword=true,
 *        tempPassword renvoye une fois). 404 hors tenant.
 *  - Garde "dernier admin" (AC5) : refus de desactiver/retrograder le dernier
 *        ADMIN actif d'un tenant.
 *  - Tracabilite (AC7) : chaque action est tracee par le middleware d'audit
 *        global (EP14-S04 / D3) avec l'identite de l'editeur (AuditLog.actorId =
 *        editorId, et non un userId tenant).
 *
 * On forge le jeton editeur exactement comme le login editeur le produira
 * (kind: "editor", signe HS256 avec le secret serveur). Cela ne contourne aucune
 * verification de signature ; c'est la representation legitime d'un token
 * editeur, et un PlatformAdmin reel est cree en base pour l'audit (actorId ->
 * PlatformAdmin) et pour rester coherent avec le modele (ADR-0009 D1).
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-ep17s03@platform.test";
// Tenants cibles manipules par l'editeur (cleanup deterministe en afterAll).
const TENANT_TARGET = "cabinet-target-ep17s03";
const TENANT_OTHER = "cabinet-other-ep17s03";

interface CreatedUserResponse {
  user: { id: string; email: string; role: string; active: boolean };
  tempPassword: string;
}

function signEditorToken(editorId: string): string {
  // Forme attendue du token editeur (ADR-0009 D1) : kind "editor", signe HS256.
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("Security — CRUD users cross-tenant Back Office editeur (EP17-S03)", () => {
  let editorId: string;
  let editorJwt: string;
  let tenantTarget: { id: string; slug: string };
  let tenantOther: { id: string; slug: string };
  // JWT d'un ADMIN de cabinet quelconque : pour verifier que /api/admin/* est
  // hors de sa portee (requireEditor -> 403).
  let tenantAdminJwt: string;
  // Cible du tenant "other" : pour verifier qu'une route scopee au tenant cible
  // ne touche pas un user d'un autre tenant (pas de mutation cross-tenant).
  let userOtherId: string;

  beforeAll(async () => {
    await teardownTestTenant(TENANT_TARGET);
    await teardownTestTenant(TENANT_OTHER);

    // PlatformAdmin reel (editeur) : pas de FK Tenant (ADR-0009 D1). On l'upsert
    // pour que actorId d'audit reference une ligne existante (D3).
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

    // Tenant cible avec son ADMIN + COMMERCIAL (les operations editeur portent
    // sur ce tenant via /api/admin/tenants/:tenantId/users).
    const target = await setupTestTenant(app, TENANT_TARGET);
    tenantTarget = target.tenant;
    tenantAdminJwt = target.admin.jwt;

    // Tenant distinct : sert de temoin d'isolation cross-tenant.
    const other = await setupTestTenant(app, TENANT_OTHER);
    tenantOther = other.tenant;
    userOtherId = other.commercial.userId;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_TARGET);
    await teardownTestTenant(TENANT_OTHER);
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("Test securite 1 : l'editeur cree un user dans un tenant cible, action tracee", () => {
    it("POST /api/admin/tenants/:tenantId/users (editeur) -> 201, compte cree DANS le tenant cible", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "commercial-cree-par-editeur@target.fr",
          firstName: "Cyril",
          lastName: "Cree",
          role: "COMMERCIAL",
        });

      expect(res.status).toBe(201);
      const data = res.body.data as CreatedUserResponse;
      expect(data.user.email).toBe("commercial-cree-par-editeur@target.fr");
      expect(data.user.role).toBe("COMMERCIAL");

      // Persiste dans le tenant cible passe en parametre (pas ailleurs).
      const created = await prisma.user.findFirst({
        where: { email: "commercial-cree-par-editeur@target.fr" },
      });
      expect(created).not.toBeNull();
      expect(created!.tenantId).toBe(tenantTarget.id);
      // D5 : le compte provisionne par l'editeur part en force-change.
      expect(created!.mustChangePassword).toBe(true);
    });

    it("le mot de passe temporaire renvoye est conforme a la policy (D5/D7) et permet le login dans le tenant cible", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "login-via-editeur@target.fr",
          firstName: "Lina",
          lastName: "Login",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);
      const data = res.body.data as CreatedUserResponse;

      // Chemin degrade D7 : pas d'email, le mot de passe temporaire est renvoye.
      expect(typeof data.tempPassword).toBe("string");
      expect(validatePassword(data.tempPassword).valid).toBe(true);

      const login = await request(app).post("/api/auth/login").send({
        email: "login-via-editeur@target.fr",
        password: data.tempPassword,
        tenantSlug: TENANT_TARGET,
      });
      expect(login.status).toBe(200);
      // Gate force-change signalee au login (D5).
      expect(login.body.data.mustChangePassword).toBe(true);
    });

    it("la creation par l'editeur est tracee dans AuditLog avec actorId = editeur (et non un userId tenant) (AC7 / D3)", async () => {
      const email = "trace-creation@target.fr";
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email,
          firstName: "Tra",
          lastName: "Ce",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);

      // L'audit est non-bloquant et ecrit en res.on("finish") : on laisse un
      // court delai au flush asynchrone avant d'interroger la base (D3).
      await new Promise((resolve) => setTimeout(resolve, 200));

      const log = await prisma.auditLog.findFirst({
        where: {
          method: "POST",
          path: { contains: `/api/admin/tenants/${tenantTarget.id}/users` },
          actorId: editorId,
        },
        orderBy: { occurredAt: "desc" },
      });
      expect(log).not.toBeNull();
      // L'identite tracee est celle de l'editeur (acteur plateforme), pas un
      // user tenant : userId reste null pour une action editeur (ADR-0009 D3).
      expect(log!.actorId).toBe(editorId);
      expect(log!.userId).toBeNull();
      // Le corps n'est jamais stocke en clair : seul un bodyHash est conserve.
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain(email);
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });

    it("l'editeur desactive un user du tenant cible, l'action est tracee (editeur identifie)", async () => {
      // Cree une cible dans le tenant cible.
      const created = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "a-desactiver-par-editeur@target.fr",
          firstName: "Des",
          lastName: "Active",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const targetId = (created.body.data as CreatedUserResponse).user.id;

      const patch = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${targetId}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });
      expect(patch.status).toBe(200);

      // Effet correct : le compte est desactive en base.
      const after = await prisma.user.findUnique({ where: { id: targetId } });
      expect(after!.active).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Tracabilite : l'action de desactivation porte l'identite de l'editeur.
      const log = await prisma.auditLog.findFirst({
        where: {
          method: "PATCH",
          path: { contains: `/api/admin/tenants/${tenantTarget.id}/users/${targetId}` },
          actorId: editorId,
        },
        orderBy: { occurredAt: "desc" },
      });
      expect(log).not.toBeNull();
      expect(log!.actorId).toBe(editorId);
    });
  });

  describe("Test securite 2 : un non-editeur appelle /api/admin/tenants/:id/users -> 403", () => {
    it("ADMIN de cabinet sur GET /api/admin/tenants/:tenantId/users -> 403, requireEditor (D1)", async () => {
      const res = await request(app)
        .get(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${tenantAdminJwt}`);
      // requireEditor garde tout /api/admin/* : un ADMIN de cabinet n'est pas un
      // editeur plateforme (le kind du jeton est "user", pas "editor").
      expect(res.status).toBe(403);
    });

    it("ADMIN de cabinet sur POST /api/admin/tenants/:tenantId/users -> 403, aucun compte cree", async () => {
      const before = await prisma.user.count({ where: { tenantId: tenantTarget.id } });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${tenantAdminJwt}`)
        .send({
          email: "interdit-par-admin@target.fr",
          firstName: "Inter",
          lastName: "Dit",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(403);
      const after = await prisma.user.count({ where: { tenantId: tenantTarget.id } });
      expect(after).toBe(before);
      const leaked = await prisma.user.findFirst({
        where: { email: "interdit-par-admin@target.fr" },
      });
      expect(leaked).toBeNull();
    });

    it("appel sans token sur /api/admin/tenants/:tenantId/users -> 401 (requireJWT en amont)", async () => {
      const res = await request(app).get(
        `/api/admin/tenants/${tenantTarget.id}/users`,
      );
      expect(res.status).toBe(401);
    });

    it("un COMMERCIAL de cabinet sur /api/admin/tenants/:tenantId/users -> 403", async () => {
      const commercial = await request(app).post("/api/auth/login").send({
        email: `commercial-${TENANT_TARGET}@test.fr`,
        password: "test-password-123",
        tenantSlug: TENANT_TARGET,
      });
      const res = await request(app)
        .get(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${commercial.body.data.jwt}`);
      expect(res.status).toBe(403);
    });
  });

  describe("Test securite 3 : desactivation du dernier ADMIN actif d'un tenant -> refus (garde AC5)", () => {
    it("desactiver le dernier ADMIN actif du tenant cible -> 409, l'admin reste actif", async () => {
      const admin = await prisma.user.findFirst({
        where: { tenantId: tenantTarget.id, role: "ADMIN", active: true },
      });
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${admin!.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });

      // 409 : conflit d'etat, le tenant ne peut pas rester sans admin actif.
      expect(res.status).toBe(409);

      const after = await prisma.user.findUnique({ where: { id: admin!.id } });
      expect(after!.active).toBe(true);
    });

    it("retrograder le dernier ADMIN actif en COMMERCIAL -> 409, role inchange", async () => {
      const admin = await prisma.user.findFirst({
        where: { tenantId: tenantTarget.id, role: "ADMIN", active: true },
      });
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${admin!.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ role: "COMMERCIAL" });
      expect(res.status).toBe(409);

      const after = await prisma.user.findUnique({ where: { id: admin!.id } });
      expect(after!.role).toBe("ADMIN");
    });

    it("avec un second ADMIN actif cree par l'editeur, la desactivation du premier est autorisee (200)", async () => {
      // L'editeur promeut un second ADMIN actif, ce qui leve la garde.
      const created = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "second-admin-editeur@target.fr",
          firstName: "Sandra",
          lastName: "Second",
          role: "ADMIN",
        });
      expect(created.status).toBe(201);
      const secondAdminId = (created.body.data as CreatedUserResponse).user.id;

      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${secondAdminId}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({ where: { id: secondAdminId } });
      expect(after!.active).toBe(false);
    });

    it("la garde dernier admin est calculee PAR tenant : un ADMIN actif d'un autre tenant ne leve pas la garde du tenant cible", async () => {
      // Le tenant "other" a son propre ADMIN actif. Il ne doit pas etre compte
      // comme un admin de secours du tenant cible (decompte scope au tenant
      // passe en parametre). On verifie qu'apres le test precedent (un seul
      // ADMIN actif restant dans le tenant cible), la garde se declenche de
      // nouveau, prouvant que le decompte est bien borne au tenant cible.
      const targetAdmins = await prisma.user.findMany({
        where: { tenantId: tenantTarget.id, role: "ADMIN", active: true },
      });
      expect(targetAdmins.length).toBe(1);

      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${targetAdmins[0].id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });
      // La presence d'un ADMIN actif dans le tenant "other" ne sauve pas le
      // tenant cible : la garde refuse (409).
      expect(res.status).toBe(409);
    });
  });

  describe("Test securite 4 : un user desactive ne peut plus se connecter", () => {
    it("apres desactivation par l'editeur, le login du user du tenant cible est refuse", async () => {
      // Cree un commercial avec un mot de passe temporaire connu, via l'editeur.
      const created = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "login-puis-off@target.fr",
          firstName: "Off",
          lastName: "Line",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const data = created.body.data as CreatedUserResponse;

      // Le login fonctionne tant que le compte est actif.
      const loginActif = await request(app).post("/api/auth/login").send({
        email: "login-puis-off@target.fr",
        password: data.tempPassword,
        tenantSlug: TENANT_TARGET,
      });
      expect(loginActif.status).toBe(200);

      // Desactivation par l'editeur (cross-tenant).
      const patch = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${data.user.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });
      expect(patch.status).toBe(200);

      // Le login est desormais refuse (sans 200) : un compte inactif ne se connecte pas.
      const loginInactif = await request(app).post("/api/auth/login").send({
        email: "login-puis-off@target.fr",
        password: data.tempPassword,
        tenantSlug: TENANT_TARGET,
      });
      expect(loginInactif.status).not.toBe(200);
      expect([401, 403]).toContain(loginInactif.status);

      // Desactivation, pas suppression : le compte subsiste en base.
      const stillThere = await prisma.user.findUnique({
        where: { id: data.user.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("la reactivation par l'editeur restaure le login", async () => {
      const created = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "reactive-via-editeur@target.fr",
          firstName: "Rea",
          lastName: "Ctive",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const data = created.body.data as CreatedUserResponse;

      await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${data.user.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });

      const reactivate = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${data.user.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: true });
      expect(reactivate.status).toBe(200);

      const login = await request(app).post("/api/auth/login").send({
        email: "reactive-via-editeur@target.fr",
        password: data.tempPassword,
        tenantSlug: TENANT_TARGET,
      });
      expect(login.status).toBe(200);
    });
  });

  describe("Test securite 5 : l'editeur ne peut pas se faire passer pour un user du tenant (pas d'heritage implicite)", () => {
    it("un jeton editeur nominal n'ouvre PAS le chemin metier tenant : GET /api/clients -> 4xx (pas d'heritage implicite)", async () => {
      // ADR-0009 D1/D2 : un jeton kind "editor" n'a pas de contexte tenant.
      // requireTenant exige req.user.tenantId ; l'editeur ne passe donc pas les
      // routes metier nominales (/api/clients...).
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).not.toBe(200);
      // 401/403 : pas de contexte tenant -> requireTenant refuse. Jamais 200.
      expect([401, 403]).toContain(res.status);
    });

    it("le jeton editeur ne donne pas acces aux donnees metier d'un tenant via la query (pas de tenantId injectable)", async () => {
      // Un editeur ne peut pas forcer un contexte tenant via un parametre de
      // requete : le tenantId metier provient du JWT signe (jamais du corps ni
      // de la query). Une tentative reste sans acces aux donnees (pas de 200).
      const res = await request(app)
        .get("/api/clients")
        .query({ tenantId: tenantTarget.id })
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).not.toBe(200);
      expect([401, 403]).toContain(res.status);
    });

    it("les routes /api/admin/tenants/:id/users restent de la GESTION de comptes, pas une session utilisateur du tenant", async () => {
      // L'editeur gere les comptes (CRUD) mais n'obtient pas, par cette route, un
      // jeton de session agissant AU NOM d'un user du tenant. La reponse de
      // creation ne renvoie ni JWT de session tenant ni cookie d'authentification
      // au nom du user cible.
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "pas-de-session@target.fr",
          firstName: "Pas",
          lastName: "Session",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);
      // Aucun jeton de session au nom du user cible n'est emis par le CRUD.
      expect(res.body.data.jwt).toBeUndefined();
      // Pas de cookie de session pose au nom du user cible.
      expect(res.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("AC1/AC3 : isolation du scope tenant passe en parametre", () => {
    it("GET /api/admin/tenants/:tenantId/users ne liste que les users du tenant cible", async () => {
      const res = await request(app)
        .get(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      const ids = (res.body.data as { id: string }[]).map((u) => u.id);
      // La cible du tenant "other" n'apparait pas dans la liste du tenant cible.
      expect(ids).not.toContain(userOtherId);

      // Tous les users listes appartiennent au tenant cible (verifie en base).
      const dbUsers = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { tenantId: true },
      });
      expect(dbUsers.every((u) => u.tenantId === tenantTarget.id)).toBe(true);

      // Aucune liste ne fait fuiter de hash de mot de passe.
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    });

    it("PATCH avec un :id appartenant a un AUTRE tenant que le :tenantId du path -> 404, aucune mutation cross-tenant", async () => {
      // Scope tenant passe en parametre : la cible doit appartenir au tenantId du
      // path. Un id d'un autre tenant n'est pas modifiable via le scope cible
      // (404, ne confirme pas son existence dans ce scope).
      const before = await prisma.user.findUnique({ where: { id: userOtherId } });
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantTarget.id}/users/${userOtherId}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ active: false });
      expect(res.status).toBe(404);

      const after = await prisma.user.findUnique({ where: { id: userOtherId } });
      expect(after!.active).toBe(before!.active);
    });

    it("reset-password avec un :id d'un autre tenant -> 404, hash inchange", async () => {
      const before = await prisma.user.findUnique({ where: { id: userOtherId } });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users/${userOtherId}/reset-password`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(404);
      const after = await prisma.user.findUnique({ where: { id: userOtherId } });
      expect(after!.passwordHash).toBe(before!.passwordHash);
    });

    it("GET sur un tenantId inconnu -> 404", async () => {
      const res = await request(app)
        .get("/api/admin/tenants/00000000-0000-0000-0000-000000000000/users")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(404);
    });
  });

  describe("AC2/AC4 : provisioning + reset cross-tenant (escalade fermee, pas de fuite de hash)", () => {
    it("POST avec un role hors UserRole (EDITEUR) -> 400, aucun compte cree (escalade plateforme fermee)", async () => {
      const before = await prisma.user.count({ where: { tenantId: tenantTarget.id } });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "escalade-editeur@target.fr",
          firstName: "Esc",
          lastName: "Alade",
          // Le niveau editeur est une table separee (PlatformAdmin, ADR-0009 D1).
          // L'editeur ne cree PAS un PlatformAdmin via le CRUD des users tenant.
          role: "EDITEUR",
        });
      expect(res.status).toBe(400);
      const after = await prisma.user.count({ where: { tenantId: tenantTarget.id } });
      expect(after).toBe(before);
    });

    it("le CRUD users tenant ne cree jamais un PlatformAdmin (table plateforme intacte)", async () => {
      const before = await prisma.platformAdmin.count();
      await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "platform-via-crud@target.fr",
          firstName: "Pla",
          lastName: "Tform",
          role: "ADMIN",
        });
      const after = await prisma.platformAdmin.count();
      expect(after).toBe(before);
    });

    it("la reponse de creation ne fait jamais fuiter le hash de mot de passe du compte cree", async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "nohash-via-editeur@target.fr",
          firstName: "No",
          lastName: "Hash",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });

    it("POST /api/admin/tenants/:tenantId/users/:id/reset-password (editeur) -> 200, force-change + hash change, tempPassword conforme (D7)", async () => {
      const created = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "reset-via-editeur@target.fr",
          firstName: "Re",
          lastName: "Set",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = (created.body.data as CreatedUserResponse).user.id;
      const before = await prisma.user.findUnique({ where: { id } });

      const res = await request(app)
        .post(`/api/admin/tenants/${tenantTarget.id}/users/${id}/reset-password`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({ where: { id } });
      // Chemin degrade D7 : nouveau secret (hash change) + force-change.
      expect(after!.passwordHash).not.toBe(before!.passwordHash);
      expect(after!.mustChangePassword).toBe(true);

      if (typeof res.body?.data?.tempPassword === "string") {
        expect(validatePassword(res.body.data.tempPassword).valid).toBe(true);
        expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
      }
    });
  });
});
