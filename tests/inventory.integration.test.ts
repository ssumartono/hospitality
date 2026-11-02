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

test("pilot generation persists 12 inspection rooms, permits room 13 and a second property, and retries never duplicate", async () => {
  const s = await setup(),
    p = await preview(s);
  assert.equal(p.statusCode, 200);
  assert.equal(p.json().rooms.length, 12);
  assert.deepEqual(
    p.json().rooms.map((r: any) => r.code),
    [
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
      "201",
      "202",
      "203",
      "204",
      "205",
      "206",
    ],
  );
  const key = randomUUID(),
    made = await commit(s, p.json().previewChecksum, key);
  assert.equal(made.statusCode, 201);
  assert.equal(made.json().created, 12);
  assert.ok(
    made
      .json()
      .rooms.every(
        (r: any) =>
          r.condition === "inspection" &&
          r.checklistRecordedAt === null &&
          !r.checklistComplete,
      ),
  );
  assert.deepEqual(
    (await commit(s, p.json().previewChecksum, key)).json(),
    made.json(),
  );
  assert.equal((await commit(s, p.json().previewChecksum)).statusCode, 409);
  assert.equal((await preview(s)).json().alreadyApplied, true);
  assert.equal((await single(s, "207")).statusCode, 201);
  assert.equal((await rooms(s)).length, 13);
  const extra = await req(
    "POST",
    "/organizations/" + s.org + "/properties",
    s.owner,
    { name: "Synthetic second", city: "Palembang", timezone: "Asia/Jakarta" },
  );
  assert.equal(extra.statusCode, 201);
  const list = await req(
    "GET",
    "/organizations/" + s.org + "/properties",
    s.owner,
  );
  assert.equal(list.json().items.length, 2);
  const usage = await req(
    "GET",
    "/organizations/" + s.org + "/subscriptions",
    s.owner,
  );
  assert.equal(usage.json().roomsUsed, 13);
  assert.equal(usage.json().propertiesUsed, 2);
});

test("room quota serializes parallel creates and preserves idempotency after limit reached", async () => {
  const s = await setup();
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=1 WHERE organization_id=$1",
    [s.org],
  );
  const keys = [randomUUID(), randomUUID()],
    codes = ["A", "B"];
  const results = await Promise.all(
    codes.map((code, i) => single(s, code, keys[i])),
  );
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
  const success = results.findIndex((r) => r.statusCode === 201);
  assert.equal(results[1 - success].json().error.code, "QUOTA_EXCEEDED");
  assert.deepEqual(
    (await single(s, codes[success], keys[success])).json(),
    results[success].json(),
  );
  assert.equal((await rooms(s)).length, 1);
});

test("bulk preview reserves nothing; quota and unique-code failures roll back whole commit", async () => {
  const s = await setup();
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=2 WHERE organization_id=$1",
    [s.org],
  );
  let p = await preview(s, [
    { code: "A", floor: 1 },
    { code: "B", floor: 1 },
  ]);
  assert.equal(p.statusCode, 200);
  assert.equal((await single(s, "B")).statusCode, 201);
  let r = await commit(s, p.json().previewChecksum);
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error.code, "QUOTA_EXCEEDED");
  assert.equal((await rooms(s)).length, 1);
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=5 WHERE organization_id=$1",
    [s.org],
  );
  r = await commit(s, p.json().previewChecksum);
  assert.equal(r.statusCode, 409);
  const remaining = await rooms(s);
  assert.deepEqual(
    remaining.map((r) => r.code),
    ["B"],
  );
  assert.equal(
    (
      await admin.query(
        "SELECT id FROM inventory_batches WHERE organization_id=$1",
        [s.org],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT id FROM rooms WHERE organization_id=$1 AND code='A'",
        [s.org],
      )
    ).rowCount,
    0,
  );
});

test("type snapshots stay immutable, stale previews/versions fail and explicit changes reset checklist", async () => {
  const s = await setup(),
    p = await preview(s, [{ code: "A", floor: 1 }]);
  const first = (await single(s, "Old")).json();
  let changed = await req(
    "POST",
    "/organizations/" + s.org + "/room-types/" + s.type.id + "/update",
    s.owner,
    {
      version: s.type.version,
      name: "Tipe sintetis baru",
      defaultCapacity: 3,
      defaultFacilities: ["Fasilitas sintetis"],
    },
  );
  assert.equal(changed.statusCode, 200);
  assert.equal(
    (await commit(s, p.json().previewChecksum)).json().error.code,
    "VERSION_CONFLICT",
  );
  let list = await rooms(s);
  assert.equal(list[0].capacity, 1);
  assert.equal(list[0].typeVersion, 1);
  const added = await single(s, "New");
  assert.equal(added.json().capacity, 3);
  assert.equal(added.json().typeVersion, 2);
  const checked = await req(
    "POST",
    "/organizations/" + s.org + "/rooms/" + first.id + "/checklist",
    s.owner,
    {
      version: 1,
      roomVersion: 1,
      water: true,
      electric: true,
      lock: true,
      furniture: true,
      clean: true,
    },
  );
  assert.equal(checked.statusCode, 200);
  assert.equal(checked.json().checklistComplete, true);
  assert.equal(checked.json().condition, "inspection");
  const payload = {
    version: 1,
    code: "Old",
    floor: 1,
    typeId: s.type.id,
    capacity: 1,
    facilities: first.facilities,
    condition: "inspection",
    applyTypeDefaults: true,
    reason: "Synthetic explicit defaults",
  };
  changed = await req(
    "POST",
    "/organizations/" + s.org + "/rooms/" + first.id + "/update",
    s.owner,
    payload,
  );
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.json().capacity, 3);
  assert.equal(changed.json().checklistComplete, false);
  assert.equal(
    (
      await req(
        "POST",
        "/organizations/" + s.org + "/rooms/" + first.id + "/update",
        s.owner,
        payload,
      )
    ).statusCode,
    409,
  );
  const invalidFloor = await req(
    "POST",
    "/organizations/" + s.org + "/properties/" + s.property + "/profile",
    s.owner,
    { version: 2, code: "Changed", floors: 1, segment: "Karyawati" },
  );
  assert.equal(invalidFloor.statusCode, 200);
  const future = await preview(s, [{ code: "Later", floor: 1 }]);
  await admin.query(
    "UPDATE room_previews SET expires_at=now()-interval '1 second' WHERE checksum=$1",
    [future.json().previewChecksum],
  );
  assert.equal(
    (await commit(s, future.json().previewChecksum)).json().error.code,
    "PREVIEW_EXPIRED",
  );
});

test("restricted/expired development entitlement blocks acquisition but preserves read/checklist and is prohibited in production context", async () => {
  const s = await setup();
  const room = (await single(s, "Existing")).json();
  await admin.query(
    "UPDATE organization_entitlements SET state='restricted' WHERE organization_id=$1",
    [s.org],
  );
  assert.equal((await single(s, "No")).statusCode, 403);
  assert.equal((await preview(s)).statusCode, 403);
  assert.equal(
    (
      await req("POST", "/organizations/" + s.org + "/properties", s.owner, {
        name: "No",
        city: "Palembang",
        timezone: "Asia/Jakarta",
      })
    ).statusCode,
    403,
  );
  assert.equal((await rooms(s)).length, 1);
  const c = await req(
    "POST",
    "/organizations/" + s.org + "/rooms/" + room.id + "/checklist",
    s.owner,
    {
      version: 1,
      roomVersion: 1,
      water: true,
      electric: false,
      lock: false,
      furniture: false,
      clean: false,
    },
  );
  assert.equal(c.statusCode, 200);
  await admin.query(
    "UPDATE organization_entitlements SET state='trial',valid_until=now()-interval '1 second',grace_until=NULL WHERE organization_id=$1",
    [s.org],
  );
  assert.equal((await single(s, "Expired")).statusCode, 403);
  await admin.query(
    "UPDATE organization_entitlements SET valid_until=NULL WHERE organization_id=$1",
    [s.org],
  );
  await assert.rejects(
    () =>
      transaction(s.owner.id, s.org, async (db) => {
        await db.query(
          "SELECT set_config('app.runtime_environment','production',true)",
        );
        await db.query("SELECT assert_entitlement_quota($1,1,0,0)", [s.org]);
      }),
    { code: "P0409" },
  );
});

test("location-scoped Manager/Ops/Finance permissions and tenant-wide quota are enforced", async () => {
  const s = await setup(),
    other = await setup();
  const manager = await account(),
    ops = await account(),
    finance = await account();
  assert.equal((await grant(s, manager, "Manager")).statusCode, 200);
  assert.equal((await grant(s, ops, "Operations")).statusCode, 200);
  assert.equal((await grant(s, finance, "Finance")).statusCode, 200);
  const r = await req("POST", "/organizations/" + s.org + "/rooms", manager, {
    propertyId: s.property,
    typeId: s.type.id,
    code: "Managed",
    floor: 1,
  });
  assert.equal(r.statusCode, 201);
  for (const actor of [manager, ops, finance]) {
    assert.equal(
      (
        await req(
          "GET",
          "/organizations/" + s.org + "/rooms?propertyId=" + s.property,
          actor,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await req(
          "GET",
          "/organizations/" + other.org + "/rooms?propertyId=" + other.property,
          actor,
        )
      ).statusCode,
      404,
    );
  }
  for (const actor of [ops, finance])
    assert.equal(
      (
        await req("POST", "/organizations/" + s.org + "/rooms", actor, {
          propertyId: s.property,
          typeId: s.type.id,
          code: "Deny",
          floor: 1,
        })
      ).statusCode,
      403,
    );
  assert.equal(
    (
      await req("POST", "/organizations/" + s.org + "/rooms", manager, {
        propertyId: s.property,
        typeId: other.type.id,
        code: "Cross-type",
        floor: 1,
      })
    ).statusCode,
    404,
  );
  const payload = {
    version: 1,
    roomVersion: 1,
    water: true,
    electric: false,
    lock: false,
    furniture: false,
    clean: false,
  };
  assert.equal(
    (
      await req(
        "POST",
        "/organizations/" + s.org + "/rooms/" + r.json().id + "/checklist",
        finance,
        payload,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/organizations/" + s.org + "/rooms/" + r.json().id + "/checklist",
        ops,
        payload,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await req("GET", "/organizations/" + s.org + "/subscriptions", manager))
      .statusCode,
    403,
  );
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=1 WHERE organization_id=$1",
    [s.org],
  );
  assert.equal(
    (
      await req("POST", "/organizations/" + s.org + "/rooms", manager, {
        propertyId: s.property,
        typeId: s.type.id,
        code: "Over",
        floor: 1,
      })
    ).json().error.code,
    "QUOTA_EXCEEDED",
  );
});

test("location quota and staff seat quota cannot be exceeded by concurrent commands", async () => {
  const s = await setup();
  await admin.query(
    "UPDATE organization_entitlements SET property_limit=2,staff_limit=2 WHERE organization_id=$1",
    [s.org],
  );
  const results = await Promise.all(
    ["A", "B"].map((name) =>
      req("POST", "/organizations/" + s.org + "/properties", s.owner, {
        name,
        city: "Palembang",
        timezone: "Asia/Jakarta",
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
  const users = await Promise.all([account(), account()]);
  const invites: { id: string; token: string }[] = [];
  for (const user of users) {
    const auth = await req("POST", "/auth/reauth", s.owner, {
      password,
      action: "staff.invite",
      organizationId: s.org,
    });
    const invite = await req(
      "POST",
      "/organizations/" + s.org + "/invitations",
      s.owner,
      { email: user.email, role: "Operations", propertyIds: [s.property] },
      { "x-reauth-token": auth.json().reauthToken },
    );
    assert.equal(invite.statusCode, 201);
    const cipher = (
      await admin.query(
        "SELECT token_cipher FROM invitation_email_outbox WHERE invitation_id=$1",
        [invite.json().id],
      )
    ).rows[0].token_cipher;
    invites.push({
      id: invite.json().id,
      token: await open(cipher, "invitation:" + s.org + ":" + invite.json().id),
    });
  }
  const accepted = await Promise.all(
    users.map((user, i) =>
      req(
        "POST",
        "/organizations/" + s.org + "/invitations/" + invites[i].id + "/accept",
        user,
        { token: invites[i].token },
      ),
    ),
  );
  assert.deepEqual(accepted.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(
    (
      await admin.query(
        "SELECT id FROM memberships WHERE organization_id=$1 AND revoked_at IS NULL",
        [s.org],
      )
    ).rowCount,
    2,
  );
});

test("quota also guards restores and retains archived codes", async () => {
  const s = await setup();
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=1 WHERE organization_id=$1",
    [s.org],
  );
  const a = (await single(s, "Archived")).json();
  await transaction(s.owner.id, s.org, (db) =>
    db.query(
      "UPDATE rooms SET archived_at=now(),version=version+1 WHERE id=$1",
      [a.id],
    ),
  );
  assert.equal((await single(s, "Replacement")).statusCode, 201);
  await assert.rejects(
    () =>
      transaction(s.owner.id, s.org, (db) =>
        db.query(
          "UPDATE rooms SET archived_at=NULL,version=version+1 WHERE id=$1",
          [a.id],
        ),
      ),
    { code: "P0409" },
  );
  const old = (
    await admin.query("SELECT archived_at FROM rooms WHERE id=$1", [a.id])
  ).rows[0];
  assert.ok(old.archived_at);
  assert.equal((await rooms(s)).length, 1);
  await admin.query(
    "UPDATE organization_entitlements SET room_limit=3 WHERE organization_id=$1",
    [s.org],
  );
  assert.equal((await single(s, "archived")).statusCode, 409);
});
test("downgrade below current usage is rejected without deleting rooms", async () => {
  const s = await setup();
  assert.equal((await single(s, "A")).statusCode, 201);
  assert.equal((await single(s, "B")).statusCode, 201);
  await assert.rejects(
    () =>
      admin.query(
        "UPDATE organization_entitlements SET room_limit=1 WHERE organization_id=$1",
        [s.org],
      ),
    { code: "P0409" },
  );
  assert.equal((await rooms(s)).length, 2);
  const plan = (
    await admin.query(
      "SELECT room_limit FROM organization_entitlements WHERE organization_id=$1",
      [s.org],
    )
  ).rows[0];
  assert.equal(plan.room_limit, 100);
});
