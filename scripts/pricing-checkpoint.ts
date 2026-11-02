import "dotenv/config";
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const db = new pg.Client({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
});
await db.connect();
try {
  const previous = JSON.parse(
    await readFile(
      "project-docs/evidence/user-data-after-inventory.json",
      "utf8",
    ),
  );
  const cutoff = JSON.parse(
    await readFile("project-docs/evidence/inventory-verification.json", "utf8"),
  ).date;
  const snapshot: Record<string, unknown> = {},
    historicalSubset: Record<string, unknown> = {};
  for (const [table, columns] of [
    ["organizations", "id,name,slug,created_at"],
    ["properties", "id,organization_id,name,city,timezone,created_at"],
  ]) {
    for (const historic of [false, true]) {
      const r = await db.query(
        "SELECT " +
          columns +
          " FROM " +
          table +
          (historic ? " WHERE created_at<=$1" : "") +
          " ORDER BY id",
        historic ? [cutoff] : [],
      );
      (historic ? historicalSubset : snapshot)[table] = {
        count: r.rowCount,
        sha256: createHash("sha256")
          .update(JSON.stringify(r.rows))
          .digest("hex"),
      };
    }
  }
  const migrations = (
    await db.query(
      "SELECT name,applied_at FROM schema_migrations WHERE name LIKE '013%' OR name LIKE '014%'",
    )
  ).rows;
  const currentCreatedTimes = (
    await db.query(
      "SELECT 'organizations' AS entity,count(*)::int n,max(created_at) AS latest FROM organizations UNION ALL SELECT 'properties',count(*)::int,max(created_at) FROM properties",
    )
  ).rows;
  const historicalSubsetMatches =
    JSON.stringify(previous) === JSON.stringify(historicalSubset);
  if (!historicalSubsetMatches)
    throw Error(
      "Historical organization/property subset changed; inspect without resetting data",
    );
  const result = {
    recordedAt: new Date().toISOString(),
    cutoff,
    historicalSubsetMatches,
    previousCounts: Object.fromEntries(
      Object.entries(previous).map(([k, v]) => [
        k,
        (v as { count: number }).count,
      ]),
    ),
    snapshot,
    currentCreatedTimes,
    migrations,
    note: "Seluruh baris organisasi/properti checkpoint 0.3 cocok. Tambahan sesudah checkpoint dipertahankan; bukan overwrite fingerprint lama. Tidak ada fingerprint tepat sebelum migrasi pricing; waktu pembuatan tambahan mendahului migration013.",
  };
  await writeFile(
    "project-docs/evidence/user-data-pricing-checkpoint.json",
    JSON.stringify(result, null, 2),
  );
  console.log({
    historicalSubsetMatches,
    currentCounts: Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [
        k,
        (v as { count: number }).count,
      ]),
    ),
    latestCreate: currentCreatedTimes,
    firstPricingMigration: migrations[0],
  });
} finally {
  await db.end();
}
