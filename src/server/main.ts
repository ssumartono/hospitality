import "dotenv/config";
import { buildApp } from "./app.js";
import { pool } from "./db.js";
const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 3001) });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
