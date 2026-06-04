// POURQUOI : src/config/env.ts parse process.env au chargement du module et
// src/app.ts l'importe. Sans variables d'env, tout test touchant app.ts echoue
// en ZodError avant Prisma (cf. ADR-0009, prerequis baseline). On charge donc
// le .env local (non committe) avant l'execution des tests via setupFiles.
import { config } from "dotenv";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
import Module from "node:module";
import { readFileSync } from "node:fs";

config({ path: resolve(__dirname, "../.env") });

// Secret partage Google (SSO) pour les tests : valeur par defaut si le .env local
// ne la definit pas, afin que les tests de /api/auth/google puissent exercer le
// chemin de succes (env.GOOGLE_SSO_SHARED_SECRET est parse au chargement du module).
process.env.GOOGLE_SSO_SHARED_SECRET ||= "test-google-sso-shared-secret";

// POURQUOI : certains tests appellent require() au runtime sur un module source
// TypeScript (ex. tests/unit/demoDataSeedTarget.test.ts require
// "../../src/lib/passwordPolicy"). Le require natif de Node ne sait pas charger
// un .ts. On installe un loader require.extensions[".ts"] minimal et synchrone
// (transpile a la demande via esbuild deja present comme dep de vitest) au lieu
// d'un loader persistant global : il ne s'active que sur un require(".ts")
// effectif, n'intercepte aucun import ESM (gere par le runner Vitest) et ne
// laisse pas de boucle/handle ouvert qui ralentirait la suite complete.
const moduleExtensions = (Module as unknown as {
  _extensions: Record<string, (m: NodeModule, filename: string) => void>;
})._extensions;
if (!moduleExtensions[".ts"]) {
  moduleExtensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const { code } = transformSync(source, {
      loader: "ts",
      format: "cjs",
      target: "es2022",
      sourcefile: filename,
    });
    (module as unknown as { _compile: (c: string, f: string) => void })._compile(
      code,
      filename
    );
  };
}
