import { test, expect, type Page } from "@playwright/test";

/**
 * E2E pipeline complet — parcours du cycle de vie d'un dossier via
 * CLIC UTILISATEUR uniquement (pas d'API directe) :
 *   1. Crea un patient via dialog → panel s'ouvre en CONTACT
 *   2. Ajoute une intervention via picker
 *   3. Definit la date de consultation
 *   4. Qualifie le dossier
 *   5. Avance les stages via le stepper (force dialog si prerequis manque)
 *   6. Suppression definitive avec confirmation "suppression"
 *
 * Le seul API direct = login (creer le JWT de session NextAuth).
 */

async function loginCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Pipeline full-flow E2E", () => {
  test("cycle complet : creation → interventions → date → qualif → transitions → delete", async ({
    page,
  }) => {
    const suffix = String(Date.now()).slice(-6);
    const patientName = `E2EFlow ${suffix}`;

    await loginCommercial(page);
    await page.goto("/pipeline");
    await page.waitForTimeout(800);

    // ──────────────────────────────────────────────
    // 1. Creation patient via dialog "Nouveau patient"
    // ──────────────────────────────────────────────
    await page.getByRole("button", { name: /^nouveau patient$/i }).click();
    await page.getByLabel("Prenom").fill("E2EFlow");
    await page.getByLabel("Nom", { exact: true }).fill(suffix);
    await page.getByLabel("Telephone").fill(`06 ${suffix.slice(0, 2)} ${suffix.slice(2, 4)} ${suffix.slice(4, 6)} 99`);
    await page.getByRole("button", { name: /^creer$/i }).click();

    // Process Panel doit s'ouvrir automatiquement en CONTACT
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: new RegExp(patientName, "i") })
    ).toBeVisible();

    // ──────────────────────────────────────────────
    // 2. Telephone mal saisi = erreur lisible (pas silencieuse)
    // ──────────────────────────────────────────────
    // (test separe ci-dessous)

    // ──────────────────────────────────────────────
    // 3. Ajoute une intervention via le picker
    // ──────────────────────────────────────────────
    await panel
      .getByRole("button", { name: /^ajouter$/i })
      .first()
      .click();

    const intervPicker = page.getByRole("dialog", {
      name: /ajouter une intervention/i,
    });
    await expect(intervPicker).toBeVisible();
    await intervPicker.getByPlaceholder(/rechercher par nom/i).fill("Rhinoplastie");
    await page.waitForTimeout(400);
    await intervPicker.getByText(/Rhinoplastie/i).first().click();
    await page.waitForTimeout(600);

    // Le picker se ferme, la liste affiche 1 intervention
    await expect(panel.getByText(/Interventions \(1\)/i)).toBeVisible();

    // ──────────────────────────────────────────────
    // 4. Definir date de consultation
    // ──────────────────────────────────────────────
    await panel.getByRole("button", { name: /definir date consult/i }).click();
    const dateDialog = page.getByRole("dialog", { name: /date de consultation/i });
    await expect(dateDialog).toBeVisible();
    // Dans 7 jours
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const ymd = future.toISOString().slice(0, 10);
    await dateDialog.getByLabel(/date et heure/i).fill(`${ymd}T10:00`);
    await dateDialog.getByRole("button", { name: /^enregistrer$/i }).click();
    await page.waitForTimeout(600);

    // ──────────────────────────────────────────────
    // 5. Qualifier le dossier
    // ──────────────────────────────────────────────
    await panel.getByRole("button", { name: /^qualifier$/i }).click();
    const qualifDialog = page.getByRole("dialog", { name: /qualifier le dossier/i });
    await expect(qualifDialog).toBeVisible();
    await qualifDialog.getByRole("button", { name: /^qualifie$/i }).click();
    await qualifDialog.getByRole("button", { name: /^enregistrer$/i }).click();
    await page.waitForTimeout(600);

    // Badge passe a "Qualifie"
    await expect(panel.getByText(/^qualifie$/i).first()).toBeVisible();

    // ──────────────────────────────────────────────
    // 6. Transition CONTACT → CONSULTATION via stepper
    //    (prerequis OK : consult date + qualif)
    // ──────────────────────────────────────────────
    await panel.locator('button[title*="Consultation"], button:has-text("Consultation")').first().click();
    // Possibilite d'un ForceDialog si conditions pas toutes OK — on accepte
    const forceDialog = page.getByRole("dialog", { name: /forcer la transition/i });
    if (await forceDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      await forceDialog.getByRole("button", { name: /forcer/i }).click();
    }
    await page.waitForTimeout(600);

    // ──────────────────────────────────────────────
    // 7. Suppression definitive
    // ──────────────────────────────────────────────
    await panel.getByRole("button", { name: /supprimer le dossier/i }).click();
    const deleteDialog = page.getByRole("dialog", { name: /supprimer definitivement/i });
    await expect(deleteDialog).toBeVisible();

    // Le bouton est disabled tant qu'on n'a pas tape "suppression" exact
    const confirmBtn = deleteDialog.getByRole("button", { name: /supprimer definitivement/i });
    await expect(confirmBtn).toBeDisabled();

    // Mauvais texte → toujours disabled
    await deleteDialog.getByPlaceholder("suppression").fill("SUPPRESSION");
    await expect(confirmBtn).toBeDisabled();

    // Bon texte → enabled
    await deleteDialog.getByPlaceholder("suppression").fill("suppression");
    await expect(confirmBtn).toBeEnabled();

    await confirmBtn.click();
    await page.waitForTimeout(800);

    // Panel ferme, patient disparait du pipeline
    await expect(page.getByText(new RegExp(patientName, "i"))).not.toBeVisible();
  });

  test("telephone invalide → toast d'erreur explicite (pas silencieux)", async ({ page }) => {
    await loginCommercial(page);
    await page.goto("/pipeline");
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: /^nouveau patient$/i }).click();
    await page.getByLabel("Prenom").fill("Test");
    await page.getByLabel("Nom", { exact: true }).fill("Invalid");
    // Numero avec pas le bon nombre de digits
    await page.getByLabel("Telephone").fill("06 12");
    await page.getByRole("button", { name: /^creer$/i }).click();

    // Le toast doit afficher le message Zod precis, pas juste "Validation error"
    await expect(page.getByText(/Numero francais invalide/i)).toBeVisible({
      timeout: 3000,
    });
  });
});
