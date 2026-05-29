import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Multi-tenant + path traversal + RBAC pour /api/document-templates (EP10).
 *
 * Particularites :
 *   - kind = PDF_UPLOADED implicitement (EP10 simplifie).
 *   - POST metadata accepte un `fileUrl` libre string (zod min 1 max 500),
 *     ne valide pas le format `<tenantId>/document-templates/<uuid>.pdf`.
 *   - GET /:id/download stream `path.join(UPLOADS_DIR, template.fileUrl)`
 *     sans assertion `startsWith(UPLOADS_DIR)`. Risque CWE-22 si `fileUrl`
 *     contient `../`.
 *
 * Tests vise a verifier l'isolation puis a documenter le risque path
 * traversal — si la route renvoie autre chose que 404 sur `../` payloads,
 * c'est une vulnerabilite a fixer cote code source.
 */
const app = buildApp();
const TA = "test-doctpl-a";
const TB = "test-doctpl-b";

describe("Security — /api/document-templates", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let templateAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    // Seed : 1 template dans le tenant A avec fileUrl factice
    const res = await request(app)
      .post("/api/document-templates")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        name: "Consentement A",
        description: "Template tenant A",
        fileUrl: `${A.tenant.id}/document-templates/dummy.pdf`,
        isActive: true,
      });
    expect(res.status).toBe(201);
    templateAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET /api/document-templates sans JWT → 401", async () => {
      const res = await request(app).get("/api/document-templates");
      expect(res.status).toBe(401);
    });

    it("POST /api/document-templates sans JWT → 401", async () => {
      const res = await request(app)
        .post("/api/document-templates")
        .send({ name: "x", fileUrl: "y" });
      expect(res.status).toBe(401);
    });

    it("GET /api/document-templates/:id/download sans JWT → 401", async () => {
      const res = await request(app).get(
        `/api/document-templates/${templateAId}/download`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET /api/document-templates ne voit pas le template de A", async () => {
      const res = await request(app)
        .get("/api/document-templates")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(templateAId);
    });

    it("adminB GET /api/document-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .get(`/api/document-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH /api/document-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .patch(`/api/document-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Hijack" });
      expect(res.status).toBe(404);

      const verify = await request(app)
        .get(`/api/document-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(verify.body.data.name).toBe("Consentement A");
    });

    it("adminB DELETE /api/document-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .delete(`/api/document-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);

      const verify = await request(app)
        .get(`/api/document-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(verify.status).toBe(200);
      expect(verify.body.data.isActive).toBe(true);
    });

    it("adminB GET /api/document-templates/:id/download du tenant A → 404", async () => {
      const res = await request(app)
        .get(`/api/document-templates/${templateAId}/download`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      // Le template est tenant A : la route doit echouer en 404 cote
      // adminB. Si la route renvoie 200 + stream, vulnerabilite IDOR.
      expect(res.status).toBe(404);
    });
  });

  describe("Validation zod (POST metadata)", () => {
    it("POST name vide → 400", async () => {
      const res = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "", fileUrl: "x" });
      expect(res.status).toBe(400);
    });

    it("POST sans fileUrl → 400", async () => {
      const res = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "x" });
      expect(res.status).toBe(400);
    });

    it("POST description > 2000 chars → 400", async () => {
      const res = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "x",
          description: "a".repeat(2001),
          fileUrl: "y",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("Path traversal (CWE-22) sur download", () => {
    it("fileUrl=../../etc/passwd → download n'expose pas /etc/passwd", async () => {
      // L'attaque : creer un template metadata avec fileUrl pointant hors
      // UPLOADS_DIR, puis tenter le download. Si le serveur stream
      // /etc/passwd, c'est une fuite de fichier systeme.
      const create = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "Path traversal probe",
          fileUrl: "../../../../etc/passwd",
        });
      // 2 issues possibles :
      //   - zod rejette `../` → 400 (souhaite : ajouter pattern)
      //   - zod accepte mais download verifie startsWith(UPLOADS_DIR) → 404
      //   - aucune des deux → fuite, NB: ne JAMAIS 200 + content `root:x:0:0`
      if (create.status === 201) {
        const dl = await request(app)
          .get(`/api/document-templates/${create.body.data.id}/download`)
          .set("Authorization", `Bearer ${commA.jwt}`);
        // Doit etre 404 (fichier introuvable car path resolu hors UPLOADS_DIR
        // suppose ne pas exister), ou idealement 400 avec validation amont.
        // NE DOIT PAS etre 200 avec un content type application/pdf qui
        // contiendrait un fichier systeme.
        expect([400, 404]).toContain(dl.status);
        if (dl.status === 200) {
          // Filet de securite : s'assurer qu'on ne stream pas /etc/passwd
          expect(dl.text || "").not.toMatch(/root:x:0:0/);
        }
      } else {
        expect(create.status).toBe(400);
      }
    });

    it("fileUrl=..%2F..%2Fetc%2Fpasswd (URL-encoded) → idem", async () => {
      const create = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "URL-encoded probe",
          fileUrl: "..%2F..%2F..%2Fetc%2Fpasswd",
        });
      if (create.status === 201) {
        const dl = await request(app)
          .get(`/api/document-templates/${create.body.data.id}/download`)
          .set("Authorization", `Bearer ${commA.jwt}`);
        expect([400, 404]).toContain(dl.status);
        if (dl.status === 200) {
          expect(dl.text || "").not.toMatch(/root:x:0:0/);
        }
      } else {
        expect(create.status).toBe(400);
      }
    });

    it("fileUrl pointant vers le tenant B (oracle IDOR) → download interdit", async () => {
      // L'attaque : commA cree un template dont fileUrl pointe vers le
      // bucket interne du tenant B. Si la route download autorise le
      // stream, on peut enumerer les fichiers d'un autre tenant.
      const create = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "IDOR storage probe",
          fileUrl: "00000000-0000-0000-0000-000000000000/document-templates/leaked.pdf",
        });
      // Souhaite : 400 (validation ajoutee) ou au moins 404 (fichier
      // inexistant). Tolere actuellement 201 + 404 sur download.
      if (create.status === 201) {
        const dl = await request(app)
          .get(`/api/document-templates/${create.body.data.id}/download`)
          .set("Authorization", `Bearer ${commA.jwt}`);
        expect(dl.status).toBe(404);
      } else {
        expect(create.status).toBe(400);
      }
    });
  });

  describe("CRUD lifecycle", () => {
    it("DELETE soft-delete → isActive=false", async () => {
      const create = await request(app)
        .post("/api/document-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "Soft delete probe",
          fileUrl: "fake/path.pdf",
        });
      const sid = create.body.data.id;

      const del = await request(app)
        .delete(`/api/document-templates/${sid}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(del.status).toBe(204);

      const get = await request(app)
        .get(`/api/document-templates/${sid}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(get.status).toBe(200);
      expect(get.body.data.isActive).toBe(false);
    });

    it("GET /:id pour un id inexistant → 404", async () => {
      const res = await request(app)
        .get("/api/document-templates/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(404);
    });
  });
});
