import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S03 — Tests de securite : resolution du tenant par sous-domaine.
 *
 * Reference : docs/product/stories/EP14-S03.md (section "Tests de securite
 * (obligatoires)", AC4/AC5/AC6/AC7 + Notes techniques). ADR-0009 : l'isolation
 * des donnees est portee par le tenantId du JWT + Prisma $extends ; le
 * sous-domaine ne fait que pre-remplir/afficher le tenant au login.
 *
 * Approche locale, sans DNS ni TLS (la part prod — wildcard DNS + certificat —
 * reste cote infra, hors scope de cette story). On exerce :
 *   1. l'endpoint read-only public GET /api/tenant/by-slug/:slug (affichage du
 *      nom au login), avec sa garantie anti-enumeration ;
 *   2. l'invariant d'isolation : le backend tranche sur le JWT, jamais sur
 *      l'en-tete Host. On spoofe un Host de sous-domaine du tenant A tout en
 *      presentant un JWT du tenant B -> l'acces reste celui du tenant B (le Host
 *      n'eleve aucun privilege), et les donnees d'un autre tenant restent en 404.
 *
 * Phase TDD rouge : la route GET /api/tenant/by-slug/:slug n'existe pas encore
 * (montee publique attendue, avant le requireJWT global de app.ts, comme
 * /api/auth). Les cas by-slug echouent tant que la route n'est pas livree. Les
 * cas d'isolation/spoof documentent l'invariant deja en place (le Host n'est pas
 * une source d'autorite) et doivent rester verts apres implementation.
 *
 * Contrat d'implementation cible (derive de la story) :
 *   GET /api/tenant/by-slug/:slug  (PUBLIC, pas de JWT)
 *     - slug d'un tenant ACTIF      -> 200 { success, data: { name } }
 *     - slug inexistant OU suspendu  -> 404 { success: false } (anti-enumeration :
 *       on ne distingue pas "inactif" de "inexistant", cf. Notes techniques)
 *     - read-only : la route n'expose que le nom (affichage login). Pas de fuite
 *       d'email, de compteur d'utilisateurs, d'id, ni d'etat interne au-dela du
 *       strict necessaire UX.
 */

const app = buildApp();
const prisma = new PrismaClient();

const SLUG_A = "subdomain-tenant-a";
const SLUG_B = "subdomain-tenant-b";
const SLUG_SUSPENDED = "subdomain-tenant-suspended";

describe("Security — Resolution tenant par sous-domaine (EP14-S03)", () => {
  let tenantBId: string;
  let adminBJwt: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    // Deux tenants nominaux + un tenant suspendu (anti-enumeration by-slug).
    await teardownTestTenant(SLUG_A);
    await teardownTestTenant(SLUG_B);
    await teardownTestTenant(SLUG_SUSPENDED);

    const a = await setupTestTenant(app, SLUG_A);
    const b = await setupTestTenant(app, SLUG_B);
    tenantBId = b.tenant.id;
    adminBJwt = b.admin.jwt;

    // Tenant suspendu : doit etre traite comme inexistant par by-slug.
    await prisma.tenant.create({
      data: {
        name: "Cabinet Suspendu",
        slug: SLUG_SUSPENDED,
        status: "SUSPENDED",
      },
    });

    // Un client dans chaque tenant : sert a prouver que le Host ne change pas
    // l'isolation (le JWT tranche). On cree via l'API tenant-scope de chaque
    // tenant pour rester fidele au chemin nominal.
    const clientA = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${a.admin.jwt}`)
      .send({ firstName: "Client", lastName: "A", phone: "0612345610" });
    clientAId = clientA.body.data?.id;

    const clientB = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${b.admin.jwt}`)
      .send({ firstName: "Client", lastName: "B", phone: "0612345611" });
    clientBId = clientB.body.data?.id;
  });

  afterAll(async () => {
    for (const slug of [SLUG_A, SLUG_B, SLUG_SUSPENDED]) {
      await teardownTestTenant(slug);
    }
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("GET /api/tenant/by-slug/:slug — affichage login (read-only, public)", () => {
    it("slug d'un tenant actif -> 200 + nom du cabinet (sans JWT)", async () => {
      // AC4 : la page /login affiche le nom du cabinet resolu depuis le slug. La
      // route est publique (l'utilisateur n'est pas encore authentifie).
      const res = await request(app).get(`/api/tenant/by-slug/${SLUG_A}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(`Cabinet ${SLUG_A}`);
    });

    it("slug inexistant -> 404 (page cabinet inconnu, pas de leak)", async () => {
      const res = await request(app).get(
        "/api/tenant/by-slug/cabinet-qui-nexiste-pas",
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("slug d'un tenant suspendu -> 404 identique a inexistant (anti-enumeration)", async () => {
      // Notes techniques : by-slug ne distingue pas "inactif" de "inexistant"
      // au-dela du strict necessaire UX. Un tenant suspendu repond comme un slug
      // inconnu : meme status, meme forme de corps.
      const unknown = await request(app).get(
        "/api/tenant/by-slug/cabinet-qui-nexiste-pas",
      );
      const suspended = await request(app).get(
        `/api/tenant/by-slug/${SLUG_SUSPENDED}`,
      );
      expect(suspended.status).toBe(404);
      expect(suspended.status).toBe(unknown.status);
      // Le corps ne doit pas reveler l'existence du tenant suspendu (meme forme).
      expect(suspended.body.success).toBe(false);
      expect(Object.keys(suspended.body)).toEqual(Object.keys(unknown.body));
    });

    it("read-only : la reponse n'expose que le nom (pas d'id, email, compteur, secrets)", async () => {
      const res = await request(app).get(`/api/tenant/by-slug/${SLUG_A}`);
      expect(res.status).toBe(200);
      const serialized = JSON.stringify(res.body);
      // Anti-enumeration / moindre exposition : aucune donnee interne au-dela du
      // nom d'affichage. On refute la presence d'identifiants ou de PII.
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("@");
      expect(res.body.data).not.toHaveProperty("id");
      expect(res.body.data).not.toHaveProperty("users");
      expect(res.body.data).not.toHaveProperty("userCount");
    });

    it("ne monte aucune mutation : POST /api/tenant/by-slug/:slug n'est pas un point d'ecriture", async () => {
      // La ressource d'affichage est strictement en lecture (GET). Une mutation
      // sur ce chemin ne doit pas exister (404 du routeur, ou 405).
      const res = await request(app)
        .post(`/api/tenant/by-slug/${SLUG_A}`)
        .send({ name: "Renomme par attaquant" });
      expect([404, 405]).toContain(res.status);
      // Le nom ne doit pas avoir change cote base (read-only).
      const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG_A } });
      expect(tenant?.name).toBe(`Cabinet ${SLUG_A}`);
    });
  });

  describe("Isolation inchangee : le backend tranche sur le JWT, pas sur l'hote", () => {
    it("spoof : Host du sous-domaine A + JWT du tenant B -> pas d'acces aux donnees de A (404)", async () => {
      // AC5/AC7 + section "Tests de securite". On presente un en-tete Host qui
      // mime l'arrivee par le sous-domaine du tenant A, mais le JWT appartient au
      // tenant B. Le client A ne doit JAMAIS etre lisible : l'autorite vient du
      // JWT (tenantId B + Prisma $extends), le Host n'eleve aucun privilege.
      const res = await request(app)
        .get(`/api/clients/${clientAId}`)
        .set("Host", `${SLUG_A}.vencor-crm.localhost`)
        .set("Authorization", `Bearer ${adminBJwt}`);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(200);
    });

    it("spoof : Host du sous-domaine A + JWT du tenant B -> lit uniquement les donnees de B", async () => {
      // Symetrie du cas precedent : avec le meme Host spoofe, le JWT B continue
      // de voir SES propres donnees (le Host n'a aucun effet d'isolation, ni en
      // restriction ni en elargissement).
      const res = await request(app)
        .get(`/api/clients/${clientBId}`)
        .set("Host", `${SLUG_A}.vencor-crm.localhost`)
        .set("Authorization", `Bearer ${adminBJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(clientBId);
    });

    it("spoof : Host apex (pas de sous-domaine) + JWT du tenant B -> acces tenant B inchange", async () => {
      // Non-regression apex : l'absence de sous-domaine ne degrade ni n'altere
      // l'autorite portee par le JWT.
      const res = await request(app)
        .get(`/api/clients/${clientBId}`)
        .set("Host", "vencor-crm.localhost")
        .set("Authorization", `Bearer ${adminBJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(clientBId);
    });

    it("la liste /api/clients sous Host spoofe A ne contient pas le client du tenant A", async () => {
      // Verification additionnelle sur le listing : le filtrage $extends (tenantId
      // du JWT) ne laisse pas fuiter un client d'un autre tenant, quel que soit le
      // Host presente.
      const res = await request(app)
        .get("/api/clients")
        .set("Host", `${SLUG_A}.vencor-crm.localhost`)
        .set("Authorization", `Bearer ${adminBJwt}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(clientBId);
      expect(ids).not.toContain(clientAId);
    });
  });

  describe("Apex -> fallback formulaire 3 champs (non-regression login)", () => {
    it("le login par slug saisi (chemin apex/formulaire) fonctionne toujours", async () => {
      // AC6 : l'apex garde le formulaire a 3 champs (email, password, tenantSlug).
      // On verifie que le login nominal par slug n'est pas regresse par l'ajout du
      // chemin sous-domaine.
      const res = await request(app).post("/api/auth/login").send({
        email: `admin-${SLUG_B}@test.fr`,
        password: "test-password-123",
        tenantSlug: SLUG_B,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(tenantBId);
      expect(res.body.data.jwt).toMatch(/^eyJ/);
    });
  });
});
