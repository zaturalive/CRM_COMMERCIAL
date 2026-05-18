import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP06-S02 — Tests securite upload documents.
 *
 * Vecteurs couverts :
 *   1. MIME non autorise (.exe, text/html) → 400
 *   2. Taille > 10 MB → 413
 *   3. Nom avec ../ → 400 (ou stockage safe apres sanitization busboy)
 *   4. Upload cross-tenant d'un document → 404
 *   5. Download cross-tenant → 404
 *   6. Preview cross-tenant → 404
 *   7. fileUrl jamais contaminee par `..` (invariant de stockage)
 */

const app = buildApp();
const prisma = new PrismaClient();
const TA = "test-docs-upload-a";
const TB = "test-docs-upload-b";

describe("EP06-S02 Security — documents upload", () => {
  let adminA: { jwt: string; tenantId: string };
  let adminB: { jwt: string; tenantId: string };
  let processA: string;
  let processB: string;
  let docOnA: string;
  let docOnB: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = { jwt: A.admin.jwt, tenantId: A.tenant.id };
    adminB = { jwt: B.admin.jwt, tenantId: B.tenant.id };

    // Clients + processes de base dans chaque tenant
    const clientA = await prisma.client.create({
      data: { tenantId: adminA.tenantId, firstName: "CA", lastName: "Test", phone: "06 00 A1" },
    });
    const clientB = await prisma.client.create({
      data: { tenantId: adminB.tenantId, firstName: "CB", lastName: "Test", phone: "06 00 B1" },
    });
    const pA = await prisma.process.create({ data: { tenantId: adminA.tenantId, clientId: clientA.id } });
    const pB = await prisma.process.create({ data: { tenantId: adminB.tenantId, clientId: clientB.id } });
    processA = pA.id;
    processB = pB.id;

    // Un doc dans chaque tenant (ajout manuel)
    const docA = await prisma.processDocument.create({
      data: { processId: processA, name: "Doc A", status: "EN_ATTENTE" },
    });
    const docB = await prisma.processDocument.create({
      data: { processId: processB, name: "Doc B", status: "EN_ATTENTE" },
    });
    docOnA = docA.id;
    docOnB = docB.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  it("upload .exe (MIME non autorise) → 400", async () => {
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docOnA}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", Buffer.from("MZfake"), {
        filename: "bad.exe",
        contentType: "application/x-msdownload",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MIME_REJECTED");
  });

  it("upload text/html (MIME non autorise) → 400", async () => {
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docOnA}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "xss.html",
        contentType: "text/html",
      });
    expect(res.status).toBe(400);
  });

  it("upload > 10 MB → 413", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docOnA}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", big, { filename: "big.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
  });

  it("upload PNG valide → 201 + fileUrl safe (ni .. ni chemin absolu)", async () => {
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docOnA}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", Buffer.from("\x89PNG\r\n\x1a\n" + "fakepayload"), {
        filename: "scan.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(201);
    const fileUrl: string = res.body.data.fileUrl;
    expect(fileUrl).toBeTruthy();
    expect(fileUrl.startsWith(adminA.tenantId)).toBe(true);
    expect(fileUrl.includes("..")).toBe(false);
    expect(fileUrl.startsWith("/")).toBe(false);
  });

  it("cross-tenant upload → 404 (adminB tente sur docOnA)", async () => {
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docOnA}/upload`)
      .set("Authorization", `Bearer ${adminB.jwt}`)
      .attach("file", Buffer.from("fake"), {
        filename: "ok.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(404);
  });

  it("cross-tenant download → 404", async () => {
    const res = await request(app)
      .get(`/api/processes/${processA}/documents/${docOnA}/download`)
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(404);
  });

  it("cross-tenant preview → 404", async () => {
    const res = await request(app)
      .get(`/api/processes/${processA}/documents/${docOnA}/preview`)
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(404);
  });

  it("cross-tenant list documents → 404", async () => {
    const res = await request(app)
      .get(`/api/processes/${processA}/documents`)
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(404);
  });

  it("GET /available isole par tenant (B ne voit pas les labels de A)", async () => {
    // Tenant A cree un label specifique
    const labelA = await prisma.documentLabel.create({
      data: { tenantId: adminA.tenantId, name: `SecretLabelA ${Date.now()}` },
    });

    // adminA le voit dans 'others' de son process
    const resA = await request(app)
      .get(`/api/processes/${processA}/documents/available`)
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.others.some((l: { id: string }) => l.id === labelA.id)).toBe(true);

    // adminB sur processB ne doit pas voir labelA
    const resB = await request(app)
      .get(`/api/processes/${processB}/documents/available`)
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data.others.some((l: { id: string }) => l.id === labelA.id)).toBe(false);
    expect(resB.body.data.recommended.some((l: { id: string }) => l.id === labelA.id)).toBe(false);
  });

  it("POST /attach-labels refuse labelIds d'un autre tenant → 404", async () => {
    const labelA = await prisma.documentLabel.create({
      data: { tenantId: adminA.tenantId, name: `CrossLabelA ${Date.now()}` },
    });
    // adminB essaie d'attacher labelA sur processB → le label est introuvable
    // dans le tenant B → 404
    const res = await request(app)
      .post(`/api/processes/${processB}/documents/attach-labels`)
      .set("Authorization", `Bearer ${adminB.jwt}`)
      .send({ labelIds: [labelA.id] });
    expect(res.status).toBe(404);
  });

  it("POST /attach-labels batch valide cree les docs en skipant les doublons", async () => {
    // Cree 2 labels nouveaux dans A
    const l1 = await prisma.documentLabel.create({
      data: { tenantId: adminA.tenantId, name: `Batch1 ${Date.now()}` },
    });
    const l2 = await prisma.documentLabel.create({
      data: { tenantId: adminA.tenantId, name: `Batch2 ${Date.now()}` },
    });
    // Attache l1 manuellement pour forcer un doublon ensuite
    await prisma.processDocument.create({
      data: { processId: processA, documentLabelId: l1.id, name: l1.name, status: "EN_ATTENTE" },
    });

    // Batch avec les deux → seul l2 est cree
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/attach-labels`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ labelIds: [l1.id, l2.id] });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);
  });

  it("POST manuel avec documentLabelId → copie le nom du label, snapshot", async () => {
    const label = await prisma.documentLabel.create({
      data: { tenantId: adminA.tenantId, name: `Snap ${Date.now()}` },
    });
    const res = await request(app)
      .post(`/api/processes/${processA}/documents`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ documentLabelId: label.id });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(label.name);
    expect(res.body.data.documentLabelId).toBe(label.id);
  });

  it("POST manuel avec les deux name + documentLabelId → 400 (mutuellement exclusifs)", async () => {
    const res = await request(app)
      .post(`/api/processes/${processA}/documents`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ name: "both", documentLabelId: "fake-id-01" });
    expect(res.status).toBe(400);
  });

  it("filename avec ../ → soit 400, soit fileUrl safe (defense profondeur)", async () => {
    // Cree un nouveau doc pour ce test (evite d'ecraser le precedent)
    const docC = await prisma.processDocument.create({
      data: { processId: processA, name: "Doc C", status: "EN_ATTENTE" },
    });
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docC.id}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", Buffer.from("fake"), {
        filename: "../../etc/passwd.png",
        contentType: "image/png",
      });
    // Soit rejete (400), soit sanitized par busboy (201 + fileUrl safe)
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
    } else {
      expect(res.status).toBe(201);
      const fileUrl: string = res.body.data.fileUrl;
      expect(fileUrl.includes("..")).toBe(false);
      expect(fileUrl.startsWith("/")).toBe(false);
      expect(fileUrl.startsWith(adminA.tenantId)).toBe(true);
    }
  });

  it("upload PDF valide → 201 + status RECU + receivedAt", async () => {
    const docD = await prisma.processDocument.create({
      data: { processId: processA, name: "Doc D", status: "EN_ATTENTE" },
    });
    const res = await request(app)
      .post(`/api/processes/${processA}/documents/${docD.id}/upload`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .attach("file", Buffer.from("%PDF-1.4\nfake"), {
        filename: "scan.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("RECU");
    expect(res.body.data.receivedAt).not.toBeNull();
    expect(res.body.data.fileUrl).toMatch(/\.pdf$/);
  });
});
