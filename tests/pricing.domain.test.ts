import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { policyInput, quoteInput } from "../src/server/pricing-schema.js";
import {
  calculateQuote,
  monthAnchor,
  halfUp,
  startOfLocalDate,
  discountLine,
} from "../src/server/pricing-domain.js";
export const fixture = () =>
  policyInput.parse({
    propertyId: randomUUID(),
    expectedVersion: 0,
    effectiveAt: "2026-01-01T00:00:00Z",
    baseRent: 1500000,
    typeRates: {},
    roomRates: {},
    depositEnabled: false,
    depositAmount: 0,
    fees: [],
    cycle: "anniversary",
    prorata: "actual",
    dueDay: 1,
    invoiceLeadDays: 0,
    bookingMinimum: 500000,
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
    notes: "TEST_ONLY synthetic",
  });
test("F01/F02 initial totals and booking minimum are not an extra fee", () => {
  const p = fixture();
  let q = calculateQuote(p, p.baseRent, "2027-01-01");
  assert.equal(q.total, 1500000);
  assert.equal(q.remainingAfterBooking, 1000000);
  assert.equal(q.initialPeriodOnly, true);
  p.depositEnabled = true;
  p.depositAmount = 1000000;
  p.fees = [
    {
      code: "admin",
      label: "Admin",
      amount: 100000,
      frequency: "once",
      refundable: false,
    },
  ];
  q = calculateQuote(p, p.baseRent, "2027-01-01");
  assert.equal(q.total, 2600000);
  assert.equal(q.remainingAfterBooking, 2100000);
});
test("F04 calendar actual half-up and F05 original anniversary anchor including leap year", () => {
  const p = { ...fixture(), cycle: "calendar" as const };
  const q = calculateQuote(p, p.baseRent, "2027-01-16", "2027-02-01");
  assert.equal(q.lines[0].amount, 774194);
  assert.equal(monthAnchor("2027-01-31", 1), "2027-02-28");
  assert.equal(monthAnchor("2027-01-31", 2), "2027-03-31");
  assert.equal(monthAnchor("2028-01-31", 1), "2028-02-29");
  assert.equal(halfUp(1, 1, 2), 1);
  assert.equal(halfUp(1000000000000, 16, 31), 516129032258);
});
test("AC32 splits rent monthly while fees monthly/once and deposit are never prorated", () => {
  const p = {
    ...fixture(),
    cycle: "calendar" as const,
    depositEnabled: true,
    depositAmount: 1000000,
    fees: [
      {
        code: "parking",
        label: "Parkir",
        amount: 100000,
        frequency: "monthly" as const,
        refundable: false,
      },
      {
        code: "admin",
        label: "Admin",
        amount: 50000,
        frequency: "once" as const,
        refundable: false,
      },
    ],
  };
  const q = calculateQuote(p, p.baseRent, "2027-01-16", "2027-03-02");
  assert.deepEqual(
    q.lines.filter((l) => l.kind === "rent").map((l) => l.amount),
    [774194, 1500000, 48387],
  );
  assert.equal(q.lines.filter((l) => l.code === "parking").length, 3);
  assert.equal(q.lines.filter((l) => l.kind === "deposit").length, 1);
  assert.equal(q.lines.filter((l) => l.code === "admin").length, 1);
  assert.equal(q.total, 3672581);
});
test("anniversary partial endings and none, F10 movement rent fragments and bounded calculations", () => {
  const p = { ...fixture(), bookingMinimum: 0 };
  assert.deepEqual(
    calculateQuote(p, 1500000, "2027-01-31", "2027-03-31").lines.map((l) => [
      l.start,
      l.end,
      l.amount,
    ]),
    [
      ["2027-01-31", "2027-02-28", 1500000],
      ["2027-02-28", "2027-03-31", 1500000],
    ],
  );
  assert.equal(
    calculateQuote(
      { ...p, cycle: "calendar" },
      1500000,
      "2027-01-01",
      "2027-01-16",
    ).total,
    725806,
  );
  assert.equal(
    calculateQuote(
      { ...p, cycle: "calendar" },
      1800000,
      "2027-01-16",
      "2027-02-01",
    ).total,
    929032,
  );
  assert.equal(
    calculateQuote(
      { ...p, prorata: "none" },
      1500000,
      "2027-01-31",
      "2027-02-01",
    ).total,
    1500000,
  );
  assert.throws(() => calculateQuote(p, 1500000, "2027-01-01", "2030-01-01"));
  assert.throws(() =>
    calculateQuote({ ...p, bookingMinimum: 2 }, 0, "2027-01-01"),
  );
  assert.equal(
    calculateQuote(p, 1500000, "2027-01-31", "2027-02-01").total,
    1500000,
  );
  assert.equal(discountLine(100, 100), 0);
  assert.throws(() => discountLine(100, 101));
});
test("business date timezone is independent of browser timezone; strict money/policy/date validation", () => {
  assert.equal(
    startOfLocalDate("2027-01-16", "Asia/Jakarta").toISOString(),
    "2027-01-15T17:00:00.000Z",
  );
  assert.equal(
    startOfLocalDate("2027-01-16", "Asia/Makassar").toISOString(),
    "2027-01-15T16:00:00.000Z",
  );
  const p = fixture();
  assert.equal(policyInput.safeParse({ ...p, baseRent: 1.5 }).success, false);
  assert.equal(
    policyInput.safeParse({ ...p, depositAmount: 1 }).success,
    false,
  );
  assert.equal(
    policyInput.safeParse({
      ...p,
      penaltyEnabled: true,
      penaltyAmount: 2,
      penaltyCap: 1,
    }).success,
    false,
  );
  assert.equal(
    quoteInput.safeParse({
      roomId: randomUUID(),
      start: "2027-02-30",
      occupantCount: 1,
    }).success,
    false,
  );
  assert.equal(
    quoteInput.safeParse({
      roomId: randomUUID(),
      start: "2027-02-01",
      end: "2027-02-01",
      occupantCount: 1,
    }).success,
    false,
  );
});
