import { test, expect, type Page } from "@playwright/test";

/**
 * EP14-S06 — Tests E2E de la page self-service RGPD /account/privacy.
 *
 * Reference : docs/product/stories/EP14-S06.md (AC5 : page /account/privacy avec
 * "Exporter mes donnees" + "Supprimer mon compte" sous confirmation forte ; AC6 :
 * actions ADMIN "Exporter" / "Anonymiser" sur la fiche client). Decisions liees :
 * ADR-0009 D3 (chaque action RGPD est tracee), D4 (export en clair via req.prisma).
 *
 * Comportement cible (page /account/privacy + actions fiche client, a implementer) :
 *  - /account/privacy : bandeau non-HDS, bouton "Exporter mes donnees" (declenche
 *    le telechargement / l'appel GET /api/me/export), bouton "Supprimer mon compte"
 *    qui ouvre une confirmation forte (modale + re-saisie/coche explicite) avant
 *    d'appeler DELETE /api/me ;
 *  - la suppression du dernier ADMIN est refusee cote API (409) et le front
 *    affiche un message clair sans deconnecter le compte ;
 *  - sur la fiche client (cote ADMIN), les actions "Exporter" et "Anonymiser"
 *    sont proposees ; "Anonymiser" passe par une confirmation forte.
 *
 * Phase TDD rouge : la page /account/privacy et les actions fiche client
 * n'existent pas encore. Ces tests echouent tant que la feature n'est pas
 * implementee.
 *
 * Prerequis d'environnement : un cabinet de demo onboarde (CGU acceptee) avec un
 * compte ADMIN et un compte COMMERCIAL. Les identifiants suivent la convention
 * des autres specs (login email + mot de passe "demo"). Les selecteurs
 * (getByRole / getByTestId) suivent la convention de role-aware.spec.ts,
 * cookie-flags.spec.ts et onboarding-cgu.spec.ts. A aligner avec le seed lors de
 * l'implementation si les identifiants de demo different.
 */

const ADMIN_EMAIL = "admin-test@cabinet-test.fr";
const COMMERCIAL_EMAIL = "commercial-test@cabinet-test.fr";
const DEMO_PASSWORD = "demo";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 10000 });
}

test.describe("EP14-S06 — Self-service RGPD /account/privacy", () => {
  test("la page expose un bandeau non-HDS et les deux actions (AC5)", async ({
    page,
  }) => {
    await login(page, COMMERCIAL_EMAIL);
    await page.goto("/account/privacy");

    // Bandeau non-HDS (cf. convention onboarding-cgu : data-testid non-hds-banner).
    await expect(page.getByTestId("non-hds-banner")).toBeVisible();
    // Les deux actions de l'AC5.
    await expect(
      page.getByRole("button", { name: /exporter mes donnees/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /supprimer mon compte/i }),
    ).toBeVisible();
  });

  test("Exporter mes donnees declenche l'export du compte (GET /api/me/export)", async ({
    page,
  }) => {
    await login(page, COMMERCIAL_EMAIL);
    await page.goto("/account/privacy");

    // L'export peut se materialiser par un telechargement OU par un appel reseau.
    // On observe l'appel a l'API d'export du compte courant.
    const [exportResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/me/export") && r.request().method() === "GET",
        { timeout: 10000 },
      ),
      page.getByRole("button", { name: /exporter mes donnees/i }).click(),
    ]);
    expect(exportResponse.status()).toBe(200);
  });

  test("Supprimer mon compte exige une confirmation forte avant d'agir (AC5)", async ({
    page,
  }) => {
    await login(page, COMMERCIAL_EMAIL);
    await page.goto("/account/privacy");

    await page.getByRole("button", { name: /supprimer mon compte/i }).click();

    // Confirmation forte : une modale / un dialog apparait ; le bouton de
    // confirmation definitif est distinct du premier clic (pas d'action en un clic).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /confirmer|supprimer definitivement/i }),
    ).toBeVisible();
    // Une annulation est possible (l'action n'est pas irreversible par accident).
    await expect(
      dialog.getByRole("button", { name: /annuler/i }),
    ).toBeVisible();
  });

  test("le dernier ADMIN voit son auto-suppression refusee avec un message clair (A-guard)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto("/account/privacy");

    await page.getByRole("button", { name: /supprimer mon compte/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: /confirmer|supprimer definitivement/i })
      .click();

    // L'API refuse (409) le retrait du dernier admin ; le front affiche le motif
    // et NE deconnecte pas le compte (il reste sur la page, pas de redirect login).
    await expect(
      page.getByText(/dernier (administrateur|admin)|ne peut pas/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
