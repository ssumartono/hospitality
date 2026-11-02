import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/server/app.js";
import { pool, transaction } from "../src/server/db.js";
import { workerPool } from "../src/server/worker-db.js";
import { open } from "../src/server/crypto.js";
import { totp } from "../src/server/mfa.js";
import { deliverInvitationOne } from "../src/server/worker.js";
const app = await buildApp(),
  origin = "http://localhost:5173",
  password = "Synthetic-password-123";
const adminUrl = process.env.MIGRATION_DATABASE_URL!;
assert.equal(new URL(adminUrl).pathname, "/kost_test");
const admin = new pg.Pool({ connectionString: adminUrl, max: 4 });
let call = 0;
const request = (
  method: string,
  url: string,
  headers: Record<string, string> = {},
  payload?: unknown,
) =>
  app.inject({
    method: method as "GET" | "POST",
    url,
    remoteAddress:
      "10.20." + Math.floor(++call / 240) + "." + ((call % 240) + 1),
    headers: { "content-type": "application/json", origin, ...headers },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
after(async () => {
  await app.close();
  await pool.end();
  await workerPool.end();
  await admin.end();
});
type Account = {
  email: string;
  userId: string;
  headers: Record<string, string>;
};
async function account(verified = true): Promise<Account> {
  const email = "staff-" + randomUUID() + "@example.test";
  assert.equal(
    (await request("POST", "/api/v1/auth/register", {}, { email, password }))
      .statusCode,
    202,
  );
  const row = (
    await pool.query(
      "SELECT e.*,u.id AS actor FROM email_outbox e JOIN users u ON u.id=e.user_id WHERE u.email=$1",
      [email],
    )
  ).rows[0];
  assert.equal(row.secret_token, null);
  if (verified) {
    const token = await open(
      row.token_cipher,
      "email:" + row.user_id + ":" + row.token_hash,
    );
    assert.equal(
      (await request("POST", "/api/v1/auth/verify-email", {}, { token }))
        .statusCode,
      200,
    );
  }
  const login = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email, password },
  );
  assert.equal(login.statusCode, 200);
  return {
    email,
    userId: row.actor,
    headers: {
      cookie: "session=" + login.cookies[0].value,
      "x-csrf-token": login.json().csrfToken,
    },
  };
}
async function organization(owner: Account) {
  const r = await request("POST", "/api/v1/organizations", owner.headers, {
    name: "Synthetic security",
    slug: "security-" + randomUUID(),
  });
  assert.equal(r.statusCode, 201);
  return r.json().id as string;
}
async function property(
  owner: Account,
  org: string,
  name = "Synthetic location",
) {
  const r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/properties",
    owner.headers,
    { name, city: "Palembang", timezone: "Asia/Jakarta" },
  );
  assert.equal(r.statusCode, 201);
  return r.json().id as string;
}
async function reauth(
  owner: Account,
  action: string,
  org?: string,
  target?: string,
  mfaCode?: string,
) {
  const r = await request("POST", "/api/v1/auth/reauth", owner.headers, {
    password,
    action,
    ...(org ? { organizationId: org } : {}),
    ...(target ? { targetId: target } : {}),
    ...(mfaCode ? { mfaCode } : {}),
  });
  assert.equal(r.statusCode, 200);
  return r.json().reauthToken as string;
}
async function invite(
  owner: Account,
  org: string,
  email: string,
  role: string,
  propertyIds: string[],
) {
  const token = await reauth(owner, "staff.invite", org);
  const key = randomUUID();
  const body = { email, role, propertyIds };
  const headers = {
    ...owner.headers,
    "idempotency-key": key,
    "x-reauth-token": token,
  };
  const r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations",
    headers,
    body,
  );
  assert.equal(r.statusCode, 201);
  const repeat = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations",
    headers,
    body,
  );
  assert.equal(repeat.statusCode, 201);
  assert.deepEqual(repeat.json(), r.json());
  const id = r.json().id as string;
  const row = (
    await admin.query(
      "SELECT token_cipher FROM invitation_email_outbox WHERE organization_id=$1 AND invitation_id=$2",
      [org, id],
    )
  ).rows[0];
  assert.ok(row.token_cipher.startsWith("v1:"));
  return {
    id,
    token: await open(row.token_cipher, "invitation:" + org + ":" + id),
  };
}
async function accept(
  recipient: Account,
  org: string,
  i: { id: string; token: string },
  key = randomUUID(),
) {
  return request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations/" + i.id + "/accept",
    { ...recipient.headers, "idempotency-key": key },
    { token: i.token },
  );
}

test("MFA enrollment, anti-replay, challenge gating, recovery and disable preserve account security", async () => {
  const a = await account();
  const other = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  const otherHeaders = {
    cookie: "session=" + other.cookies[0].value,
    "x-csrf-token": other.json().csrfToken,
  };
  assert.equal(
    (await request("POST", "/api/v1/auth/mfa/enroll", a.headers, {}))
      .statusCode,
    403,
  );
  const reauthToken = await reauth(a, "mfa.enroll");
  const enroll = await request(
    "POST",
    "/api/v1/auth/mfa/enroll",
    { ...a.headers, "x-reauth-token": reauthToken },
    {},
  );
  assert.equal(enroll.statusCode, 200);
  const setup = enroll.json();
  assert.ok(setup.otpauthUri.startsWith("otpauth://totp/"));
  assert.equal(
    (
      await request(
        "POST",
        "/api/v1/auth/mfa/enroll",
        { ...a.headers, "x-reauth-token": reauthToken },
        {},
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request("POST", "/api/v1/auth/mfa/verify", a.headers, {
        challengeId: setup.challengeId,
        code: "invalid-code",
      })
    ).statusCode,
    401,
  );
  const code = totp(setup.secret).generate();
  const confirmed = await request(
    "POST",
    "/api/v1/auth/mfa/verify",
    a.headers,
    { challengeId: setup.challengeId, code },
  );
  assert.equal(confirmed.statusCode, 200);
  const recovery = confirmed.json().recoveryCodes as string[];
  assert.equal(recovery.length, 10);
  const method = await transaction(a.userId, null, (db) =>
    db.query(
      "SELECT secret_cipher,pending_secret_cipher FROM mfa_methods WHERE user_id=$1",
      [a.userId],
    ),
  );
  assert.ok(!method.rows[0].secret_cipher.includes(setup.secret));
  assert.equal(method.rows[0].pending_secret_cipher, null);
  assert.equal(
    (await request("GET", "/api/v1/auth/session", otherHeaders)).statusCode,
    401,
  );
  const login = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().mfaRequired, true);
  const pending = {
    cookie: "session=" + login.cookies[0].value,
    "x-csrf-token": login.json().csrfToken,
  };
  const blocked = await request("GET", "/api/v1/organizations", pending);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().error.code, "MFA_REQUIRED");
  assert.equal(
    (
      await request("POST", "/api/v1/auth/mfa/verify", pending, {
        challengeId: login.json().challengeId,
        code,
      })
    ).statusCode,
    401,
  );
  const verified = await request("POST", "/api/v1/auth/mfa/verify", pending, {
    challengeId: login.json().challengeId,
    code: recovery[0],
  });
  assert.equal(verified.statusCode, 200);
  assert.notEqual(verified.cookies[0].value, login.cookies[0].value);
  const active = {
    cookie: "session=" + verified.cookies[0].value,
    "x-csrf-token": verified.json().csrfToken,
  };
  assert.equal(
    (await request("GET", "/api/v1/auth/session", pending)).statusCode,
    401,
  );
  assert.equal(
    (await request("GET", "/api/v1/organizations", active)).statusCode,
    200,
  );
  assert.equal(
    (
      await request("POST", "/api/v1/auth/reauth", active, {
        password,
        action: "mfa.disable",
        mfaCode: recovery[0],
      })
    ).statusCode,
    401,
  );
  const valid = await reauth(
    { ...a, headers: active },
    "mfa.disable",
    undefined,
    undefined,
    recovery[1],
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/v1/auth/mfa/disable",
        { ...active, "x-reauth-token": valid },
        {},
      )
    ).statusCode,
    200,
  );
  const normal = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  assert.equal(normal.json().mfaRequired, false);
});

test("invitation establishes scoped membership, is retry-safe, and scope/revoke take effect on next request", async () => {
  const owner = await account(),
    staff = await account(),
    outsider = await account();
  const org = await organization(owner),
    first = await property(owner, org, "First"),
    second = await property(owner, org, "Second");
  const ownOrg = await organization(staff);
  const i = await invite(owner, org, staff.email, "Manager", [first]);
  const wrong = await accept(outsider, org, i);
  assert.equal(wrong.statusCode, 404);
  const key = randomUUID(),
    accepted = await accept(staff, org, i, key);
  assert.equal(accepted.statusCode, 200);
  const member = accepted.json().membershipId;
  assert.deepEqual((await accept(staff, org, i, key)).json(), accepted.json());
  assert.equal((await accept(staff, org, i)).statusCode, 409);
  let list = await request(
    "GET",
    "/api/v1/organizations/" + org + "/properties",
    staff.headers,
  );
  assert.deepEqual(
    list.json().items.map((x: { id: string }) => x.id),
    [first],
  );
  assert.equal(
    (
      await request(
        "GET",
        "/api/v1/organizations/" + org + "/memberships",
        staff.headers,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/v1/organizations/" + org + "/properties",
        staff.headers,
        { name: "Forbidden", city: "Palembang", timezone: "Asia/Jakarta" },
      )
    ).statusCode,
    403,
  );
  const badToken = await reauth(owner, "staff.revoke", org, member);
  let changed = await request(
    "POST",
    "/api/v1/organizations/" + org + "/memberships/" + member + "/scope",
    { ...owner.headers, "idempotency-key": randomUUID() },
    {
      role: "Finance",
      propertyIds: [second],
      reauthToken: badToken,
      reason: "Synthetic scope change",
    },
  );
  assert.equal(changed.statusCode, 403);
  const token = await reauth(owner, "staff.scope", org, member);
  changed = await request(
    "POST",
    "/api/v1/organizations/" + org + "/memberships/" + member + "/scope",
    { ...owner.headers, "idempotency-key": randomUUID() },
    {
      role: "Finance",
      propertyIds: [second],
      reauthToken: token,
      reason: "Synthetic scope change",
    },
  );
  assert.equal(changed.statusCode, 200);
  list = await request(
    "GET",
    "/api/v1/organizations/" + org + "/properties",
    staff.headers,
  );
  assert.deepEqual(
    list.json().items.map((x: { id: string }) => x.id),
    [second],
  );
  const revoke = await request(
    "POST",
    "/api/v1/organizations/" + org + "/memberships/" + member + "/revoke",
    {
      ...owner.headers,
      "idempotency-key": randomUUID(),
      "x-reauth-token": badToken,
    },
    { reason: "Synthetic revoke" },
  );
  assert.equal(revoke.statusCode, 200);
  assert.equal(
    (
      await request(
        "GET",
        "/api/v1/organizations/" + org + "/properties",
        staff.headers,
      )
    ).statusCode,
    404,
  );
  const orgs = await request("GET", "/api/v1/organizations", staff.headers);
  assert.deepEqual(
    orgs.json().items.map((x: { id: string }) => x.id),
    [ownOrg],
  );
  assert.equal(
    (await request("GET", "/api/v1/auth/session", staff.headers)).statusCode,
    200,
  );
});

test("invitation guards verified email, expiry, revocation and cross-tenant location IDs", async () => {
  const owner = await account(),
    unverified = await account(false),
    recipient = await account(),
    other = await account();
  const org = await organization(owner),
    local = await property(owner, org),
    foreignOrg = await organization(other),
    foreign = await property(other, foreignOrg);
  let token = await reauth(owner, "staff.invite", org);
  let r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations",
    {
      ...owner.headers,
      "idempotency-key": randomUUID(),
      "x-reauth-token": token,
    },
    { email: recipient.email, role: "Manager", propertyIds: [foreign] },
  );
  assert.equal(r.statusCode, 404);
  const unverifiedOrg = await organization(unverified),
    unverifiedLocation = await property(unverified, unverifiedOrg);
  token = await reauth(unverified, "staff.invite", unverifiedOrg);
  r = await request(
    "POST",
    "/api/v1/organizations/" + unverifiedOrg + "/invitations",
    {
      ...unverified.headers,
      "idempotency-key": randomUUID(),
      "x-reauth-token": token,
    },
    {
      email: recipient.email,
      role: "Manager",
      propertyIds: [unverifiedLocation],
    },
  );
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().error.code, "EMAIL_NOT_VERIFIED");
  let i = await invite(owner, org, unverified.email, "Operations", [local]);
  assert.equal((await accept(unverified, org, i)).statusCode, 403);
  i = await invite(owner, org, recipient.email, "Finance", [local]);
  await admin.query(
    "UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
    [i.id],
  );
  assert.equal((await accept(recipient, org, i)).statusCode, 409);
  i = await invite(owner, org, recipient.email, "Finance", [local]);
  token = await reauth(owner, "invitation.revoke", org, i.id);
  r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations/" + i.id + "/revoke",
    {
      ...owner.headers,
      "idempotency-key": randomUUID(),
      "x-reauth-token": token,
    },
    { reason: "Synthetic cancellation" },
  );
  assert.equal(r.statusCode, 200);
  assert.equal((await accept(recipient, org, i)).statusCode, 409);
  await assert.rejects(
    () =>
      transaction(recipient.userId, org, (db) =>
        db.query(
          "INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'Owner')",
          [org, recipient.userId],
        ),
      ),
    { code: "42501" },
  );
});

test("manual staff changes cannot remove last Owner, including concurrent API revocations", async () => {
  const a = await account(),
    b = await account();
  const org = await organization(a);
  let members = await request(
    "GET",
    "/api/v1/organizations/" + org + "/memberships",
    a.headers,
  );
  const aMember = members.json().items[0].id;
  let token = await reauth(a, "staff.revoke", org, aMember);
  let r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/memberships/" + aMember + "/revoke",
    { ...a.headers, "idempotency-key": randomUUID(), "x-reauth-token": token },
    { reason: "Synthetic last owner attempt" },
  );
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error.code, "LAST_OWNER_REQUIRED");
  const i = await invite(a, org, b.email, "Owner", []);
  const acceptB = await accept(b, org, i);
  assert.equal(acceptB.statusCode, 200);
  const bMember = acceptB.json().membershipId;
  const bToken = await reauth(b, "staff.revoke", org, bMember);
  const attempts = await Promise.all([
    request(
      "POST",
      "/api/v1/organizations/" + org + "/memberships/" + aMember + "/revoke",
      {
        ...a.headers,
        "idempotency-key": randomUUID(),
        "x-reauth-token": token,
      },
      { reason: "Synthetic parallel revoke" },
    ),
    request(
      "POST",
      "/api/v1/organizations/" + org + "/memberships/" + bMember + "/revoke",
      {
        ...b.headers,
        "idempotency-key": randomUUID(),
        "x-reauth-token": bToken,
      },
      { reason: "Synthetic parallel revoke" },
    ),
  ]);
  assert.deepEqual(attempts.map((x) => x.statusCode).sort(), [200, 409]);
  const remaining = (
    await admin.query(
      "SELECT id FROM memberships WHERE organization_id=$1 AND role='Owner' AND revoked_at IS NULL",
      [org],
    )
  ).rows;
  assert.equal(remaining.length, 1);
});

test("restricted worker sends real invitation to local SMTP and cannot read tenant records/passwords", async () => {
  const a = await account(),
    b = await account(),
    org = await organization(a);
  const i = await invite(a, org, b.email, "Owner", []);
  for (let n = 0; n < 50; n++) {
    const row = await admin.query(
      "SELECT sent_at FROM invitation_email_outbox WHERE invitation_id=$1",
      [i.id],
    );
    if (row.rows[0].sent_at) break;
    await deliverInvitationOne();
  }
  const row = (
    await admin.query(
      "SELECT sent_at,token_cipher FROM invitation_email_outbox WHERE invitation_id=$1",
      [i.id],
    )
  ).rows[0];
  assert.ok(row.sent_at);
  assert.equal(row.token_cipher, null);
  await assert.rejects(
    () => workerPool.query("SELECT password_hash FROM users LIMIT 1"),
    { code: "42501" },
  );
  await assert.rejects(
    () => workerPool.query("SELECT * FROM properties LIMIT 1"),
    { code: "42501" },
  );
});

test("role/location matrix and private-file access are reevaluated immediately after revoke", async () => {
  const owner = await account(),
    org = await organization(owner),
    first = await property(owner, org),
    second = await property(owner, org);
  const foreignOwner = await account(),
    foreignOrg = await organization(foreignOwner);
  await property(foreignOwner, foreignOrg);
  const boundary = "SyntheticRoleMatrix",
    bytes = Buffer.from("%PDF-1.4\n%%EOF");
  const payload = Buffer.concat([
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="file"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\n',
    ),
    bytes,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  const uploaded = await app.inject({
    method: "POST",
    url: "/api/v1/organizations/" + org + "/files",
    headers: {
      origin,
      ...owner.headers,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
  assert.equal(uploaded.statusCode, 201);
  const file = uploaded.json().id;
  /* Synthetic clean fixture only; this is authorization evidence, not antivirus evidence. */ await admin.query(
    "UPDATE private_files SET state='clean',scan_at=now() WHERE id=$1",
    [file],
  );
  for (const role of ["Owner", "Manager", "Finance", "Operations"]) {
    const user = await account(),
      i = await invite(
        owner,
        org,
        user.email,
        role,
        role === "Owner" ? [] : [first],
      );
    const acceptance = await accept(user, org, i);
    assert.equal(acceptance.statusCode, 200);
    const member = acceptance.json().membershipId;
    const list = await request(
      "GET",
      "/api/v1/organizations/" + org + "/properties",
      user.headers,
    );
    assert.equal(list.statusCode, 200);
    assert.deepEqual(
      list
        .json()
        .items.map((p: { id: string }) => p.id)
        .sort(),
      (role === "Owner" ? [first, second] : [first]).sort(),
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/v1/organizations/" + org + "/memberships",
          user.headers,
        )
      ).statusCode,
      role === "Owner" ? 200 : 403,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/v1/organizations/" + foreignOrg + "/properties",
          user.headers,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/v1/organizations/" + org + "/files/" + file + "/download",
          user.headers,
        )
      ).statusCode,
      role === "Owner" ? 200 : 403,
    );
    const token = await reauth(owner, "staff.revoke", org, member);
    assert.equal(
      (
        await request(
          "POST",
          "/api/v1/organizations/" + org + "/memberships/" + member + "/revoke",
          {
            ...owner.headers,
            "idempotency-key": randomUUID(),
            "x-reauth-token": token,
          },
          { reason: "Synthetic role matrix revoke" },
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/v1/organizations/" + org + "/files/" + file + "/download",
          user.headers,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/v1/organizations/" + org + "/properties",
          user.headers,
        )
      ).statusCode,
      404,
    );
  }
});

test("MFA challenge has bounded attempts and server-enforced expiry", async () => {
  const a = await account();
  const token = await reauth(a, "mfa.enroll");
  const setup = (
    await request(
      "POST",
      "/api/v1/auth/mfa/enroll",
      { ...a.headers, "x-reauth-token": token },
      {},
    )
  ).json();
  const enabled = await request("POST", "/api/v1/auth/mfa/verify", a.headers, {
    challengeId: setup.challengeId,
    code: totp(setup.secret).generate(),
  });
  assert.equal(enabled.statusCode, 200);
  const codes = enabled.json().recoveryCodes;
  let login = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  let pending = {
    cookie: "session=" + login.cookies[0].value,
    "x-csrf-token": login.json().csrfToken,
  };
  for (let n = 0; n < 6; n++)
    assert.equal(
      (
        await request("POST", "/api/v1/auth/mfa/verify", pending, {
          challengeId: login.json().challengeId,
          code: "invalid-code",
        })
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await request("POST", "/api/v1/auth/mfa/verify", pending, {
        challengeId: login.json().challengeId,
        code: codes[0],
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await admin.query("SELECT attempts FROM mfa_challenges WHERE id=$1", [
        login.json().challengeId,
      ])
    ).rows[0].attempts,
    5,
  );
  login = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  pending = {
    cookie: "session=" + login.cookies[0].value,
    "x-csrf-token": login.json().csrfToken,
  };
  await admin.query(
    "UPDATE mfa_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
    [login.json().challengeId],
  );
  assert.equal(
    (
      await request("POST", "/api/v1/auth/mfa/verify", pending, {
        challengeId: login.json().challengeId,
        code: codes[0],
      })
    ).statusCode,
    401,
  );
});

test("normal API retains registration throttling despite E2E fixture override option", async () => {
  for (let n = 0; n < 6; n++) {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: "10.99.99.99",
      headers: { origin },
      payload: { email: "rate-" + randomUUID() + "@example.test", password },
    });
    assert.equal(r.statusCode, n < 5 ? 202 : 429);
  }
});

test("unverified account can request a fresh verification email without reusing the old token", async () => {
  const a = await account(false);
  const old = (
    await pool.query(
      "SELECT e.token_cipher,e.token_hash FROM email_outbox e WHERE e.user_id=$1 AND e.kind='verify' ORDER BY available_at DESC LIMIT 1",
      [a.userId],
    )
  ).rows[0];
  const oldToken = await open(
    old.token_cipher,
    "email:" + a.userId + ":" + old.token_hash,
  );
  assert.equal(
    (await request("POST", "/api/v1/auth/verification/resend", a.headers, {}))
      .statusCode,
    202,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/v1/auth/verify-email",
        {},
        { token: oldToken },
      )
    ).statusCode,
    422,
  );
  const fresh = (
    await pool.query(
      "SELECT e.token_cipher,e.token_hash FROM email_outbox e WHERE e.user_id=$1 AND e.kind='verify' ORDER BY available_at DESC LIMIT 1",
      [a.userId],
    )
  ).rows[0];
  const token = await open(
    fresh.token_cipher,
    "email:" + a.userId + ":" + fresh.token_hash,
  );
  assert.equal(
    (await request("POST", "/api/v1/auth/verify-email", {}, { token }))
      .statusCode,
    200,
  );
  const session = await request("GET", "/api/v1/auth/session", a.headers);
  assert.ok(session.json().user.verifiedAt);
});

test("reauth token expires and is bound to the original authenticated session", async () => {
  const a = await account(),
    org = await organization(a);
  const target = await account();
  const token = await reauth(a, "staff.invite", org);
  const login = await request(
    "POST",
    "/api/v1/auth/login",
    {},
    { email: a.email, password },
  );
  const second = {
    cookie: "session=" + login.cookies[0].value,
    "x-csrf-token": login.json().csrfToken,
  };
  const body = { email: target.email, role: "Owner", propertyIds: [] };
  let r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations",
    { ...second, "idempotency-key": randomUUID(), "x-reauth-token": token },
    body,
  );
  assert.equal(r.statusCode, 403);
  await transaction(a.userId, org, (db) =>
    db.query(
      "UPDATE reauth_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [a.userId],
    ),
  );
  r = await request(
    "POST",
    "/api/v1/organizations/" + org + "/invitations",
    { ...a.headers, "idempotency-key": randomUUID(), "x-reauth-token": token },
    body,
  );
  assert.equal(r.statusCode, 403);
});
