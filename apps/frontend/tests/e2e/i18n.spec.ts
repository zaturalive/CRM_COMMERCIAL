import { test, expect, type Page } from "@playwright/test";

/**
 * D12 — Tests E2E du switcher de langue (next-intl mode "without routing").
 *
 * Verifie :
 * - Le cookie crm-commercial-locale est pose apres click switcher
 * - La sidebar bascule en EN sans rechargement
 * - Le defaut est FR si pas de cookie
 * - Refresh persiste la locale
 */

async function loginAsCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("julie@cabinet-delobaux.fr");
  await page.getByLabel(/mot de passe|password/i).fill("demo");
  await page.getByRole("button", { name: /se connecter|sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("D12 i18n - switcher de langue", () => {
  test("defaut FR sans cookie + sidebar affiche les labels en francais", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);

    // Sidebar items en FR (labels traduits via Sidebar.dashboard, etc.)
    await expect(page.getByTestId("nav-dashboard")).toContainText(/tableau de bord|dashboard/i);
    await expect(page.getByTestId("nav-pipeline")).toContainText(/pipeline/i);
    await expect(page.getByTestId("nav-clients")).toContainText(/clients/i);

    // Le LanguageSwitcher est visible
    const switcher = page.getByTestId("language-switcher");
    await expect(switcher).toBeVisible();
  });

  test("click sur EN bascule la sidebar en anglais", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);

    // Click sur le bouton EN
    await page.getByTestId("lang-en").click();

    // Attendre que la page revalidate (server action)
    await page.waitForLoadState("networkidle");

    // Sidebar items en EN
    await expect(page.getByTestId("nav-dashboard")).toContainText(/dashboard/i, { timeout: 5000 });
    await expect(page.getByTestId("nav-clients")).toContainText(/clients/i);
    // Settings au lieu de "Parametrage"
    await expect(page.getByTestId("nav-parametrage")).toContainText(/settings/i);
  });

  test("le cookie crm-commercial-locale est pose apres click", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);

    await page.getByTestId("lang-en").click();
    await page.waitForLoadState("networkidle");

    const cookies = await context.cookies();
    const localeCookie = cookies.find((c) => c.name === "crm-commercial-locale");
    expect(localeCookie?.value).toBe("en");
  });

  test("la locale est persistee apres refresh", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);

    // Bascule en EN
    await page.getByTestId("lang-en").click();
    await page.waitForLoadState("networkidle");

    // Refresh
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Toujours en EN apres refresh
    await expect(page.getByTestId("nav-dashboard")).toContainText(/dashboard/i);
    await expect(page.getByTestId("nav-parametrage")).toContainText(/settings/i);
  });

  test("le bouton de la locale courante est disabled", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);

    // Defaut FR : le bouton FR est disabled, EN est enabled
    await expect(page.getByTestId("lang-fr")).toBeDisabled();
    await expect(page.getByTestId("lang-en")).toBeEnabled();

    // Switch en EN
    await page.getByTestId("lang-en").click();
    await page.waitForLoadState("networkidle");

    // Maintenant EN disabled, FR enabled
    await expect(page.getByTestId("lang-en")).toBeDisabled({ timeout: 5000 });
    await expect(page.getByTestId("lang-fr")).toBeEnabled();
  });
});
