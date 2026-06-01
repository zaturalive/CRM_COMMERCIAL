import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

/**
 * EP14-S02 — Tests de securite du gate CGU + onboarding.
 *
 * Reference : docs/product/stories/EP14-S02.md (section "Tests de securite
 * (obligatoires)", AC2-AC6-AC8) + ADR-0009 D5 (couche unique "post-login
 * requirements", mutualisee avec la gate mustChangePassword). Texte CGU :
 * docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md (cguVersion courante = 2026.06,
 * deliverable EP14-S07).
 *
 * Surface sous test (contrat cible, derive des AC + ADR) :
 *  - POST /api/tenant/accept-cgu  body { signatoryName, cguVersion }
 *      reserve a l'ADMIN du tenant courant (RBAC RM1, AC5). Sur succes (AC4) :
 *      set Tenant.cguAcceptedAt = now() (UTC), cguVersion, cguSignatoryName ;
 *      reponse 200. La cible est TOUJOURS le tenant du token (req.user.tenantId),
 *      jamais un tenant passe dans le corps -> pas d'acceptation cross-tenant.
 *  - Garde back requireCguAccepted : sur une route tenant nominale, un tenant
 *      dont cguAcceptedAt est null (ou dont la version acceptee differe de la
 *      version courante, RM5) est refuse (403 + code machine), au lieu de servir
 *      la donnee metier. Exemptions : /api/auth/*, /api/tenant/accept-cgu.
 *  - Login (AC6) : la reponse expose un flag cguAccepted pour que le front pose
 *      la gate des le login (mutualisation avec mustChangePassword), sans fuite
 *      de donnee metier.
 *
 * Phase TDD rouge : la route /api/tenant/accept-cgu, le middleware
 * requireCguAccepted, les colonnes Tenant.cguAcceptedAt / cguVersion /
 * cguSignatoryName et le flag cguAccepted dans la reponse de login n'existent pas
 * encore. Ces tests echouent tant que la feature n'est pas implementee.
 *
 * On forge les jetons exactement comme le login les produit (kind "user",
 * HS256, signe avec le secret serveur). Cela ne contourne aucune verification de
 * signature ; c'est la representation legitime d'un token user. Pour les chemins
 * positifs on passe par /api/auth/login (jeton reel).
 */

const app = buildApp();
const prisma = new PrismaClient();

// Version courante du texte CGU (docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md, EP14-S07).
const CURRENT_CGU_VERSION = "2026.06";

const TENANT_A = "test-cgu-gate-a";
const TENANT_B = "test-cgu-gate-b";

/**
 * Force l'etat CGU d'un tenant directement en base (basePrisma, hors extension
 * tenant) pour isoler chaque test du precedent. null = CGU non acceptee.
 */
async function setCguState(
  slug: string,
  state: { acceptedAt: Date | null; version?: string | null; signatory?: string | null },
): Promise<void> {
  await prisma.tenant.update({
    where: { slug },
    data: {
      cguAcceptedAt: state.acceptedAt,
      cguVersion: state.version ?? null,
      cguSignatoryName: state.signatory ?? null,
    },
  });
}

describe("Security — Gate CGU + POST /api/tenant/accept-cgu (EP14-S02)", () => {
  let ctxA: Awaited<ReturnType<typeof setupTestTenant>>;
  let ctxB: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctxA = await setupTestTenant(app, TENANT_A);
    ctxB = await setupTestTenant(app, TENANT_B);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Etat de depart deterministe : CGU non acceptee pour les deux tenants.
  beforeEach(async () => {
    await setCguState(TENANT_A, { acceptedAt: null });
    await setCguState(TENANT_B, { acceptedAt: null });
  });

  describe("AC5 / RM1 : RBAC — seul un ADMIN du tenant courant accepte", () => {
    it("un COMMERCIAL appelant POST /api/tenant/accept-cgu -> 403", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.commercial.jwt}`)
        .send({ signatoryName: "Jean Commercial", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(403);

      // Aucune acceptation n'a ete posee par un non-ADMIN.
      const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(tenant?.cguAcceptedAt).toBeNull();
    });

    it("sans token -> 401 (la route reste derriere requireJWT)", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .send({ signatoryName: "Anonyme", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(401);
    });

    it("un ADMIN accepte -> 200 et la ligne Tenant porte la preuve (timestamp + version + signataire)", async () => {
      const before = Date.now();
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "Florian Admin", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(200);

      // AC4 / AC8 : preuve immuable portee par la ligne Tenant (mode degrade).
      const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(tenant?.cguAcceptedAt).not.toBeNull();
      expect(tenant?.cguVersion).toBe(CURRENT_CGU_VERSION);
      expect(tenant?.cguSignatoryName).toBe("Florian Admin");
      // Timestamp coherent avec le moment de l'appel (UTC, fraichement pose).
      expect(tenant!.cguAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  describe("AC4 : validation du corps (signataire non vide, version connue)", () => {
    it("signatoryName vide -> 400 sans muter la ligne Tenant (RM4 : saisie obligatoire)", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(400);

      const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(tenant?.cguAcceptedAt).toBeNull();
    });

    it("signatoryName seulement des espaces -> 400 (non vide apres trim)", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "   ", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(400);

      const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(tenant?.cguAcceptedAt).toBeNull();
    });

    it("cguVersion inconnue (tentative de downgrade) -> 400 sans muter la ligne Tenant", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "Florian Admin", cguVersion: "1999.01" });
      expect(res.status).toBe(400);

      const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(tenant?.cguAcceptedAt).toBeNull();
      expect(tenant?.cguVersion).toBeNull();
    });

    it("cguVersion absente du corps -> 400", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "Florian Admin" });
      expect(res.status).toBe(400);
    });
  });

  describe("AC2 : isolation cross-tenant de l'acceptation", () => {
    it("l'acceptation d'un ADMIN ne touche QUE son propre tenant", async () => {
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "Florian Admin A", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(200);

      // Le tenant A est accepte, le tenant B reste intact.
      const a = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      const b = await prisma.tenant.findUnique({ where: { slug: TENANT_B } });
      expect(a?.cguAcceptedAt).not.toBeNull();
      expect(b?.cguAcceptedAt).toBeNull();
    });

    it("un tenantId injecte dans le corps est ignore : la cible reste le tenant du token", async () => {
      // RM : la cible est toujours req.user.tenantId. Un identifiant de tenant
      // (ou un slug) place dans le corps ne doit pas rediriger l'acceptation vers
      // un autre cabinet (anti-mass-assignment, isolation multi-tenant).
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({
          signatoryName: "Florian Admin A",
          cguVersion: CURRENT_CGU_VERSION,
          tenantId: ctxB.tenant.id,
          slug: TENANT_B,
        });
      // Le corps injecte n'eleve pas le privilege : si l'API accepte (200) elle
      // accepte le tenant du token (A) ; si elle rejette le champ inattendu (400)
      // c'est egalement acceptable. Dans les deux cas, B ne doit jamais bouger.
      expect([200, 400]).toContain(res.status);

      const b = await prisma.tenant.findUnique({ where: { slug: TENANT_B } });
      expect(b?.cguAcceptedAt).toBeNull();
    });

    it("un jeton editeur (kind editor) n'a pas de contexte tenant -> pas d'acceptation", async () => {
      // ADR-0009 D1 : un editeur n'est pas un User tenant. requireTenant exige
      // req.user.tenantId, absent pour un jeton editeur. La route ne doit donc pas
      // accepter une CGU au nom d'un tenant arbitraire.
      const editorJwt = jwt.sign(
        { kind: "editor", editorId: "00000000-0000-0000-0000-0000000000ed" },
        env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: "1h" },
      );
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ signatoryName: "Edith Teur", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).not.toBe(200);

      const a = await prisma.tenant.findUnique({ where: { slug: TENANT_A } });
      expect(a?.cguAcceptedAt).toBeNull();
    });
  });

  describe("AC2 / AC3 (bypass) : la garde back refuse les routes tenant tant que la CGU n'est pas acceptee", () => {
    it("acces a une route tenant nominale sans CGU acceptee -> refus (403), pas de donnee servie", async () => {
      // /api/dashboard est une route tenant nominale (requireJWT + requireTenant).
      // Tant que cguAcceptedAt est null, la couche post-login requirements doit
      // refuser l'acces (le front redirige vers /onboarding/cgu, cf. AC2). Le
      // serveur ne doit pas servir la donnee metier a un tenant non onboarde.
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`);
      expect(res.status).toBe(403);
      // Pas de fuite de donnee metier dans le corps de refus.
      expect(JSON.stringify(res.body)).not.toContain("kpi");
    });

    it("une fois la CGU acceptee, la meme route tenant repond normalement", async () => {
      await setCguState(TENANT_A, {
        acceptedAt: new Date(),
        version: CURRENT_CGU_VERSION,
        signatory: "Florian Admin",
      });
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`);
      expect(res.status).toBe(200);
    });

    it("RM5 : une version acceptee perimee (differente de la version courante) re-declenche la gate", async () => {
      // Une nouvelle version du texte (post-revue juriste) doit re-forcer
      // l'acceptation : un tenant ayant accepte une ancienne version est traite
      // comme non onboarde tant qu'il n'a pas accepte la version courante.
      await setCguState(TENANT_A, {
        acceptedAt: new Date(),
        version: "2025.01",
        signatory: "Florian Admin",
      });
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`);
      expect(res.status).toBe(403);
    });

    it("la route POST /api/tenant/accept-cgu reste accessible meme CGU non acceptee (exemption de la gate)", async () => {
      // Sinon : boucle (impossible d'accepter parce que la gate bloque la route
      // d'acceptation elle-meme). L'ADMIN doit pouvoir accepter.
      const res = await request(app)
        .post("/api/tenant/accept-cgu")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`)
        .send({ signatoryName: "Florian Admin", cguVersion: CURRENT_CGU_VERSION });
      expect(res.status).toBe(200);
    });

    it("les routes /api/auth/* restent accessibles meme CGU non acceptee (exemption)", async () => {
      // /api/auth/me ne doit pas etre prise dans la gate CGU : le front en a
      // besoin pour connaitre l'etat (role, cguAccepted) avant la redirection.
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${ctxA.admin.jwt}`);
      expect(res.status).toBe(200);
    });
  });

  describe("AC6 : le login expose l'etat CGU (mutualisation avec mustChangePassword)", () => {
    it("login d'un ADMIN d'un tenant sans CGU acceptee -> cguAccepted: false", async () => {
      await setCguState(TENANT_A, { acceptedAt: null });
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: ctxA.admin.email,
          password: "test-password-123",
          tenantSlug: TENANT_A,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.cguAccepted).toBe(false);
    });

    it("login d'un ADMIN d'un tenant ayant accepte la version courante -> cguAccepted: true", async () => {
      await setCguState(TENANT_A, {
        acceptedAt: new Date(),
        version: CURRENT_CGU_VERSION,
        signatory: "Florian Admin",
      });
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: ctxA.admin.email,
          password: "test-password-123",
          tenantSlug: TENANT_A,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.cguAccepted).toBe(true);
    });

    it("login d'un ADMIN d'un tenant ayant accepte une version perimee -> cguAccepted: false (RM5)", async () => {
      await setCguState(TENANT_A, {
        acceptedAt: new Date(),
        version: "2025.01",
        signatory: "Florian Admin",
      });
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: ctxA.admin.email,
          password: "test-password-123",
          tenantSlug: TENANT_A,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.cguAccepted).toBe(false);
    });
  });
});
