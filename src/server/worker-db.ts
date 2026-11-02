import "dotenv/config";
import pg from "pg";
import { transaction } from "./db.js";
export const workerPool = new pg.Pool({
  connectionString:
    process.env.WORKER_DATABASE_URL ??
    "postgres://kost_worker:local-worker-only@localhost:5432/kost",
  max: 4,
});
export function workerTransaction<T>(
  org: string | null,
  fn: (db: pg.PoolClient) => Promise<T>,
) {
  return transaction(null, org, fn, workerPool);
}
