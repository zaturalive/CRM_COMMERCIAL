import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

/**
 * EP15-S05 — Desactivation de DEMO_MODE + retrait du role switcher en prod.
 *
 * Reference : docs/product/stories/EP15-S05.md (Acceptance Criteria + section
 * "Tests de securite (obligatoires)"). Fichier cible designe par la story :
 * apps/backend/tests/security/demo-mode-off.test.ts.
 *
 * Etat verifie (audit 2026-06-01, repris dans la story) :
 *   - src/app.ts:100 monte /api/demo si `env.NODE_ENV !== "production" ||
 *     env.DEMO_MODE`. La condition `|| env.DEMO_MODE` est une porte de sortie
 *     qui re-active la surface de demo MEME en production si DEMO_MODE=true.
 *   - La route /api/demo/switch-role (src/routes/demo.ts) re-signe un JWT avec
 *     le role demande, donc l'atteindre permet une elevation de role.
 *
 * La story transforme la coupure en garantie testee, pas en hypothese de config
 * (AC4 : "la surface de demo est absente, pas seulement masquee cote front").
 *
 * Subtilite d'execution (cf. demo-route-prod.test.ts deja en place) :
 * src/config/env.ts parse process.env au premier import et met le resultat en
 * cache. On patche donc process.env PUIS on `vi.resetModules()` avant un import
 * dynamique de buildApp, ce qui force une nouvelle evaluation de env.ts.
 *
 * Note de portee : ce fichier ne duplique pas demo-route-prod.test.ts (qui
 * couvre deja "prod + ADMIN -> 404", "dev -> 401", "health prod -> 200"). Il
 * ajoute les angles checklist non couverts : DEMO_MODE explicitement off,
 * tentative d'elevation par un COMMERCIAL, et le verrou serveur quand
 * DEMO_MODE=true est positionne par erreur en production.
 *
 * Phase TDD : certains cas sont rouges tant que le verrou prod n'est pas
 * durci (la porte `|| env.DEMO_MODE` doit etre neutralisee en production). Ne
 * pas implementer le code a ce stade.
 */

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.DEMO_MODE;

/**
 * Restaure le buildApp avec un NODE_ENV / DEMO_MODE donnes, en forcant une
 * re-evaluation de env.ts (parse au chargement, mis en cache).
 */
async function buildAppWithEnv(opts: {
  nodeEnv: string;
  demoMode?: string | undefined;
}): Promise<import("express").Express> {
  process.env.NODE_ENV = opts.nodeEnv;
  if (opts.demoMode === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = opts.demoMode;
  }
  vi.resetModules();
  const { buildApp } = await import("../../src/app");
  return buildApp();
}

function signUserJWT(role: "ADMIN" | "COMMERCIAL"): string {
  // Le secret est commun prod/dev dans l'environnement de test : on signe un
  // jeton tenant valide pour que requireJWT passe et qu'on observe le routing
  // (404 si la route n'est pas montee) plutot qu'un 401 de la chaine middleware.
  const secret = process.env.JWT_SECRET as string;
  return jwt.sign(
    { kind: "user", userId: "u-test", tenantId: "t-test", role },
    secret
  );
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalDemoMode === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = originalDemoMode;
  }
  vi.resetModules();
});

describe("EP15-S05 — DEMO_MODE off en production (surface backend absente)", () => {
  it("AC1 : NODE_ENV=production sans DEMO_MODE -> POST /api/demo/switch-role = 404", async () => {
    const app = await buildAppWithEnv({ nodeEnv: "production", demoMode: undefined });
    const res = await request(app)
      .post("/api/demo/switch-role")
      .set("Authorization", `Bearer ${signUserJWT("ADMIN")}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
    // La reponse ne doit pas renvoyer de nouveau JWT (pas de re-signature).
    expect(res.body?.data?.jwt).toBeUndefined();
  });

  it("AC1 : NODE_ENV=production avec DEMO_MODE=false -> 404 (off explicite)", async () => {
    const app = await buildAppWithEnv({ nodeEnv: "production", demoMode: "false" });
    const res = await request(app)
      .post("/api/demo/switch-role")
      .set("Authorization", `Bearer ${signUserJWT("ADMIN")}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
  });

  it("checklist : un COMMERCIAL ne peut pas atteindre la route de demo pour s'octroyer un autre role en prod", async () => {
    // POURQUOI : la route switch-role re-signe un JWT avec le role demande. En
    // prod, elle doit etre absente du routing (404), donc un COMMERCIAL ne peut
    // pas l'utiliser pour s'auto-promouvoir ADMIN. Le 404 (surface absente)
    // prime sur un controle de role : il n'y a rien a atteindre.
    const app = await buildAppWithEnv({ nodeEnv: "production", demoMode: undefined });
    const res = await request(app)
      .post("/api/demo/switch-role")
      .set("Authorization", `Bearer ${signUserJWT("COMMERCIAL")}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
    expect(res.body?.data?.jwt).toBeUndefined();
    expect(res.body?.data?.role).toBeUndefined();
  });

  it("AC4 verrou serveur : DEMO_MODE=true positionne par erreur en production NE re-active PAS la surface de demo", async () => {
    // POURQUOI (rouge attendu) : src/app.ts:100 monte la route si
    // `NODE_ENV !== "production" || env.DEMO_MODE`. Cette porte de sortie
    // permet a DEMO_MODE=true de re-ouvrir /api/demo en production. La story
    // (AC4 "verrou serveur ... rendu explicite et teste" ; Notes techniques
    // "s'appuyer sur NODE_ENV=production") exige que la production reste le
    // plancher dur : une mauvaise valeur de DEMO_MODE ne doit pas exposer la
    // surface de demo en prod. Ce test pilote le durcissement de la condition.
    const app = await buildAppWithEnv({ nodeEnv: "production", demoMode: "true" });
    const res = await request(app)
      .post("/api/demo/switch-role")
      .set("Authorization", `Bearer ${signUserJWT("COMMERCIAL")}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
    expect(res.body?.data?.jwt).toBeUndefined();
  });

  it("non-regression : la route reste montee en development (401 sans JWT, pas 404)", async () => {
    // Sanity : on ne casse pas l'usage de demo en dev. Sans JWT -> 401 (la
    // route existe et exige requireJWT), ce qui prouve qu'elle est bien montee.
    const app = await buildAppWithEnv({ nodeEnv: "development", demoMode: undefined });
    const res = await request(app).post("/api/demo/switch-role").send({ role: "ADMIN" });
    expect(res.status).toBe(401);
  });

  it("non-regression : /api/health reste disponible en production", async () => {
    const app = await buildAppWithEnv({ nodeEnv: "production", demoMode: undefined });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.env).toBe("production");
  });
});
