import { test, expect, type Page } from "@playwright/test";

/**
 * Tests E2E EP16-S03 — Petite previsualisation a droite du devis maker.
 *
 * AC couverts :
 *  1. Layout deux zones : editeur a gauche, panneau d'apercu a droite.
 *  2. Apercu en temps reel quand le commercial modifie le devis (montant, remise).
 *  3. Apercu coherent avec le PDF final (meme fonction de calcul unique, D6).
 *  4. Rendu leger : pas de regeneration PDF Puppeteer a chaque frappe.
 *  5. Responsive : le panneau se replie / se masque sur petit ecran.
 *  6. Aucun element medical rendu dans l'apercu (garde-fou EP16, non-HDS).
 *
 * Ces tests sont autonomes du seed : ils creent intervention + client +
 * process + devis via l'API backend (meme pattern que devis.spec.ts), puis
 * naviguent dans le builder.
 *
 * Marqueurs attendus de l'implementation (rouge tant qu'absents) :
 *  - data-testid="devis-editor"        : la zone editeur (gauche)
 *  - data-testid="devis-preview"       : le panneau d'apercu (droite)
 *  - data-testid="devis-preview-total" : le total net affiche dans l'apercu
 *  - data-testid="devis-preview-toggle": le bouton replier/afficher (mobile)
 */

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

/**
 * Cree intervention + client + process + devis via API backend pour rester
 * autonome du seed. Retourne { devisId, jwt } : le jwt sert a relire le total
 * et le PDF cote API pour l'assertion de coherence.
 */
async function createDevisViaApi(
  page: Page
): Promise<{ devisId: string; jwt: string }> {
  const session = await page.request.get("/api/auth/session");
  const sessionJson = (await session.json()) as { jwt?: string };
  const jwt = sessionJson.jwt;
  if (!jwt) {
    throw new Error(
      `no jwt - session body: ${JSON.stringify(sessionJson).slice(0, 300)}`
    );
  }

  const base = process.env.BACKEND_BASE_URL ?? "http://localhost:4100";

  const intRes = await page.request.post(`${base}/api/interventions`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: {
      name: `E2E Preview ${Date.now()}`,
      category: "CHIRURGIE",
      duration: 120,
      priceHonoraires: 500_000,
    },
  });
  const intJson = (await intRes.json()) as { data?: { id: string } };
  if (!intJson.data?.id) {
    throw new Error(
      `intervention POST failed status=${intRes.status()} body=${JSON.stringify(intJson).slice(0, 300)}`
    );
  }
  const interventionId = intJson.data.id;

  const clientRes = await page.request.post(`${base}/api/clients`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: {
      firstName: "E2E",
      lastName: `Preview-${Date.now()}`,
      phone: "06 99 88 77 66",
    },
  });
  const client = (await clientRes.json()) as { data?: { id: string } };
  if (!client.data?.id) {
    throw new Error(
      `client POST failed status=${clientRes.status()} body=${JSON.stringify(client).slice(0, 300)}`
    );
  }

  const procRes = await page.request.post(`${base}/api/processes`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: { clientId: client.data.id, interventionIds: [interventionId] },
  });
  const proc = (await procRes.json()) as { data?: { id: string } };
  if (!proc.data?.id) {
    throw new Error(
      `process POST failed status=${procRes.status()} body=${JSON.stringify(proc).slice(0, 300)}`
    );
  }

  const devisRes = await page.request.post(
    `${base}/api/processes/${proc.data.id}/devis`,
    { headers: { Authorization: `Bearer ${jwt}` }, data: {} }
  );
  if (devisRes.status() !== 201) {
    throw new Error(
      `devis POST failed status=${devisRes.status()} body=${(await devisRes.text()).slice(0, 200)}`
    );
  }
  const created = (await devisRes.json()) as { data?: { id: string } };
  if (!created.data?.id) {
    throw new Error("devis POST returned no id");
  }
  return { devisId: created.data.id, jwt };
}

test.describe("EP16-S03 — Apercu live du devis", () => {
  test("AC1 : layout deux zones — editeur a gauche, panneau d'apercu a droite", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const editor = page.getByTestId("devis-editor");
    const preview = page.getByTestId("devis-preview");
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();

    // POURQUOI : sur desktop l'apercu est a DROITE de l'editeur (split-pane).
    const editorBox = await editor.boundingBox();
    const previewBox = await preview.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.x).toBeGreaterThan(editorBox!.x);
  });

  test("AC2 : l'apercu se met a jour en temps reel quand le montant change", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const previewTotal = page.getByTestId("devis-preview-total");
    await expect(previewTotal).toBeVisible();
    const before = await previewTotal.textContent();

    // Ajouter une option personnalisee -> le total de l'apercu doit changer.
    await page
      .getByRole("button", { name: /ajouter une option personnalisee/i })
      .click();
    await page.getByPlaceholder("Label").fill("Option apercu E2E");
    const priceInput = page.locator('input[placeholder="0.00"]').first();
    await priceInput.fill("250");
    await page.getByRole("button", { name: /^ajouter$/i }).click();

    await expect(async () => {
      const after = await previewTotal.textContent();
      expect(after).not.toBe(before);
    }).toPass({ timeout: 10_000 });
  });

  test("AC2/AC3 : la remise (EP16-S02) est refletee dans le total de l'apercu", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const previewTotal = page.getByTestId("devis-preview-total");
    await expect(previewTotal).toBeVisible();
    const beforeRemise = await previewTotal.textContent();

    // Saisir une remise -> total net de l'apercu diminue (apres remise).
    const remiseInput = page.getByTestId("devis-remise-value");
    await remiseInput.fill("10");
    await remiseInput.blur();

    await expect(async () => {
      const afterRemise = await previewTotal.textContent();
      expect(afterRemise).not.toBe(beforeRemise);
    }).toPass({ timeout: 10_000 });
  });

  test("AC3 : le total de l'apercu est coherent avec le PDF genere (meme calcul)", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId, jwt } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const previewTotal = page.getByTestId("devis-preview-total");
    await expect(previewTotal).toBeVisible();
    const previewText = (await previewTotal.textContent()) ?? "";
    // Normalise en centimes Int (retire espaces, symbole euro, virgule decimale).
    const toCents = (s: string): number => {
      const m = s.replace(/\s| /g, "").match(/(\d+)[.,](\d{2})/);
      if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
      const digits = s.replace(/\D/g, "");
      return digits ? parseInt(digits, 10) : NaN;
    };
    const previewCents = toCents(previewText);

    // Le total cote API (meme fonction de calcul unique D6 que le PDF).
    const base = process.env.BACKEND_BASE_URL ?? "http://localhost:4100";
    const totalRes = await page.request.get(
      `${base}/api/devis/${devisId}/total`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    const totalJson = (await totalRes.json()) as {
      data?: { totalNet?: number; total?: number };
    };
    const apiCents = totalJson.data?.totalNet ?? totalJson.data?.total;
    expect(apiCents, "API total should be present").toBeTruthy();
    expect(previewCents).toBe(apiCents);
  });

  test("AC4 : rendu leger — pas de regeneration PDF Puppeteer a chaque frappe", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);

    // Compte les appels a la route de generation PDF.
    let pdfCalls = 0;
    await page.route("**/api/devis/**/pdf**", (route) => {
      pdfCalls += 1;
      return route.continue();
    });

    await page.goto(`/devis/${devisId}`);
    await expect(page.getByTestId("devis-preview")).toBeVisible();

    // Saisie repetee dans une option : l'apercu se rafraichit, le PDF non.
    await page
      .getByRole("button", { name: /ajouter une option personnalisee/i })
      .click();
    const label = page.getByPlaceholder("Label");
    await label.fill("perf");
    await label.fill("perf live render");
    const priceInput = page.locator('input[placeholder="0.00"]').first();
    await priceInput.fill("1");
    await priceInput.fill("12");
    await priceInput.fill("123");

    // POURQUOI : l'apercu HTML/React ne doit JAMAIS appeler Puppeteer ; le PDF
    // reste reserve au bouton "Voir le PDF complet" (AC4/AC7).
    expect(pdfCalls).toBe(0);
  });

  test("AC5 : petit ecran — le panneau d'apercu est repliable, l'editeur reste utilisable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // mobile
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    // L'editeur reste accessible sur petit ecran.
    await expect(page.getByTestId("devis-editor")).toBeVisible();

    const toggle = page.getByTestId("devis-preview-toggle");
    await expect(toggle).toBeVisible();

    const preview = page.getByTestId("devis-preview");
    // Sur mobile l'apercu est masque par defaut (tiroir/onglet).
    await expect(preview).toBeHidden();
    await toggle.click();
    await expect(preview).toBeVisible();
    // Re-replier libere l'espace pour l'editeur.
    await toggle.click();
    await expect(preview).toBeHidden();
    await expect(page.getByTestId("devis-editor")).toBeVisible();
  });

  test("AC6 : aucun champ medical rendu dans l'apercu (garde-fou EP16 non-HDS)", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const { devisId } = await createDevisViaApi(page);
    await page.goto(`/devis/${devisId}`);

    const preview = page.getByTestId("devis-preview");
    await expect(preview).toBeVisible();
    const text = ((await preview.textContent()) ?? "").toLowerCase();

    // POURQUOI : versant commercial uniquement (ADR-0003). Aucun element
    // medical (consentement medical, frais anesthesiste isole, antecedents,
    // double signature legale).
    for (const term of [
      "consentement",
      "anesthesiste",
      "antecedent",
      "antécédent",
      "dossier medical",
      "dossier médical",
    ]) {
      expect(text, `apercu ne doit pas contenir "${term}"`).not.toContain(term);
    }
  });
});
