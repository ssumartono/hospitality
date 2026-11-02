import "dotenv/config";
import pg from "pg";
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://kost_app:local-app-only@localhost:5432/kost",
  max: 10,
});
export async function transaction<T>(
  actor: string | null,
  organization: string | null,
  fn: (db: pg.PoolClient) => Promise<T>,
  connectionPool: pg.Pool = pool,
): Promise<T> {
  const db = await connectionPool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "SELECT set_config('app.actor_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.runtime_environment',$3,true)",
      [actor ?? "", organization ?? "", process.env.NODE_ENV ?? "development"],
    );
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
