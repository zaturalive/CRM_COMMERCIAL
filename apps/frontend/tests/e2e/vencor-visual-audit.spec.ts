import { test, expect, type Page } from "@playwright/test";

/**
 * Audit visuel theme Vencor : parcourt les memes pages que visual-audit.spec
 * mais avec le theme Vencor pre-active via localStorage.
 *
 * Screenshots dans test-results/vencor/.
 * Lance avec :
 *   docker compose -f docker/docker-compose.e2e.yml run --rm e2e \
 *     npx playwright test tests/e2e/vencor-visual-audit.spec.ts --reporter=list
 */

async function setVencorTheme(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem("crm-commercial:theme", "vencor");
  });
  await page.reload();
  await page.waitForTimeout(300);
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Vencor visual audit", () => {
  test("v01 - login page (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/vencor/v01-login.png", fullPage: true });
  });

  test("v02 - dashboard commercial (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v02-dashboard-commercial.png",
      fullPage: true,
    });
  });

  test("v03 - dashboard admin (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v03-dashboard-admin.png",
      fullPage: true,
    });
  });

  test("v04 - pipeline kanban (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v04-pipeline.png",
      fullPage: true,
    });
  });

  test("v05 - process panel ouvert (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/pipeline");
    await page.waitForTimeout(1000);
    const firstCard = page.locator("[data-testid^='process-card-']").first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({
      path: "test-results/vencor/v05-process-panel.png",
      fullPage: true,
    });
  });

  test("v06 - agenda (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/agenda");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v06-agenda.png",
      fullPage: true,
    });
  });

  test("v07 - clients list (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/clients");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v07-clients.png",
      fullPage: true,
    });
  });

  test("v08 - config cliniques (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/cliniques");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v08-config-cliniques.png",
      fullPage: true,
    });
  });

  test("v09 - config interventions (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/interventions");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v09-config-interventions.png",
      fullPage: true,
    });
  });

  test("v10 - config cabinet (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "florian@cabinet-delobaux.fr");
    await page.goto("/config/cabinet");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v10-config-cabinet.png",
      fullPage: true,
    });
  });

  test("v12 - devis builder (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    // Trouver un devis existant via API
    const sessionResp = await page.request.get("/api/auth/session");
    const { jwt } = (await sessionResp.json()) as { jwt?: string };
    if (!jwt) return;
    const listResp = await page.request.get("http://localhost:4100/api/devis", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const { data } = (await listResp.json()) as { data?: Array<{ id: string }> };
    const devisId = data?.[0]?.id;
    if (!devisId) return;
    await page.goto(`/devis/${devisId}`);
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v12-devis-builder.png",
      fullPage: true,
    });
  });

  test("v11 - follow-up kanban (Vencor)", async ({ page }) => {
    await setVencorTheme(page);
    await loginAs(page, "julie@cabinet-delobaux.fr");
    await page.goto("/follow-up");
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "test-results/vencor/v11-follow-up.png",
      fullPage: true,
    });
  });
});
