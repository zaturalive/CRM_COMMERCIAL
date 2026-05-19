import { test, expect, type Page } from "@playwright/test";

/**
 * Tests E2E EP01-S02 + S03 : design system, sidebar role-aware, role switcher,
 * guards sur les pages role-scoped.
 *
 * ADR-0002 (2026-05-18) : role CHIRURGIEN retire. Seuls ADMIN + COMMERCIAL.
 */

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Sidebar role-aware", () => {
  test("ADMIN voit tous les items dont Parametrage", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-pipeline")).toBeVisible();
    await expect(page.getByTestId("nav-clients")).toBeVisible();
    await expect(page.getByTestId("nav-agenda")).toBeVisible();
    await expect(page.getByTestId("nav-parametrage")).toBeVisible();
  });

  test("COMMERCIAL voit tout + Parametrage (ouvert 23/04)", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-pipeline")).toBeVisible();
    await expect(page.getByTestId("nav-clients")).toBeVisible();
    await expect(page.getByTestId("nav-agenda")).toBeVisible();
    await expect(page.getByTestId("nav-parametrage")).toBeVisible();
  });

});

test.describe("Guards par role (attaque directe par URL)", () => {
  test("COMMERCIAL atteint /config/cliniques (ouvert a tous)", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/config/cliniques");
    await expect(page).toHaveURL(/\/config\/cliniques$/);
    await expect(page.getByRole("heading", { name: /^parametrage$/i })).toBeVisible();
  });

  test("ADMIN atteint /config/cliniques (pas de redirect)", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/cliniques");
    await expect(page).toHaveURL(/\/config\/cliniques$/);
    await expect(page.getByRole("heading", { name: /^parametrage$/i })).toBeVisible();
    await expect(page.getByTestId("config-tabs")).toBeVisible();
  });
});

test.describe("Role switcher (demo)", () => {
  test("switcher visible pour COMMERCIAL et permet de passer ADMIN", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");

    const switcher = page.getByTestId("role-switcher");
    await expect(switcher).toBeVisible();

    // Avant switch : Parametrage + Pipeline visibles
    await expect(page.getByTestId("nav-parametrage")).toBeVisible();
    await expect(page.getByTestId("nav-pipeline")).toBeVisible();

    // Clic sur ADMIN — la Pipeline reste visible
    await page.getByTestId("role-switch-admin").click();
    await expect(page.getByTestId("nav-pipeline")).toBeVisible({ timeout: 10000 });
  });

  test("switcher present pour chaque role", async ({ page }) => {
    for (const email of [
      "florian@cabinet-delobaux.fr",
      "julie@cabinet-delobaux.fr",
    ]) {
      await loginAs(page, email);
      await expect(page.getByTestId("role-switcher")).toBeVisible();
      await page.getByRole("button", { name: /se deconnecter/i }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    }
  });
});
