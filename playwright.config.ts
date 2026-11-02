import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    channel: "chromium",
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx scripts/e2e-server.ts",
      url: "http://127.0.0.1:3002/api/v1/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        DATABASE_URL:
          "postgres://kost_app:local-app-only@localhost:5432/kost_e2e",
        APP_ORIGIN: "http://localhost:4173",
        WORKER_DATABASE_URL:
          "postgres://kost_worker:local-worker-only@localhost:5432/kost_e2e",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        SMTP_FROM: "noreply@kost.test",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:3002" },
    },
  ],
});
