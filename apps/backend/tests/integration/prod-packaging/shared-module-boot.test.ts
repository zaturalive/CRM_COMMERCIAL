import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * R1-build — non-regression du chargement RUNTIME du module @crm/shared en prod.
 *
 * POURQUOI ce test (audit AUDIT-PREPROD-2026-06-02 C1, CRITICAL) :
 * `node dist/index.js` (CMD de l'image prod) plante au boot parce que
 * `apps/backend/src/services/devisLoader.ts:18` fait
 * `import { computeDevisTotal } from "@crm/shared/devis/computeTotal"`, et que
 * `packages/shared/package.json` expose `default: "./src/devis/computeTotal.ts"`
 * (du TypeScript brut). En prod, `node` resout donc un `.ts` et echoue :
 *   require('@crm/shared/devis/computeTotal') -> SyntaxError: Unexpected token 'export'
 * Le DEV ne le voit pas car il tourne sous tsx (transpile a la volee).
 *
 * POURQUOI un PROCESS NODE ENFANT et pas un require() direct :
 * tests/setup.ts installe volontairement un loader require.extensions[".ts"]
 * (esbuild) pour le runner Vitest. Un `require("@crm/shared/...")` execute DANS
 * ce test serait donc transpile et passerait au vert a tort, masquant le crash
 * prod. On relance un `node -e` SANS ce setup : c'est exactement ce que fait
 * `node dist/index.js`. C'est le pendant intra-conteneur du smoke test Docker
 * `scripts/ci/prod-boot-smoke.sh` (qui, lui, build + boote l'image complete).
 *
 * Contrat verifie (ROUGE tant que R1-build n'est pas livre) :
 *   - `require("@crm/shared/devis/computeTotal")` reussit en `node` nu ;
 *   - la cible resolue est un `.js` transpile, pas un `.ts` source ;
 *   - le module expose bien `computeDevisTotal` (la fonction que la prod appelle).
 *
 * Fix attendu cote R1 : repointer l'export `default` de @crm/shared vers
 * `./dist/devis/computeTotal.js` (le CJS deja transpile et present) et garantir
 * que ce dist est build/package avant le packaging prod.
 */

const backendRoot = path.resolve(__dirname, "../../..");
const SHARED_SUBPATH = "@crm/shared/devis/computeTotal";

/**
 * Lance `node -e <script>` depuis la racine backend, hors runner Vitest (donc
 * sans le loader .ts de tests/setup.ts), et renvoie le resultat brut.
 */
function runInPlainNode(script: string) {
  return spawnSync(process.execPath, ["-e", script], {
    cwd: backendRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("R1-build — boot prod : @crm/shared chargeable par node nu", () => {
  it("require('@crm/shared/devis/computeTotal') ne crashe pas en node (pas de tsx)", () => {
    const result = runInPlainNode(
      `require(${JSON.stringify(SHARED_SUBPATH)}); console.log("REQUIRE_OK");`
    );

    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    // Diagnostic explicite quand c'est rouge : on remonte l'erreur node telle
    // quelle (Unexpected token 'export' / Cannot find module / not exported).
    expect(
      result.status,
      `node require a echoue (regression C1 boot prod). Sortie:\n${combined}`
    ).toBe(0);
    expect(combined).toContain("REQUIRE_OK");
  });

  it("la cible resolue est un .js transpile, pas un .ts source", () => {
    const result = runInPlainNode(
      `process.stdout.write(require.resolve(${JSON.stringify(SHARED_SUBPATH)}));`
    );

    const resolved = (result.stdout ?? "").trim();
    const combined = `${resolved}${result.stderr ?? ""}`;

    expect(
      result.status,
      `require.resolve a echoue. Sortie:\n${combined}`
    ).toBe(0);
    // node ne sait pas charger un .ts en prod -> la cible publique doit etre .js.
    expect(resolved.endsWith(".ts")).toBe(false);
    expect(resolved.endsWith(".js")).toBe(true);
  });

  it("le module expose computeDevisTotal (la fonction consommee par devisLoader)", () => {
    const result = runInPlainNode(
      `const m = require(${JSON.stringify(SHARED_SUBPATH)});` +
        `process.stdout.write(typeof m.computeDevisTotal);`
    );

    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(
      result.status,
      `chargement du module a echoue. Sortie:\n${combined}`
    ).toBe(0);
    expect((result.stdout ?? "").trim()).toBe("function");
  });
});
