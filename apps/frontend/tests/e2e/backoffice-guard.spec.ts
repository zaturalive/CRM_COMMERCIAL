import { test, expect, type Page } from "@playwright/test";

/**
 * E2E EP17-S01 — guard front sur la zone Back Office /admin.
 *
 * Reference : docs/product/stories/EP17-S01.md (AC 3 et 5, tests de securite).
 * Decision : ADR-0009 D1 (impact frontend) — middleware.ts conserve withAuth
 * NextAuth et ajoute une garde sur /admin/* qui verifie le flag editeur dans
 * le token de session. Un non-editeur est redirige, sans rendu du BO.
 *
 * Phase TDD rouge : la coquille /admin et la garde editeur n'existent pas
 * encore. Ces tests echouent tant que la feature n'est pas implementee.
 *
 * Prerequis run : stack dev + seed (cf. docker/docker-compose.e2e.yml). Les
 * comptes seed (julie/florian @cabinet-delobaux.fr) sont des users de cabinet,
 * pas des editeurs plateforme.
 */

async function loginAsCabinetUser(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Back Office guard /admin (EP17-S01)", () => {
  test("visiteur non authentifie sur /admin → redirige vers /login, pas de rendu BO", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    // La coquille BO ne doit pas etre rendue (navigation Tenants/Logs absente).
    await expect(page.getByTestId("backoffice-shell")).toHaveCount(0);
  });

  test("ADMIN de cabinet (non editeur) sur /admin → redirige, pas de rendu BO", async ({
    page,
  }) => {
    await loginAsCabinetUser(page, "florian@cabinet-delobaux.fr");
    await page.goto("/admin");
    // Un user de cabinet n'est pas editeur plateforme : il ne doit pas voir le BO.
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
    await expect(page.getByTestId("backoffice-shell")).toHaveCount(0);
  });

  test("COMMERCIAL (non editeur) sur /admin → redirige, pas de rendu BO", async ({
    page,
  }) => {
    await loginAsCabinetUser(page, "julie@cabinet-delobaux.fr");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
    await expect(page.getByTestId("backoffice-shell")).toHaveCount(0);
  });

  test("attaque directe par URL sur une sous-page BO → non rendue pour un non-editeur", async ({
    page,
  }) => {
    await loginAsCabinetUser(page, "julie@cabinet-delobaux.fr");
    await page.goto("/admin/tenants");
    await expect(page).not.toHaveURL(/\/admin\/tenants/);
    await expect(page.getByTestId("backoffice-shell")).toHaveCount(0);
  });
});
