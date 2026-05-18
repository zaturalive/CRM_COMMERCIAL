import { test, expect, type Page } from "@playwright/test";

/**
 * Tests E2E EP02 — CRUD admin sur Cliniques, Interventions, Document Labels.
 * Prerequis : le stack dev doit tourner + seed (2 cliniques + 20 interventions + 11 labels).
 *
 * Les tests creent et suppriment leurs propres donnees de test. Pour eviter
 * les collisions entre runs (strict mode Playwright), chaque run utilise un
 * suffixe unique (timestamp) — aucune collision possible si un cleanup
 * precedent a foire.
 */

const RUN_ID = String(Date.now()).slice(-6);

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("florian@cabinet-delobaux.fr");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("EP02 — Cliniques CRUD (admin)", () => {
  test("liste les cliniques seed + cree + modifie + supprime", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/config/cliniques");

    // Seed visible
    await expect(page.getByRole("cell", { name: /clinique cepe/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: /clinique alphand/i })).toBeVisible();

    // Creer une clinique de test
    await page.getByRole("button", { name: /nouvelle clinique/i }).click();
    await page.getByLabel("Nom").fill("E2E Clinique Test");
    await page.getByLabel("Ville").fill("Testville");
    await page.getByLabel("Frais ambulatoire").fill("400");
    await page.getByRole("button", { name: /^creer$/i }).click();

    // Doit apparaitre dans la liste
    await expect(page.getByRole("cell", { name: /e2e clinique test/i })).toBeVisible({ timeout: 5000 });

    // Modifier : ouvrir l'edit
    const row = page.locator("tr", { hasText: "E2E Clinique Test" });
    await row.getByRole("button", { name: /modifier/i }).click();
    await page.getByLabel("Ville").fill("Testville-Edited");
    await page.getByRole("button", { name: /enregistrer/i }).click();
    await expect(page.getByRole("cell", { name: "Testville-Edited" })).toBeVisible();

    // Supprimer
    await page
      .locator("tr", { hasText: "E2E Clinique Test" })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
    await expect(page.getByRole("cell", { name: "E2E Clinique Test" })).toHaveCount(0);
  });

  test("gestion des tarifs sur page detail d'une clinique", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/config/cliniques");

    // Ouvrir CEPE (Button asChild + Link → render <a>, donc getByRole("link"))
    const cepeRow = page.locator("tr", { hasText: "Clinique CEPE" });
    await cepeRow.getByRole("link", { name: /tarifs & options/i }).click();
    await expect(page.getByRole("heading", { name: /clinique cepe/i })).toBeVisible();

    // Voir les 8 tarifs seed
    await expect(page.getByText(/grille tarifaire/i)).toBeVisible();

    // Creer un tarif hors-overlap (0-60, 61-75, etc. existent — on prend 501-600)
    await page.getByRole("button", { name: /nouveau tarif/i }).click();
    await page.getByLabel("Duree min").fill("501");
    await page.getByLabel("Duree max").fill("600");
    await page.getByLabel("Frais bloc").fill("4000");
    await page.getByLabel("Anesthesie").fill("2200");
    await page.getByRole("button", { name: /valider/i }).click();
    await expect(page.getByText("501 → 600")).toBeVisible({ timeout: 5000 });

    // Supprimer le tarif ajoute
    await page
      .locator("tr", { hasText: "501 → 600" })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await expect(page.getByText("501 → 600")).toHaveCount(0);
  });
});

test.describe("EP02 — Interventions CRUD + DocumentLabelPicker", () => {
  test("cree une intervention + associe un label existant via picker", async ({ page }) => {
    const name = `E2E Intervention ${RUN_ID}`;
    await loginAdmin(page);
    await page.goto("/config/interventions");

    // Seed visible (20 interventions)
    await expect(page.getByRole("cell", { name: /liposuccion 360° femmes/i })).toBeVisible();

    // Creer intervention
    await page.getByRole("button", { name: /nouvelle intervention/i }).click();
    await page.getByLabel("Nom").fill(name);
    await page.getByLabel("Duree").fill("60");
    await page.getByLabel("Honoraires").fill("500");
    await page.getByRole("button", { name: /^creer$/i }).click();

    await expect(page.getByRole("cell", { name })).toBeVisible();

    // Ouvrir detail (Button asChild + Link)
    const row = page.locator("tr", { hasText: name });
    await row.getByRole("link", { name: /frais & documents/i }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Associer un label existant via picker
    await page.getByTestId("add-label-association").click();
    await expect(page.getByTestId("picker-mode-existing")).toBeVisible();
    // "Rechercher un patient..." (header, disabled) + "Rechercher un label..." (picker) →
    // on cible le label pour eviter la strict mode violation
    await page.getByPlaceholder(/rechercher un label/i).fill("Bilan");
    await page.getByText("Bilan sanguin").first().click();

    // Le label doit apparaitre dans la liste des docs de l'intervention
    await expect(page.getByText("Bilan sanguin").first()).toBeVisible({ timeout: 5000 });

    // Cleanup : retour liste + suppression intervention
    await page.goto("/config/interventions");
    await page
      .locator("tr", { hasText: name })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
    await expect(page.getByRole("cell", { name })).toHaveCount(0);
  });

  test("picker avec creation inline d'un nouveau label", async ({ page }) => {
    const intervName = `E2E Inline Picker ${RUN_ID}`;
    const labelName = `E2E Label Inline ${RUN_ID}`;
    await loginAdmin(page);
    await page.goto("/config/interventions");

    // Creer une intervention temporaire
    await page.getByRole("button", { name: /nouvelle intervention/i }).click();
    await page.getByLabel("Nom").fill(intervName);
    await page.getByLabel("Duree").fill("30");
    await page.getByLabel("Honoraires").fill("100");
    await page.getByRole("button", { name: /^creer$/i }).click();

    const row = page.locator("tr", { hasText: intervName });
    await row.getByRole("link", { name: /frais & documents/i }).click();

    // Ouvrir picker + mode "new"
    await page.getByTestId("add-label-association").click();
    await page.getByTestId("picker-mode-new").click();
    await page.getByLabel("Nom").fill(labelName);
    await page.getByRole("button", { name: /creer et associer/i }).click();

    // Le label doit apparaitre comme associe
    await expect(page.getByText(labelName).first()).toBeVisible({ timeout: 5000 });

    // Cleanup : retour liste + suppression intervention + suppression label
    await page.goto("/config/interventions");
    await page
      .locator("tr", { hasText: intervName })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();

    await page.goto("/config/document-labels");
    await page
      .locator("tr", { hasText: labelName })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
    await expect(page.getByRole("cell", { name: labelName })).toHaveCount(0);
  });
});

test.describe("EP02 — Document Labels CRUD", () => {
  test("liste + create + delete", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/config/document-labels");

    // Seed visible (11 labels)
    await expect(page.getByRole("cell", { name: /bilan sanguin/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: /consentement eclaire/i })).toBeVisible();

    // Creer un label test
    await page.getByRole("button", { name: /nouveau label/i }).click();
    await page.getByLabel("Nom").fill("E2E Test Label");
    await page.getByRole("button", { name: /^creer$/i }).click();
    await expect(page.getByRole("cell", { name: "E2E Test Label" })).toBeVisible();

    // Supprimer
    await page
      .locator("tr", { hasText: "E2E Test Label" })
      .getByRole("button", { name: /supprimer/i })
      .click();
    await page.getByRole("button", { name: /^supprimer$/i }).click();
    await expect(page.getByRole("cell", { name: "E2E Test Label" })).toHaveCount(0);
  });
});
