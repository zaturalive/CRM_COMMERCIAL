import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config de test Vitest (frontend).
// Pourquoi : Vitest ne lit PAS les "paths" du tsconfig. Sans alias explicite,
// tous les imports "@/..." (ex. "@/lib/api" depuis RoleSwitcher.tsx) echouent a
// la resolution et ~24 fichiers de test tombent en cascade — alors que `tsc`,
// lui, resout via tsconfig et passe. On declare donc l'alias "@" -> ./src.
export default defineConfig({
  test: {
    // Defaut jsdom (les tests composant fixent deja `// @vitest-environment
    // jsdom` par fichier ; ce defaut couvre ceux qui ne le precisent pas).
    environment: "jsdom",
    globals: true,
    // Vitest ne doit voir QUE les tests unitaires colocalises dans src/. Les
    // specs E2E (tests/e2e/*.spec.ts) utilisent @playwright/test et ne doivent
    // PAS etre collectees par Vitest (sinon "did not expect
    // test.describe.configure()"). Elles tournent via Playwright (test:e2e).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  // Runtime JSX automatique (React 17+, comme Next en prod). Sans ca, esbuild
  // utilise le transform classique (React.createElement) et les tests JSX
  // cassent sur "ReferenceError: React is not defined".
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
