import { test, expect } from "@playwright/test";

/**
 * SEC-10 — NextAuth cookie flags.
 *
 * Threat : un cookie session accessible via document.cookie (absence de
 * HttpOnly) est exfiltrable par n'importe quelle XSS. Sans SameSite, il est
 * envoye sur les requetes cross-site (CSRF). Sans Secure en prod, il leak
 * sur un MITM HTTP.
 *
 * NextAuth v4 pose par defaut :
 *   - next-auth.session-token  : HttpOnly + SameSite=Lax + Path=/
 *   - next-auth.csrf-token     : HttpOnly + SameSite=Lax + Path=/
 *   - next-auth.callback-url   : SameSite=Lax (pas HttpOnly, utilise cote client)
 * En prod (HTTPS + NEXTAUTH_URL https://) les cookies basculent sur le
 * prefixe __Secure- avec Secure=true. En dev HTTP, Secure=false est normal.
 *
 * Ce test est un filet anti-regression : si quelqu'un override cookies.*
 * dans authOptions en retirant HttpOnly, le test casse.
 */

test.describe("Security — NextAuth cookie flags (SEC-10)", () => {
  test("session-token est HttpOnly + SameSite=Lax apres login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
    await page.getByLabel("Mot de passe").fill("demo");
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    const cookies = await page.context().cookies();
    // En dev le nom est next-auth.session-token (sans prefixe __Secure-)
    // car le serveur tourne en HTTP. En prod HTTPS, NextAuth bascule sur
    // __Secure-next-auth.session-token.
    const session = cookies.find((c) =>
      c.name === "next-auth.session-token" ||
      c.name === "__Secure-next-auth.session-token"
    );
    expect(session, "session cookie must be set after login").toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
    // En dev HTTP Secure=false est attendu et correct (sinon le cookie ne
    // serait jamais envoye par le navigateur). En prod, NextAuth le passe
    // automatiquement a true via le prefixe __Secure-.
    if (session!.name.startsWith("__Secure-")) {
      expect(session!.secure).toBe(true);
    }
    // Path=/ = le cookie est envoye sur toute l'app, attendu.
    expect(session!.path).toBe("/");
  });

  test("csrf-token est HttpOnly", async ({ page }) => {
    // Le cookie CSRF est pose des le premier GET sur une page NextAuth
    // (pas besoin de login). Visiter /login suffit pour le recevoir via
    // le GET /api/auth/csrf declenche par le provider.
    await page.goto("/login");
    // Forcer un appel a /api/auth/csrf pour garantir la pose du cookie.
    await page.request.get("/api/auth/csrf");

    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) =>
      c.name === "next-auth.csrf-token" ||
      c.name === "__Host-next-auth.csrf-token"
    );
    expect(csrf, "csrf cookie must be set").toBeDefined();
    expect(csrf!.httpOnly).toBe(true);
    expect(csrf!.sameSite).toBe("Lax");
  });

  test("session-token n'est PAS lisible via document.cookie (HttpOnly effectif)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("julie@cabinet-delobaux.fr");
    await page.getByLabel("Mot de passe").fill("demo");
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Test comportemental : l'attaquant via XSS essaierait de lire le cookie
    // depuis le JS de la page. HttpOnly doit le cacher.
    const jsCookie = await page.evaluate(() => document.cookie);
    expect(jsCookie).not.toContain("next-auth.session-token");
    expect(jsCookie).not.toContain("__Secure-next-auth.session-token");
  });
});
