import { test, expect, type Page } from "@playwright/test";

/**
 * Audit visuel : parcourt toutes les pages cles et screenshot fullPage.
 * Lance avec : npx playwright test tests/e2e/visual-audit.spec.ts
 * Les screenshots vont dans test-results/visual/.
 */

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Visual audit", () => {
  test("01 - login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/visual/01-login.png", fullPage: true });
  });

  test("02 - dashboard commercial", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.waitForTimeout(1500); // laisser le chart charger
    await page.screenshot({
      path: "test-results/visual/02-dashboard-commercial.png",
      fullPage: true,
    });
  });

  test("03 - dashboard admin", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/visual/03-dashboard-admin.png",
      fullPage: true,
    });
  });

  test("04 - pipeline kanban", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/visual/04-pipeline.png",
      fullPage: true,
    });
  });

  test("04b - pipeline split button menu ouvert", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1500);
    // Clic sur la chevron pour ouvrir le menu
    await page.getByRole("button", { name: /autres options/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "test-results/visual/04b-pipeline-split-menu.png",
      fullPage: false,
    });
  });

  test("04c - patient picker dialog", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /autres options/i }).click();
    await page.waitForTimeout(300);
    await page.getByText(/Nouveau dossier sur patient existant/i).click();
    await page.waitForTimeout(600);
    await page
      .getByRole("dialog")
      .getByPlaceholder(/rechercher par nom/i)
      .fill("Dupont");
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "test-results/visual/04c-patient-picker.png",
      fullPage: false,
    });
  });

  test("05 - process panel CONFIRMEE", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1200);
    await page.getByText("Marine Dupont").first().click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: "test-results/visual/05-process-panel-overview.png",
      fullPage: true,
    });
  });

  test("06 - process panel documents tab", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1200);
    await page.getByText("Marine Dupont").first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.waitForTimeout(1200);
    // Force scroll top dans le panel pour voir le badge + header
    await page.evaluate(() => {
      const panel = document.querySelector<HTMLDivElement>(
        '[role="dialog"] .overflow-y-auto'
      );
      if (panel) panel.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: "test-results/visual/06-process-panel-documents.png",
      fullPage: true,
    });
  });

  test("07 - clients list", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/clients");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/visual/07-clients.png",
      fullPage: true,
    });
  });

  test("08 - agenda semaine", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/agenda");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/visual/08-agenda-week.png",
      fullPage: true,
    });
  });

  test("09 - agenda mois + event sheet", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/agenda");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Mois", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: "test-results/visual/09-agenda-month.png",
      fullPage: true,
    });

    // Clic event Amelie → EventSheet
    const amelie = page.getByText(/Amelie/i).first();
    if (await amelie.isVisible()) {
      await amelie.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: "test-results/visual/10-event-sheet.png",
        fullPage: true,
      });
    }
  });

  test("10 - config cliniques", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/cliniques");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/visual/11-config-cliniques.png",
      fullPage: true,
    });
  });

  test("11 - config interventions", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/interventions");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/visual/12-config-interventions.png",
      fullPage: true,
    });
  });

  test("12 - config cabinet (settings)", async ({ page }) => {
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/cabinet");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/visual/13-config-cabinet.png",
      fullPage: true,
    });
  });

  test("13 - fiche client", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/clients");
    await page.waitForTimeout(1000);
    // Clic sur la premiere fleche ArrowUpRight (ouvrir fiche)
    await page.getByLabel("Ouvrir fiche").first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: "test-results/visual/14-fiche-client.png",
      fullPage: true,
    });
  });

  test("14 - devis builder", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1200);
    await page.getByText("Amelie").first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Devis", exact: true }).click();
    await page.waitForTimeout(500);
    // Clic sur le Link du devis (maintenant rendu <a href="/devis/..."/>)
    await page.locator("a").filter({ hasText: /DEV-SEED/ }).first().click();
    await page.waitForURL(/\/devis\//, { timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: "test-results/visual/15-devis-builder.png",
      fullPage: true,
    });
  });
});
