import { workerPool } from "../src/server/worker-db.js";
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
  await workerPool.end();
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

async function prepared(minimum = 500000) {
  const s = await setup(),
    room = (await single(s, "101")).json();
  const checks = await req(
    "POST",
    path(s, "/rooms/" + room.id + "/checklist"),
    s.owner,
    {
      version: room.checklistVersion,
      roomVersion: room.version,
      water: true,
      electric: true,
      lock: true,
      furniture: true,
      clean: true,
    },
  );
  assert.equal(checks.statusCode, 200, checks.body);
  const ready = await req(
    "POST",
    path(s, "/rooms/" + room.id + "/initial-ready"),
    s.owner,
    { version: room.version, reason: "Inspeksi fisik awal sintetis selesai" },
  );
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().condition, "ready");
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { bookingMinimum: minimum }),
  );
  return { ...s, room: ready.json() };
}
async function quote(s: Awaited<ReturnType<typeof prepared>>) {
  const q = await req("POST", path(s, "/quotes"), s.owner, {
    roomId: s.room.id,
    start: "2027-01-01",
    occupantCount: 1,
  });
  assert.equal(q.statusCode, 201, q.body);
  return q.json();
}
async function intake(
  s: Awaited<ReturnType<typeof prepared>>,
  q: any,
  key = randomUUID(),
) {
  const r = await req(
    "POST",
    path(s, "/bookings"),
    s.owner,
    {
      quoteId: q.id,
      plannedMonths: 6,
      policyAccepted: true,
      consentNote:
        "Konfirmasi langsung calon penghuni sintetis dicatat petugas",
      customer: { name: "Calon penghuni sintetis", phone: "0000000000" },
    },
    { "idempotency-key": key },
  );
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
test("two real accepts serialize allocation/invoice/outbox and idempotent retry; issued snapshot never follows master edits", async () => {
  const s = await prepared(),
    q = await quote(s),
    a = await intake(s, q),
    b = await intake(s, q);
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM room_allocations WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all(
    [a, b].map((b, i) =>
      req(
        "POST",
        path(s, "/bookings/" + b.id + "/accept"),
        s.owner,
        { version: 1, reason: "Konfirmasi pengelola sintetis" },
        { "idempotency-key": keys[i] },
      ),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.statusCode).sort(),
    [200, 409],
    results.map((r) => r.body).join(" "),
  );
  const winner = results.findIndex((r) => r.statusCode === 200),
    accepted = results[winner].json(),
    selected = [a, b][winner];
  const replay = await req(
    "POST",
    path(s, "/bookings/" + selected.id + "/accept"),
    s.owner,
    { version: 1, reason: "Konfirmasi pengelola sintetis" },
    { "idempotency-key": keys[winner] },
  );
  assert.deepEqual(replay.json(), accepted);
  assert.equal(accepted.booking.state, "held");
  assert.equal(accepted.booking.end, null);
  for (const t of ["invoices", "room_allocations", "booking_events_outbox"])
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int n FROM " + t + " WHERE organization_id=$1",
          [s.org],
        )
      ).rows[0].n,
      1,
    );
  const invoice = (
    await req("GET", path(s, "/invoices?propertyId=" + s.property), s.owner)
  ).json().items[0];
  assert.equal(invoice.total, 1500000);
  assert.equal(invoice.balance, 1500000);
  assert.equal(invoice.verifiedReceived, 0);
  assert.equal(invoice.paymentStatus, "unpaid");
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { expectedVersion: 1, baseRent: 2100000 }),
  );
  assert.deepEqual(
    (
      await req("GET", path(s, "/invoices?propertyId=" + s.property), s.owner)
    ).json().items[0],
    invoice,
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query("UPDATE invoices SET total=0 WHERE id=$1", [invoice.id]),
    ),
    (e: any) => e.code === "42501",
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query(
        "INSERT INTO invoice_lines(organization_id,property_id,invoice_id,position,kind,code,label,amount,starts_on,ends_on,refundable)VALUES($1,$2,$3,99,'fee','x','bad append',1,'2027-01-01','2027-02-01',false)",
        [s.org, s.property, invoice.id],
      ),
    ),
    (e: any) => e.message === "INVALID_STATE",
  );
});
test("minimum zero confirms without receipts; real expiry retry releases only held and notification dedupe preserves tenant scope", async () => {
  const { processBookingJobs } = await import("../src/server/booking-jobs.js");
  const s = await prepared(0),
    a = await intake(s, await quote(s));
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + a.id + "/accept"), s.owner, {
        version: 1,
        reason: "Minimum nol eksplisit",
      })
    ).json().booking.state,
    "confirmed",
  );
  await admin.query(
    "UPDATE invoices SET due_at=now()-interval'1 day' WHERE booking_id=$1",
    [a.id],
  );
  assert.equal(
    (
      await req("GET", path(s, "/invoices?propertyId=" + s.property), s.owner)
    ).json().items[0].paymentStatus,
    "overdue",
  );
  const held = await prepared(500000),
    b = await intake(held, await quote(held));
  assert.equal(
    (
      await req(
        "POST",
        path(held, "/bookings/" + b.id + "/accept"),
        held.owner,
        { version: 1, reason: "Tunggu verifikasi pembayaran" },
      )
    ).json().booking.state,
    "held",
  );
  await admin.query(
    "UPDATE bookings SET hold_deadline=now()-interval'1 second' WHERE id=$1",
    [b.id],
  );
  for (let i = 0; i < 20; i++) await processBookingJobs();
  assert.equal(
    (await admin.query("SELECT state FROM bookings WHERE id=$1", [a.id]))
      .rows[0].state,
    "confirmed",
  );
  assert.equal(
    (await admin.query("SELECT state FROM bookings WHERE id=$1", [b.id]))
      .rows[0].state,
    "expired",
  );
  assert.equal(
    (
      await admin.query("SELECT state FROM invoices WHERE booking_id=$1", [
        b.id,
      ])
    ).rows[0].state,
    "void",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT state FROM room_allocations WHERE booking_id=$1",
        [b.id],
      )
    ).rows[0].state,
    "released",
  );
  const events = (
    await admin.query(
      "SELECT event,count(*)::int n FROM booking_events_outbox WHERE booking_id=$1 GROUP BY event",
      [b.id],
    )
  ).rows;
  assert.deepEqual(
    events.map((r) => r.n),
    [1, 1],
  );
  const notes = (
    await req("GET", path(held, "/notifications"), held.owner)
  ).json().items;
  assert.equal(notes.filter((n: any) => n.bookingId === b.id).length, 2);
  assert.equal(
    (await req("GET", path(held, "/notifications"), s.owner)).statusCode,
    404,
  );

  await assert.rejects(
    workerPool.query("SELECT name FROM customers"),
    (e: any) => e.code === "42501",
  );
  await assert.rejects(
    transaction(s.owner.id, s.org, (db) =>
      db.query("SELECT expire_one_staff_booking()"),
    ),
    (e: any) => e.code === "42501",
  );
});
test("initial readiness requires actual checklist, no current block/workorder or occupancy history; accept rechecks checklist after ready", async () => {
  const s = await setup(),
    r = (await single(s, "101")).json();
  const ready = () =>
    req("POST", path(s, "/rooms/" + r.id + "/initial-ready"), s.owner, {
      version: 1,
      reason: "Inspeksi sintetis",
    });
  assert.equal((await ready()).json().error.code, "ROOM_NOT_READY");
  await req("POST", path(s, "/rooms/" + r.id + "/checklist"), s.owner, {
    version: 1,
    roomVersion: 1,
    water: true,
    electric: true,
    lock: true,
    furniture: true,
    clean: true,
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const block = (
    await req("POST", path(s, "/rooms/" + r.id + "/blocks"), s.owner, {
      start: today,
      reason: "Perbaikan saat ini sintetis",
    })
  ).json();
  assert.equal((await ready()).json().error.code, "ROOM_NOT_READY");
  await req("POST", path(s, "/room-blocks/" + block.id + "/release"), s.owner, {
    version: 1,
    reason: "Blokir selesai sintetis",
  });
  const w = (
    await admin.query(
      "INSERT INTO work_orders(organization_id,property_id,room_id,kind,state,reason)VALUES($1,$2,$3,'maintenance','open','TEST_ONLY') RETURNING id",
      [s.org, s.property, r.id],
    )
  ).rows[0];
  assert.equal((await ready()).json().error.code, "ROOM_NOT_READY");
  await admin.query("UPDATE work_orders SET state='completed' WHERE id=$1", [
    w.id,
  ]);
  assert.equal((await ready()).statusCode, 200);
  const preparedRoom = { ...s, room: { ...r, version: 2 } };
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { bookingMinimum: 0 }),
  );
  const b = await intake(preparedRoom, await quote(preparedRoom));
  await req("POST", path(s, "/rooms/" + r.id + "/checklist"), s.owner, {
    version: 2,
    roomVersion: 2,
    water: false,
    electric: true,
    lock: true,
    furniture: true,
    clean: true,
  });
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + b.id + "/accept"), s.owner, {
        version: 1,
        reason: "Tidak boleh lewat inspeksi gagal",
      })
    ).json().error.code,
    "INVALID_STATE",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM invoices WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
  const historicalBooking = randomUUID(),
    historicalLease = randomUUID();
  await admin.query(
    "INSERT INTO bookings(id,organization_id,property_id,room_id,state,starts_on,pricing_snapshot)VALUES($1,$2,$3,$4,'checked_in','2026-01-01','{}')",
    [historicalBooking, s.org, s.property, r.id],
  );
  await admin.query(
    "INSERT INTO leases(id,organization_id,property_id,room_id,booking_id,state,starts_on)VALUES($1,$2,$3,$4,$5,'physical_exit','2026-01-01')",
    [historicalLease, s.org, s.property, r.id, historicalBooking],
  );
  await admin.query(
    "INSERT INTO room_presence(organization_id,property_id,room_id,lease_id,entered_at,exited_at)VALUES($1,$2,$3,$4,'2026-01-01','2026-02-01')",
    [s.org, s.property, r.id, historicalLease],
  );
  await admin.query(
    "UPDATE rooms SET condition='inspection',version=version+1 WHERE id=$1",
    [r.id],
  );
  await req("POST", path(s, "/rooms/" + r.id + "/checklist"), s.owner, {
    version: 3,
    roomVersion: 3,
    water: true,
    electric: true,
    lock: true,
    furniture: true,
    clean: true,
  });
  assert.equal(
    (
      await req("POST", path(s, "/rooms/" + r.id + "/initial-ready"), s.owner, {
        version: 3,
        reason: "Tidak boleh menggantikan turnover",
      })
    ).json().error.code,
    "ROOM_NOT_READY",
  );
});
test("changed/expired policy requires explicit refreshed consent and another authorized Manager can accept", async () => {
  const s = await prepared(0),
    b = await intake(s, await quote(s));
  await req(
    "POST",
    path(s, "/rate-policies"),
    s.owner,
    policyBody(s, { expectedVersion: 1, baseRent: 1800000 }),
  );
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + b.id + "/accept"), s.owner, {
        version: 1,
        reason: "Harga berubah tidak diam-diam",
      })
    ).json().error.code,
    "QUOTE_CHANGED",
  );
  await admin.query(
    "UPDATE bookings SET quote_expires_at=now()-interval'1 second' WHERE id=$1",
    [b.id],
  );
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + b.id + "/accept"), s.owner, {
        version: 1,
        reason: "Expired wajib quote baru",
      })
    ).json().error.code,
    "QUOTE_EXPIRED",
  );
  const q = await quote(s);
  const refreshed = await req(
    "POST",
    path(s, "/bookings/" + b.id + "/refresh-quote"),
    s.owner,
    {
      version: 1,
      quoteId: q.id,
      policyAccepted: true,
      consentNote: "Harga baru dikonfirmasi ulang sintetis",
    },
  );
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  assert.equal(refreshed.json().version, 2);
  assert.equal(refreshed.json().snapshot.pricing.initialTotal, 1800000);
  const manager = await account();
  assert.equal((await grant(s, manager, "Manager")).statusCode, 200);
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + b.id + "/accept"), manager, {
        version: 2,
        reason: "Manager lokasi menyetujui",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM booking_consents WHERE booking_id=$1",
        [b.id],
      )
    ).rows[0].n,
    2,
  );
});
test("booking customers/invoices are tenant+location scoped; Finance/Ops cannot command booking and failed intake is atomic", async () => {
  const s = await prepared(),
    other = await prepared(),
    q = await quote(s);
  for (const role of ["Finance", "Operations"]) {
    const actor = await account();
    await grant(s, actor, role);
    assert.equal(
      (
        await req("POST", path(s, "/bookings"), actor, {
          quoteId: q.id,
          plannedMonths: 6,
          policyAccepted: true,
          consentNote: "Tidak boleh menulis",
          customer: { name: "Synthetic", phone: "00000000" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await req("GET", path(s, "/invoices?propertyId=" + s.property), actor))
        .statusCode,
      role === "Finance" ? 200 : 403,
    );
  }
  const before = (
    await admin.query(
      "SELECT count(*)::int n FROM customers WHERE organization_id=$1",
      [s.org],
    )
  ).rows[0].n;
  assert.equal(
    (
      await req("POST", path(s, "/bookings"), s.owner, {
        quoteId: q.id,
        plannedMonths: 6,
        policyAccepted: true,
        consentNote: "Customer tenant lain",
        customerId: randomUUID(),
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM customers WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    before,
  );
  const b = await intake(s, q);
  assert.equal(
    (
      await req(
        "GET",
        path(s, "/bookings?propertyId=" + s.property),
        other.owner,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await req("POST", path(s, "/bookings/" + b.id + "/accept"), other.owner, {
        version: 1,
        reason: "Cross tenant denied",
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await req(
        "GET",
        path(other, "/customers?propertyId=" + s.property),
        other.owner,
      )
    ).statusCode,
    404,
  );
  const rejected = await req(
    "POST",
    path(s, "/bookings/" + b.id + "/reject"),
    s.owner,
    { version: 1, reason: "Calon penghuni batal sebelum approval" },
  );
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.json().state, "rejected");
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM invoices WHERE organization_id=$1",
        [s.org],
      )
    ).rows[0].n,
    0,
  );
});
