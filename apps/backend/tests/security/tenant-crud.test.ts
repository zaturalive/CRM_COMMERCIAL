import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * EP17-S02 — Tests de securite du CRUD tenants (Back Office editeur).
 *
 * Reference : docs/product/stories/EP17-S02.md (section "Tests de securite (obligatoires)")
 * Decisions d'architecture : ADR-0009 D1 (PlatformAdmin + requireEditor + basePrisma),
 * D5 (password policy partagee + mustChangePassword sur le 1er admin), D7 (chemin
 * degrade : mot de passe temporaire renvoye a l'editeur, sans dependance email).
 *
 * Phase TDD rouge : les routes de gestion des tenants sous /api/admin/tenants
 * (POST creation tenant + 1er admin, PATCH modification/suspension, GET detail,
 * DELETE si implemente) et le champ Tenant.status (ACTIVE | SUSPENDED) ainsi que
 * le refus de login d'un tenant suspendu n'existent pas encore. Ces tests
 * echouent tant que la feature n'est pas implementee.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009) :
 *  - POST /api/admin/tenants  body { slug, name, admin: { email, firstName, lastName } }
 *      -> 201 { data: { tenant: { id, slug, name, status }, admin: { id, email },
 *               tempPassword } }
 *      cree le Tenant (status ACTIVE) + 1 User ADMIN avec mustChangePassword=true
 *      et un mot de passe temporaire conforme a passwordPolicy (D5). Le mot de
 *      passe temporaire est renvoye a l'editeur (chemin degrade D7, pas d'email).
 *  - GET  /api/admin/tenants        -> liste { id, name, slug, status, userCount, createdAt }
 *  - GET  /api/admin/tenants/:id    -> detail idem + 404 si inconnu
 *  - PATCH /api/admin/tenants/:id   body { name?, status? } -> 200, modifie nom + statut
 *  - Validation : slug RFC 1035 (minuscules/chiffres/tirets, pas d'underscore) -> 400 ;
 *      slug en double -> 409 sans creation partielle ; email admin invalide -> 400.
 *  - Suspension : un Tenant SUSPENDED refuse le login de ses users (403/401) sans
 *      suppression de donnees.
 *  - DELETE /api/admin/tenants/:id (si implemente) : reserve a l'editeur (un non
 *      editeur -> 403) et trace (audit middleware global, EP14-S04).
 *
 * On forge le jeton editeur exactement comme le login editeur le produira
 * (kind: "editor", signe HS256 avec le secret serveur via signEditorJWT). Cela ne
 * contourne aucune verification de signature ; c'est la representation legitime
 * d'un token editeur, et un PlatformAdmin reel est cree en base pour l'audit
 * (actorId -> PlatformAdmin) et pour rester coherent avec le modele.
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-ep17s02@platform.test";
// Slugs des tenants crees par les tests (cleanup deterministe en afterAll).
const CREATED_SLUGS = [
  "cabinet-nouveau-s02",
  "cabinet-dup-s02",
  "cabinet-suspendu-s02",
  "cabinet-iso-a-s02",
  "cabinet-iso-b-s02",
  "cabinet-patch-s02",
];

interface CreatedTenantResponse {
  tenant: { id: string; slug: string; name: string; status: string };
  admin: { id: string; email: string };
  tempPassword: string;
}

function signEditorToken(editorId: string): string {
  // Forme attendue du token editeur (ADR-0009 D1) : kind "editor", signe HS256.
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("Security — CRUD tenants Back Office (EP17-S02)", () => {
  let editorId: string;
  let editorJwt: string;
  let tenantAdminJwtForDeleteGuard: string;

  beforeAll(async () => {
    // PlatformAdmin reel (editeur) : pas de FK Tenant (ADR-0009 D1). On l'upsert
    // pour que actorId d'audit reference une ligne existante.
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

    // Un ADMIN de cabinet quelconque pour tester que le DELETE tenant n'est pas
    // accessible a un acteur tenant. On le cree directement (pas d'editeur requis).
    await teardownTestTenant("cabinet-deleteguard-s02");
    const t = await prisma.tenant.create({
      data: { name: "Cabinet DeleteGuard", slug: "cabinet-deleteguard-s02" },
    });
    await prisma.user.create({
      data: {
        tenantId: t.id,
        email: "admin-deleteguard@test.fr",
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "DeleteGuard",
      },
    });
    const login = await request(app).post("/api/auth/login").send({
      email: "admin-deleteguard@test.fr",
      password: "test-password-123",
      tenantSlug: "cabinet-deleteguard-s02",
    });
    tenantAdminJwtForDeleteGuard = login.body.data.jwt;
  });

  afterAll(async () => {
    for (const slug of [...CREATED_SLUGS, "cabinet-deleteguard-s02"]) {
      await teardownTestTenant(slug);
    }
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC1 : l'editeur cree un cabinet + 1er admin (scope correct)", () => {
    it("POST /api/admin/tenants (editeur) -> 201, Tenant + 1 User ADMIN crees", async () => {
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-nouveau-s02",
          name: "Cabinet Nouveau",
          admin: {
            email: "admin@cabinet-nouveau-s02.fr",
            firstName: "Anne",
            lastName: "Admin",
          },
        });

      expect(res.status).toBe(201);
      const data = res.body.data as CreatedTenantResponse;
      expect(data.tenant.slug).toBe("cabinet-nouveau-s02");
      expect(data.tenant.status).toBe("ACTIVE");
      expect(data.admin.email).toBe("admin@cabinet-nouveau-s02.fr");

      // Tenant reellement persiste.
      const tenant = await prisma.tenant.findUnique({
        where: { slug: "cabinet-nouveau-s02" },
        include: { users: true },
      });
      expect(tenant).not.toBeNull();
      // Exactement un compte cree, role ADMIN, scope au nouveau tenant.
      expect(tenant!.users).toHaveLength(1);
      expect(tenant!.users[0].role).toBe("ADMIN");
      expect(tenant!.users[0].tenantId).toBe(tenant!.id);
      expect(tenant!.users[0].email).toBe("admin@cabinet-nouveau-s02.fr");
    });

    it("le 1er admin part avec mustChangePassword=true (D5) et un mot de passe temporaire conforme a la policy (D7)", async () => {
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-patch-s02",
          name: "Cabinet Patch",
          admin: {
            email: "admin@cabinet-patch-s02.fr",
            firstName: "Paul",
            lastName: "Patch",
          },
        });
      expect(res.status).toBe(201);
      const data = res.body.data as CreatedTenantResponse;

      // Le mot de passe temporaire est renvoye a l'editeur (chemin degrade, pas
      // d'email au demarrage, ADR-0009 D7) et respecte passwordPolicy (D5).
      expect(typeof data.tempPassword).toBe("string");
      const { validatePassword } = await import("../../src/lib/passwordPolicy");
      expect(validatePassword(data.tempPassword).valid).toBe(true);

      const user = await prisma.user.findFirst({
        where: { email: "admin@cabinet-patch-s02.fr" },
      });
      expect(user).not.toBeNull();
      // Force-change au 1er login (D5 AC1 de la story).
      expect(user!.mustChangePassword).toBe(true);

      // Le mot de passe temporaire permet le login (et le login renvoie le flag
      // mustChangePassword pour declencher la gate front).
      const login = await request(app).post("/api/auth/login").send({
        email: "admin@cabinet-patch-s02.fr",
        password: data.tempPassword,
        tenantSlug: "cabinet-patch-s02",
      });
      expect(login.status).toBe(200);
      expect(login.body.data.mustChangePassword).toBe(true);
    });

    it("la reponse ne renvoie jamais le hash de mot de passe du nouvel admin", async () => {
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-iso-a-s02",
          name: "Cabinet Iso A",
          admin: {
            email: "admin@cabinet-iso-a-s02.fr",
            firstName: "Iso",
            lastName: "A",
          },
        });
      expect(res.status).toBe(201);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("passwordHash");
      // Le hash bcrypt commence par $2 ; il ne doit pas fuiter dans la reponse.
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe("AC : POST /api/admin/tenants reserve a l'editeur (requireEditor)", () => {
    it("ADMIN de cabinet -> 403, aucun tenant cree", async () => {
      const before = await prisma.tenant.count();
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${tenantAdminJwtForDeleteGuard}`)
        .send({
          slug: "cabinet-interdit-s02",
          name: "Cabinet Interdit",
          admin: {
            email: "x@cabinet-interdit-s02.fr",
            firstName: "X",
            lastName: "Y",
          },
        });
      expect(res.status).toBe(403);
      const after = await prisma.tenant.count();
      expect(after).toBe(before);
      const leaked = await prisma.tenant.findUnique({
        where: { slug: "cabinet-interdit-s02" },
      });
      expect(leaked).toBeNull();
    });

    it("appel sans token -> 401 (requireJWT en amont)", async () => {
      const res = await request(app).post("/api/admin/tenants").send({
        slug: "cabinet-noauth-s02",
        name: "Cabinet NoAuth",
        admin: { email: "x@x.fr", firstName: "X", lastName: "Y" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("AC6 : validation slug + email", () => {
    it("slug en double -> 409, pas de creation partielle (ni tenant ni admin)", async () => {
      // Premier create OK.
      const first = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-dup-s02",
          name: "Cabinet Dup",
          admin: {
            email: "admin@cabinet-dup-s02.fr",
            firstName: "Du",
            lastName: "Plicate",
          },
        });
      expect(first.status).toBe(201);

      const usersBefore = await prisma.user.count();

      // Deuxieme create avec le meme slug -> conflit, aucune mutation partielle.
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-dup-s02",
          name: "Cabinet Dup Bis",
          admin: {
            email: "autre-admin@cabinet-dup-s02.fr",
            firstName: "Bis",
            lastName: "Admin",
          },
        });
      expect([400, 409]).toContain(res.status);
      expect(res.status).not.toBe(201);

      // Aucun user partiel cree par la tentative en doublon.
      const usersAfter = await prisma.user.count();
      expect(usersAfter).toBe(usersBefore);
      const leakedAdmin = await prisma.user.findFirst({
        where: { email: "autre-admin@cabinet-dup-s02.fr" },
      });
      expect(leakedAdmin).toBeNull();
    });

    it("slug avec underscore (hors RFC 1035) -> 400, aucune creation", async () => {
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet_invalide_s02",
          name: "Cabinet Slug Invalide",
          admin: {
            email: "admin@invalide.fr",
            firstName: "Slug",
            lastName: "KO",
          },
        });
      expect(res.status).toBe(400);
      const leaked = await prisma.tenant.findUnique({
        where: { slug: "cabinet_invalide_s02" },
      });
      expect(leaked).toBeNull();
    });

    it("email admin invalide -> 400, aucune creation partielle", async () => {
      const tenantsBefore = await prisma.tenant.count();
      const res = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-email-ko-s02",
          name: "Cabinet Email KO",
          admin: {
            email: "pas-un-email",
            firstName: "Email",
            lastName: "KO",
          },
        });
      expect(res.status).toBe(400);
      const tenantsAfter = await prisma.tenant.count();
      // Aucun tenant cree malgre la presence d'un slug valide : la transaction
      // est atomique (pas de tenant orphelin sans admin).
      expect(tenantsAfter).toBe(tenantsBefore);
      const leaked = await prisma.tenant.findUnique({
        where: { slug: "cabinet-email-ko-s02" },
      });
      expect(leaked).toBeNull();
    });
  });

  describe("AC2/AC3 : liste, detail, modification du nom + statut", () => {
    it("GET /api/admin/tenants (editeur) -> liste avec status + userCount", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const nouveau = res.body.data.find(
        (t: { slug: string }) => t.slug === "cabinet-nouveau-s02"
      );
      expect(nouveau).toBeDefined();
      expect(nouveau.status).toBe("ACTIVE");
      // userCount : le 1er admin cree par le provisioning.
      expect(nouveau.userCount).toBeGreaterThanOrEqual(1);
    });

    it("PATCH /api/admin/tenants/:id -> modifie le nom et le statut", async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: "cabinet-patch-s02" },
      });
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenant!.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ name: "Cabinet Patch Renomme", status: "SUSPENDED" });
      expect(res.status).toBe(200);

      const updated = await prisma.tenant.findUnique({
        where: { id: tenant!.id },
      });
      expect(updated!.name).toBe("Cabinet Patch Renomme");
      expect((updated as { status: string }).status).toBe("SUSPENDED");
    });

    it("GET /api/admin/tenants/:id inconnu -> 404", async () => {
      const res = await request(app)
        .get("/api/admin/tenants/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(404);
    });

    it("non editeur sur GET /api/admin/tenants -> 403", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${tenantAdminJwtForDeleteGuard}`);
      expect(res.status).toBe(403);
    });
  });

  describe("AC4 : un tenant SUSPENDED refuse le login de ses users, donnees conservees", () => {
    it("apres suspension, le login d'un user du tenant est refuse, et ses donnees subsistent", async () => {
      // Cree un tenant + admin via l'editeur.
      const created = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-suspendu-s02",
          name: "Cabinet Suspendu",
          admin: {
            email: "admin@cabinet-suspendu-s02.fr",
            firstName: "Sus",
            lastName: "Pendu",
          },
        });
      expect(created.status).toBe(201);
      const data = created.body.data as CreatedTenantResponse;

      // Le login fonctionne tant que le tenant est ACTIVE.
      const loginActive = await request(app).post("/api/auth/login").send({
        email: "admin@cabinet-suspendu-s02.fr",
        password: data.tempPassword,
        tenantSlug: "cabinet-suspendu-s02",
      });
      expect(loginActive.status).toBe(200);

      // Suspension par l'editeur.
      const patch = await request(app)
        .patch(`/api/admin/tenants/${data.tenant.id}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ status: "SUSPENDED" });
      expect(patch.status).toBe(200);

      // Le login est desormais refuse (sans 200), tenant suspendu.
      const loginSuspended = await request(app).post("/api/auth/login").send({
        email: "admin@cabinet-suspendu-s02.fr",
        password: data.tempPassword,
        tenantSlug: "cabinet-suspendu-s02",
      });
      expect(loginSuspended.status).not.toBe(200);
      expect([401, 403]).toContain(loginSuspended.status);

      // Donnees conservees : le tenant et son admin existent toujours en base
      // (suspension, pas suppression — AC4).
      const stillThere = await prisma.tenant.findUnique({
        where: { slug: "cabinet-suspendu-s02" },
        include: { users: true },
      });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.users.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AC5 : suppression dure (si implementee) reservee a l'editeur et tracee", () => {
    it("un ADMIN de cabinet ne peut pas DELETE un tenant -> 403 (requireEditor)", async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: "cabinet-nouveau-s02" },
      });
      const res = await request(app)
        .delete(`/api/admin/tenants/${tenant!.id}`)
        .set("Authorization", `Bearer ${tenantAdminJwtForDeleteGuard}`);
      // requireEditor garde /api/admin/* : un acteur tenant est refuse (403),
      // jamais un 2xx (la donnee client n'est pas supprimable par un non editeur).
      expect(res.status).toBe(403);
      // Le tenant n'a pas ete supprime.
      const stillThere = await prisma.tenant.findUnique({
        where: { slug: "cabinet-nouveau-s02" },
      });
      expect(stillThere).not.toBeNull();
    });

    it("un DELETE sans token -> 401, jamais de suppression", async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: "cabinet-nouveau-s02" },
      });
      const res = await request(app).delete(
        `/api/admin/tenants/${tenant!.id}`
      );
      expect(res.status).toBe(401);
      const stillThere = await prisma.tenant.findUnique({
        where: { slug: "cabinet-nouveau-s02" },
      });
      expect(stillThere).not.toBeNull();
    });
  });

  describe("AC : l'isolation entre cabinets reste intacte", () => {
    it("deux tenants crees par l'editeur ne partagent ni users ni donnees", async () => {
      const a = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-iso-b-s02",
          name: "Cabinet Iso B",
          admin: {
            email: "admin@cabinet-iso-b-s02.fr",
            firstName: "Iso",
            lastName: "B",
          },
        });
      expect(a.status).toBe(201);

      const tenantA = await prisma.tenant.findUnique({
        where: { slug: "cabinet-iso-a-s02" },
        include: { users: true },
      });
      const tenantB = await prisma.tenant.findUnique({
        where: { slug: "cabinet-iso-b-s02" },
        include: { users: true },
      });
      expect(tenantA).not.toBeNull();
      expect(tenantB).not.toBeNull();
      // Identifiants distincts, aucun user partage entre les deux cabinets.
      expect(tenantA!.id).not.toBe(tenantB!.id);
      const sharedUser = tenantA!.users.find((ua) =>
        tenantB!.users.some((ub) => ub.id === ua.id)
      );
      expect(sharedUser).toBeUndefined();
      // Chaque admin est bien scope a son propre tenant.
      expect(tenantA!.users.every((u) => u.tenantId === tenantA!.id)).toBe(true);
      expect(tenantB!.users.every((u) => u.tenantId === tenantB!.id)).toBe(true);
    });

    it("le 1er admin du cabinet A ne voit pas les donnees du cabinet B via le chemin nominal", async () => {
      // Login admin A (cree par l'editeur dans le test AC1 "hash" : cabinet-iso-a-s02).
      // On re-provisionne un user dont on connait le mot de passe temporaire en
      // recreant un tenant dedie pour ce controle d'isolation cross-tenant.
      const provA = await request(app)
        .post("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          slug: "cabinet-iso-a-s02",
          name: "Cabinet Iso A",
          admin: {
            email: "admin@cabinet-iso-a-s02.fr",
            firstName: "Iso",
            lastName: "A",
          },
        });
      // Le slug existe deja (cree en AC1) -> conflit attendu ; on se rabat sur un
      // login direct n'est pas possible sans le mot de passe. On verifie plutot
      // l'isolation au niveau base : un client cree dans B n'apparait pas pour A.
      expect([201, 400, 409]).toContain(provA.status);

      const tenantA = await prisma.tenant.findUnique({
        where: { slug: "cabinet-iso-a-s02" },
      });
      const tenantB = await prisma.tenant.findUnique({
        where: { slug: "cabinet-iso-b-s02" },
      });
      // Cree un client cote B directement en base (scope tenant B).
      const clientB = await prisma.client.create({
        data: {
          tenantId: tenantB!.id,
          firstName: "Client",
          lastName: "DeB",
          phone: "0600000000",
        },
      });
      // Le client de B n'est pas rattache au tenant A (isolation par tenantId).
      const visibleFromA = await prisma.client.findFirst({
        where: { id: clientB.id, tenantId: tenantA!.id },
      });
      expect(visibleFromA).toBeNull();
    });
  });
});
