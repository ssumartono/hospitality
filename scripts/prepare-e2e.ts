import "dotenv/config";
import pg from "pg";
if (process.env.NODE_ENV === "production") throw Error("No production E2E");
const url = new URL(
  process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local DB only");
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
try {
  if (
    !(await admin.query("SELECT 1 FROM pg_database WHERE datname='kost_e2e'"))
      .rowCount
  )
    await admin.query("CREATE DATABASE kost_e2e");
} finally {
  await admin.end();
}
url.pathname = "/kost_e2e";
process.env.MIGRATION_DATABASE_URL = url.href;
await import("./migrate.js");
const { provisionDevelopmentPlan } = await import("./development-plan.js");
await provisionDevelopmentPlan(true);

process.env.DATABASE_URL =
  "postgres://kost_app:local-app-only@localhost:5432/kost_e2e";
await import("./encrypt-outbox.js");
await import("./validate-security.js");
