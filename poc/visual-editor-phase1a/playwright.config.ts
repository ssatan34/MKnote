import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.MKN_PHASE1A_E2E_PORT ?? 4173);
if (!Number.isInteger(e2ePort) || e2ePort < 1024 || e2ePort > 65535) {
  throw new Error(`invalid MKN_PHASE1A_E2E_PORT: ${e2ePort}`);
}
const e2eUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: true,
  reporter: [["line"], ["json", { outputFile: "artifacts/e2e-results.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    channel: "msedge",
 baseURL: e2eUrl,
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
 command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`,
 url: e2eUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
