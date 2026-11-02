import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { z } from "zod";
export async function provisionDevelopmentPlan(confirmDevelopment = false) {
  if (!confirmDevelopment || process.env.NODE_ENV === "production")
    throw Error("Explicit nonproduction confirmation required");
  const url = new URL(
    process.env.MIGRATION_DATABASE_URL ??
      "postgres://kost:local-migration-only@localhost:5432/kost",
  );
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["/kost", "/kost_test", "/kost_e2e"].includes(url.pathname)
  )
    throw Error("Development fixture requires known local database");
  const fixture = z
    .object({
      fixture: z.literal("TEST_ONLY_NOT_PRODUCTION"),
      code: z.string(),
      label: z.string(),
      roomLimit: z.number().int().positive(),
      propertyLimit: z.number().int().positive(),
      staffLimit: z.number().int().positive(),
      priceIdr: z.null(),
    })
    .parse(
      JSON.parse(
        await readFile("fixtures/development-plan.TEST_ONLY.json", "utf8"),
      ),
    );
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query("BEGIN");
    const p =
      (
        await db.query(
          "INSERT INTO saas_plans(code,label,kind,room_limit,property_limit,staff_limit,price_idr) VALUES($1,$2,'development',$3,$4,$5,NULL) ON CONFLICT(code) DO NOTHING RETURNING id",
          [
            fixture.code,
            fixture.label,
            fixture.roomLimit,
            fixture.propertyLimit,
            fixture.staffLimit,
          ],
        )
      ).rows[0] ??
      (
        await db.query("SELECT id FROM saas_plans WHERE code=$1", [
          fixture.code,
        ])
      ).rows[0];
    await db.query(
      "INSERT INTO deployment_plan_defaults(id,plan_id,trial_days) VALUES(true,$1,NULL) ON CONFLICT(id) DO NOTHING",
      [p.id],
    );
    const assigned = await db.query(
      "INSERT INTO organization_entitlements(organization_id,plan_id,plan_kind,room_limit,property_limit,staff_limit,state) SELECT id,$1,'development',$2,$3,$4,'trial' FROM organizations ON CONFLICT(organization_id) DO NOTHING RETURNING organization_id",
      [p.id, fixture.roomLimit, fixture.propertyLimit, fixture.staffLimit],
    );
    for (const row of assigned.rows)
      await db.query(
        "INSERT INTO entitlement_events(organization_id,event,source) VALUES($1,'initial_local_plan','development_fixture')",
        [row.organization_id],
      );
    await db.query("COMMIT");
    console.log(
      "TEST_ONLY development plan configured; new assignments: " +
        assigned.rowCount +
        "; existing entitlements preserved.",
    );
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}
if (process.argv[1]?.endsWith("development-plan.ts"))
  await provisionDevelopmentPlan(
    process.argv.includes("--confirm-development"),
  );
