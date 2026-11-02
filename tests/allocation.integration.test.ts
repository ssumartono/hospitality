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

test("parallel block requests cannot overlap; failures rollback block/audit and retries do not duplicate", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const pathRoom = path(s, "/rooms/" + room.id);
  const body = {
    start: "2027-01-01",
    end: "2027-02-01",
    reason: "Inspeksi sintetis",
  };
  const keys = [randomUUID(), randomUUID()];
  const responses = await Promise.all(
    keys.map((k) =>
      req("POST", pathRoom + "/blocks", s.owner, body, {
        "idempotency-key": k,
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
  const winner = responses.findIndex((r) => r.statusCode === 201),
    block = responses[winner].json();
  assert.deepEqual(
    (
      await req("POST", pathRoom + "/blocks", s.owner, body, {
        "idempotency-key": keys[winner],
      })
    ).json(),
    block,
  );
  assert.equal(
    responses[1 - winner].json().error.code,
    "AVAILABILITY_CONFLICT",
  );
  for (const table of ["room_blocks", "room_allocations"])
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int n FROM " + table + " WHERE organization_id=$1",
          [s.org],
        )
      ).rows[0].n,
      1,
    );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM audit_logs WHERE organization_id=$1 AND action='room.block_created'",
        [s.org],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await req("POST", pathRoom + "/blocks", s.owner, {
        start: "2027-02-01",
        end: "2027-02-02",
        reason: "Blokir bersebelahan",
      })
    ).statusCode,
    201,
  );
  const q = (
    await req(
      "GET",
      pathRoom + "/availability?start=2027-01-15&end=2027-01-16",
      s.owner,
    )
  ).json();
  assert.equal(q.available, false);
  assert.deepEqual(q.reasons, ["ROOM_NOT_READY", "ALLOCATION_CONFLICT"]);
  const k = randomUUID(),
    releaseBody = {
      version: block.version,
      reason: "Pemeriksaan selesai sintetis",
    };
  const released = await req(
    "POST",
    path(s, "/room-blocks/" + block.id + "/release"),
    s.owner,
    releaseBody,
    { "idempotency-key": k },
  );
  assert.equal(released.statusCode, 200, released.body);
  assert.deepEqual(
    (
      await req(
        "POST",
        path(s, "/room-blocks/" + block.id + "/release"),
        s.owner,
        releaseBody,
        { "idempotency-key": k },
      )
    ).json(),
    released.json(),
  );
  assert.equal(
    (
      await req(
        "POST",
        path(s, "/room-blocks/" + block.id + "/release"),
        s.owner,
        releaseBody,
      )
    ).statusCode,
    409,
  );
  const after = (
    await req(
      "GET",
      pathRoom + "/availability?start=2027-01-15&end=2027-01-16",
      s.owner,
    )
  ).json();
  assert.deepEqual(after.reasons, ["ROOM_NOT_READY"]);
  assert.equal(
    (await req("GET", pathRoom + "/blocks", s.owner)).json().items.length,
    2,
  );
});
async function sourceBooking(
  s: Awaited<ReturnType<typeof setup>>,
  room: string,
  db: pg.PoolClient,
  state = "held",
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO bookings(id,organization_id,property_id,room_id,state,starts_on,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      s.org,
      s.property,
      room,
      state,
      "2026-01-01",
      JSON.stringify({
        fixture: "TEST_ONLY constraint test, not accepted booking",
      }),
    ],
  );
  return id;
}
test("two independent database transactions contend on hold exclusion and ongoing null end locks future dates", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const run = () =>
    transaction(
      s.owner.id,
      s.org,
      async (db) => {
        const booking = await sourceBooking(s, room.id, db);
        await db.query(
          "INSERT INTO room_allocations(organization_id,property_id,room_id,kind,booking_id,starts_on,ends_on) VALUES($1,$2,$3,'hold',$4,'2027-01-01',NULL)",
          [s.org, s.property, room.id, booking],
        );
        await db.query("SELECT pg_sleep(0.05)");
        return booking;
      },
      admin,
    );
  const r = await Promise.allSettled([run(), run()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    (r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason
      .code,
    "23P01",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM bookings WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await req("POST", path(s, "/rooms/" + room.id + "/blocks"), s.owner, {
        start: "2099-01-01",
        reason: "Tidak boleh merebut ongoing",
      })
    ).statusCode,
    409,
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query(
        "INSERT INTO room_allocations(organization_id,property_id,room_id,kind,booking_id,starts_on) VALUES($1,$2,$3,'hold',$4,'2027-01-01')",
        [
          s.org,
          s.property,
          room.id,
          (
            r.find(
              (x) => x.status === "fulfilled",
            ) as PromiseFulfilledResult<string>
          ).value,
        ],
      ),
    ),
    (e: any) => e.code === "42501",
  );
});
test("physical presence survives planned end/released allocation, prevents new block, unique active presence and tenant FKs hold", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const lease = await transaction(
    s.owner.id,
    s.org,
    async (db) => {
      const booking = await sourceBooking(s, room.id, db, "checked_in");
      const lease = randomUUID();
      await db.query(
        "INSERT INTO leases(id,organization_id,property_id,room_id,booking_id,state,starts_on,planned_end_on) VALUES($1,$2,$3,$4,$5,'checked_in','2026-01-01','2026-02-01')",
        [lease, s.org, s.property, room.id, booking],
      );
      await db.query(
        "INSERT INTO room_allocations(organization_id,property_id,room_id,kind,lease_id,starts_on,ends_on,state,released_at) VALUES($1,$2,$3,'stay',$4,'2026-01-01','2026-02-01','released',now())",
        [s.org, s.property, room.id, lease],
      );
      await db.query(
        "INSERT INTO room_presence(organization_id,property_id,room_id,lease_id,entered_at) VALUES($1,$2,$3,$4,'2026-01-01T00:00:00Z')",
        [s.org, s.property, room.id, lease],
      );
      return lease;
    },
    admin,
  );
  const check = (
    await req(
      "GET",
      path(s, "/rooms/" + room.id + "/availability?start=2027-01-01"),
      s.owner,
    )
  ).json();
  assert.equal(check.available, false);
  assert(check.reasons.includes("ACTIVE_PRESENCE"));
  assert(!check.reasons.includes("ALLOCATION_CONFLICT"));
  assert.equal(
    (
      await req("POST", path(s, "/rooms/" + room.id + "/blocks"), s.owner, {
        start: "2027-01-01",
        reason: "Jangan sembunyikan penghuni",
      })
    ).json().error.code,
    "ACTIVE_PRESENCE",
  );
  await assert.rejects(
    admin.query(
      "INSERT INTO room_presence(organization_id,property_id,room_id,lease_id,entered_at) VALUES($1,$2,$3,$4,now())",
      [s.org, s.property, room.id, lease],
    ),
    (e: any) => e.code === "23505",
  );
  const other = await setup(),
    foreign = (await single(other, "101")).json();
  await assert.rejects(
    admin.query(
      "INSERT INTO room_presence(organization_id,property_id,room_id,lease_id,entered_at) VALUES($1,$2,$3,$4,now())",
      [other.org, other.property, foreign.id, lease],
    ),
    (e: any) => e.code === "23503",
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query("UPDATE room_presence SET exited_at=now() WHERE lease_id=$1", [
        lease,
      ]),
    ),
    (e: any) => e.code === "42501",
  );
});
test("block role/location/tenant boundaries and deferred parent-allocation consistency reject incomplete commands", async () => {
  const s = await setup(),
    room = (await single(s, "101")).json(),
    other = await setup();
  const p = path(s, "/rooms/" + room.id);
  for (const role of ["Manager", "Finance", "Operations"]) {
    const actor = await account();
    assert.equal((await grant(s, actor, role)).statusCode, 200);
    assert.equal(
      (await req("GET", p + "/availability?start=2027-01-01", actor))
        .statusCode,
      200,
    );
    const created = await req("POST", p + "/blocks", actor, {
      start: "2027-01-01",
      end: "2027-02-01",
      reason: "Role test",
    });
    assert.equal(created.statusCode, role === "Manager" ? 201 : 403);
    assert.equal(
      (await req("GET", path(other, "/rooms/" + room.id + "/blocks"), actor))
        .statusCode,
      404,
    );
  }
  assert.equal((await req("GET", p + "/blocks", other.owner)).statusCode, 404);
  const p2 = (
    await req("POST", path(s, "/properties"), s.owner, {
      name: "Lokasi lain sintetis",
      city: "Palembang",
      timezone: "Asia/Jakarta",
    })
  ).json();
  await req("POST", path(s, "/properties/" + p2.id + "/profile"), s.owner, {
    version: 1,
    code: "LOC2-" + randomUUID().slice(0, 8),
    floors: 1,
    segment: "Mahasiswi",
  });
  const type2 = (
    await req("POST", path(s, "/room-types"), s.owner, {
      propertyId: p2.id,
      name: "Tipe kedua",
      defaultCapacity: 1,
      defaultFacilities: [],
    })
  ).json();
  const room2 = (
    await req("POST", path(s, "/rooms"), s.owner, {
      propertyId: p2.id,
      typeId: type2.id,
      code: "101",
      floor: 1,
    })
  ).json();
  const scopedManager = await account();
  assert.equal((await grant(s, scopedManager, "Manager")).statusCode, 200);
  assert.equal(
    (await req("GET", path(s, "/rooms/" + room2.id + "/blocks"), scopedManager))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await req(
        "POST",
        path(s, "/rooms/" + room2.id + "/blocks"),
        scopedManager,
        { start: "2027-01-01", reason: "Tidak boleh lintas lokasi" },
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await req(
        "GET",
        path(s, "/rooms/" + room2.id + "/availability?start=2027-01-01"),
        scopedManager,
      )
    ).statusCode,
    404,
  );

  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query(
        "INSERT INTO room_blocks(organization_id,property_id,room_id,starts_on,reason,actor_id) VALUES($1,$2,$3,'2027-03-01','No allocation',$4)",
        [s.org, s.property, room.id, s.owner.id],
      ),
    ),
    (e: any) => e.message === "INVALID_STATE",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM room_blocks WHERE organization_id=$1 AND reason='No allocation'",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
  await transaction(s.owner.id, null, async (db) =>
    assert.equal(
      (await db.query("SELECT id FROM room_allocations")).rowCount,
      0,
    ),
  );
});
test("booking snapshot guard rejects changed/expired quotes and preserves requested ongoing end separately from preview", async () => {
  const { prepareBookingPricingSnapshot } =
    await import("../src/server/booking-snapshot.js");
  const s = await setup(),
    room = (await single(s, "101")).json();
  await req("POST", path(s, "/rate-policies"), s.owner, policyBody(s));
  const q = (
    await req("POST", path(s, "/quotes"), s.owner, {
      roomId: room.id,
      start: "2027-01-16",
      occupantCount: 1,
    })
  ).json();
  const snapshot = await transaction(s.owner.id, s.org, (db) =>
    prepareBookingPricingSnapshot(db, s.owner.id, s.org, q.id),
  );
  assert.equal(snapshot.requestedEnd, null);
  assert.equal(snapshot.pricing.end, "2027-02-01");
  assert.equal(snapshot.initialInvoiceLines.length, 1);
  const copied = JSON.stringify(snapshot);
  snapshot.pricing.total = 1;
  assert.equal(
    (await req("GET", path(s, "/quotes/" + q.id), s.owner)).json().snapshot
      .total,
    774194,
  );
  assert.notEqual(copied, JSON.stringify(snapshot));
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { expectedVersion: 1, baseRent: 1800000 }),
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      prepareBookingPricingSnapshot(db, s.owner.id, s.org, q.id),
    ),
    (e: any) => e.code === "QUOTE_CHANGED",
  );
  const q2 = (
    await req("POST", path(s, "/quotes"), s.owner, {
      roomId: room.id,
      start: "2027-01-16",
      occupantCount: 1,
    })
  ).json();
  await admin.query(
    "UPDATE pricing_quotes SET expires_at=now()-interval'1 second' WHERE id=$1",
    [q2.id],
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      prepareBookingPricingSnapshot(db, s.owner.id, s.org, q2.id),
    ),
    (e: any) => e.code === "QUOTE_EXPIRED",
  );
  const q3 = (
    await req("POST", path(s, "/quotes"), s.owner, {
      roomId: room.id,
      start: "2027-01-16",
      occupantCount: 1,
    })
  ).json();
  await transaction(s.owner.id, s.org, (db) =>
    prepareBookingPricingSnapshot(db, s.owner.id, s.org, q3.id),
  );
  await admin.query(
    "UPDATE rooms SET capacity=2,version=version+1 WHERE id=$1",
    [room.id],
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      prepareBookingPricingSnapshot(db, s.owner.id, s.org, q3.id),
    ),
    (e: any) => e.code === "QUOTE_CHANGED",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM bookings WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
});
