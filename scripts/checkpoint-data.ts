import "dotenv/config";
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const mode = process.argv[2],
  phase = process.argv[3];
if (!["before", "after"].includes(mode) || !/^[-a-z0-9]+$/.test(phase ?? ""))
  throw Error("Expected before|after phase");
const url = new URL(
  process.env.MIGRATION_DATABASE_URL ??
    "postgres://kost:local-migration-only@localhost:5432/kost",
);
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/kost"
)
  throw Error("Local development database only");
const db = new pg.Client({ connectionString: url.href });
await db.connect();
try {
  const snapshot: Record<string, unknown> = {};
  for (const table of [
    "organizations",
    "properties",
    "rooms",
    "room_types",
    "room_type_versions",
    "rate_policy_versions",
    "policy_type_rates",
    "policy_room_rates",
    "pricing_quotes",
  ]) {
    const rows = (
      await db.query("SELECT * FROM " + table + " t ORDER BY to_jsonb(t)::text")
    ).rows;
    snapshot[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  const path = "project-docs/evidence/user-data-" + phase + "-";
  if (mode === "after") {
    const before = JSON.parse(await readFile(path + "before.json", "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(snapshot))
      throw Error(
        "Domain fingerprint changed; preserve both states and inspect, do not reset",
      );
  }
  await writeFile(path + mode + ".json", JSON.stringify(snapshot, null, 2));
  console.log(
    "Domain checkpoint " +
      phase +
      " " +
      mode +
      ": " +
      (mode === "after" ? "MATCH" : "recorded") +
      " (counts/hashes only)",
  );
} finally {
  await db.end();
}
