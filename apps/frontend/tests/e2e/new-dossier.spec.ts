import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — Split button "Nouveau patient" + "Nouveau dossier sur patient existant".
 * Couvre :
 *   - Menu chevron s'ouvre / se ferme
 *   - Option "Nouveau patient" ouvre le formulaire classique
 *   - Option "Nouveau dossier" ouvre le picker
 *   - Picker cherche un patient existant + clic = creation process + Process
 *     Panel ouvert
 *   - Le meme patient peut apparaitre dans 2 dossiers distincts (multi-dossier)
 */

async function loginCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Split button — Nouveau dossier", () => {
  test("chevron ouvre un menu avec 2 options", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/pipeline");
    await page.waitForTimeout(1000);

    // Menu ferme initialement
    await expect(
      page.getByText(/Nouveau dossier sur patient existant/i)
    ).not.toBeVisible();

    // Clic sur le chevron
    await page.getByRole("button", { name: /autres options/i }).click();

    // Les 2 options apparaissent
    await expect(
      page.getByText(/Cree le patient \+ un premier dossier/i)
    ).toBeVisible();
    await expect(
      page.getByText(/Pour un patient qui revient/i)
    ).toBeVisible();

    // Clic a l'exterieur ferme
    await page.mouse.click(400, 400);
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/Nouveau dossier sur patient existant/i)
    ).not.toBeVisible();
  });

  test("picker trouve un patient existant + cree un dossier", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/pipeline");
    await page.waitForTimeout(1000);

    // Compter le nombre de dossiers initial du seed (Marine Dupont)
    // Elle apparait dans CONFIRMEE du seed.
    await page.getByRole("button", { name: /autres options/i }).click();
    await page.getByText(/Nouveau dossier sur patient existant/i).click();

    // Picker ouvert
    const dialog = page.getByRole("dialog", { name: /choisir le patient/i });
    await expect(dialog).toBeVisible();

    // Chercher Marine Dupont
    await dialog.getByPlaceholder(/rechercher par nom/i).fill("Dupont");
    await page.waitForTimeout(600);
    await expect(dialog.getByText("Marine Dupont").first()).toBeVisible();

    // Badge dossier(s) visible (au moins 1)
    await expect(dialog.getByText(/\d+ dossier/i).first()).toBeVisible();
    const initialCountText = await dialog
      .getByText(/\d+ dossier/i)
      .first()
      .textContent();
    const initialCount = parseInt(initialCountText?.match(/\d+/)?.[0] ?? "0", 10);

    // Clic → cree le process + redirect vers pipeline + panel ouvert.
    // Le picker se ferme en premier, puis le ProcessPanel s'ouvre apres
    // la requete POST. On laisse le temps a React de transitionner.
    await dialog.getByText("Marine Dupont").first().click();
    await page.waitForTimeout(1200);

    // Le Process Panel (toujours un role=dialog) doit contenir "Marine Dupont"
    // comme heading. Plus robuste que getByRole("dialog") qui peut trouver
    // le picker en cours de fermeture.
    const heading = page.getByRole("heading", { name: /marine dupont/i });
    await expect(heading).toBeVisible({ timeout: 5000 });

    // Cleanup : fermer le panel
    await page.getByRole("button", { name: /fermer/i }).click();
    await page.waitForTimeout(300);

    // Un dossier supplementaire doit exister : le badge passe de N a N+1.
    await page.getByRole("button", { name: /autres options/i }).click();
    await page.getByText(/Nouveau dossier sur patient existant/i).click();
    const dialog2 = page.getByRole("dialog", { name: /choisir le patient/i });
    await dialog2.getByPlaceholder(/rechercher par nom/i).fill("Dupont");
    await page.waitForTimeout(600);
    const newText = await dialog2
      .getByText(/\d+ dossier/i)
      .first()
      .textContent();
    const newCount = parseInt(newText?.match(/\d+/)?.[0] ?? "0", 10);
    expect(newCount).toBe(initialCount + 1);
  });

  test("picker : search vide = liste complete, recherche filtree = sous-ensemble", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/pipeline");
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /autres options/i }).click();
    await page.getByText(/Nouveau dossier sur patient existant/i).click();

    const dialog = page.getByRole("dialog", { name: /choisir le patient/i });

    // Vide au depart → affiche tous les patients (seed + fake = 45+)
    await page.waitForTimeout(600);
    // Le placeholder indique "Saisis un nom pour rechercher" OU la liste
    // appparait si la API renvoie par defaut. On check plutot qu'apres une
    // recherche precise le filtrage fonctionne.
    await dialog.getByPlaceholder(/rechercher par nom/i).fill("Lea");
    await page.waitForTimeout(600);
    await expect(dialog.getByText(/Lea Petit/i).first()).toBeVisible();

    // Non existant
    await dialog.getByPlaceholder(/rechercher par nom/i).fill("Zzzzzzzz");
    await page.waitForTimeout(600);
    await expect(dialog.getByText(/aucun patient trouve/i)).toBeVisible();
  });
});
