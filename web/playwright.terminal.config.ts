import { defineConfig, devices } from "@playwright/test";

/**
 * Live-terminal end-to-end tests: a real FastAPI service on a real PostgreSQL database,
 * seeded with the SYNTHETIC fixture issuer through the real ingest pipeline (no network,
 * no paid services), and the production Next.js build in front of it.
 */
const WEB = Number(process.env.E2E_WEB_PORT ?? 3200);
const API = Number(process.env.E2E_API_PORT ?? 8100);
const DB = process.env.E2E_DATABASE_URL ?? "postgresql+psycopg://postgres@127.0.0.1:5433/aurelis_e2e";

export default defineConfig({
  testDir: "./e2e/terminal",
  timeout: 30_000,
  reporter: [["list"]],
  globalSetup: "./e2e/terminal/seed.ts",
  use: {
    baseURL: `http://localhost:${WEB}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `uv run aurelis-api serve --port ${API}`,
      cwd: "../api",
      url: `http://127.0.0.1:${API}/v1/health`,
      env: { AURELIS_DATABASE_URL: DB },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx next start --port ${WEB}`,
      port: WEB,
      env: { AURELIS_API_URL: `http://127.0.0.1:${API}` },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});

export const E2E = { API, DB };
