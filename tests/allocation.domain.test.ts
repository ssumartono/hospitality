import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockInput,
  interval,
  releaseBlockInput,
  intervalsOverlap,
} from "../src/server/allocation-schema.js";
test("exclusive boundaries, overlapping and ongoing intervals", () => {
  assert.equal(
    intervalsOverlap(
      { start: "2027-01-01", end: "2027-01-10" },
      { start: "2027-01-10", end: "2027-02-01" },
    ),
    false,
  );
  assert.equal(
    intervalsOverlap(
      { start: "2027-01-01", end: null },
      { start: "2099-01-01", end: null },
    ),
    true,
  );
  assert.equal(
    intervalsOverlap(
      { start: "2027-01-01", end: "2027-01-11" },
      { start: "2027-01-10", end: null },
    ),
    true,
  );
});
test("block dates and release reason/version validate before mutation", () => {
  assert.equal(
    blockInput.safeParse({ start: "2027-02-30", reason: "Inspeksi" }).success,
    false,
  );
  assert.equal(
    interval.safeParse({ start: "2027-01-01", end: "2027-01-01" }).success,
    false,
  );
  assert.equal(
    blockInput.safeParse({ start: "2027-01-01", reason: "Inspeksi" }).success,
    true,
  );
  assert.equal(
    releaseBlockInput.safeParse({ version: 0, reason: "ok" }).success,
    false,
  );
});
