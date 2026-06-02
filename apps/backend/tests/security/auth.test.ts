import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";

const app = buildApp();

/**
 * Tests de securite obligatoires (ADR-0005).
 *
 * POURQUOI le tenant "demo" et non un vrai cabinet : ces tests s'appuient sur
 * les users du SEED PUBLIC committe (prisma/seed.ts) — tenant `demo`, users
 * admin@cabinet-demo.fr (ADMIN) + commercial@cabinet-demo.fr (COMMERCIAL),
 * password=demo. Le seed des vrais cabinets (seed.local.ts) est gitignored et
 * absent en CI : s'appuyer dessus rendrait la suite verte en local mais rouge
 * en CI (EP14-S08). On vise donc la seule source de credentials reproductible.
 */
describe("Security — auth", () => {
  describe("POST /api/auth/login", () => {
    it("400 si payload invalide (email manquant)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ password: "demo", tenantSlug: "demo" });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("401 si mauvais mot de passe", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "commercial@cabinet-demo.fr", password: "wrong", tenantSlug: "demo" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("401 si tenant inconnu (anti-enumeration)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "commercial@cabinet-demo.fr", password: "demo", tenantSlug: "fake-tenant-that-does-not-exist" });
      expect(res.status).toBe(401);
      // Meme message pour tenant inconnu que bad password → anti-enumeration
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("401 si email inconnu (anti-enumeration)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "unknown@cabinet-demo.fr", password: "demo", tenantSlug: "demo" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("200 avec credentials valides + JWT signe", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "commercial@cabinet-demo.fr", password: "demo", tenantSlug: "demo" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("COMMERCIAL");
      expect(res.body.data.jwt).toMatch(/^eyJ/);
      // Verifie que le JWT est signe avec le bon secret
      const decoded = jwt.verify(res.body.data.jwt, env.JWT_SECRET) as { userId: string; tenantId: string; role: string };
      expect(decoded.role).toBe("COMMERCIAL");
      expect(decoded.userId).toBe(res.body.data.userId);
      expect(decoded.tenantId).toBe(res.body.data.tenantId);
    });
  });

  describe("GET /api/auth/me", () => {
    let validJWT: string;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "commercial@cabinet-demo.fr", password: "demo", tenantSlug: "demo" });
      validJWT = res.body.data.jwt;
    });

    it("401 sans header Authorization", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("401 avec Authorization mal forme (pas Bearer)", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", "ApiKey xyz");
      expect(res.status).toBe(401);
    });

    it("401 avec JWT random invalide", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer invalid.jwt.here");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid token");
    });

    it("401 avec JWT signe avec mauvaise cle", async () => {
      const badJWT = jwt.sign(
        { userId: "x", tenantId: "y", role: "ADMIN" },
        "wrong-secret-at-least-32-bytes-xxxxxxxxxxx"
      );
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${badJWT}`);
      expect(res.status).toBe(401);
    });

    it("401 avec JWT expire", async () => {
      const expiredJWT = jwt.sign(
        { userId: "x", tenantId: "y", role: "ADMIN" },
        env.JWT_SECRET,
        { expiresIn: "-1s" }
      );
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expiredJWT}`);
      expect(res.status).toBe(401);
    });

    it("200 avec JWT valide + renvoie user + tenant", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${validJWT}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe("commercial@cabinet-demo.fr");
      expect(res.body.data.role).toBe("COMMERCIAL");
      expect(res.body.data.tenantSlug).toBe("demo");
    });
  });

  describe("POST /api/demo/switch-role", () => {
    let validJWT: string;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "commercial@cabinet-demo.fr", password: "demo", tenantSlug: "demo" });
      validJWT = res.body.data.jwt;
    });

    it("dispo en dev (NODE_ENV=development)", async () => {
      // Sanity check : env de test n'est pas production
      expect(env.NODE_ENV).not.toBe("production");
      const res = await request(app)
        .post("/api/demo/switch-role")
        .set("Authorization", `Bearer ${validJWT}`)
        .send({ role: "ADMIN" });
      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe("ADMIN");
      expect(res.body.data.jwt).toMatch(/^eyJ/);
    });

    it("400 si role invalide", async () => {
      const res = await request(app)
        .post("/api/demo/switch-role")
        .set("Authorization", `Bearer ${validJWT}`)
        .send({ role: "SUPERADMIN" });
      expect(res.status).toBe(400);
    });

    it("401 sans JWT", async () => {
      const res = await request(app).post("/api/demo/switch-role").send({ role: "ADMIN" });
      expect(res.status).toBe(401);
    });
  });
});
