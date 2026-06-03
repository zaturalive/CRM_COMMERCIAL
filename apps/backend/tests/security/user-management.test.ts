import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import {
  RecordingEmailSender,
  activateViaInvitation,
} from "../helpers/invitation";

/**
 * EP15-S02 — Tests de securite de la gestion des comptes users intra-cabinet
 * par l'ADMIN du cabinet (scope = tenant courant).
 *
 * Reference : docs/product/stories/EP15-S02.md (section "Tests de securite
 * (obligatoires)"). Decisions d'architecture liees : ADR-0009 D1 (niveau
 * editeur hors de portee d'un ADMIN de cabinet), D5 (mustChangePassword +
 * password policy partagee).
 *
 * Provisioning par INVITATION email (decision D1) : la creation et la
 * reinitialisation n'affichent JAMAIS de mot de passe. Elles envoient un lien
 * /set-password (token) par email ; l'interesse definit son mot de passe via
 * POST /api/auth/reset-password (page /set-password), ce qui leve aussi le
 * force-change (mustChangePassword repasse a false). Les tests injectent un
 * RecordingEmailSender pour recuperer le token et activer le compte.
 *
 * Distinction de perimetre (story EP15-S02 + brief section 1 contrainte 11) :
 * la gestion intra-cabinet par l'ADMIN reste TENANT-SCOPE. Les routes vivent
 * donc sous /api/users (chaine requireJWT + requireTenant + getTenantPrisma),
 * PAS sous /api/admin/* (qui est le Back Office EDITEUR cross-tenant,
 * requireEditor). C'est ce qui garantit l'isolation : un ADMIN du tenant A ne
 * voit ni ne modifie un user du tenant B (l'extension tenant filtre par
 * tenantId), d'ou un 404 (ressource hors de son scope), pas un 403.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009) :
 *  - GET  /api/users               (ADMIN) -> 200 liste des users DU tenant courant.
 *  - POST /api/users               (ADMIN) body { email, firstName, lastName, role }
 *        -> 201 { data: { user: { id, email, role, active }, invitationSent } }
 *        cree le compte dans le tenant de l'ADMIN, role COMMERCIAL ou ADMIN,
 *        mustChangePassword=true, AUCUN mot de passe renvoye (invitation par email).
 *  - PATCH /api/users/:id          (ADMIN) body { active?, role? }
 *        -> 200 ; desactive/reactive (User.active), change le role intra-cabinet.
 *        -> 404 si :id n'appartient pas au tenant de l'ADMIN (isolation).
 *        -> 409 si le changement enleve le dernier ADMIN actif (garde AC6).
 *  - POST /api/users/:id/reset-password (ADMIN)
 *        -> 200 ; invalide l'acces courant (hash change) + mustChangePassword=true
 *        + envoie un lien d'invitation par email (invitationSent). 404 hors tenant.
 *  - RBAC : un COMMERCIAL sur ces routes -> 403. Un ADMIN ne peut pas se
 *        promouvoir editeur (niveau plateforme hors de sa portee).
 */

const recorder = new RecordingEmailSender();
const app = buildApp({ emailSender: recorder });
const prisma = new PrismaClient();

const TENANT_A = "cabinet-um-a-ep15s02";
const TENANT_B = "cabinet-um-b-ep15s02";

interface CreatedUserResponse {
  user: { id: string; email: string; role: string; active: boolean };
  invitationSent: boolean;
}

describe("Security — gestion users intra-cabinet (EP15-S02)", () => {
  let tenantA: { id: string; slug: string };
  let adminAJwt: string;
  let commercialAJwt: string;
  let tenantB: { id: string; slug: string };
  let userBId: string;

  beforeAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);

    const a = await setupTestTenant(app, TENANT_A);
    tenantA = a.tenant;
    adminAJwt = a.admin.jwt;
    commercialAJwt = a.commercial.jwt;

    const b = await setupTestTenant(app, TENANT_B);
    tenantB = b.tenant;
    // Une cible du tenant B, pour les controles d'isolation cross-tenant.
    userBId = b.commercial.userId;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC2 : un ADMIN cree un COMMERCIAL dans son tenant", () => {
    it("POST /api/users (ADMIN) -> 201, compte cree dans SON tenant avec mustChangePassword=true", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "nouveau-commercial@cabinet-a.fr",
          firstName: "Nina",
          lastName: "Nouvelle",
          role: "COMMERCIAL",
        });

      expect(res.status).toBe(201);
      const data = res.body.data as CreatedUserResponse;
      expect(data.user.email).toBe("nouveau-commercial@cabinet-a.fr");
      expect(data.user.role).toBe("COMMERCIAL");

      // Persiste dans le tenant de l'ADMIN (pas ailleurs).
      const created = await prisma.user.findFirst({
        where: { email: "nouveau-commercial@cabinet-a.fr" },
      });
      expect(created).not.toBeNull();
      expect(created!.tenantId).toBe(tenantA.id);
      // EP15-S04 / D5 : le compte part en force-change tant qu'il n'est pas active.
      expect(created!.mustChangePassword).toBe(true);
    });

    it("aucun mot de passe n'est renvoye ; l'invitation permet d'activer puis de se connecter", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "login-commercial@cabinet-a.fr",
          firstName: "Leo",
          lastName: "Login",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);
      const data = res.body.data as CreatedUserResponse;

      // Decision D1 : aucun mot de passe en clair renvoye ; une invitation est envoyee.
      expect("tempPassword" in (res.body.data ?? {})).toBe(false);
      expect(data.invitationSent).toBe(true);

      // L'interesse definit son mot de passe via le lien recu (page /set-password
      // -> POST /api/auth/reset-password). On recupere le token dans l'email capture.
      const password = await activateViaInvitation(
        app,
        recorder,
        "login-commercial@cabinet-a.fr",
      );

      const login = await request(app).post("/api/auth/login").send({
        email: "login-commercial@cabinet-a.fr",
        password,
        tenantSlug: TENANT_A,
      });
      expect(login.status).toBe(200);
      // Ayant choisi son mot de passe via l'invitation, le force-change est leve.
      expect(login.body.data.mustChangePassword).toBe(false);
    });

    it("la reponse de creation ne fait jamais fuiter le hash de mot de passe", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "nohash-commercial@cabinet-a.fr",
          firstName: "No",
          lastName: "Hash",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(201);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("passwordHash");
      // Le hash bcrypt ($2...) ne doit pas apparaitre dans la reponse.
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe("AC1 : GET /api/users liste uniquement les users du tenant courant", () => {
    it("ADMIN A ne voit que les users du tenant A (pas ceux du tenant B)", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      const ids = (res.body.data as { id: string; email: string }[]).map(
        (u) => u.id,
      );
      // La cible du tenant B n'apparait pas dans la liste vue par l'ADMIN A.
      expect(ids).not.toContain(userBId);

      // Tous les users listes appartiennent au tenant A (verifie en base).
      const dbUsers = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { tenantId: true },
      });
      expect(dbUsers.every((u) => u.tenantId === tenantA.id)).toBe(true);

      // Aucune liste ne fait fuiter de hash de mot de passe.
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe("AC5 : isolation cross-tenant — un ADMIN du tenant A ne touche pas un user du tenant B", () => {
    it("PATCH /api/users/:id sur un user du tenant B -> 404 (hors scope), aucune mutation", async () => {
      const before = await prisma.user.findUnique({ where: { id: userBId } });
      const res = await request(app)
        .patch(`/api/users/${userBId}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: false });

      // 404 : la ressource n'existe pas DANS le scope de l'ADMIN A (l'extension
      // tenant ne la voit pas). Pas un 403, pour ne pas confirmer son existence.
      expect(res.status).toBe(404);

      // Le user du tenant B n'a pas ete modifie (toujours actif).
      const after = await prisma.user.findUnique({ where: { id: userBId } });
      expect((after as { active?: boolean }).active).toBe(
        (before as { active?: boolean }).active,
      );
    });

    it("POST /api/users/:id/reset-password sur un user du tenant B -> 404, hash inchange", async () => {
      const before = await prisma.user.findUnique({ where: { id: userBId } });
      const res = await request(app)
        .post(`/api/users/${userBId}/reset-password`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(404);

      // Le secret du user de B n'a pas ete reinitialise par un ADMIN de A.
      const after = await prisma.user.findUnique({ where: { id: userBId } });
      expect(after!.passwordHash).toBe(before!.passwordHash);
    });

    it("GET /api/users ne renvoie jamais un user d'un autre tenant meme avec un :id connu", async () => {
      // Tentative de lecture directe d'un user de B via la route de detail (si
      // exposee) : doit etre 404 pour l'ADMIN A.
      const res = await request(app)
        .get(`/api/users/${userBId}`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect([404, 405]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });

  describe("AC5 : RBAC — un COMMERCIAL n'accede pas aux routes de gestion des users", () => {
    it("COMMERCIAL sur POST /api/users -> 403, aucun compte cree", async () => {
      const before = await prisma.user.count({ where: { tenantId: tenantA.id } });
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({
          email: "interdit@cabinet-a.fr",
          firstName: "Inter",
          lastName: "Dit",
          role: "COMMERCIAL",
        });
      expect(res.status).toBe(403);
      const after = await prisma.user.count({ where: { tenantId: tenantA.id } });
      expect(after).toBe(before);
      const leaked = await prisma.user.findFirst({
        where: { email: "interdit@cabinet-a.fr" },
      });
      expect(leaked).toBeNull();
    });

    it("COMMERCIAL sur GET /api/users -> 403", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${commercialAJwt}`);
      expect(res.status).toBe(403);
    });

    it("COMMERCIAL sur PATCH /api/users/:id -> 403", async () => {
      // Sur sa propre cible tenant : meme un COMMERCIAL de A est refuse (la
      // gestion des comptes est reservee a l'ADMIN, AC5).
      const someUser = await prisma.user.findFirst({
        where: { tenantId: tenantA.id, role: "COMMERCIAL" },
      });
      const res = await request(app)
        .patch(`/api/users/${someUser!.id}`)
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ active: false });
      expect(res.status).toBe(403);
    });

    it("appel sans token sur /api/users -> 401 (requireJWT en amont)", async () => {
      const res = await request(app).get("/api/users");
      expect(res.status).toBe(401);
    });
  });

  describe("AC6 : garde dernier admin — refus de desactiver / retrograder le dernier ADMIN actif", () => {
    it("desactiver le dernier ADMIN actif du tenant -> refus (409), l'admin reste actif", async () => {
      // Le tenant A a un unique ADMIN (cree par setupTestTenant). On tente de le
      // desactiver via son propre token : la garde doit refuser.
      const admin = await prisma.user.findFirst({
        where: { tenantId: tenantA.id, role: "ADMIN" },
      });
      const res = await request(app)
        .patch(`/api/users/${admin!.id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: false });

      expect(res.status).toBe(409);

      // L'admin n'a pas ete desactive : le tenant garde un admin actif.
      const after = await prisma.user.findUnique({ where: { id: admin!.id } });
      expect((after as { active?: boolean }).active).toBe(true);
    });

    it("retrograder le dernier ADMIN actif en COMMERCIAL -> refus (409), role inchange", async () => {
      const admin = await prisma.user.findFirst({
        where: { tenantId: tenantA.id, role: "ADMIN" },
      });
      const res = await request(app)
        .patch(`/api/users/${admin!.id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ role: "COMMERCIAL" });

      expect(res.status).toBe(409);
      const after = await prisma.user.findUnique({ where: { id: admin!.id } });
      expect(after!.role).toBe("ADMIN");
    });

    it("avec un second ADMIN actif, la desactivation du premier est autorisee (200)", async () => {
      // On promeut d'abord un second compte en ADMIN actif, ce qui lève la garde.
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "second-admin@cabinet-a.fr",
          firstName: "Sandra",
          lastName: "Second",
          role: "ADMIN",
        });
      expect(created.status).toBe(201);
      const secondAdminId = (created.body.data as CreatedUserResponse).user.id;

      // Maintenant que deux ADMIN actifs existent, on peut en desactiver un.
      const res = await request(app)
        .patch(`/api/users/${secondAdminId}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: false });
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({
        where: { id: secondAdminId },
      });
      expect((after as { active?: boolean }).active).toBe(false);
    });
  });

  describe("AC3 + login : un user desactive ne peut plus se connecter", () => {
    it("apres desactivation d'un COMMERCIAL, son login est refuse", async () => {
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "desactive@cabinet-a.fr",
          firstName: "Des",
          lastName: "Active",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const data = created.body.data as CreatedUserResponse;

      // Active le compte via l'invitation (mot de passe choisi par l'interesse).
      const password = await activateViaInvitation(
        app,
        recorder,
        "desactive@cabinet-a.fr",
      );

      // Le login fonctionne tant que le compte est actif.
      const loginActif = await request(app).post("/api/auth/login").send({
        email: "desactive@cabinet-a.fr",
        password,
        tenantSlug: TENANT_A,
      });
      expect(loginActif.status).toBe(200);

      // Desactivation par l'ADMIN.
      const patch = await request(app)
        .patch(`/api/users/${data.user.id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: false });
      expect(patch.status).toBe(200);

      // Le login est desormais refuse (sans 200) : un compte inactif ne se connecte pas.
      const loginInactif = await request(app).post("/api/auth/login").send({
        email: "desactive@cabinet-a.fr",
        password,
        tenantSlug: TENANT_A,
      });
      expect(loginInactif.status).not.toBe(200);
      expect([401, 403]).toContain(loginInactif.status);

      // Le compte n'est pas supprime (desactivation, pas suppression).
      const stillThere = await prisma.user.findUnique({
        where: { id: data.user.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("reactiver le compte restaure le login", async () => {
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "reactive@cabinet-a.fr",
          firstName: "Rea",
          lastName: "Ctive",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const data = created.body.data as CreatedUserResponse;
      const password = await activateViaInvitation(
        app,
        recorder,
        "reactive@cabinet-a.fr",
      );

      await request(app)
        .patch(`/api/users/${data.user.id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: false });

      const reactivate = await request(app)
        .patch(`/api/users/${data.user.id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ active: true });
      expect(reactivate.status).toBe(200);

      const login = await request(app).post("/api/auth/login").send({
        email: "reactive@cabinet-a.fr",
        password,
        tenantSlug: TENANT_A,
      });
      expect(login.status).toBe(200);
    });
  });

  describe("AC : escalade de privilege — un ADMIN ne peut pas se promouvoir editeur", () => {
    it("POST /api/users avec un role hors UserRole (EDITEUR) -> 400, aucun compte cree", async () => {
      const before = await prisma.user.count({ where: { tenantId: tenantA.id } });
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "escalade@cabinet-a.fr",
          firstName: "Esc",
          lastName: "Alade",
          // Le niveau editeur est une table separee (PlatformAdmin, ADR-0009
          // D1) hors de portee de la route tenant. Un role inconnu est refuse.
          role: "EDITEUR",
        });
      expect(res.status).toBe(400);
      const after = await prisma.user.count({ where: { tenantId: tenantA.id } });
      expect(after).toBe(before);
    });

    it("PATCH /api/users/:id avec role hors UserRole -> 400, role inchange", async () => {
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "target-escalade@cabinet-a.fr",
          firstName: "Tar",
          lastName: "Get",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = (created.body.data as CreatedUserResponse).user.id;

      const res = await request(app)
        .patch(`/api/users/${id}`)
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ role: "PLATFORM_ADMIN" });
      expect(res.status).toBe(400);

      const after = await prisma.user.findUnique({ where: { id } });
      expect(after!.role).toBe("COMMERCIAL");
    });

    it("creer un user via /api/users ne cree jamais un PlatformAdmin (table plateforme intacte)", async () => {
      // L'ADMIN cabinet n'a aucun moyen, via ses routes tenant, d'ecrire dans la
      // table des editeurs plateforme (ADR-0009 D1 : isolation du niveau editeur).
      const before = await prisma.platformAdmin.count();
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "platform-attempt@cabinet-a.fr",
          firstName: "Pla",
          lastName: "Tform",
          role: "ADMIN",
        });
      const after = await prisma.platformAdmin.count();
      expect(after).toBe(before);
    });

    it("un ADMIN de cabinet ne peut pas atteindre le Back Office editeur /api/admin/* -> 403", async () => {
      // Defense en profondeur : le niveau plateforme passe par requireEditor sur
      // /api/admin/* (ADR-0009 D1). Un token user (kind: "user") n'a pas req.editor.
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(403);
    });
  });

  describe("AC4 : reinitialisation de l'acces (invitation par email, D1)", () => {
    it("POST /api/users/:id/reset-password (ADMIN) -> 200, invalide l'acces + envoie un lien, sans mot de passe en clair", async () => {
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({
          email: "reset@cabinet-a.fr",
          firstName: "Re",
          lastName: "Set",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = (created.body.data as CreatedUserResponse).user.id;
      const before = await prisma.user.findUnique({ where: { id } });

      const res = await request(app)
        .post(`/api/users/${id}/reset-password`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({ where: { id } });
      // L'acces courant est invalide (hash change) + force-change repositionne.
      expect(after!.passwordHash).not.toBe(before!.passwordHash);
      expect(after!.mustChangePassword).toBe(true);

      // Decision D1 : aucun mot de passe en clair dans la reponse ; un lien est envoye.
      expect("tempPassword" in (res.body.data ?? {})).toBe(false);
      expect(res.body.data.invitationSent).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);

      // Un email de reinitialisation a bien ete capture pour cet utilisateur.
      expect(recorder.lastFor("reset@cabinet-a.fr")).toBeDefined();
    });
  });
});
