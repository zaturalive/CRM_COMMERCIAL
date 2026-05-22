import { test, expect, type Page } from "@playwright/test";

/**
 * P3 Pattern B — Tests E2E du modal HDS de consentement avant upload.
 *
 * Verifie :
 * - Premier upload de la session declenche le modal
 * - Click "Je confirme et j upload" → upload lance
 * - Click "Annuler" → upload abandonne, pas de consent stocke
 * - Deuxieme upload meme session → pas de modal (consent sessionStorage)
 * - SessionStorage UPLOAD_CONSENT_KEY = "true" apres confirm
 */

async function loginAsCommercial(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("julie@cabinet-delobaux.fr");
  await page.getByLabel(/mot de passe|password/i).fill("demo");
  await page.getByRole("button", { name: /se connecter|sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

async function openFirstProcessWithDocuments(page: Page) {
  // Ouvre le pipeline et clique sur le premier process qui a des documents
  await page.goto("/pipeline");
  await page.waitForLoadState("networkidle");

  // Click sur le premier process avec des documents en attente
  // Le seed.local cree des processes en stage CONFIRMEE/OP_PROGRAMMEE avec documents
  await page.getByText(/Marine Dupont|Amelie Vidal|Sarah Laurent/i).first().click();

  // Onglet Documents
  await page.getByRole("button", { name: /^Documents$/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("P3 Pattern B - modal HDS upload", () => {
  test("premier upload de la session affiche le modal HDS", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);
    await openFirstProcessWithDocuments(page);

    // Click sur Upload du premier document EN_ATTENTE
    const uploadButton = page.getByRole("button", { name: /televerser|upload/i }).first();
    await uploadButton.scrollIntoViewIfNeeded();

    // Pour declencher le modal, on doit simuler la selection d un fichier
    // Le fileChooser sera intercepte par Playwright
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "carte-identite.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("PDF mock content"),
    });

    // Le modal HDS apparait
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 3000 });
    await expect(modal).toContainText(/avant d'uploader|before uploading/i);
    await expect(modal).toContainText(/bilan sanguin|blood test/i); // liste interdits
  });

  test("click sur Annuler ferme le modal sans uploader", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);
    await openFirstProcessWithDocuments(page);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /televerser|upload/i }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("PDF"),
    });

    await page.getByRole("dialog").waitFor({ state: "visible" });

    // Click Annuler
    await page.getByRole("button", { name: /annuler|cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });

    // SessionStorage pas defini
    const consent = await page.evaluate(() =>
      sessionStorage.getItem("crm-commercial:hds-upload-consent")
    );
    expect(consent).toBeNull();
  });

  test("apres confirm, sessionStorage est set et 2e upload skip le modal", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);
    await openFirstProcessWithDocuments(page);

    // Premier upload : declenche modal + confirm
    let fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /televerser|upload/i }).first().click();
    let fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "rib.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("RIB content"),
    });

    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /confirme|confirm/i }).click();

    // SessionStorage doit etre "true"
    const consent = await page.evaluate(() =>
      sessionStorage.getItem("crm-commercial:hds-upload-consent")
    );
    expect(consent).toBe("true");

    // Attendre que l upload se termine (toast ou ProcessDocument visible)
    await page.waitForLoadState("networkidle");

    // Deuxieme upload sur un autre document : pas de modal
    const uploadButtons = page.getByRole("button", { name: /televerser|upload/i });
    const count = await uploadButtons.count();
    if (count >= 2) {
      fileChooserPromise = page.waitForEvent("filechooser");
      await uploadButtons.nth(1).click();
      fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "cgv.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("CGV content"),
      });

      // Le modal ne doit PAS reapparaitre (consent deja donne)
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 1500 });
    }
  });

  test("le modal liste les documents interdits explicitement", async ({ page, context }) => {
    await context.clearCookies();
    await loginAsCommercial(page);
    await openFirstProcessWithDocuments(page);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /televerser|upload/i }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("PDF"),
    });

    const modal = page.getByRole("dialog");
    await modal.waitFor({ state: "visible" });

    // Verifier la presence des mots-cles interdits
    const text = await modal.textContent();
    expect(text).toMatch(/bilan|ordonnance|consentement|CRO|echographie|mammographie/i);
  });
});
