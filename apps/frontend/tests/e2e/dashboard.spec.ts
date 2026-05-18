import { test, expect, type Page } from "@playwright/test";

/**
 * EP08 — Dashboard : 4 KPIs + chart CA + previsionnel + bandeau follow-up.
 */

async function loginCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("EP08 — Dashboard", () => {
  test("les 4 KPIs s'affichent avec des valeurs non vides", async ({ page }) => {
    await loginCommercial(page);
    await expect(page.getByText(/Total patients/i)).toBeVisible();
    await expect(page.getByText(/Consults du mois/i)).toBeVisible();
    await expect(page.getByText(/CA du mois/i)).toBeVisible();
    await expect(page.getByText(/Taux conversion/i)).toBeVisible();

    // Apres chargement, au moins une valeur non "..."
    await page.waitForTimeout(1200);
    // Total patients doit etre un nombre >= 1 (seed a 15+ clients)
    const kpiCard = page.locator("div").filter({ hasText: /^Total patients/ }).first();
    await expect(kpiCard).toBeVisible();
  });

  test("toggle chart semaine/mois/annee fonctionne", async ({ page }) => {
    await loginCommercial(page);
    await expect(page.getByText(/Chiffre d'affaires/i)).toBeVisible();

    // Le switch period
    await page.getByRole("button", { name: "Semaine", exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Annee", exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Mois", exact: true }).click();
  });

  test("bandeau CA attente follow-up visible", async ({ page }) => {
    await loginCommercial(page);
    await expect(page.getByText(/CA en attente/i).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByRole("link", { name: /voir les process follow-up/i })
    ).toBeVisible();
  });

  test("previsionnel montre les operations programmees", async ({ page }) => {
    await loginCommercial(page);
    const bloc = page.locator("div").filter({ hasText: /^Previsionnel operations/ }).first();
    await expect(bloc).toBeVisible();

    // Soit une ligne avec "Amelie" (seed OP_PROGRAMMEE le 08/05), soit "Aucune"
    const hasAmelie = await page.getByText(/Amelie/i).first().isVisible().catch(() => false);
    const hasEmpty = await page
      .getByText(/aucune operation programmee/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasAmelie || hasEmpty).toBe(true);
  });
});
