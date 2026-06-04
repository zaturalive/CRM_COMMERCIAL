import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S08 — Batterie de conformite securite PAR-ENDPOINT, auto-decouverte.
 *
 * POURQUOI cette suite existe : les tests de securite par ressource
 * (clients.test.ts, devis.test.ts, ...) couvrent chacun UN router. Rien ne
 * garantit qu'un NOUVEL endpoint monte demain hérite par defaut de la baseline
 * OWASP (401 sans JWT, isolation cross-tenant, pas de fuite d'erreur, headers
 * helmet, surface BO cloisonnee). Cette suite enumere TOUTES les routes Express
 * effectivement montees (introspection de app._router.stack) et asserte la
 * baseline sur CHACUNE. Elle est volontairement RED si un endpoint apparait sans
 * classification explicite : ajouter une route force a la ranger (publique vs
 * tenant vs editeur), donc a decider consciemment de sa protection.
 *
 * Reference modele d'autorite (ADR-0009) :
 *  - requireJWT (SEC-01, HS256 pinned) : 401 si pas de Bearer valide.
 *  - requireTenant + Prisma $extends : isolation multi-tenant (404 cross-tenant,
 *    pas d'oracle d'existence).
 *  - requireEditor : surface /api/admin/* reservee au kind "editor" (un JWT
 *    tenant -> 403, fix escalade EP17-S04).
 *  - helmet (SEC-04) : headers securite sur toutes les reponses.
 *  - errorHandler (SEC-05) : la reponse ne leak ni stack ni secret.
 *
 * Non-HDS : aucune donnee de sante manipulee ici (clients commerciaux de test).
 */

const app = buildApp();

// ---------------------------------------------------------------------------
// 1. Auto-decouverte des routes montees
// ---------------------------------------------------------------------------

interface DiscoveredRoute {
  method: string; // GET | POST | PATCH | PUT | DELETE | ALL
  path: string; // chemin normalise, ex "/api/clients/:id"
}

interface ExpressLayer {
  name?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: ExpressLayer[] };
  regexp?: RegExp;
  keys?: { name: string }[];
}

/**
 * Reconstitue le prefixe de montage d'un sous-router depuis sa regexp compilee.
 *
 * POURQUOI lire la regexp plutot qu'une table statique : la source de verite est
 * l'app reellement construite (app.use(...)), pas une liste qu'on devrait tenir a
 * jour. Si un router est monte, il est decouvert ; on ne peut pas oublier de
 * couvrir un endpoint.
 *
 * Express compile "/api/clients" en /^\/api\/clients\/?(?=\/|$)/i et un parametre
 * "/api/processes/:id/documents" via un groupe capture + une cle nommee. Les
 * routers imbriques avec mergeParams produisent un segment optionnel
 * "(?:/:tenantId)" : on le ramene a "/:tenantId".
 */
function mountPathFromRegexp(layer: ExpressLayer): string {
  if (!layer.regexp) return "";
  let src = layer.regexp.source;
  src = src
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
    .replace(/\\\/\?\$$/, "")
    .replace(/\$$/, "")
    .replace(/\\\//g, "/");

  const keys = layer.keys ?? [];
  let keyIndex = 0;
  // Segment de parametre rendu optionnel par mergeParams : (?:/([^/]+?)) ou
  // (?:/(?:([^/]+?))) -> /:name
  src = src.replace(/\(\?:\/\(\?:\(\[\^\/\]\+\?\)\)\)/g, () => `/:${keys[keyIndex++]?.name ?? "param"}`);
  src = src.replace(/\(\?:\/\(\[\^\/\]\+\?\)\)/g, () => `/:${keys[keyIndex++]?.name ?? "param"}`);
  // Parametre nominal : (?:([^/]+?)) ou ([^/]+?) -> :name
  src = src.replace(/\(\?:\(\[\^\/\]\+\?\)\)/g, () => `:${keys[keyIndex++]?.name ?? "param"}`);
  src = src.replace(/\(\[\^\/\]\+\?\)/g, () => `:${keys[keyIndex++]?.name ?? "param"}`);
  return src;
}

function discoverRoutes(application: Express): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  const seen = new Set<string>();

  function walk(stack: ExpressLayer[], prefix: string) {
    for (const layer of stack) {
      if (layer.route) {
        const routePath = prefix + layer.route.path;
        const methods = Object.keys(layer.route.methods).filter(
          (m) => layer.route!.methods[m],
        );
        for (const method of methods) {
          const m = method.toUpperCase();
          const key = `${m} ${routePath}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ method: m, path: routePath });
          }
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPathFromRegexp(layer));
      }
    }
  }

  const root = (application as unknown as { _router: { stack: ExpressLayer[] } })
    ._router;
  walk(root.stack, "");
  return out.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

const ALL_ROUTES = discoverRoutes(app);

// ---------------------------------------------------------------------------
// 2. Classification de la surface
// ---------------------------------------------------------------------------

/**
 * Routes PUBLIQUES (accessibles sans JWT) — allowlist EXPLICITE.
 *
 * POURQUOI une allowlist fermee : c'est le coeur de la garantie "secure by
 * default". Toute route /api/* qui n'est NI ici NI sous /api/admin/* est traitee
 * comme tenant-protected et doit repondre 401 sans JWT. Un nouvel endpoint
 * public oublie ici sera donc teste comme protege et, s'il repond 200 sans JWT,
 * la suite passe RED : l'auteur doit consciemment le declarer public. Le couple
 * (methode, chemin normalise) doit matcher la decouverte.
 *
 * 2fa/verify et 2fa/recovery sont dual-mode (challenge de login sans JWT prealable
 * + confirmation post-login) : la route elle-meme n'exige pas de Bearer, on la
 * classe donc publique (l'authz reelle est portee par le pendingToken / TOTP).
 */
const PUBLIC_ROUTES = new Set<string>([
  "GET /api/health",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/auth/forgot-password",
  "POST /api/auth/reset-password",
  "POST /api/auth/2fa/verify",
  "POST /api/auth/2fa/recovery",
  // 2FA par email (etape 2 du login : pendingToken, pas de JWT a ce stade) +
  // renvoi du code + SSO Google (echange serveur-a-serveur par secret partage) +
  // check token reset (verification publique, ne consomme pas). Publics par
  // conception, comme /2fa/verify : l'authz est portee par le pendingToken / le
  // secret partage / le token, pas par un JWT de session.
  "POST /api/auth/2fa/verify-email",
  "POST /api/auth/2fa/email/resend",
  "POST /api/auth/google",
  "POST /api/auth/reset-password/check",
  "GET /api/tenant/by-slug/:slug",
  // Express expose une route router.all(...) avec la pseudo-methode "_all" :
  // c'est la garde 405 (Method Not Allowed) du lookup public, pas un point
  // d'ecriture. Classee publique (l'autorite reste le JWT + Prisma).
  "_ALL /api/tenant/by-slug/:slug",
  // EP17 (completion) : login editeur. PUBLIC par conception (l'editeur n'a pas
  // encore de jeton) — monte AVANT requireEditor (app.ts). L'authz reelle est
  // portee par bcrypt + signEditorJWT (cf. editor-login.test.ts). Declaree ici
  // explicitement pour rester "secure by default" : c'est la seule route
  // /api/admin/* non gardee, et ce choix est conscient.
  "POST /api/admin/login",
]);

/**
 * Routes hors-tenant qui exigent un JWT mais PAS de contexte tenant
 * (kind "user" suffit, requireTenant n'est pas dans leur chaine). Elles doivent
 * repondre 401 sans JWT comme les routes tenant, mais l'assertion d'isolation
 * cross-tenant (404) ne s'applique pas. /api/demo/switch-role n'est monte qu'en
 * NODE_ENV != production (re-signe un JWT, surface de demo locale).
 */
const JWT_NO_TENANT_ROUTES = new Set<string>([
  "POST /api/demo/switch-role",
]);

function routeKey(r: DiscoveredRoute): string {
  return `${r.method} ${r.path}`;
}

function isEditorSurface(r: DiscoveredRoute): boolean {
  return r.path.startsWith("/api/admin/");
}

function isPublic(r: DiscoveredRoute): boolean {
  return PUBLIC_ROUTES.has(routeKey(r));
}

function isJwtNoTenant(r: DiscoveredRoute): boolean {
  return JWT_NO_TENANT_ROUTES.has(routeKey(r));
}

/** Route tenant nominale : protegee par requireJWT + requireTenant. */
function isTenantProtected(r: DiscoveredRoute): boolean {
  return (
    r.path.startsWith("/api/") &&
    !isEditorSurface(r) &&
    !isPublic(r) &&
    !isJwtNoTenant(r)
  );
}

/**
 * Substitue les segments de parametre par des UUID/valeurs plausibles pour
 * pouvoir frapper l'URL. On vise un id INEXISTANT (UUID zero) : pour une route
 * tenant, l'attendu sans JWT est 401 (le routage atteint requireJWT avant tout
 * handler), donc la valeur du parametre n'influe pas sur l'assertion d'auth.
 */
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
function concretePath(path: string, overrides: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
    return overrides[name] ?? ZERO_UUID;
  });
}

const SUPERTEST_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
function send(method: string, url: string) {
  const lower = method.toLowerCase();
  // supertest n'expose que les verbes HTTP standard ; toute pseudo-methode
  // (ex "_all" de router.all) est exercee via POST, methode mutante
  // representative. Les routes baseline testees ici sont toutes des verbes
  // standard ; ce fallback evite un crash si la surface evolue.
  const m = SUPERTEST_METHODS.has(lower) ? lower : "post";
  return (request(app) as unknown as Record<string, (u: string) => request.Test>)[m](url);
}

// ---------------------------------------------------------------------------
// 3. Patterns de fuite (SEC-05) — aucun ne doit apparaitre dans un body
// ---------------------------------------------------------------------------

const LEAK_PATTERNS: RegExp[] = [
  /"stack"\s*:/i, // champ stack serialise
  /\bat \/[\w./-]+:\d+:\d+/, // frame de stacktrace V8
  /\/home\/[\w./-]+/, // chemin absolu du serveur de dev
  /node_modules\//, // chemin interne de dependances
  /JWT_SECRET|AT_REST_KEY|EMAIL_SEARCH_KEY|DATABASE_URL/i, // noms de secrets env
  /postgres(ql)?:\/\//i, // DSN base de donnees
  /PrismaClient(KnownRequest|Validation)?Error/, // type d'erreur ORM brut
];

function assertNoLeak(body: unknown, route: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body ?? {});
  for (const pattern of LEAK_PATTERNS) {
    expect(
      pattern.test(raw),
      `Fuite potentielle sur ${route} : pattern ${pattern} present dans le body`,
    ).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// 4. Suites
// ---------------------------------------------------------------------------

describe("EP14-S08 — Conformite securite par-endpoint (auto-decouverte)", () => {
  it("decouvre la surface de routes (sanity : la suite a bien quelque chose a tester)", () => {
    // POURQUOI un plancher : si l'introspection casse (montage change, version
    // d'Express), on veut un echec bruyant plutot qu'une suite qui passe sur 0
    // route. Le chiffre exact derive et n'est pas fige.
    expect(ALL_ROUTES.length).toBeGreaterThan(100);
  });

  it("toute route /api/* est classee (publique | tenant | editeur | jwt-sans-tenant) — secure by default", () => {
    const unclassified = ALL_ROUTES.filter(
      (r) =>
        r.path.startsWith("/api/") &&
        !isPublic(r) &&
        !isEditorSurface(r) &&
        !isJwtNoTenant(r) &&
        !isTenantProtected(r),
    );
    // isTenantProtected attrape tout le reste : ce filtre doit etre vide. Il sert
    // de garde-fou si la logique de classification evolue.
    expect(unclassified.map(routeKey)).toEqual([]);
  });

  it("l'allowlist PUBLIC ne reference que des routes reellement montees (anti-derive)", () => {
    const live = new Set(ALL_ROUTES.map(routeKey));
    const stale = [...PUBLIC_ROUTES].filter((k) => !live.has(k));
    // Une entree publique qui ne correspond plus a aucune route = derive : soit la
    // route a ete supprimee/renommee, soit l'allowlist ment. On force le menage.
    expect(stale).toEqual([]);
  });

  describe("Baseline A — routes tenant : 401 sans JWT (requireJWT)", () => {
    const tenantRoutes = ALL_ROUTES.filter(isTenantProtected);

    it("au moins une route tenant decouverte", () => {
      expect(tenantRoutes.length).toBeGreaterThan(0);
    });

    it.each(tenantRoutes.map((r) => [routeKey(r), r] as const))(
      "%s sans Authorization -> 401",
      async (_key, route) => {
        const res = await send(route.method, concretePath(route.path));
        expect(
          res.status,
          `${routeKey(route)} devrait exiger un JWT (401), recu ${res.status}`,
        ).toBe(401);
        assertNoLeak(res.body, routeKey(route));
      },
    );
  });

  describe("Baseline A — routes jwt-sans-tenant : 401 sans JWT", () => {
    const routes = ALL_ROUTES.filter(isJwtNoTenant);

    it.each(routes.map((r) => [routeKey(r), r] as const))(
      "%s sans Authorization -> 401",
      async (_key, route) => {
        const res = await send(route.method, concretePath(route.path));
        expect(res.status).toBe(401);
        assertNoLeak(res.body, routeKey(route));
      },
    );
  });

  describe("Baseline B — surface BO /api/admin/* cloisonnee (requireEditor)", () => {
    // EP17 (completion) : on exclut les routes /api/admin/* explicitement
    // declarees publiques (POST /api/admin/login). Elles sont montees AVANT
    // requireEditor (l'editeur n'a pas encore de jeton) ; leur contrat est teste
    // a part (editor-login.test.ts : 401 mauvais mdp, 403 inactif, anti-oracle).
    // Le reste de la surface BO reste asserte 401 (sans token) / 403 (JWT tenant).
    const adminRoutes = ALL_ROUTES.filter(
      (r) => isEditorSurface(r) && !isPublic(r),
    );

    it("au moins une route editeur decouverte", () => {
      expect(adminRoutes.length).toBeGreaterThan(0);
    });

    it.each(adminRoutes.map((r) => [routeKey(r), r] as const))(
      "%s sans Authorization -> 401",
      async (_key, route) => {
        const res = await send(route.method, concretePath(route.path));
        expect(res.status).toBe(401);
        assertNoLeak(res.body, routeKey(route));
      },
    );

    // JWT tenant valide (kind "user", signe avec le secret serveur). requireEditor
    // refuse tout kind != "editor" AVANT toute lecture base, donc ce token suffit a
    // exercer l'isolation d'autorite sans dependre d'un tenant en base : un acteur
    // tenant ne franchit JAMAIS le BO cross-tenant (fix escalade EP17-S04).
    const tenantUserJwt = jwt.sign(
      { userId: ZERO_UUID, tenantId: ZERO_UUID, role: "ADMIN" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" },
    );

    it.each(adminRoutes.map((r) => [routeKey(r), r] as const))(
      "%s avec un JWT tenant valide -> 403 (pas 200, pas de fuite cross-tenant)",
      async (_key, route) => {
        const res = await send(route.method, concretePath(route.path)).set(
          "Authorization",
          `Bearer ${tenantUserJwt}`,
        );
        expect(
          res.status,
          `${routeKey(route)} : un JWT tenant ne doit pas franchir requireEditor`,
        ).toBe(403);
        expect(res.status).not.toBe(200);
        assertNoLeak(res.body, routeKey(route));
      },
    );
  });

  // -------------------------------------------------------------------------
  // Isolation multi-tenant + headers helmet + non-fuite sur reponses reelles
  // -------------------------------------------------------------------------
  describe("Baseline OWASP — isolation cross-tenant, headers helmet, non-fuite", () => {
    const TA = "test-conf-a";
    const TB = "test-conf-b";
    let clientAId = "";
    let processAId = "";
    let cliniqueAId = "";
    let interventionAId = "";
    let aJwt = "";
    let bJwt = "";

    beforeAll(async () => {
      const A = await setupTestTenant(app, TA);
      const B = await setupTestTenant(app, TB);
      aJwt = A.admin.jwt;
      bJwt = B.admin.jwt;

      // Ressources concretes du tenant A : servent de cibles cross-tenant. Le JWT
      // du tenant B doit recevoir 404 (pas d'oracle d'existence), jamais 200.
      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${A.admin.jwt}`)
        .send({ firstName: "Conf", lastName: "Iso", phone: "0612340001" });
      clientAId = client.body.data?.id ?? "";

      const clinique = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${A.admin.jwt}`)
        .send({ name: "Clinique Conf A", city: "Lyon", fraisAmbulatoire: 0 });
      cliniqueAId = clinique.body.data?.id ?? "";

      const intervention = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${A.admin.jwt}`)
        .send({
          name: "Intervention Conf A",
          category: "MED_ESTH",
          duration: 60,
          priceHonoraires: 1000,
        });
      interventionAId = intervention.body.data?.id ?? "";

      const process = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${A.admin.jwt}`)
        .send({ clientId: clientAId });
      processAId = process.body.data?.id ?? "";
    });

    afterAll(async () => {
      await teardownTestTenant(TA);
      await teardownTestTenant(TB);
      await disconnectPrisma();
    });

    it("headers helmet (SEC-04) presents sur une reponse 401 (toute la surface)", async () => {
      // helmet est monte en premier dans buildApp : il couvre meme les 401/404.
      // On echantillonne sur une route tenant refusee, representative de toutes.
      const res = await request(app).get("/api/clients");
      expect(res.status).toBe(401);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toMatch(/^(SAMEORIGIN|DENY)$/);
      expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("headers helmet presents sur la reponse 200 publique /api/health", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    /**
     * Isolation cross-tenant generique (ADR-0009, Prisma $extends). On enumere les
     * ressources tenant identifiees par un id de premier niveau ("/api/<res>/:id")
     * pour lesquelles on dispose d'une instance reelle dans le tenant A. Le JWT du
     * tenant B doit obtenir 404 sur ces ids : pas de lecture, pas d'oracle
     * d'existence, jamais 200.
     */
    const isolationTargets: { method: string; tpl: string; param: string; idGetter: () => string }[] = [
      { method: "GET", tpl: "/api/clients/:id", param: "id", idGetter: () => clientAId },
      { method: "GET", tpl: "/api/cliniques/:id", param: "id", idGetter: () => cliniqueAId },
      { method: "GET", tpl: "/api/interventions/:id", param: "id", idGetter: () => interventionAId },
      { method: "GET", tpl: "/api/processes/:id", param: "id", idGetter: () => processAId },
    ];

    it.each(isolationTargets.map((t) => [`${t.method} ${t.tpl}`, t] as const))(
      "%s : JWT tenant B sur une ressource tenant A -> 404 (isolation, pas de fuite)",
      async (_key, target) => {
        // La cible doit etre une route reellement montee : sinon la garantie est
        // vide. On verifie d'abord sa presence dans la decouverte.
        const mounted = ALL_ROUTES.some(
          (r) => r.method === target.method && r.path === target.tpl,
        );
        expect(mounted, `${target.method} ${target.tpl} doit etre montee`).toBe(true);

        const id = target.idGetter();
        expect(id, `id tenant A pour ${target.tpl} doit etre cree`).not.toBe("");

        // Le proprietaire (A) lit bien sa ressource : la cible est valide.
        const owner = await request(app)
          .get(concretePath(target.tpl, { [target.param]: id }))
          .set("Authorization", `Bearer ${aJwt}`);
        expect(owner.status).toBe(200);

        // Le tenant B ne la voit pas : 404, jamais 200, pas de fuite.
        const res = await request(app)
          .get(concretePath(target.tpl, { [target.param]: id }))
          .set("Authorization", `Bearer ${bJwt}`);
        expect(
          res.status,
          `${target.tpl} : tenant B ne doit pas lire la ressource de A`,
        ).toBe(404);
        expect(res.status).not.toBe(200);
        assertNoLeak(res.body, `${target.method} ${target.tpl}`);
      },
    );

    it("un id inexistant pour le proprietaire renvoie 404 (pas 200, pas 500)", async () => {
      // Garantit que l'absence de ressource ne fuite pas en 500 (stack) ni ne
      // renvoie un faux 200.
      for (const target of isolationTargets) {
        const res = await request(app)
          .get(concretePath(target.tpl, { [target.param]: ZERO_UUID }))
          .set("Authorization", `Bearer ${aJwt}`);
        expect([404]).toContain(res.status);
        assertNoLeak(res.body, `${target.method} ${target.tpl} (inexistant)`);
      }
    });
  });
});
