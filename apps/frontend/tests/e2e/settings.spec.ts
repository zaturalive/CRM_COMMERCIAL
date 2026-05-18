import { test, expect, type Page } from "@playwright/test";

/**
 * Parametres cabinet — /config/cabinet.
 * Changement du montant d'acompte et persistance. Role commercial
 * (parametrage ouvert a tous les roles depuis ADR-0006).
 */

async function loginCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Parametres cabinet", () => {
  test("modifier l'acompte puis restorer le defaut", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/config/cabinet");

    // Page loaded
    await expect(page.getByRole("heading", { name: /cabinet/i }).first()).toBeVisible();
    await expect(page.getByLabel("Montant (euros)")).toBeVisible();

    // Lit la valeur actuelle
    const input = page.getByLabel("Montant (euros)");
    const original = await input.inputValue();
    expect(Number(original)).toBeGreaterThan(0);

    // Passe a 2000
    await input.fill("2000");
    await page.getByRole("button", { name: /^enregistrer$/i }).click();

    // Toast + valeur persistee apres reload
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByLabel("Montant (euros)")).toHaveValue("2000");

    // Restore
    await page.getByLabel("Montant (euros)").fill(original);
    await page.getByRole("button", { name: /^enregistrer$/i }).click();
    await page.waitForTimeout(500);
  });

  test("montant invalide → pas de submit", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/config/cabinet");

    const input = page.getByLabel("Montant (euros)");
    const original = await input.inputValue();

    // Tente valeur negative via js direct (le type=number min=0 bloque l'UI)
    // → on teste juste le happy path de range via une valeur trop grande
    await input.fill("99999999");
    // Backend accepte jusqu'a 100_000_000 centimes (= 1 000 000 €).
    // 99 999 999 € → 9 999 999 900 centimes → > max → 400.
    await page.getByRole("button", { name: /^enregistrer$/i }).click();
    await page.waitForTimeout(500);

    // Le backend doit avoir refuse — la valeur originale est preservee apres reload
    await page.reload();
    await expect(page.getByLabel("Montant (euros)")).toHaveValue(original);
  });
});
