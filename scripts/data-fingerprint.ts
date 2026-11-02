import "dotenv/config";
import pg from "pg";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const db = new pg.Client({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
});
await db.connect();
try {
  const snapshot: Record<string, { count: number; sha256: string }> = {};
  for (const [table, columns] of [
    ["organizations", "id,name,slug,created_at"],
    ["properties", "id,organization_id,name,city,timezone,created_at"],
  ]) {
    const rows = (
      await db.query("SELECT " + columns + " FROM " + table + " ORDER BY id")
    ).rows;
    snapshot[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  const mode = process.argv[2] ?? "before";
  const phase = process.argv[3] ?? "security";
  if (!["security", "inventory"].includes(phase))
    throw Error("Unknown checkpoint phase");
  if (!["before", "after"].includes(mode)) throw Error("Expected before/after");
  if (mode === "after") {
    const before = JSON.parse(
      await readFile(
        "project-docs/evidence/user-data-before-" + phase + ".json",
        "utf8",
      ),
    );
    if (JSON.stringify(before) !== JSON.stringify(snapshot))
      throw Error("User organization/property fingerprint changed");
  }
  await mkdir("project-docs/evidence", { recursive: true });
  await writeFile(
    "project-docs/evidence/user-data-" + mode + "-" + phase + ".json",
    JSON.stringify(snapshot, null, 2),
  );
  console.log(
    "Organization/property preservation " +
      mode +
      ": " +
      (mode === "after" ? "MATCH" : "recorded") +
      " (counts/hashes only)",
  );
} finally {
  await db.end();
}
