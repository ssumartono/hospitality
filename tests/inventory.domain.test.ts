import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBulk } from "../src/server/inventory-service.js";
import {
  bulkInput,
  roomInput,
  typeInput,
} from "../src/server/inventory-schema.js";
const property = "00000000-0000-4000-8000-000000000001",
  type = {
    id: "00000000-0000-4000-8000-000000000002",
    version: 1,
    defaultCapacity: 1,
    defaultFacilities: ["Synthetic facility"],
  };
test("pilot fixture is exactly 12 configurable inspection candidates on two floors", async () => {
  const rows = await resolveBulk(
    bulkInput.parse({ mode: "pilot", propertyId: property, typeId: type.id }),
    type,
    2,
  );
  assert.equal(rows.length, 12);
  assert.deepEqual(
    rows.map((r) => r.floor),
    [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
  );
  assert.equal(rows[0].code, "101");
  assert.equal(rows[11].code, "206");
});
test("sequence generation handles padding and rejects duplicate/cross-floor/oversize plans", async () => {
  let input = bulkInput.parse({
    propertyId: property,
    typeId: type.id,
    prefix: "A",
    startNumber: 9,
    count: 3,
    floor: 1,
    padding: 3,
  });
  assert.deepEqual(
    (await resolveBulk(input, type, 2)).map((r) => r.code),
    ["A009", "A010", "A011"],
  );
  await assert.rejects(
    () =>
      resolveBulk(
        bulkInput.parse({
          mode: "manual",
          propertyId: property,
          typeId: type.id,
          rooms: [
            { code: "A", floor: 1 },
            { code: "a", floor: 1 },
          ],
        }),
        type,
        2,
      ),
    { code: "DUPLICATE_ROOM_CODE" },
  );
  await assert.rejects(
    () =>
      resolveBulk(
        bulkInput.parse({
          mode: "manual",
          propertyId: property,
          typeId: type.id,
          rooms: [{ code: "A", floor: 3 }],
        }),
        type,
        2,
      ),
    { code: "VALIDATION_ERROR" },
  );
  assert.throws(() =>
    bulkInput.parse({
      propertyId: property,
      typeId: type.id,
      prefix: "",
      startNumber: 1,
      count: 101,
      floor: 1,
    }),
  );
});
test("new rooms cannot claim ready and absent overrides preserve type inheritance intent", () => {
  const body = { propertyId: property, typeId: type.id, code: "A", floor: 1 };
  assert.equal(roomInput.parse(body).condition, "inspection");
  assert.equal(roomInput.parse(body).facilities, undefined);
  assert.throws(() => roomInput.parse({ ...body, condition: "ready" }));
  assert.throws(() =>
    typeInput.parse({
      propertyId: property,
      name: "Synthetic",
      defaultCapacity: 0,
    }),
  );
});
