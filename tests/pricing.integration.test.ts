import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../src/server/app.js";
import { pool, transaction } from "../src/server/db.js";
import { open } from "../src/server/crypto.js";
const app = await buildApp(),
  origin = "http://localhost:5173",
  password = "Synthetic-password-123";
const url = process.env.MIGRATION_DATABASE_URL!;
assert.equal(new URL(url).pathname, "/kost_test");
const admin = new pg.Pool({ connectionString: url, max: 4 });
let calls = 0;
type Actor = { id: string; email: string; headers: Record<string, string> };
async function req(
  method: string,
  path: string,
  actor?: Actor,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: method as "GET" | "POST",
    url: "/api/v1" + path,
    remoteAddress:
      "10.40." + Math.floor(++calls / 240) + "." + ((calls % 240) + 1),
    headers: {
      origin,
      "content-type": "application/json",
      ...(actor?.headers ?? {}),
      "idempotency-key": randomUUID(),
      ...headers,
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
after(async () => {
  await app.close();
  await pool.end();
  await admin.end();
});
async function account(): Promise<Actor> {
  const email = "inventory-" + randomUUID() + "@example.test";
  assert.equal(
    (await req("POST", "/auth/register", undefined, { email, password }))
      .statusCode,
    202,
  );
  const e = (
    await pool.query(
      "SELECT e.user_id,e.token_hash,e.token_cipher FROM email_outbox e JOIN users u ON u.id=e.user_id WHERE u.email=$1",
      [email],
    )
  ).rows[0];
  await req("POST", "/auth/verify-email", undefined, {
    token: await open(
      e.token_cipher,
      "email:" + e.user_id + ":" + e.token_hash,
    ),
  });
  const login = await req("POST", "/auth/login", undefined, {
    email,
    password,
  });
  assert.equal(login.statusCode, 200);
  return {
    id: e.user_id,
    email,
    headers: {
      cookie: "session=" + login.cookies[0].value,
      "x-csrf-token": login.json().csrfToken,
    },
  };
}
async function setup() {
  const owner = await account();
  const org = (
    await req("POST", "/organizations", owner, {
      name: "Synthetic inventory",
      slug: "inventory-" + randomUUID(),
    })
  ).json().id as string;
  const created = await req(
    "POST",
    "/organizations/" + org + "/properties",
    owner,
    {
      name: "Synthetic Palembang",
      city: "Palembang",
      timezone: "Asia/Jakarta",
    },
  );
  assert.equal(created.statusCode, 201);
  const property = created.json().id as string;
  const profile = await req(
    "POST",
    "/organizations/" + org + "/properties/" + property + "/profile",
    owner,
    {
      version: 1,
      code: "PLB-" + randomUUID().slice(0, 8),
      floors: 2,
      segment: "Mahasiswi & karyawati",
    },
  );
  assert.equal(profile.statusCode, 200);
  const type = await req(
    "POST",
    "/organizations/" + org + "/room-types",
    owner,
    {
      propertyId: property,
      name: "Tipe sintetis",
      defaultCapacity: 1,
      defaultFacilities: ["Kamar mandi dalam", "Listrik prabayar per kamar"],
    },
  );
  assert.equal(type.statusCode, 201);
  return { owner, org, property, type: type.json() };
}
async function single(
  s: Awaited<ReturnType<typeof setup>>,
  code: string,
  key = randomUUID(),
) {
  return req(
    "POST",
    "/organizations/" + s.org + "/rooms",
    s.owner,
    { propertyId: s.property, typeId: s.type.id, code, floor: 1 },
    { "idempotency-key": key },
  );
}
async function preview(
  s: Awaited<ReturnType<typeof setup>>,
  rooms?: { code: string; floor: number }[],
) {
  return req(
    "POST",
    "/organizations/" + s.org + "/rooms/bulk-preview",
    s.owner,
    rooms
      ? { mode: "manual", propertyId: s.property, typeId: s.type.id, rooms }
      : { mode: "pilot", propertyId: s.property, typeId: s.type.id },
  );
}
async function commit(
  s: Awaited<ReturnType<typeof setup>>,
  checksum: string,
  key = randomUUID(),
) {
  return req(
    "POST",
    "/organizations/" + s.org + "/rooms/bulk-commit",
    s.owner,
    {
      propertyId: s.property,
      previewChecksum: checksum,
      confirmCodes: true,
      confirmLayout: true,
    },
    { "idempotency-key": key },
  );
}
async function rooms(s: Awaited<ReturnType<typeof setup>>) {
  return (
    await req(
      "GET",
      "/organizations/" +
        s.org +
        "/rooms?propertyId=" +
        s.property +
        "&limit=100",
      s.owner,
    )
  ).json().items as any[];
}
async function grant(
  s: Awaited<ReturnType<typeof setup>>,
  user: Actor,
  role: string,
) {
  const auth = await req("POST", "/auth/reauth", s.owner, {
    password,
    action: "staff.invite",
    organizationId: s.org,
  });
  const i = await req(
    "POST",
    "/organizations/" + s.org + "/invitations",
    s.owner,
    {
      email: user.email,
      role,
      propertyIds: role === "Owner" ? [] : [s.property],
    },
    { "x-reauth-token": auth.json().reauthToken },
  );
  assert.equal(i.statusCode, 201);
  const e = (
    await admin.query(
      "SELECT token_cipher FROM invitation_email_outbox WHERE invitation_id=$1",
      [i.json().id],
    )
  ).rows[0];
  const accepted = await req(
    "POST",
    "/organizations/" + s.org + "/invitations/" + i.json().id + "/accept",
    user,
    {
      token: await open(
        e.token_cipher,
        "invitation:" + s.org + ":" + i.json().id,
      ),
    },
  );
  return accepted;
}

function policyBody(
  s: Awaited<ReturnType<typeof setup>>,
  extra: Record<string, unknown> = {},
) {
  return {
    propertyId: s.property,
    expectedVersion: 0,
    effectiveAt: "2026-01-01T00:00:00Z",
    baseRent: 1500000,
    typeRates: {},
    roomRates: {},
    depositEnabled: false,
    depositAmount: 0,
    fees: [],
    cycle: "calendar",
    prorata: "actual",
    dueDay: 1,
    invoiceLeadDays: 0,
    bookingMinimum: 0,
    checkinMinimumPercent: 100,
    holdHours: 24,
    reviewHours: 24,
    noticeDays: 30,
    cancellationDays: 7,
    refundBeforePercent: 100,
    refundLatePercent: 0,
    noShowRefundPercent: 0,
    penaltyEnabled: false,
    penaltyAmount: 0,
    penaltyCap: 0,
    graceDays: 0,
    electricityMode: "prepaid_per_room",
    notes: "TEST_ONLY",
    ...extra,
  };
}
const path = (s: Awaited<ReturnType<typeof setup>>, suffix: string) =>
  "/organizations/" + s.org + suffix;
test("effective policy uses location midnight, room then type then base overrides including zero", async () => {
  const s = await setup();
  const r = (await single(s, "101")).json();
  const r2 = (await single(s, "102")).json();
  const p = await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, {
      typeRates: { [s.type.id]: 1800000 },
      roomRates: { [r.id]: 0 },
    }),
  );
  assert.equal(p.statusCode, 201, p.body);
  for (const [id, expected, source] of [
    [r.id, 0, "room"],
    [r2.id, 1800000, "type"],
  ]) {
    const q = await req("POST", path(s, "/quotes"), s.owner, {
      roomId: id,
      start: "2027-01-16",
      end: "2027-02-01",
      occupantCount: 1,
    });
    assert.equal(q.statusCode, 201, q.body);
    assert.equal(q.json().snapshot.resolvedRent, expected);
    assert.equal(q.json().snapshot.rateSource, source);
  }
  const future = await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, {
      expectedVersion: 1,
      effectiveAt: "2027-01-15T17:00:00Z",
      baseRent: 2100000,
    }),
  );
  assert.equal(future.statusCode, 201);
  for (const [start, v] of [
    ["2027-01-15", 1],
    ["2027-01-16", 2],
  ]) {
    const q = await req("POST", path(s, "/quotes"), s.owner, {
      roomId: r.id,
      start,
      occupantCount: 1,
    });
    assert.equal(q.statusCode, 201, q.body);
    assert.equal(q.json().snapshot.policyVersion, v);
  }
  const base = (
    await req("POST", path(s, "/quotes"), s.owner, {
      roomId: r2.id,
      start: "2027-02-01",
      occupantCount: 1,
    })
  ).json();
  assert.equal(base.snapshot.rateSource, "property");
  assert.equal(base.snapshot.resolvedRent, 2100000);
});
test("policy concurrent CAS and retry are atomic; immutable quote snapshot survives later policy and same-key retries", async () => {
  const s = await setup();
  const room = (await single(s, "101")).json();
  const k = randomUUID(),
    b = policyBody(s);
  const created = await req("POST", path(s, "/rate-policies"), s.owner, b, {
    "idempotency-key": k,
  });
  assert.equal(created.statusCode, 201);
  const replay = await req("POST", path(s, "/rate-policies"), s.owner, b, {
    "idempotency-key": k,
  });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.json(), created.json());
  assert.equal(
    (
      await req(
        "POST",
        path(s, "/rate-policies"),
        s.owner,
        { ...b, baseRent: 1 },
        { "idempotency-key": k },
      )
    ).json().error.code,
    "IDEMPOTENCY_MISMATCH",
  );
  const qk = randomUUID(),
    qb = {
      roomId: room.id,
      start: "2027-01-16",
      end: "2027-02-01",
      occupantCount: 1,
    };
  const q = await req("POST", path(s, "/quotes"), s.owner, qb, {
    "idempotency-key": qk,
  });
  assert.equal(q.statusCode, 201, q.body);
  assert.equal(q.json().snapshot.total, 774194);
  const outcomes = await Promise.all(
    [2000000, 3000000].map((baseRent) =>
      req(
        "POST",
        path(s, "/rate-policies"),
        s.owner,
        policyBody(s, { expectedVersion: 1, baseRent }),
      ),
    ),
  );
  assert.deepEqual(outcomes.map((x) => x.statusCode).sort(), [201, 409]);
  const old = (
    await req("GET", path(s, "/quotes/" + q.json().id), s.owner)
  ).json();
  assert.deepEqual(old.snapshot, q.json().snapshot);
  assert.deepEqual(
    (
      await req("POST", path(s, "/quotes"), s.owner, qb, {
        "idempotency-key": qk,
      })
    ).json(),
    q.json(),
  );
  const current = (await req("POST", path(s, "/quotes"), s.owner, qb)).json();
  assert.equal(current.snapshot.policyVersion, 2);
  assert.notEqual(current.snapshot.total, q.json().snapshot.total);
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM pricing_quotes WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM audit_logs WHERE organization_id=$1 AND action='pricing.policy_created'",
        [s.org],
      )
    ).rows[0].n,
    2,
  );
});
test("cross-tenant and cross-property overrides rollback and pricing roles/scopes are enforced", async () => {
  const s = await setup(),
    other = await setup();
  const room = (await single(s, "101")).json(),
    foreign = (await single(other, "101")).json();
  for (const overrides of [
    { typeRates: { [other.type.id]: 100 } },
    { roomRates: { [foreign.id]: 100 } },
  ])
    assert.equal(
      (
        await req(
          "POST",
          path(s, "/rate-policies"),
          s.owner,
          policyBody(s, overrides),
        )
      ).statusCode,
      404,
    );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM rate_policy_versions WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await req(
        "GET",
        path(s, "/rate-policies?propertyId=" + s.property),
        other.owner,
      )
    ).statusCode,
    404,
  );
  const same = (
    await req("POST", path(s, "/properties"), s.owner, {
      name: "Location2",
      city: "Palembang",
      timezone: "Asia/Jakarta",
    })
  ).json();
  assert.equal(
    (
      await req(
        "POST",
        path(s, "/rate-policies"),
        s.owner,
        policyBody(s, { propertyId: same.id, typeRates: { [s.type.id]: 1 } }),
      )
    ).statusCode,
    404,
  );
  await req("POST", path(s, "/rate-policies"), s.owner, policyBody(s));
  const quote = await req("POST", path(s, "/quotes"), s.owner, {
    roomId: room.id,
    start: "2027-01-01",
    occupantCount: 1,
  });
  for (const role of ["Manager", "Finance", "Operations"]) {
    const actor = await account();
    assert.equal((await grant(s, actor, role)).statusCode, 200);
    assert.equal(
      (
        await req(
          "GET",
          path(s, "/rate-policies?propertyId=" + s.property),
          actor,
        )
      ).statusCode,
      role === "Operations" ? 403 : 200,
    );
    assert.equal(
      (await req("GET", path(s, "/rate-policies?propertyId=" + same.id), actor))
        .statusCode,
      role === "Operations" ? 403 : 404,
    );
    const write = await req(
      "POST",
      path(s, "/rate-policies"),
      actor,
      policyBody(s, { expectedVersion: 1 }),
    );
    assert.equal(write.statusCode, role === "Manager" ? 201 : 403, write.body);
    assert.equal(
      (await req("GET", path(s, "/quotes/" + quote.json().id), actor))
        .statusCode,
      404,
    );
    await transaction(actor.id, s.org, async (db) => {
      assert.equal(
        (
          await db.query("SELECT id FROM pricing_quotes WHERE id=$1", [
            quote.json().id,
          ])
        ).rowCount,
        0,
      );
      if (role === "Operations")
        assert.equal(
          (
            await db.query(
              "SELECT id FROM rate_policy_versions WHERE organization_id=$1",
              [s.org],
            )
          ).rowCount,
          0,
        );
    });
  }
  assert.equal(
    (await req("GET", path(other, "/quotes/" + quote.json().id), other.owner))
      .statusCode,
    404,
  );
});
test("missing policy, invalid dates/money/minimum and capacity fail without saved quote; expiry keeps historical snapshot", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const b = { roomId: room.id, start: "2027-01-01", occupantCount: 1 };
  assert.equal(
    (await req("POST", path(s, "/quotes"), s.owner, b)).json().error.code,
    "POLICY_NOT_CONFIGURED",
  );
  for (const extra of [
    { baseRent: 1.1 },
    { depositAmount: 100 },
    { penaltyEnabled: true, penaltyAmount: 2, penaltyCap: 1 },
    {
      fees: [
        {
          code: "x",
          label: "x",
          amount: -1,
          frequency: "monthly",
          refundable: false,
        },
      ],
    },
  ])
    assert.equal(
      (
        await req(
          "POST",
          path(s, "/rate-policies"),
          s.owner,
          policyBody(s, extra),
        )
      ).statusCode,
      422,
    );
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { baseRent: 0, bookingMinimum: 1 }),
  );
  assert.equal(
    (await req("POST", path(s, "/quotes"), s.owner, b)).json().error.code,
    "BOOKING_MINIMUM_EXCEEDS_INITIAL",
  );
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { expectedVersion: 1 }),
  );
  for (const extra of [
    { occupantCount: 2 },
    { start: "2027-02-30" },
    { end: "2026-12-31" },
    { end: "2030-01-01" },
  ])
    assert.equal(
      (await req("POST", path(s, "/quotes"), s.owner, { ...b, ...extra }))
        .statusCode,
      422,
    );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM pricing_quotes WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
  const q = (await req("POST", path(s, "/quotes"), s.owner, b)).json();
  assert.equal(
    (
      await req(
        "POST",
        path(s, "/rate-policies"),
        s.owner,
        policyBody(s, { expectedVersion: 2, cycle: "anniversary" }),
      )
    ).statusCode,
    201,
  );
  const anniversary = await req("POST", path(s, "/quotes"), s.owner, {
    ...b,
    start: "2027-01-31",
    end: "2027-02-01",
  });
  assert.equal(anniversary.json().snapshot.total, 1500000);
  await admin.query(
    "UPDATE pricing_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",
    [q.id],
  );
  const old = (await req("GET", path(s, "/quotes/" + q.id), s.owner)).json();
  assert.equal(old.expired, true);
  assert.deepEqual(old.snapshot, q.snapshot);
});
test("runtime cannot rewrite policies/quotes or append overrides to previously committed policy", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const p = (
    await req("POST", path(s, "/rate-policies"), s.owner, policyBody(s))
  ).json();
  for (const sql of [
    "UPDATE rate_policy_versions SET base_rent=1 WHERE id=$1",
    "DELETE FROM rate_policy_versions WHERE id=$1",
    "UPDATE pricing_quotes SET snapshot='{}' WHERE id=$1",
  ])
    await assert.rejects(
      transaction(s.owner.id, s.org, (db) => db.query(sql, [p.id])),
      (e: any) => e.code === "42501",
    );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query(
        "INSERT INTO policy_room_rates(organization_id,property_id,policy_id,room_id,amount) VALUES($1,$2,$3,$4,1)",
        [s.org, s.property, p.id, room.id],
      ),
    ),
    (e: any) => e.message === "INVALID_STATE",
  );
});
