import "dotenv/config";
import { pool, transaction } from "../src/server/db.js";
import { seal } from "../src/server/crypto.js";
let count = 0;
try {
  await transaction(null, null, async (db) => {
    const rows = await db.query(
      "SELECT id,user_id,token_hash,secret_token FROM email_outbox WHERE secret_token IS NOT NULL FOR UPDATE",
    );
    for (const row of rows.rows) {
      await db.query(
        "UPDATE email_outbox SET token_cipher=coalesce(token_cipher,$1),secret_token=NULL WHERE id=$2",
        [
          await seal(
            row.secret_token,
            "email:" + row.user_id + ":" + row.token_hash,
          ),
          row.id,
        ],
      );
      count++;
    }
  });
  console.log(
    "Encrypted legacy outbox rows: " + count + "; no token values logged.",
  );
} finally {
  await pool.end();
}
