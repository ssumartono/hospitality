import type pg from "pg";
import { digest } from "./security.js";
import { seal } from "./crypto.js";
export async function queueTokenEmail(
  db: pg.PoolClient,
  user: string,
  kind: "verify" | "reset",
  token: string,
) {
  const hash = digest(token);
  await db.query(
    "INSERT INTO email_outbox(user_id,kind,token_hash,token_cipher) VALUES($1,$2,$3,$4)",
    [user, kind, hash, await seal(token, "email:" + user + ":" + hash)],
  );
}
