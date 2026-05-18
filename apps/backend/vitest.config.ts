import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Tests isoles : un worker (evite les conflits DB sur le seed)
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
