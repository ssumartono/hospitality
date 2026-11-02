import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
if (process.env.NODE_ENV === "production")
  throw Error("Integration tests are prohibited in production");
const adminUrl = new URL(
  process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
);
if (!["localhost", "127.0.0.1"].includes(adminUrl.hostname))
  throw Error("Local test runner requires localhost PostgreSQL");
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
try {
  if (
    !(await admin.query("SELECT 1 FROM pg_database WHERE datname='kost_test'"))
      .rowCount
  )
    await admin.query("CREATE DATABASE kost_test");
} finally {
  await admin.end();
}
adminUrl.pathname = "/kost_test";
process.env.MIGRATION_DATABASE_URL = adminUrl.href;
const appUrl = new URL(
  process.env.DATABASE_URL ??
    "postgres://kost_app:local-app-only@localhost:5432/kost",
);
appUrl.pathname = "/kost_test";
process.env.DATABASE_URL = appUrl.href;
const workerUrl = new URL(
  process.env.WORKER_DATABASE_URL ??
    "postgres://kost_worker:local-worker-only@localhost:5432/kost",
);
if (!["localhost", "127.0.0.1"].includes(workerUrl.hostname))
  throw Error("Local worker database required for tests");
workerUrl.pathname = "/kost_test";
process.env.WORKER_DATABASE_URL = workerUrl.href;
await import("./migrate.js");
const { provisionDevelopmentPlan } = await import("./development-plan.js");
await provisionDevelopmentPlan(true);
await import("./encrypt-outbox.js");
await import("./validate-security.js");
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.S3_ENDPOINT ?? "http://localhost:9000").hostname,
  )
)
  throw Error("Integration tests require local S3");
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "";
process.env.SMTP_PASSWORD = "";
process.env.SMTP_FROM = "noreply@kost.test";
process.env.S3_BUCKET = "kost-test-private";
process.env.CLAMD_PORT = "1";
await import("./storage-init.js");
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "tests/foundation.integration.test.ts",
    "tests/account-staff.integration.test.ts",
    "tests/inventory.integration.test.ts",
    "tests/pricing.integration.test.ts",
    "tests/allocation.integration.test.ts",
    "tests/booking.integration.test.ts",
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "test" } },
);
process.exitCode = result.status ?? 1;
