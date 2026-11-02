import { workerPool } from "../src/server/worker-db.js";
import { buildApp } from "../src/server/app.js";
import { deliverOne } from "../src/server/worker.js";
import { pool } from "../src/server/db.js";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.DATABASE_URL?.endsWith("/kost_e2e")
)
  throw Error("E2E server requires isolated database");
const app = await buildApp({ testRateLimitMultiplier: 20 });
await app.listen({ host: "127.0.0.1", port: 3002 });
let delivering = false;
const timer = setInterval(async () => {
  if (delivering) return;
  delivering = true;
  try {
    await deliverOne();
  } finally {
    delivering = false;
  }
}, 300);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    await pool.end();
    await workerPool.end();
    process.exit(0);
  });
