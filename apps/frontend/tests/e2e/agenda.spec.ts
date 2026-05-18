import { test, expect, type Page } from "@playwright/test";

/**
 * EP07 — Agenda : chargement page + navigation vues + event visible.
 *
 * Seed : une consultation en CONSULTATION stage (Emma/seed-p-04,
 * consultationDate = 2026-04-24) + une operation signee (Amelie/seed-p-08,
 * DevisStay 2026-05-08).
 */

async function loginChir(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("alexis@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("EP07 — Agenda", () => {
  test("chirurgien accede a /agenda et voit la toolbar", async ({ page }) => {
    await loginChir(page);
    await page.goto("/agenda");

    // Toolbar : boutons Aujourd'hui + nav + switcher vues
    await expect(page.getByRole("button", { name: /aujourd'hui/i })).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByRole("button", { name: "Semaine", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mois", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Jour", exact: true })).toBeVisible();
  });

  test("navigation mois affiche les events seed (Amelie 2026-05-08)", async ({ page }) => {
    await loginChir(page);
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Mois", exact: true }).click();

    // Cherche Mai 2026 — clic next jusqu'au bon label OR direct si today = avril 2026
    const monthButton = page.getByRole("button", { name: "Mois", exact: true });
    await expect(monthButton).toBeVisible();

    // La demo est prevue le 24 avril 2026 — en vue mois on devrait voir
    // les operations du mois. On navigue +1 mois pour atteindre mai.
    await page.getByRole("button", { name: "Suivant" }).click();

    // Amelie doit apparaitre comme event operation le 8 mai
    await expect(page.getByText(/Amelie Vidal/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("clic sur event operation ouvre l'EventSheet", async ({ page }) => {
    await loginChir(page);
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Mois", exact: true }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Clic sur l'event Amelie (operation signee)
    await page.getByText(/Amelie Vidal/i).first().click();

    // Panneau EventSheet visible (dialog 480px)
    const sheet = page.getByRole("dialog", { name: /detail evenement/i });
    await expect(sheet).toBeVisible();

    // Header patient + badge type
    await expect(sheet.getByText(/Amelie Vidal/i)).toBeVisible();
    await expect(sheet.getByText(/interventions a effectuer/i)).toBeVisible();
    // Footer "Ouvrir la fiche process"
    await expect(sheet.getByRole("button", { name: /ouvrir la fiche process/i })).toBeVisible();
  });

  test("clic 'Ouvrir la fiche process' navigate vers /pipeline ET ouvre le panel", async ({ page }) => {
    await loginChir(page);
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Mois", exact: true }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByText(/Amelie Vidal/i).first().click();

    const sheet = page.getByRole("dialog", { name: /detail evenement/i });
    await expect(sheet).toBeVisible();

    // Clic → navigate vers /pipeline?open=<processId>
    await sheet.getByRole("button", { name: /ouvrir la fiche process/i }).click();
    await page.waitForURL(/\/pipeline\?/, { timeout: 5000 });

    // Le ProcessPanel s'ouvre (heading avec le nom patient visible)
    await expect(
      page.getByRole("heading", { name: /amelie vidal/i }),
    ).toBeVisible({ timeout: 5000 });
  });
});
