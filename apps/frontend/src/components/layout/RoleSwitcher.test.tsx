// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render } from "@testing-library/react";

/**
 * EP15-S05 AC2 — Le RoleSwitcher n'est pas rendu quand
 * NEXT_PUBLIC_DEMO_MODE !== "true".
 *
 * Reference : docs/product/stories/EP15-S05.md (AC2 + checklist securite
 * "NEXT_PUBLIC_DEMO_MODE non 'true' -> RoleSwitcher absent du DOM").
 *
 * Etat verifie (audit 2026-06-01) :
 * RoleSwitcher.tsx:12 lit `const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE
 * === "true"` et `if (!DEMO_MODE || !session) return null`. Les vars
 * NEXT_PUBLIC_* sont inline au build (cf. story Notes techniques), donc la
 * valeur prod est figee au build de l'image. En test, on simule la valeur via
 * process.env avant l'import du composant (le module lit la var au chargement).
 *
 * On mocke next-auth/react pour fournir une session authentifiee : ainsi
 * l'absence du switcher provient de DEMO_MODE off, pas de l'absence de session.
 *
 * Subtilite : DEMO_MODE est lu une seule fois a l'evaluation du module. On pose
 * donc NEXT_PUBLIC_DEMO_MODE PUIS on importe RoleSwitcher dynamiquement, avec un
 * vi.resetModules() entre chaque cas pour re-evaluer la constante.
 */

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { role: "ADMIN", user: { name: "Test" } },
    status: "authenticated",
    update: vi.fn(),
  }),
}));

// Les imports indirects du composant (apiFetch, cn) sont neutres au rendu
// initial ; on les laisse tels quels. Si l'environnement front ne resout pas un
// import (deps absentes), ce fichier est hors du gate de test backend.

const ORIGINAL_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE;

beforeEach(() => {
  vi.resetModules();
});

async function renderWithDemoMode(value: string | undefined) {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  } else {
    process.env.NEXT_PUBLIC_DEMO_MODE = value;
  }
  vi.resetModules();
  const { RoleSwitcher } = await import("./RoleSwitcher");
  return render(<RoleSwitcher />);
}

describe("EP15-S05 AC2 — RoleSwitcher absent hors DEMO_MODE", () => {
  it("NEXT_PUBLIC_DEMO_MODE non defini -> aucun noeud role-switcher dans le DOM", async () => {
    const { queryByTestId, container } = await renderWithDemoMode(undefined);
    expect(queryByTestId("role-switcher")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("NEXT_PUBLIC_DEMO_MODE=false -> RoleSwitcher absent du DOM", async () => {
    const { queryByTestId } = await renderWithDemoMode("false");
    expect(queryByTestId("role-switcher")).toBeNull();
    expect(queryByTestId("role-switch-admin")).toBeNull();
    expect(queryByTestId("role-switch-commercial")).toBeNull();
  });

  it("NEXT_PUBLIC_DEMO_MODE=0 (valeur non 'true') -> RoleSwitcher absent", async () => {
    // POURQUOI : seule la chaine exacte "true" active le switcher ; toute autre
    // valeur (build prod) le laisse absent du DOM.
    const { queryByTestId } = await renderWithDemoMode("0");
    expect(queryByTestId("role-switcher")).toBeNull();
  });

  it("sanity : NEXT_PUBLIC_DEMO_MODE=true -> le switcher est rendu (session presente)", async () => {
    const { queryByTestId } = await renderWithDemoMode("true");
    expect(queryByTestId("role-switcher")).not.toBeNull();
  });
});

afterAll(() => {
  if (ORIGINAL_DEMO_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  } else {
    process.env.NEXT_PUBLIC_DEMO_MODE = ORIGINAL_DEMO_MODE;
  }
});
