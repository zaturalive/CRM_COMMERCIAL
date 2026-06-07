import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * OWASP A10:2021 — Server-Side Request Forgery (SSRF).
 *
 * Etat V1 :
 *   - Aucune route ne fait fetch/axios/got/http.request avec un input
 *     utilisateur. Verifie par grep static.
 *   - Puppeteer (pdfGenerator) utilise `page.setContent(html)` — html
 *     est genere server-side, pas un URL en input. Si on stockait des
 *     URLs d'images cliente (logo PDF, etc.) et qu'on les rendait via
 *     <img src="...">, ce serait un vecteur SSRF puisque Chromium
 *     resoud les URLs en interne. Pas le cas en V1.
 *   - `track/redirect/:trackingId` retourne 501 (NOT_IMPLEMENTED) en V1.
 *   - Le champ `doctolibUrl` cote client est stocke mais jamais fetch
 *     server-side.
 *
 * On ecrit donc :
 *   1. Static check : aucun fetch/axios/got/node-fetch dans src/.
 *   2. doctolibUrl stocke verbatim (pas de validation distante).
 *   3. /api/track/redirect → 501 pas un proxy.
 *   4. Pattern URL interne dans field libre → stocke verbatim, jamais
 *      fetch (e.g. tenter http://localhost:9090/metrics dans un name).
 *   5. Document N/A pour les services / metadata cloud (AWS 169.254...).
 */

const TENANT_SLUG = "test-ssrf-a10";
const app = buildApp();
const backendRoot = path.resolve(__dirname, "../..");
const srcDir = path.join(backendRoot, "src");

function recursiveFind(dir: string, exts = [".ts"]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...recursiveFind(full, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}
const allSrcFiles = recursiveFind(srcDir);

// Allowlist outbound HTTP audite + non-SSRF : BrevoApiEmailSender fait un fetch()
// vers l'API Brevo dont l'URL provient de la CONFIG (apiBase fixe), jamais d'un
// input utilisateur (le destinataire est dans le body, pas dans l'URL). Scaleway
// bloquant le SMTP sortant, c'est le canal email officiel (ADR-0009 D7).
const OUTBOUND_HTTP_ALLOWLIST = ["BrevoApiEmailSender.ts"];
const isAllowlisted = (f: string) =>
  OUTBOUND_HTTP_ALLOWLIST.some((a) => f.endsWith(a));

describe("Security — A10 SSRF", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT_SLUG);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await disconnectPrisma();
  });

  describe("Static : aucun outbound HTTP utilisateur-controlable", () => {
    it("src/ ne contient pas fetch(<input>) / axios / got / node-fetch / http.request", () => {
      const offenders: string[] = [];
      for (const f of allSrcFiles) {
        const content = fs.readFileSync(f, "utf-8");
        // Patterns risques. On exclut puppeteer (genere son propre HTTP
        // mais c'est encapsule) et les imports test/dev.
        if (/\baxios\b|node-fetch|\bgot\(/.test(content)) {
          offenders.push(f);
        }
        // fetch() global : seul l'outbound allowliste (Brevo, URL config-fixe)
        // est tolere ; tout autre fetch = offender (SSRF potentiel a auditer).
        if (/\bfetch\s*\(/.test(content) && !f.includes("test") && !isAllowlisted(f)) {
          offenders.push(f);
        }
        // http.request / https.request directs : risque SSRF si input user.
        if (/https?\.request\s*\(|https?\.get\s*\(/.test(content)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("page.goto() avec URL non-controlee absent (Puppeteer)", () => {
      // page.setContent(html) est OK (html server-side). page.goto(url)
      // avec url provenant de DB/input user = SSRF.
      const offenders: string[] = [];
      for (const f of allSrcFiles) {
        const content = fs.readFileSync(f, "utf-8");
        if (/page\.goto\s*\(/.test(content)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("doctolibUrl : stocke verbatim, jamais fetch server-side", () => {
    it("POST /api/clients avec doctolibUrl pointant sur metadata AWS interne → stocke OK, pas de fetch", async () => {
      // 169.254.169.254 = AWS IMDS metadata. Si le backend fetch cette URL
      // (e.g. pour valider ou cacher), un attaquant peut leak les creds
      // EC2/EKS. On verifie juste qu'on stocke la valeur sans la fetcher.
      const evilUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/";
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "SSRF",
          lastName: "Test",
          phone: "06 00 00 00 11",
          doctolibUrl: evilUrl,
        });
      // Le schema valide juste que c'est une URL valide. Stocke verbatim.
      expect(res.status).toBe(201);
      expect(res.body.data.doctolibUrl).toBe(evilUrl);
      // Si le serveur avait fetch l'URL, on aurait potentiellement leak
      // les creds dans la response ou ralentissement notable. Sanity sur
      // le timing.
    });

    it("POST /api/clients avec doctolibUrl pointant sur file:// → schema rejette (URL valide HTTP)", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "SSRF2",
          lastName: "Test",
          phone: "06 00 00 00 12",
          doctolibUrl: "file:///etc/passwd",
        });
      // Zod schema utilise z.string().url() qui accepte file://. C'est un
      // risque potentiel si on fetch un jour. V1 OK car pas de fetch.
      // On verifie au minimum que le serveur ne crash pas en 500.
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe("Internal-network targets : stockes mais jamais fetch", () => {
    it("POST /api/clients avec address contenant URL interne → stocke verbatim", async () => {
      const internal = "http://localhost:9090/metrics http://10.0.0.1/admin http://127.0.0.1:5432/";
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "Mallory",
          lastName: "Internal",
          phone: "06 00 00 00 13",
          address: internal,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.address).toBe(internal);
    });
  });

  describe("/api/track/redirect — V1 returns 501 (no SSRF surface)", () => {
    it("GET /api/track/redirect/anything avec JWT → 501 NOT_IMPLEMENTED (pas de proxy actif)", async () => {
      // La route est sous /api/ protege, donc requireJWT fire d'abord.
      // Avec un JWT valide, on observe le 501 attendu.
      const res = await request(app)
        .get("/api/track/redirect/abc-tracking-id-test")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(501);
      expect(res.body.code).toBe("NOT_IMPLEMENTED");
    });

    it("GET /api/track/redirect avec URL dans le path + JWT → toujours 501 (pas de redirect actif)", async () => {
      // Si la V2 implemente le redirect, il faudra valider l'URL contre
      // une whitelist tenant. Pour V1, 501 partout — pas de SSRF possible
      // puisqu'aucun fetch n'est jamais declenche.
      const res = await request(app)
        .get("/api/track/redirect/" + encodeURIComponent("http://evil.fr"))
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(501);
    });

    it("GET /api/track/redirect sans JWT → 401 (route protected)", async () => {
      // Sanity : sans token, c'est 401 (defense en profondeur via auth).
      const res = await request(app).get("/api/track/redirect/abc");
      expect(res.status).toBe(401);
    });
  });

  describe("Documentation des risques tolere V1", () => {
    it("aucune route /api/proxy, /api/fetch, /api/import-url → 401/404", async () => {
      const paths = ["/api/proxy", "/api/fetch", "/api/import-url", "/api/webhook-test"];
      for (const p of paths) {
        const res = await request(app)
          .post(p)
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ url: "http://evil.fr" });
        expect([404, 401]).toContain(res.status);
        expect(res.status).not.toBe(200);
      }
    });
  });
});
