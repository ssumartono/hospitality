import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const db = new pg.Client({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
});
await db.connect();
try {
  await db.query("SELECT pg_advisory_lock(430011)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())",
  );
  for (const file of (await readdir("db/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("db/migrations/" + file, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const prior = await db.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [file],
    );
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== hash)
        throw Error("Migration checksum mismatch: " + file);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [file, hash],
      );
      await db.query("COMMIT");
      console.log("Applied " + file);
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await db.query("SELECT pg_advisory_unlock(430011)");
  await db.end();
}
