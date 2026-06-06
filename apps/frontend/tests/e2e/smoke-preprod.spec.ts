import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Smoke test pre-prod — exerce les fonctionnalites principales du CRM via
 * http://localhost:3301 (stack DEV deja up). Cible localhost et NON les
 * sous-domaines *.vencor-crm.localhost (probleme DNS/NextAuth en cours).
 *
 * Compte : cabinet `demo` / admin@cabinet-demo.fr / demo (mode demo actif).
 *
 * Ordre (serial) : si le login echoue, les etapes suivantes sont SKIP.
 *   1. Login -> dashboard
 *   2. Dashboard : KPIs visibles
 *   3. Clients : liste + creation d'un client de test + retrouver
 *   4. Pipeline : kanban charge
 *   5. Devis / Agenda / Config (cliniques, interventions) : pages sans erreur JS/500
 *
 * Ce spec ne modifie AUCUN code applicatif. Il cree un client de test
 * (nom unique horodate) et tente de le nettoyer en fin de parcours.
 */

const CABINET = "demo";
const EMAIL = "admin@cabinet-demo.fr";
const PASSWORD = "demo";

const RUN_ID = String(Date.now()).slice(-6);
const TEST_CLIENT_FIRST = "SmokePreprod";
const TEST_CLIENT_LAST = `Client${RUN_ID}`;
const TEST_CLIENT_PHONE = "06 00 00 00 00";

// Contexte partage entre les tests serial : on se loggue une seule fois.
let context: BrowserContext;
let page: Page;
// Passe a true une fois le login reussi (etape 1). Conditionne le cleanup :
// inutile (et lent : timeout) de chercher a supprimer le client si on n'a
// jamais ete authentifie.
let loggedIn = false;

// Collecte des erreurs JS (pageerror) et reponses HTTP 5xx, par etape.
const jsErrors: string[] = [];
const httpErrors: string[] = [];

function attachErrorListeners(p: Page) {
  p.on("pageerror", (err) => {
    jsErrors.push(`[pageerror] ${err.message}`);
  });
  p.on("response", (resp) => {
    const status = resp.status();
    if (status >= 500) {
      httpErrors.push(`[HTTP ${status}] ${resp.request().method()} ${resp.url()}`);
    }
  });
}

/** Recupere puis vide les erreurs accumulees depuis le dernier appel. */
function drainErrors(): { js: string[]; http: string[] } {
  const out = { js: [...jsErrors], http: [...httpErrors] };
  jsErrors.length = 0;
  httpErrors.length = 0;
  return out;
}

test.describe.configure({ mode: "serial" });

test.describe("Smoke pre-prod (localhost:3301)", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    attachErrorListeners(page);
  });

  test.afterAll(async () => {
    // Cleanup best-effort : supprime le client de test cree par le smoke.
    // Ne fait pas echouer la suite si le cleanup foire. Saute si on n'a
    // jamais ete authentifie (login casse) — evite un timeout inutile.
    try {
      if (!loggedIn) return;
      await page.goto("/clients");
      await page.getByPlaceholder(/rechercher par nom/i).fill(TEST_CLIENT_LAST);
      const row = page.locator("tr", { hasText: TEST_CLIENT_LAST });
      // La liste est re-fetchee sur changement de recherche (debounce) : on
      // attend que la ligne du client de test apparaisse avant de supprimer.
      // Best-effort : si elle n'apparait pas (deja absente), on ne fait rien.
      const appeared = await row
        .first()
        .waitFor({ state: "visible", timeout: 7000 })
        .then(() => true)
        .catch(() => false);
      if (appeared) {
        // Bouton de la ligne (aria-label "Supprimer") -> ouvre la confirm.
        await row.first().getByRole("button", { name: /supprimer/i }).click();
        // Confirmation : il y a deux "Supprimer" dans le DOM (ligne + dialog) ;
        // on scope le clic au dialog pour eviter toute ambiguite.
        await page
          .getByRole("dialog")
          .getByRole("button", { name: /^supprimer$/i })
          .click();
        // Attendre la disparition effective pour garantir le cleanup.
        await expect(row).toHaveCount(0, { timeout: 5000 });
      }
    } catch {
      // ignore — cleanup best-effort
    }
    await context.close();
  });

  test("1. Login (cabinet demo) -> dashboard", async () => {
    // Soumet le formulaire de login. Le champ cabinet (id=cabinet) est
    // pre-rempli avec "demo" (DEFAULT_TENANT) sur localhost ; on le force
    // explicitement pour ne dependre d'aucun etat (localStorage, ?cabinet=).
    async function submitLogin() {
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: /connexion/i })
      ).toBeVisible();
      await page.locator("#cabinet").fill(CABINET);
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Mot de passe").fill(PASSWORD);
      await page.getByRole("button", { name: /se connecter/i }).click();
    }

    await submitLogin();

    // NextAuth est susceptible de repondre 500 par intermittence pendant que
    // la config (NEXTAUTH_SECRET / BACKEND_URL) est ajustee cote humain. On
    // retente une fois si on est toujours sur /login apres un court delai —
    // sans contourner l'auth (on resoumet juste les memes identifiants).
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 8000 });
    } catch {
      await submitLogin();
    }

    // Doit arriver sur /dashboard. Si non -> login reellement casse, on echoue
    // ici et le mode serial SKIP les etapes suivantes.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: /bonjour/i })).toBeVisible({
      timeout: 10000,
    });
    loggedIn = true;

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS au login: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx au login: ${errs.http.join(" ;; ")}`).toEqual([]);
  });

  test("2. Dashboard : les KPIs sont visibles", async () => {
    // On est deja sur /dashboard apres l'etape 1.
    await expect(page.getByText("Total clients").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Consults du mois").first()).toBeVisible();
    await expect(page.getByText("CA du mois").first()).toBeVisible();
    await expect(page.getByText("Taux conversion").first()).toBeVisible();

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS dashboard: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx dashboard: ${errs.http.join(" ;; ")}`).toEqual([]);
  });

  test("3. Clients : liste, creation d'un client, on le retrouve", async () => {
    await page.goto("/clients");

    // La page liste est rendue : compteur "X client(s)" + bouton de creation
    // + entete de tableau "Nom". (TableHead = <th>, mais le texte est mis en
    // capitales par CSS ; on matche donc sur l'entete via son texte rendu.)
    await expect(page.getByText(/\d+\s+client\(s\)/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: /nouveau client/i })
    ).toBeVisible();
    // Entete de tableau : les <th> ne portent pas le role ARIA columnheader
    // ici (table sans scope, wrappee overflow-auto -> Chromium la traite en
    // table de layout). On matche donc l'entete par son texte.
    await expect(
      page.locator("th", { hasText: /telephone/i })
    ).toBeVisible();

    // Creer un client de test.
    await page.getByRole("button", { name: /nouveau client/i }).click();
    await expect(
      page.getByRole("heading", { name: /nouvelle fiche client/i })
    ).toBeVisible();
    // "Prenom" contient "Nom" en sous-chaine : on matche les labels en exact
    // pour eviter une violation strict mode (Prenom vs Nom).
    await page.getByLabel("Prenom", { exact: true }).fill(TEST_CLIENT_FIRST);
    await page.getByLabel("Nom", { exact: true }).fill(TEST_CLIENT_LAST);
    await page.getByLabel("Telephone", { exact: true }).fill(TEST_CLIENT_PHONE);
    await page.getByRole("button", { name: /^creer$/i }).click();

    // Retrouver le client : il apparait dans la liste (recherche par nom).
    // Les <td> ne portent pas le role ARIA cell ici -> on cible une ligne <tr>
    // contenant le nom complet du client de test.
    await page.getByPlaceholder(/rechercher par nom/i).fill(TEST_CLIENT_LAST);
    await expect(
      page.locator("tr", {
        hasText: new RegExp(`${TEST_CLIENT_FIRST}\\s+${TEST_CLIENT_LAST}`, "i"),
      })
    ).toBeVisible({ timeout: 10000 });

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS clients: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx clients: ${errs.http.join(" ;; ")}`).toEqual([]);
  });

  test("4. Pipeline : la vue kanban charge", async () => {
    await page.goto("/pipeline");

    // Le bandeau filtres + le compteur "dossiers actifs" + au moins une colonne
    // kanban (les libelles de stage / le bouton nouveau dossier).
    await expect(page.getByPlaceholder(/rechercher par nom client/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/dossiers actifs/i)).toBeVisible();

    // Le loader "Chargement..." doit disparaitre (kanban charge).
    await expect(page.getByText("Chargement...")).toHaveCount(0, {
      timeout: 10000,
    });

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS pipeline: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx pipeline: ${errs.http.join(" ;; ")}`).toEqual([]);
  });

  test("5a. Agenda : la page charge sans erreur JS/500", async () => {
    await page.goto("/agenda");

    // Toolbar agenda : bouton "Aujourd'hui" + conteneur calendrier.
    await expect(page.getByRole("button", { name: /aujourd'hui/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(".crm-agenda")).toBeVisible();

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS agenda: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx agenda: ${errs.http.join(" ;; ")}`).toEqual([]);
  });

  test("5b. Config cliniques : la page charge sans erreur JS/500", async () => {
    await page.goto("/config/cliniques");

    await expect(
      page.getByRole("button", { name: /nouvelle clinique/i })
    ).toBeVisible({ timeout: 10000 });

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS config/cliniques: ${errs.js.join(" ;; ")}`).toEqual(
      []
    );
    expect(
      errs.http,
      `HTTP 5xx config/cliniques: ${errs.http.join(" ;; ")}`
    ).toEqual([]);
  });

  test("5c. Config interventions : la page charge sans erreur JS/500", async () => {
    await page.goto("/config/interventions");

    await expect(
      page.getByRole("button", { name: /nouvelle intervention/i })
    ).toBeVisible({ timeout: 10000 });

    const errs = drainErrors();
    expect(
      errs.js,
      `Erreurs JS config/interventions: ${errs.js.join(" ;; ")}`
    ).toEqual([]);
    expect(
      errs.http,
      `HTTP 5xx config/interventions: ${errs.http.join(" ;; ")}`
    ).toEqual([]);
  });

  test("5d. Devis : le builder charge depuis un process pipeline (sans erreur JS/500)", async () => {
    // Il n'existe pas de route /devis index : un devis est rattache a un
    // process pipeline (route /devis/[id]). On atteint donc le 1er devis
    // existant via la pipeline -> fiche process -> onglet/lien Devis.
    // Si aucun devis n'existe dans le seed, on tombe sur l'etat "creer un
    // devis" qui reste une page valide (pas d'erreur JS/500).
    //
    // Strategie robuste pour un smoke : on verifie qu'une page /devis/<id>
    // rend le DevisBuilder sans erreur. On recupere un id de devis via l'API
    // interne deja authentifiee (cookies partages dans le contexte).
    const devisId = await page.evaluate(async () => {
      try {
        // L'API liste les process ; chaque process expose ses devis.
        const res = await fetch("/api/pipeline", { credentials: "include" });
        if (!res.ok) return null;
        const json = await res.json();
        const data = json?.data ?? json;
        const cols = data?.columns ?? [];
        for (const col of cols) {
          for (const proc of col.processes ?? []) {
            if (Array.isArray(proc.devis) && proc.devis.length > 0) {
              return proc.devis[0].id as string;
            }
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    if (!devisId) {
      // Pas de devis dans le seed accessible via /api/pipeline : on ne peut
      // pas exercer le builder de maniere deterministe. On verifie au moins
      // que la route /devis/<uuid-inexistant> ne fait pas crasher le front
      // (DevisBuilder doit gerer le 404 proprement, sans pageerror JS).
      test.info().annotations.push({
        type: "note",
        description:
          "Aucun devis trouve via /api/pipeline — verification du DevisBuilder sur un id inexistant (gestion d'erreur).",
      });
      await page.goto("/devis/00000000-0000-0000-0000-000000000000");
    } else {
      await page.goto(`/devis/${devisId}`);
    }

    // Le DevisBuilder est monte (la page n'est ni blanche ni un crash Next).
    // On attend que le body ait du contenu et qu'aucune erreur JS ne soit
    // remontee. On ne fait pas d'assertion sur un libelle precis du builder
    // pour rester tolerant a l'etat (devis existant vs introuvable).
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    const errs = drainErrors();
    expect(errs.js, `Erreurs JS devis: ${errs.js.join(" ;; ")}`).toEqual([]);
    expect(errs.http, `HTTP 5xx devis: ${errs.http.join(" ;; ")}`).toEqual([]);
  });
});
