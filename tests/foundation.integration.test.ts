import { open } from "../src/server/crypto.js";
import { workerPool } from "../src/server/worker-db.js";
import pg from "pg";
import { idempotent } from "../src/server/idempotency.js";
import { readObject } from "../src/server/storage.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/server/app.js";
import { pool, transaction } from "../src/server/db.js";
import { deliverOne } from "../src/server/worker.js";
const app = await buildApp();
const origin = "http://localhost:5173";
after(async () => {
  await app.close();
  await pool.end();
  await workerPool.end();
});
async function readEmailToken(email: string, kind: string) {
  const row = (
    await pool.query(
      "SELECT e.token_cipher,e.user_id,e.token_hash,e.secret_token FROM email_outbox e JOIN users u ON u.id=e.user_id WHERE u.email=$1 AND e.kind=$2 ORDER BY e.available_at DESC LIMIT 1",
      [email, kind],
    )
  ).rows[0];
  assert.equal(row.secret_token, null);
  return open(row.token_cipher, "email:" + row.user_id + ":" + row.token_hash);
}
let registration = 0;
async function account() {
  const email = "test-" + randomUUID() + "@example.test";
  const password = "Synthetic-password-123";
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "10.1.0." + ++registration,
    headers: { origin },
    payload: { email, password },
  });
  assert.equal(r.statusCode, 202);
  const tokenValue = await readEmailToken(email, "verify");
  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verify-email",
    headers: { origin },
    payload: { token: tokenValue },
  });
  assert.equal(r.statusCode, 200);
  const reused = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verify-email",
    headers: { origin },
    payload: { token: tokenValue },
  });
  assert.equal(reused.statusCode, 422);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email, password },
  });
  assert.equal(r.statusCode, 200);
  const cookie = r.cookies[0].value;
  return {
    headers: {
      origin,
      cookie: "session=" + cookie,
      "x-csrf-token": r.json().csrfToken,
    },
    email,
  };
}
test("foundation API: real persistence, tenant denial, CSRF, token reuse and logout", async () => {
  const a = await account(),
    b = await account();
  const bOrg = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: b.headers,
    payload: { name: "Synthetic B", slug: "org-" + randomUUID() },
  });
  assert.equal(bOrg.statusCode, 201);
  const slug = "org-" + randomUUID();
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: a.headers,
    payload: { name: "Synthetic A", slug },
  });
  assert.equal(r.statusCode, 201);
  const org = r.json().id;
  r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations/" + org + "/properties",
    headers: a.headers,
    payload: {
      name: "Synthetic Palembang",
      city: "Palembang",
      timezone: "Asia/Jakarta",
    },
  });
  assert.equal(r.statusCode, 201);
  r = await app.inject({
    url: "/api/v1/organizations/" + org + "/properties",
    headers: a.headers,
  });
  assert.equal(r.json().items.length, 1);
  r = await app.inject({
    url: "/api/v1/organizations/" + org + "/properties",
    headers: b.headers,
  });
  assert.equal(r.statusCode, 404);
  r = await app.inject({ url: "/api/v1/organizations", headers: b.headers });
  assert.equal(r.json().items.length, 1);
  assert.equal(r.json().items[0].id, bOrg.json().id);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: { ...a.headers, "x-csrf-token": "wrong" },
    payload: { name: "Bad", slug: "bad" },
  });
  assert.equal(r.statusCode, 403);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: a.headers,
  });
  assert.equal(r.statusCode, 200);
  r = await app.inject({ url: "/api/v1/auth/session", headers: a.headers });
  assert.equal(r.statusCode, 401);
});
test("database role cannot bypass RLS and unscoped tenant queries return no data", async () => {
  const r = await pool.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.equal(r.rows[0].rolsuper, false);
  assert.equal(r.rows[0].rolbypassrls, false);
  await transaction(null, null, async (db) => {
    assert.equal((await db.query("SELECT id FROM properties")).rowCount, 0);
    assert.equal((await db.query("SELECT id FROM organizations")).rowCount, 0);
  });
});
test("SMTP outbox delivers to local sink and does not claim production delivery", async () => {
  const email = "mail-" + randomUUID() + "@example.test";
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "10.2.0.1",
    headers: { origin },
    payload: { email, password: "Synthetic-password-123" },
  });
  assert.equal(await deliverOne(), true);
  const r = await pool.query(
    "SELECT count(*)::int AS n FROM email_outbox WHERE sent_at IS NOT NULL AND secret_token IS NULL",
  );
  assert.ok(r.rows[0].n > 0);
});

async function ownedOrganization() {
  const a = await account();
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: a.headers,
    payload: { name: "Synthetic foundation", slug: "org-" + randomUUID() },
  });
  assert.equal(r.statusCode, 201);
  const u = await pool.query("SELECT id FROM users WHERE email=$1", [a.email]);
  return { ...a, actor: u.rows[0].id as string, org: r.json().id as string };
}
test("idempotency serializes two database connections and rolls back faulted mutations", async () => {
  const a = await ownedOrganization(),
    key = randomUUID();
  let executes = 0;
  const invoke = (payload: unknown) =>
    transaction(a.actor, a.org, (db) =>
      idempotent(db, a.org, a.actor, "test.command", key, payload, async () => {
        executes++;
        await db.query(
          "INSERT INTO audit_logs(organization_id,actor_id,action) VALUES($1,$2,'synthetic.idempotent')",
          [a.org, a.actor],
        );
        await new Promise((r) => setTimeout(r, 30));
        return { id: randomUUID() };
      }),
    );
  const [one, two] = await Promise.all([
    invoke({ a: 1, b: 2 }),
    invoke({ b: 2, a: 1 }),
  ]);
  assert.deepEqual(one, two);
  assert.equal(executes, 1);
  await assert.rejects(() => invoke({ a: 2 }), {
    code: "IDEMPOTENCY_MISMATCH",
  });
  await assert.rejects(() =>
    transaction(a.actor, a.org, (db) =>
      idempotent(
        db,
        a.org,
        a.actor,
        "test.failure",
        randomUUID(),
        {},
        async () => {
          await db.query(
            "INSERT INTO audit_logs(organization_id,actor_id,action) VALUES($1,$2,'synthetic.rollback')",
            [a.org, a.actor],
          );
          throw Error("injected failure");
        },
      ),
    ),
  );
  await transaction(a.actor, a.org, async (db) => {
    assert.equal(
      (
        await db.query(
          "SELECT id FROM audit_logs WHERE action='synthetic.rollback'",
        )
      ).rowCount,
      0,
    );
  });
});
test("private S3 files stay quarantined when scanner unavailable and deny anonymous/cross-tenant downloads", async () => {
  const a = await ownedOrganization();
  const boundary = "KostTestBoundary";
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
  const payload = Buffer.concat([
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n',
    ),
    bytes,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations/" + a.org + "/files",
    headers: {
      ...a.headers,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
  assert.equal(r.statusCode, 201, r.body);
  const id = r.json().id;
  assert.equal(r.json().state, "quarantined");
  assert.deepEqual(await readObject(a.org + "/" + id), bytes);
  r = await app.inject({
    url: "/api/v1/organizations/" + a.org + "/files/" + id + "/download",
    headers: a.headers,
  });
  assert.equal(r.statusCode, 423);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/organizations/" + a.org + "/files/" + id + "/scan",
    headers: a.headers,
    payload: {},
  });
  assert.equal(r.statusCode, 503);
  r = await app.inject({
    url: "/api/v1/organizations/" + a.org + "/files/" + id + "/download",
    headers: a.headers,
  });
  assert.equal(r.statusCode, 423);
  const bOrg = randomUUID();
  r = await app.inject({
    url: "/api/v1/organizations/" + bOrg + "/files/" + id + "/download",
    headers: a.headers,
  });
  assert.equal(r.statusCode, 404);
  const anonymous = await fetch(
    (process.env.S3_ENDPOINT ?? "http://localhost:9000") +
      "/" +
      process.env.S3_BUCKET +
      "/" +
      a.org +
      "/" +
      id,
  );
  assert.equal(anonymous.status, 403);
});

test("password reset is single-use, revokes sessions and never logs the user in", async () => {
  const a = await account();
  const forgot = await app.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    headers: { origin },
    payload: { email: a.email },
  });
  assert.equal(forgot.statusCode, 202);
  const token = await readEmailToken(a.email, "reset");
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/reset-password",
    headers: { origin },
    payload: { token, password: "Updated-synthetic-123" },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.cookies.length, 0);
  r = await app.inject({ url: "/api/v1/auth/session", headers: a.headers });
  assert.equal(r.statusCode, 401);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/reset-password",
    headers: { origin },
    payload: { token, password: "Updated-synthetic-123" },
  });
  assert.equal(r.statusCode, 422);
  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "10.3.0.1",
    headers: { origin },
    payload: { email: a.email, password: "Updated-synthetic-123" },
  });
  assert.equal(r.statusCode, 200);
});

test("database protects last Owner even when two revocations race", async () => {
  const a = await ownedOrganization();
  const url = process.env.MIGRATION_DATABASE_URL!;
  assert.equal(new URL(url).pathname, "/kost_test");
  const admin = new pg.Pool({ connectionString: url, max: 2 });
  try {
    const owner = (
      await admin.query(
        "SELECT id FROM memberships WHERE organization_id=$1 AND role='Owner'",
        [a.org],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        admin.query("UPDATE memberships SET revoked_at=now() WHERE id=$1", [
          owner,
        ]),
      { code: "23514" },
    );
    const other = (
      await admin.query("SELECT id FROM users WHERE id<>$1 LIMIT 1", [a.actor])
    ).rows[0].id;
    const second = (
      await admin.query(
        "WITH ctx AS (SELECT set_config('app.actor_id',$3,false),set_config('app.organization_id',$1,false),set_config('app.runtime_environment','test',false)) INSERT INTO memberships(organization_id,user_id,role) SELECT $1::uuid,$2::uuid,'Owner' FROM ctx RETURNING id",
        [a.org, other, a.actor],
      )
    ).rows[0].id;
    const clients = await Promise.all([admin.connect(), admin.connect()]);
    try {
      const attempts = await Promise.allSettled(
        clients.map(async (db, index) => {
          await db.query("BEGIN");
          try {
            await db.query(
              "UPDATE memberships SET revoked_at=now() WHERE id=$1",
              [index === 0 ? owner : second],
            );
            await db.query("COMMIT");
          } catch (e) {
            await db.query("ROLLBACK");
            throw e;
          }
        }),
      );
      assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((x) => x.status === "rejected").length, 1);
      assert.equal(
        (
          await clients[0].query(
            "SELECT id FROM memberships WHERE organization_id=$1 AND role='Owner' AND revoked_at IS NULL",
            [a.org],
          )
        ).rowCount,
        1,
      );
    } finally {
      clients.forEach((c) => c.release());
    }
  } finally {
    await admin.end();
  }
});
