import { workerTransaction } from "./worker-db.js";
export async function processBookingJobs() {
  const expired = await workerTransaction(
    null,
    async (db) =>
      (await db.query("SELECT expire_one_staff_booking() AS changed")).rows[0]
        .changed,
  );
  const notified = await workerTransaction(
    null,
    async (db) =>
      (await db.query("SELECT deliver_one_booking_notification() AS changed"))
        .rows[0].changed,
  );
  return expired || notified;
}
