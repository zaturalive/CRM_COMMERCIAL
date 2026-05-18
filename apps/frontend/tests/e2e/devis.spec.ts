import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests E2E EP05 — Devis.
 *
 * Ces tests sont autonomes du seed : ils creent intervention + client +
 * process + devis via l'API backend, puis naviguent dans le builder.
 *
 * On reste volontairement sur un smoke minimum : chargement de la page,
 * presence des sections, boutons PDF/Copy/Send, calcul du total.
 */

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

/**
 * Helper : cree un intervention + client + process + devis via les API
 * backend pour que le test soit totalement autonome du contenu seed. Tous
 * les appels utilisent le JWT NextAuth recupere depuis /api/auth/session.
 */
async function createDevisViaApi(page: Page): Promise<string | null> {
  const session = await page.request.get("/api/auth/session");
  const sessionJson = (await session.json()) as { jwt?: string };
  const jwt = sessionJson.jwt;
  if (!jwt) {
    throw new Error(
      `no jwt - session body: ${JSON.stringify(sessionJson).slice(0, 300)}`
    );
  }

  const base = "http://localhost:4000";
  let processId: string | null = null;

  {
    // On cree intervention + client + process via API
    // pour que le test soit autonome (interventions du seed ont des ids non-UUID,
    // incompatibles avec la validation zod du POST /api/processes).
    const intRes = await page.request.post(`${base}/api/interventions`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        name: `E2E Devis ${Date.now()}`,
        category: "CHIRURGIE",
        duration: 90,
        priceHonoraires: 500_000,
      },
    });
    const intJson = (await intRes.json()) as { data?: { id: string } };
    if (!intJson.data?.id) {
      throw new Error(
        `intervention POST failed status=${intRes.status()} body=${JSON.stringify(
          intJson
        ).slice(0, 300)}`
      );
    }
    const interventionId = intJson.data.id;

    const clientRes = await page.request.post(`${base}/api/clients`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        firstName: "E2E",
        lastName: `Devis-${Date.now()}`,
        phone: "06 99 88 77 66",
      },
    });
    const client = (await clientRes.json()) as { data?: { id: string } };
    if (!client.data?.id) {
      throw new Error(
        `client POST failed status=${clientRes.status()} body=${JSON.stringify(
          client
        ).slice(0, 300)}`
      );
    }

    const procRes = await page.request.post(`${base}/api/processes`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        clientId: client.data.id,
        interventionIds: [interventionId],
      },
    });
    const proc = (await procRes.json()) as { data?: { id: string } };
    if (!proc.data?.id) {
      throw new Error(
        `process POST failed status=${procRes.status()} body=${JSON.stringify(
          proc
        ).slice(0, 300)}`
      );
    }
    processId = proc.data.id;
  }

  const devisRes = await page.request.post(
    `${base}/api/processes/${processId}/devis`,
    {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {},
    }
  );
  if (devisRes.status() !== 201) {
    throw new Error(
      `devis POST failed status=${devisRes.status()} body=${(await devisRes.text()).slice(0, 200)}`
    );
  }
  const created = (await devisRes.json()) as { data?: { id: string } };
  return created.data?.id ?? null;
}

test.describe("EP05 — Devis builder", () => {
  test("COMMERCIAL cree un devis et voit les sections technique + commerciale + total", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    expect(devisId, "Helper API should have created a devis").toBeTruthy();

    await page.goto(`/devis/${devisId}`);

    // Header
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^DEV-/);
    // Sections principales
    await expect(page.getByRole("heading", { name: /partie technique/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /partie commerciale/i })).toBeVisible();

    // Actions header
    await expect(
      page.getByRole("button", { name: /telecharger pdf/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /copier le devis complet en texte/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /envoyer/i })).toBeDisabled();

    // Sticky total
    await expect(page.getByText(/TOTAL/).first()).toBeVisible();
  });

  test("CHIRURGIEN voit la section technique mais la commerciale est disabled", async ({
    page,
  }) => {
    await loginAs(page, "alexis@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    test.skip(!devisId, "Aucun process avec interventions dans le seed");

    await page.goto(`/devis/${devisId}`);
    await expect(page.getByRole("heading", { name: /partie technique/i })).toBeVisible();
    // La section commerciale est visible mais contient un hint "Lecture seule"
    await expect(page.getByText(/lecture seule pour ce role/i)).toBeVisible();
  });

  test("Le total se met a jour apres ajout d'une option personnalisee", async ({
    page,
  }) => {
    await loginAs(page, "julie@cabinet-delobaux.fr");
    const devisId = await createDevisViaApi(page);
    test.skip(!devisId, "Aucun process avec interventions dans le seed");

    await page.goto(`/devis/${devisId}`);

    // Recupere total initial
    const totalLocator = page.locator("span.font-mono.text-2xl").last();
    await expect(totalLocator).toBeVisible();
    const before = await totalLocator.textContent();

    // Ajouter une option personnalisee
    await page
      .getByRole("button", { name: /ajouter une option personnalisee/i })
      .click();
    await page.getByPlaceholder("Label").fill("Option test E2E");
    // Input en euros (decimal) — le composant convertit en centimes a l'envoi
    const priceInput = page.locator('input[placeholder="0.00"]').first();
    await priceInput.fill("250");
    await page.getByRole("button", { name: /^ajouter$/i }).click();

    // Attendre que le total ait change
    await expect(async () => {
      const after = await totalLocator.textContent();
      expect(after).not.toBe(before);
    }).toPass({ timeout: 10_000 });
  });
});
