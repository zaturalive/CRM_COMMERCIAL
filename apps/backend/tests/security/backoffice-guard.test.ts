import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP17-S01 — Tests de securite du socle Back Office editeur.
 *
 * Reference : docs/product/stories/EP17-S01.md (section "Tests de securite")
 * Decision d'architecture : ADR-0009 D1/D2.
 *
 * Phase TDD rouge : le router /api/admin et le middleware requireEditor
 * n'existent pas encore. Ces tests echouent tant que la feature n'est pas
 * implementee.
 *
 * Modele de jeton (ADR-0009 D1) : requireJWT discrimine sur le champ `kind`.
 *   - kind === "user" (ou absent, retro-compat) : req.user = { userId, tenantId, role }
 *   - kind === "editor" : req.editor = { editorId }, req.user indefini
 * requireEditor (monte sur /api/admin/*) renvoie 403 si req.editor est absent.
 *
 * On forge le jeton editeur en signant en HS256 avec le secret serveur, exactement
 * la forme attendue une fois que requireJWT reconnait kind: "editor". Cela ne
 * contourne aucune verification de signature (le secret reel est utilise), c'est
 * la representation legitime d'un token editeur.
 */

const app = buildApp();
const TA = "test-bo-guard-a";

/**
 * Signe un jeton editeur conforme a EditorJWTPayload (ADR-0009 D1).
 * Pas encore de helper signEditorJWT cote source au moment de la phase rouge.
 */
function signEditorToken(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("Security — Back Office guard /api/admin (EP17-S01)", () => {
  let adminJwt: string;
  let commercialJwt: string;
  let editorJwt: string;
  let clientAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    adminJwt = A.admin.jwt;
    commercialJwt = A.commercial.jwt;
    // L'editeur n'appartient a aucun tenant (PlatformAdmin, hors modele Tenant).
    editorJwt = signEditorToken("00000000-0000-0000-0000-0000000000ed");

    // Un client du tenant A, pour verifier qu'un editeur ne lit pas la donnee
    // metier d'un tenant par le chemin nominal /api/clients (AC : pas d'heritage
    // implicite d'acces aux donnees d'un tenant sans passer par S03/S04).
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ firstName: "Iso", lastName: "TestA", phone: "0612345699" });
    clientAId = res.body.data?.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await disconnectPrisma();
  });

  describe("AC : /api/admin/* protege par requireEditor", () => {
    it("ADMIN de cabinet sur /api/admin/* → 403", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(403);
    });

    it("COMMERCIAL sur /api/admin/* → 403", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${commercialJwt}`);
      expect(res.status).toBe(403);
    });

    it("JWT sans flag editeur (token user) → routes admin inaccessibles (403)", async () => {
      // Un token user nominal n'a pas req.editor : requireEditor doit refuser.
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(403);
    });

    it("appel /api/admin/* sans aucun token → 401 (requireJWT en amont)", async () => {
      const res = await request(app).get("/api/admin/tenants");
      expect(res.status).toBe(401);
    });

    it("editeur (kind: editor) accede a /api/admin/* → ni 401 ni 403", async () => {
      // Sanity : le jeton editeur legitime passe le guard. Le code de retour
      // exact depend du contenu de la route (livre par S02+), mais il ne doit
      // etre ni 401 (auth) ni 403 (guard editeur).
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("AC : un editeur n'herite pas d'un acces implicite aux donnees d'un tenant", () => {
    it("token editeur sur le chemin nominal tenant /api/clients → refuse (pas de contexte tenant)", async () => {
      // ADR-0009 D1 : requireTenant exige req.user.tenantId. Un token editeur n'a
      // pas de contexte tenant, il ne passe donc pas les routes tenant nominales.
      // L'acces a un tenant est borne aux stories dediees (S03/S04, jeton
      // d'impersonation signe). Statut attendu : refus (401/403), jamais 200.
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect([401, 403]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it("token editeur ne peut pas lire un client precis d'un tenant via /api/clients/:id", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientAId}`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect([401, 403]).toContain(res.status);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe("AC : isolation multi-tenant nominale non regressee", () => {
    it("ADMIN de cabinet garde l'acces a ses propres donnees /api/clients → 200", async () => {
      // Garde-fou : ajouter le niveau editeur ne doit pas casser le chemin user nominal.
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
    });
  });
});
