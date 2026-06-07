import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NoopEmailSender,
  type EmailSender,
  type EmailMessage,
} from "../../src/lib/email/EmailSender";
import {
  BrevoApiEmailSender,
  parseSender,
} from "../../src/lib/email/BrevoApiEmailSender";

/**
 * EP15-S03 / ADR-0009 D7 — Tests unitaires du port EmailSender et de son
 * implementation par defaut au demarrage (NoopEmailSender).
 *
 * Reference : docs/architecture/decisions/0009-preprod-foundations.md, section
 * D7 ("EmailSender + chemin degrade") ; docs/product/stories/EP15-S03.md, Notes
 * techniques ("interface EmailSender (impl SMTP auto-heberge ou Brevo free,
 * interchangeable)").
 *
 * POURQUOI un port (interface) : la decision verrouillee du brief
 * (BUILD-BRIEF-PREPROD-2026-06-01, section 3) est "email auto-heberge ou Brevo
 * gratuit, pas au demarrage". Le reset self-service ne doit pas bloquer faute
 * d'email configure. On isole donc l'envoi derriere une interface, avec une
 * implementation NoopEmailSender au demarrage qui n'envoie rien reellement (le
 * self-service par email reste inactif), et des implementations SMTP/Brevo
 * branchables ulterieurement sans toucher le code appelant.
 *
 * Phase TDD rouge : src/lib/email/EmailSender.ts n'existe pas encore, l'import
 * echoue tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   interface EmailMessage { to: string; subject: string; text: string;
 *                            html?: string }
 *   interface EmailSender  { send(message: EmailMessage): Promise<void> }
 *   class NoopEmailSender implements EmailSender — ne fait aucun envoi reseau,
 *     expose si possible un compteur/marqueur permettant a un test de verifier
 *     qu'aucun envoi reel n'a eu lieu.
 */

describe("EmailSender (port) + NoopEmailSender (ADR-0009 D7)", () => {
  const sampleMessage: EmailMessage = {
    to: "user@example.test",
    subject: "Reinitialisation de votre mot de passe",
    text: "Lien de reinitialisation: https://app.example.test/reset-password?token=...",
  };

  it("NoopEmailSender satisfait le contrat EmailSender (send -> Promise<void>)", async () => {
    // POURQUOI : le code appelant (route forgot-password) ne depend que de
    // l'interface ; il doit pouvoir consommer NoopEmailSender sans le savoir.
    const sender: EmailSender = new NoopEmailSender();
    const result = sender.send(sampleMessage);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it("NoopEmailSender n'effectue aucun envoi reel (self-service email inactif au demarrage)", async () => {
    // Au demarrage (D7), aucun provider n'est branche : l'implementation par
    // defaut ne doit pas tenter d'envoi reseau. On verifie via un marqueur
    // expose par l'implementation (sentCount / lastMessage) que rien n'est
    // "vraiment" envoye, seulement consigne en memoire/log.
    const sender = new NoopEmailSender();
    await sender.send(sampleMessage);
    // Le contrat de NoopEmailSender expose un compteur des messages consignes,
    // sans qu'aucun appel reseau ne soit declenche.
    expect(sender.sentCount).toBe(1);
    expect(sender.lastMessage?.to).toBe(sampleMessage.to);
  });

  it("NoopEmailSender ne consigne jamais le mot de passe en clair (seulement le lien de reset)", async () => {
    // Defense en profondeur : le canal email transporte un lien avec token, pas
    // un secret en clair. On verifie que le message consigne ne contient pas de
    // motif de hash bcrypt ni un champ "password".
    const sender = new NoopEmailSender();
    await sender.send(sampleMessage);
    const serialized = JSON.stringify(sender.lastMessage ?? {});
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(serialized.toLowerCase()).not.toContain("passwordhash");
  });
});

/**
 * BrevoApiEmailSender — envoi via l'API HTTP Brevo (POST /v3/smtp/email, 443).
 *
 * POURQUOI cette impl en plus du SMTP : l'hebergeur (Scaleway) bloque les ports
 * SMTP sortants (25/465/587) au niveau reseau (anti-spam), donc SmtpEmailSender
 * timeout en prod meme avec UFW grand ouvert. L'API HTTP passe par le 443. On
 * mocke `fetch` : aucun appel reseau reel pendant les tests.
 */
describe("BrevoApiEmailSender (API HTTP Brevo, contournement blocage SMTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const cfg = {
    apiKey: "xkeysib-test-key",
    apiBase: "https://api.brevo.com/v3",
    from: "Vencor CRM <no-reply@vencor-crm.com>",
  };
  const msg: EmailMessage = {
    to: "user@example.test",
    subject: "Votre code de connexion",
    text: "123456",
    html: "<b>123456</b>",
  };

  it("parseSender gere 'email' seul et 'Nom <email>'", () => {
    expect(parseSender("no-reply@vencor-crm.com")).toEqual({
      email: "no-reply@vencor-crm.com",
    });
    expect(parseSender("Vencor CRM <no-reply@vencor-crm.com>")).toEqual({
      email: "no-reply@vencor-crm.com",
      name: "Vencor CRM",
    });
  });

  it("POST /smtp/email avec api-key + payload Brevo, resout si 2xx", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve(
        new Response(JSON.stringify({ messageId: "<x@smtp>" }), { status: 201 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender: EmailSender = new BrevoApiEmailSender(cfg);
    await expect(sender.send(msg)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const args = fetchMock.mock.calls[0];
    expect(args[0] as string).toBe("https://api.brevo.com/v3/smtp/email");
    const init = args[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe(
      "xkeysib-test-key",
    );
    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({
      email: "no-reply@vencor-crm.com",
      name: "Vencor CRM",
    });
    expect(body.to).toEqual([{ email: "user@example.test" }]);
    expect(body.subject).toBe("Votre code de connexion");
    expect(body.textContent).toBe("123456");
    expect(body.htmlContent).toBe("<b>123456</b>");
  });

  it("throw si l'API repond une erreur (401), le message ne contient pas la cle", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: "unauthorized", message: "Key not found" }),
          { status: 401 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender = new BrevoApiEmailSender(cfg);
    await expect(sender.send(msg)).rejects.toThrow(/Brevo API HTTP 401/);
    await expect(sender.send(msg)).rejects.not.toThrow(/xkeysib-test-key/);
  });

  it("omet htmlContent quand html est absent (texte seul)", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve(new Response("{}", { status: 201 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender = new BrevoApiEmailSender(cfg);
    await sender.send({ to: "u@x.test", subject: "s", text: "t" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.htmlContent).toBeUndefined();
    expect(body.textContent).toBe("t");
  });
});
