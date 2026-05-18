import { test, expect, type Page } from "@playwright/test";

/**
 * E2E follow-up — page dediee + sub-pipeline + onglet Suivi (EP09).
 *
 * Pre-requis : seed standard + load-fake-data (5 process en stage=FOLLOWUP
 * distribues sur les sub-stages J0/J3/J7/J14/ABANDON).
 *
 * Le seul API direct = login (creer le JWT de session NextAuth). Tout le
 * reste passe par interaction UI : navigation, drag&drop, dialog.
 */

async function loginAdmin(page: Page) {
  await page.goto("/login");
  // Code cabinet : la fake-data load-fake-data.ts cible le tenant slug "demo",
  // pas cabinet-delobaux. ADMIN du tenant demo = admin@cabinet-demo.fr.
  await page.locator("#cabinet").fill("demo");
  await page.getByLabel("Email").fill("admin@cabinet-demo.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.describe("Follow-up page (EP09)", () => {
  test("acces /follow-up affiche les 7 colonnes du sub-pipeline", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/follow-up");
    await page.waitForLoadState("networkidle");

    // Header de la page
    await expect(page.getByRole("heading", { name: /^follow-up$/i })).toBeVisible();

    // 7 colonnes : J+0, J+1, J+3, J+7, J+14, J+30, Abandon
    for (const label of ["J+0", "J+1", "J+3", "J+7", "J+14", "J+30", "Abandon"]) {
      await expect(
        page.locator("[data-testid^='followup-column-']").filter({ hasText: label }).first()
      ).toBeVisible();
    }
  });

  test("badge follow-up dans le header pipeline pointe vers /follow-up", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/pipeline");
    await page.waitForLoadState("networkidle");

    // Le badge "X dossiers en follow-up" est visible et cliquable
    const badge = page.locator("a[href='/follow-up']").filter({ hasText: /follow-up/i }).first();
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(page).toHaveURL(/\/follow-up$/);
  });

  test("ProcessPanel onglet Suivi visible sur un process en stage=FOLLOWUP", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/follow-up");
    await page.waitForLoadState("networkidle");

    // Cliquer sur la premiere card visible (au minimum 1 dans la fake-data : 5 process)
    const firstCard = page.locator("[data-testid^='process-card-']").first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    await firstCard.click();

    // Le panel s'ouvre
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // L'onglet "Suivi" est present (specifique au stage FOLLOWUP)
    await expect(panel.getByRole("button", { name: /^suivi$/i })).toBeVisible();
  });

  test("onglet Suivi : observation libre cree un log dans la timeline", async ({ page }) => {
    const observation = `E2E observation ${Date.now()}`;

    await loginAdmin(page);
    await page.goto("/follow-up");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("[data-testid^='process-card-']").first();
    await firstCard.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    // Switch sur l'onglet Suivi
    await panel.getByRole("button", { name: /^suivi$/i }).click();

    // Bouton "Observation"
    await panel.getByRole("button", { name: /observation/i }).first().click();

    // Dialog observation libre
    const obsDialog = page.getByRole("dialog", { name: /ajouter une observation/i });
    await expect(obsDialog).toBeVisible();

    // Selectionner progressLabel "Avance" + remplir note
    await obsDialog.getByRole("button", { name: /^avance$/i }).click();
    await obsDialog.locator("textarea#obs-note").fill(observation);
    await obsDialog.getByRole("button", { name: /^enregistrer$/i }).click();

    // Toast success + observation visible dans la timeline
    await expect(panel.getByText(observation)).toBeVisible({ timeout: 5000 });
  });

  test("la section parallele FOLLOWUP n'apparait plus dans le pipeline", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/pipeline");
    await page.waitForLoadState("networkidle");

    // EP09-S07 : ParallelSections ne contient plus que NON_QUALIFIE
    // On verifie qu'il n'y a pas de section avec le titre "Follow-up" dans le body
    // (le badge en header est OK, c'est un Link distinct)
    const followupSection = page
      .locator("section, div")
      .filter({ hasText: /^follow-up$/i })
      .filter({ has: page.locator("[data-testid^='process-card-']") });
    await expect(followupSection).toHaveCount(0);
  });
});
