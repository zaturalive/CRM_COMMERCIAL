import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Charge le .env local avant tout test (cf. tests/setup.ts, ADR-0009 prerequis).
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Tests isoles : un worker (evite les conflits DB sur le seed)
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
