import { test, expect } from "@playwright/test";

/**
 * Smoke tests E2E auth — EP01-S01.
 *
 * Prerequis : le stack dev doit tourner + seed minimum (3 users).
 * Lancement recommande : via docker/docker-compose.e2e.yml (cf. infra.md §5).
 */

test.describe("Auth flow", () => {
  test("visite / sans auth redirige vers /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
  });

  test("login avec credentials commercial → dashboard", async ({ page }) => {
    await page.goto("/login");

    // Le form est pre-rempli avec julie + demo, on soumet direct.
    await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
    await page.getByLabel("Mot de passe").fill("demo");
    await page.getByRole("button", { name: /se connecter/i }).click();

    // On doit arriver sur /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /bonjour julie/i })).toBeVisible();

    // La session doit exposer le role COMMERCIAL
    await expect(page.getByText(/commercial/i).first()).toBeVisible();
  });

  test("login mauvais mot de passe → erreur inline", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
    await page.getByLabel("Mot de passe").fill("wrong-password");
    await page.getByRole("button", { name: /se connecter/i }).click();

    // On reste sur /login avec un message d'erreur
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/email ou mot de passe invalide/i)).toBeVisible();
  });

  test("dashboard sans auth redirige vers /login?callbackUrl=...", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=.*dashboard/);
  });

  test("logout depuis dashboard → /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("alexis@cabinet-delobaux.fr");
    await page.getByLabel("Mot de passe").fill("demo");
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.getByRole("button", { name: /se deconnecter/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
