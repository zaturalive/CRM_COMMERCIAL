import { test, expect, type Page } from "@playwright/test";

/**
 * EP14-S02 — Tests E2E du gate CGU + onboarding.
 *
 * Reference : docs/product/stories/EP14-S02.md (section "Tests de securite
 * (obligatoires)", AC2/AC3/AC5/AC6) + UC-03-onboarding-cgu.md. Texte CGU :
 * docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md (cguVersion 2026.06, EP14-S07).
 *
 * Comportement cible (front middleware.ts + page /onboarding/cgu, a implementer) :
 *  - tant que le cabinet n'a pas accepte la CGU courante, toute navigation
 *    applicative est redirigee vers /onboarding/cgu (mutualise avec la gate
 *    force-change mustChangePassword, ADR-0009 D5) ;
 *  - exemptions de la gate : /login, /onboarding/cgu, /api/auth/*,
 *    /api/tenant/accept-cgu ;
 *  - la page /onboarding/cgu plein-ecran : bandeau non-HDS + texte integral +
 *    champ "Nom complet du signataire" (saisi, pas pre-rempli — RM4) + date du
 *    jour en lecture seule + checkbox obligatoire + bouton "Accepter et
 *    continuer" (disabled tant que non coche) + "Annuler" -> logout ;
 *  - un ADMIN accepte -> session rafraichie (cguAccepted: true) -> /dashboard ;
 *  - un COMMERCIAL arrivant sur la page (CGU non acceptee) voit un message
 *    "contactez votre administrateur" et n'a pas acces (RM1 / A1).
 *
 * Phase TDD rouge : la page /onboarding/cgu, le redirect du middleware et
 * l'endpoint /api/tenant/accept-cgu n'existent pas encore. Ces tests echouent
 * tant que la feature n'est pas implementee.
 *
 * Prerequis d'environnement : ces tests supposent un cabinet de demo dont la CGU
 * n'est PAS encore acceptee (cguAcceptedAt = null) pour observer la gate. Si le
 * seed marque les comptes de demo comme deja onboardes, ce spec doit etre lance
 * sur un cabinet de seed "non onboarde" dedie (a aligner avec le seed lors de
 * l'implementation). Les selecteurs (getByTestId / getByRole) suivent la
 * convention des autres specs e2e (role-aware.spec.ts, cookie-flags.spec.ts).
 */

const ADMIN_EMAIL = "florian@cabinet-delobaux.fr";
const COMMERCIAL_EMAIL = "julie@cabinet-delobaux.fr";
const DEMO_PASSWORD = "demo";
const CGU_PATH = /\/onboarding\/cgu/;

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /se connecter/i }).click();
}

test.describe("EP14-S02 — Gate CGU + onboarding", () => {
  test("ADMIN sans CGU acceptee est redirige vers /onboarding/cgu apres login", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(CGU_PATH, { timeout: 10000 });
    // Bandeau non-HDS present (interdiction de saisir des donnees de sante).
    await expect(page.getByTestId("non-hds-banner")).toBeVisible();
  });

  test("le bouton Accepter est desactive tant que la checkbox n'est pas cochee (AC3)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(CGU_PATH, { timeout: 10000 });

    const accept = page.getByRole("button", { name: /accepter et continuer/i });
    await expect(accept).toBeDisabled();

    // Le champ signataire est saisi, pas pre-rempli de force (RM4).
    const signatory = page.getByLabel(/nom complet du signataire/i);
    await expect(signatory).toHaveValue("");
    await signatory.fill("Florian Delobaux");

    await page.getByRole("checkbox").check();
    await expect(accept).toBeEnabled();
  });

  test("ADMIN coche + signe + accepte -> arrive sur /dashboard (AC3/AC6)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(CGU_PATH, { timeout: 10000 });

    await page.getByLabel(/nom complet du signataire/i).fill("Florian Delobaux");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /accepter et continuer/i }).click();

    // Session rafraichie (cguAccepted: true) -> redirection dashboard, plus de gate.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page).not.toHaveURL(CGU_PATH);
  });

  test("bypass : acces direct /dashboard sans CGU acceptee -> re-redirect /onboarding/cgu (AC2)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(CGU_PATH, { timeout: 10000 });

    // Tentative de contournement : aller directement sur une page applicative.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(CGU_PATH, { timeout: 10000 });
  });

  test("COMMERCIAL (CGU non acceptee) voit 'contactez votre administrateur', pas d'acces (RM1/A1)", async ({
    page,
  }) => {
    await login(page, COMMERCIAL_EMAIL);
    // Un COMMERCIAL ne peut pas accepter : il est arrete par un message dedie.
    await expect(page.getByText(/contactez votre administrateur/i)).toBeVisible({
      timeout: 10000,
    });
    // Il ne doit pas atteindre le dashboard (donnee metier) tant que la CGU du
    // cabinet n'est pas acceptee par un ADMIN.
    await expect(page).not.toHaveURL(/\/dashboard/);
    // Le bouton d'acceptation n'est pas propose au COMMERCIAL.
    await expect(
      page.getByRole("button", { name: /accepter et continuer/i }),
    ).toHaveCount(0);
  });
});
