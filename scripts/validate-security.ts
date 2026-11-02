import "dotenv/config";
import pg from "pg";
const db = new pg.Client({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
});
await db.connect();
try {
  await db.query(
    "ALTER TABLE email_outbox VALIDATE CONSTRAINT no_plaintext_email_tokens",
  );
  const roles = await db.query(
    "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('kost_app','kost_worker')",
  );
  if (
    roles.rowCount !== 2 ||
    roles.rows.some((r) => r.rolsuper || r.rolbypassrls)
  )
    throw Error("Application/worker role cannot be superuser or bypass RLS");
  console.log(
    "Encrypted-only outbox constraint validated; application/worker roles restricted.",
  );
} finally {
  await db.end();
}
