import { test, expect, type Page } from "@playwright/test";

/**
 * EP05 — Devis mutations : garantir qu'une erreur backend leve un toast.
 *
 * Avant le fix : les handlers (patchFee, patchIntervention, etc.) dans
 * DevisBuilder.tsx appellent apiFetch sans verifier res.success → echec
 * silencieux (rien ne bouge). Ce spec reproduit le bug (test 1 FAIL avant
 * fix) puis valide le comportement attendu apres fix.
 */

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

async function createDevisViaApi(page: Page): Promise<string> {
  const session = await page.request.get("/api/auth/session");
  const { jwt } = (await session.json()) as { jwt?: string };
  if (!jwt) throw new Error("no jwt in session");

  const base = "http://localhost:4000";
  const auth = { Authorization: `Bearer ${jwt}` };

  const intRes = await page.request.post(`${base}/api/interventions`, {
    headers: auth,
    data: {
      name: `E2E ErrToast ${Date.now()}`,
      category: "CHIRURGIE",
      duration: 90,
      priceHonoraires: 500_000,
    },
  });
  const interventionId = ((await intRes.json()) as { data: { id: string } }).data.id;

  const clientRes = await page.request.post(`${base}/api/clients`, {
    headers: auth,
    data: { firstName: "E2E", lastName: `ErrToast-${Date.now()}`, phone: "06 11 22 33 44" },
  });
  const clientId = ((await clientRes.json()) as { data: { id: string } }).data.id;

  const procRes = await page.request.post(`${base}/api/processes`, {
    headers: auth,
    data: { clientId, interventionIds: [interventionId] },
  });
  const processId = ((await procRes.json()) as { data: { id: string } }).data.id;

  const devisRes = await page.request.post(`${base}/api/processes/${processId}/devis`, {
    headers: auth,
    data: {},
  });
  if (devisRes.status() !== 201) throw new Error(`devis POST ${devisRes.status()}`);
  return ((await devisRes.json()) as { data: { id: string } }).data.id;
}

/** Ajoute une ligne de frais via l'UI et renvoie le FeeRow (prix input visible). */
async function addFeeViaUi(page: Page, label: string, priceEuros: number) {
  await page.getByRole("button", { name: /ajouter un frais/i }).first().click();
  const form = page.locator("div").filter({ has: page.getByPlaceholder("Label") }).last();
  await form.getByPlaceholder("Label").fill(label);
  await form.getByPlaceholder("0.00").fill(String(priceEuros));
  await form.getByRole("button", { name: /^ok$/i }).click();
  // On attend que la ligne existe (input texte avec cette valeur).
  await expect(page.locator(`input[type="text"][value="${label}"]`)).toBeVisible({
    timeout: 10_000,
  });
}

/** Sonner rend les toasts en <li data-sonner-toast data-type="error" ...>. */
const errorToastLocator = (page: Page) =>
  page.locator('[data-sonner-toast][data-type="error"]');

test.describe("EP05 — Devis : toast sur erreur backend", () => {
  test("patchFee price = -1 : toast error apparait (silent-failure repro)", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    await addFeeViaUi(page, "Frais test neg", 50);

    // Le FeeRow cible : input number avec defaultValue "50.00" et step 0.01.
    const priceInput = page.locator('input[type="number"][step="0.01"]').first();
    await priceInput.fill("-1");
    await priceInput.blur();

    // Attendu apres fix : un toast d'erreur visible (message Zod ou generique).
    // Avant fix : aucun toast → ce test FAIL (c'est la repro).
    await expect(errorToastLocator(page)).toBeVisible({ timeout: 5_000 });
  });

  test("patchFee price = 300 (valide) : le total se met a jour", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    await addFeeViaUi(page, "Frais valide", 100);

    const totalLocator = page.locator("span.font-mono.text-2xl").last();
    await expect(totalLocator).toBeVisible();
    const before = await totalLocator.textContent();

    const priceInput = page.locator('input[type="number"][step="0.01"]').first();
    await priceInput.fill("300");
    await priceInput.blur();

    await expect(async () => {
      const after = await totalLocator.textContent();
      expect(after).not.toBe(before);
    }).toPass({ timeout: 10_000 });
    await expect(errorToastLocator(page)).toHaveCount(0);
  });

  test("patchIntervention duration = 0 : toast error (donnee rejetee par Zod)", async ({
    page,
  }) => {
    // Duration n'est editable que par CHIRURGIEN (readOnlyMedical=true pour COMMERCIAL).
    // On cree le devis en tant que Julie puis on bascule role CHIRURGIEN via
    // le RoleSwitcher demo (window.location.reload embarque dedans).
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);

    await page.goto(`/devis/${devisId}`);
    await page.getByTestId("role-switch-chirurgien").click();
    await expect(page.getByText(/lecture seule pour ce role/i)).toBeVisible({
      timeout: 10_000,
    });

    const durationInput = page.locator('input[type="number"][min="1"]').first();
    await expect(durationInput).toHaveValue("90");
    await expect(durationInput).toBeEnabled();
    await durationInput.fill("0");
    await durationInput.blur();

    // Sans le fix : rien. Avec le fix : toast error (Zod >= 1).
    await expect(errorToastLocator(page)).toBeVisible({ timeout: 10_000 });
  });

  test("deleteFee : la ligne disparait de la liste", async ({ page }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const label = `A-supprimer-${Date.now()}`;
    await addFeeViaUi(page, label, 42);

    const feeRow = page.locator(`input[type="text"][value="${label}"]`);
    await expect(feeRow).toBeVisible();
    // Le Trash2 du FeeRow est le dernier bouton icon de la ligne.
    const trashBtn = feeRow.locator("..").getByRole("button").last();
    await trashBtn.click();

    await expect(feeRow).toHaveCount(0, { timeout: 5_000 });
    await expect(errorToastLocator(page)).toHaveCount(0);
  });
});
