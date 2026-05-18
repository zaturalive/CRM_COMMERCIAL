import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { setupTestTenant, teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * Advanced security angles — audit 2026-04-23.
 *
 * Trois angles non couverts par les SEC-01..SEC-11 :
 *   1. ReDoS sur la validation du telephone FR (regex Zod)
 *   2. Path traversal : pre-EP06, verifier qu'aucune route backend ne passe
 *      un chemin utilisateur a fs/sendFile. Filet anti-regression avant que
 *      les uploads arrivent.
 *   3. Header injection sur POST /api/auth/login — un email contenant
 *      \r\nX-Injected: evil ne doit pas ressortir dans les headers de
 *      reponse (defense against HTTP response splitting).
 */

const TENANT_SLUG = "advanced-angles-test";
const app = buildApp();

describe("Security — advanced angles", () => {
  let adminJwt: string;

  beforeAll(async () => {
    const ctx = await setupTestTenant(app, TENANT_SLUG);
    adminJwt = ctx.admin.jwt;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await disconnectPrisma();
  });

  /**
   * Angle 1 — ReDoS sur regex telephone FR.
   *
   * Pattern : /^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/
   * Analyse : le groupe (?:[\s.-]?\d{2}){4} est borne (4 repetitions fixes)
   * et [\s.-]? est optionnel non-ambigu. Pas de catastrophic backtracking
   * apparent. On teste empiriquement avec un payload adversarial : 10 KB de
   * caracteres qui auraient pu matcher partiellement, pour confirmer qu'il
   * n'y a pas de degeneration en temps exponentiel.
   */
  it("ReDoS — regex phone FR resiste a un payload de 10 KB", async () => {
    const phoneRegex = /^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/;

    // Payload "bait" : un prefixe valide + 10 KB de caracteres que le regex
    // va essayer de matcher. Si le regex etait vulnerable au backtracking,
    // le temps d'execution exploserait.
    const payloads = [
      "0" + " ".repeat(10_000) + "12",
      "06 12 34 56 78" + "x".repeat(10_000),
      "+33" + "1".repeat(10_000),
      "0" + "1 2".repeat(5_000),
      "0123456789" + "x".repeat(10_000),
    ];

    for (const payload of payloads) {
      const start = performance.now();
      const matched = phoneRegex.test(payload);
      const elapsed = performance.now() - start;
      // Aucun payload malicieux ne doit match (sanity).
      expect(matched).toBe(false);
      // Seuil conservateur : un regex safe sur 10 KB s'execute en quelques ms.
      // > 100 ms indiquerait un pattern vulnerable (ReDoS).
      expect(elapsed).toBeLessThan(100);
    }
  });

  /**
   * Angle 1b — integration : POST /api/clients avec un phone malicieux
   * doit renvoyer 400 Validation rapidement (< 1s).
   */
  it("ReDoS — POST /api/clients avec phone adversarial → 400 rapide", async () => {
    const start = performance.now();
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        firstName: "Test",
        lastName: "ReDoS",
        phone: "0" + " ".repeat(10_000) + "12",
      });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(400);
    // Le pipeline complet (Zod + error handler) doit rendre la main < 1s.
    expect(elapsed).toBeLessThan(1000);
  });

  /**
   * Angle 2 — path traversal.
   *
   * Etat du code a date (2026-04-23) : aucune route backend ne lit/ecrit de
   * fichier a partir d'un chemin utilisateur. `pdfGenerator` utilise
   * Puppeteer avec `page.setContent(html)` (aucune IO disque). Le seul
   * endroit ou une valeur issue de la DB est interpolee dans un header est
   * `Content-Disposition: filename="${reference}.pdf"`, et `reference` est
   * generee serveur-side (DEV-YYYY-XXXX, alphanumerique strict).
   *
   * Ce test verifie qu'un attaquant qui tente de passer un payload ../..
   * via une URL ne peut ni atteindre un FS ni faire leak de contenu.
   */
  it("path traversal — GET /api/devis/../../../../etc/passwd → 404/400, pas de fuite FS", async () => {
    const res = await request(app)
      .get("/api/devis/..%2F..%2F..%2F..%2Fetc%2Fpasswd")
      .set("Authorization", `Bearer ${adminJwt}`);
    // Express normalise et ne laisse pas sortir du routeur. On accepte
    // 400/404/403 mais pas 200 avec du contenu /etc/passwd.
    expect([400, 404, 403]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/root:.*:0:0:/);
  });

  it("path traversal — GET /api/cliniques/..%2Fadmin avec JWT → 404, pas de leak", async () => {
    const res = await request(app)
      .get("/api/cliniques/..%2Fadmin")
      .set("Authorization", `Bearer ${adminJwt}`);
    expect([400, 404]).toContain(res.status);
  });

  /**
   * Angle 3 — Header injection / HTTP response splitting.
   *
   * Un attaquant envoie un email contenant \r\nX-Injected: evil. Express
   * valide normalement les headers entrants (reject sur CRLF dans le header
   * Authorization par ex.) mais la valeur dans le BODY JSON est libre. Ce
   * qu'on teste : que le email du body ne soit jamais echo dans les headers
   * de la reponse (Set-Cookie, Location, Content-Disposition, etc.).
   */
  it("header injection — email avec CRLF ne leak pas dans les headers de reponse", async () => {
    const payload = "julie@cabinet-delobaux.fr\r\nX-Injected: evil";
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: payload,
        password: "demo",
        tenantSlug: "cabinet-delobaux",
      });

    // Aucun header ne doit etre X-Injected.
    const hasInjected = Object.keys(res.headers).some((h) =>
      h.toLowerCase().includes("x-injected")
    );
    expect(hasInjected).toBe(false);

    // Et plus generalement, aucune valeur de header ne doit contenir
    // "evil" (sanity sur tous les headers).
    for (const [, value] of Object.entries(res.headers)) {
      const str = Array.isArray(value) ? value.join(",") : String(value ?? "");
      expect(str).not.toContain("X-Injected");
      expect(str).not.toContain("evil");
    }

    // Le endpoint doit aussi rejeter l'email (email Zod invalide) ou renvoyer
    // 401. On n'a pas de comportement leak si on renvoie 400/401.
    expect([400, 401]).toContain(res.status);
  });

  it("header injection — tenantSlug avec CRLF ne pollue pas les headers", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "x@test.fr",
        password: "demo",
        tenantSlug: "cabinet-delobaux\r\nSet-Cookie: pwn=1",
      });
    // Aucun Set-Cookie "pwn" dans la reponse.
    const setCookie = res.headers["set-cookie"];
    const str = Array.isArray(setCookie) ? setCookie.join(",") : String(setCookie ?? "");
    expect(str).not.toContain("pwn");
  });
});
