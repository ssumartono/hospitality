import type pg from "pg";
import { createHash } from "node:crypto";
import { DomainError } from "./security.js";
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export async function idempotent<T>(
  db: pg.PoolClient,
  organization: string,
  actor: string,
  command: string,
  key: string,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new DomainError(422, "VALIDATION_ERROR");
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    JSON.stringify([organization, actor, command, key]),
  ]);
  const previous = await db.query(
    "SELECT payload_hash,result FROM idempotency_requests WHERE organization_id=$1 AND actor_id=$2 AND command=$3 AND key=$4",
    [organization, actor, command, key],
  );
  if (previous.rowCount) {
    if (previous.rows[0].payload_hash !== hash)
      throw new DomainError(409, "IDEMPOTENCY_MISMATCH");
    return previous.rows[0].result as T;
  }
  const result = await execute();
  await db.query(
    "INSERT INTO idempotency_requests(organization_id,actor_id,command,key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)",
    [organization, actor, command, key, hash, JSON.stringify(result)],
  );
  return result;
}
