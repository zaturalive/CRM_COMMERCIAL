import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — tests E2E lances dans le container dedie
 * (cf docker/Dockerfile.playwright + docker/docker-compose.e2e.yml).
 *
 * BASE_URL :
 * - Dans le container E2E (network_mode: host) : http://localhost:3301
 * - En local sur l'hote (si on run `npx playwright test` direct) : idem 3301
 *
 * MAJ 2026-05-22 : port frontend passe a 3301 (conflit autofront sur 3300).
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3301";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
