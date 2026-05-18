import { test, expect, type Page } from "@playwright/test";

/**
 * EP06 — Documents : checklist + upload + badge.
 *
 * On utilise un process CONFIRMEE du seed (Marine Dupont / seed-p-07) qui a
 * 9 docs synchronises dont 3 RECU. Le badge en vue d'ensemble doit afficher
 * "3/9" amber et permettre de basculer sur l'onglet Documents.
 */

async function loginCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

/**
 * Helper : ouvre le dossier CONFIRMEE de Marine Dupont (seed-p-07). Les tests
 * precedents peuvent avoir cree d'autres dossiers Marine (en CONTACT) sur
 * le meme client, donc on filtre sur le testid du card pour eviter l'ambiguite.
 */
async function openMarineConfirmee(page: Page) {
  await page.goto("/pipeline");
  await page.waitForTimeout(600);
  // seed-p-07 = Marine Dupont en CONFIRMEE, testid genere par ProcessCard
  await page.getByTestId("process-card-seed-p-07").click();
}

test.describe("EP06 — Documents checklist", () => {
  test("badge X/Y visible en vue d'ensemble d'un process CONFIRMEE", async ({ page }) => {
    await loginCommercial(page);
    await openMarineConfirmee(page);

    const panel = page.locator('[role="dialog"], aside').filter({ hasText: "Marine" }).first();
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Badge Documents X/Y visible (seed = 3/9)
    await expect(page.getByText(/Documents : 3\/9/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("onglet Documents affiche la checklist + permet add manuel", async ({ page }) => {
    await loginCommercial(page);
    await openMarineConfirmee(page);

    // Bascule sur onglet Documents (cibler le tab, pas le badge)
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(page.getByText(/Checklist documents/i)).toBeVisible();

    // Liste non vide (9 docs)
    const list = page.getByTestId("documents-list");
    await expect(list).toBeVisible();
    const rows = list.locator("li");
    await expect(rows).toHaveCount(9);

    // Ajout manuel via la section "Creer un nouveau document" du dialog
    await page.getByRole("button", { name: /ajouter un document/i }).click();
    const dialogName = `E2E Doc ${Date.now()}`;
    await page.getByLabel("Nom du document").fill(dialogName);
    // Bouton "Creer" du form custom (≠ "Importer N" du batch label picker)
    await page.getByRole("button", { name: /^creer$/i }).click();

    await expect(page.getByText(dialogName).first()).toBeVisible({ timeout: 5000 });

    // Cleanup : trouver la row et delete
    const row = list.locator("li", { hasText: dialogName });
    await row.getByRole("button", { name: /supprimer/i }).click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
  });

  test("supprimer un doc recommande → apparait en surbrillance dans 'Recommandes' + re-import", async ({
    page,
  }) => {
    await loginCommercial(page);
    await openMarineConfirmee(page);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    const list = page.getByTestId("documents-list");
    await expect(list).toBeVisible();

    // Supprime le 1er doc (ex: Bilan sanguin — issu du sync auto donc recommande)
    const firstRow = list.locator("li").first();
    const firstName = (await firstRow.textContent())?.replace(/En attente|Recu|Valide/, "").trim() ?? "";
    await firstRow.getByRole("button", { name: /supprimer/i }).click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
    await page.waitForTimeout(600);

    // Ouvre le dialog d'ajout
    await page.getByRole("button", { name: /ajouter un document/i }).click();

    // La section "Recommandes" doit contenir ce doc avec le style surligne
    const dialog = page.getByRole("dialog", { name: /ajouter des documents/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/recommandes par les interventions/i)).toBeVisible();

    // Coche-le + importe (bouton change de "Aucune selection" a "Importer 1 document")
    const recommendedRow = dialog.locator('label', { hasText: new RegExp(firstName.slice(0, 12), "i") }).first();
    await recommendedRow.click();
    await dialog.getByRole("button", { name: /importer 1 document/i }).click();
    await page.waitForTimeout(600);

    // Le doc est reapparu dans la liste
    await expect(list.locator("li", { hasText: new RegExp(firstName.slice(0, 12), "i") })).toBeVisible();
  });
});
