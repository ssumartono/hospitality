import { processBookingJobs } from "./booking-jobs.js";
import "dotenv/config";
import nodemailer from "nodemailer";
import { pool } from "./db.js";
import { workerPool, workerTransaction } from "./worker-db.js";
import { open } from "./crypto.js";
const mail = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 15000,
});
async function deliverIdentity() {
  return workerTransaction(null, async (db) => {
    await db.query(
      "UPDATE email_outbox e SET failed_at=now(),secret_token=NULL,token_cipher=NULL FROM verification_tokens t WHERE e.token_hash=t.token_hash AND e.sent_at IS NULL AND e.failed_at IS NULL AND (t.used_at IS NOT NULL OR t.expires_at<=now())",
    );
    const r = await db.query(
      "SELECT e.*,u.email FROM email_outbox e JOIN users u ON u.id=e.user_id JOIN verification_tokens t ON t.token_hash=e.token_hash WHERE t.used_at IS NULL AND t.expires_at>now() AND e.sent_at IS NULL AND e.failed_at IS NULL AND e.available_at<=now() ORDER BY e.available_at FOR UPDATE OF e SKIP LOCKED LIMIT 1",
    );
    if (!r.rowCount) return false;
    const job = r.rows[0];
    try {
      if (!job.token_cipher)
        throw Error("Legacy outbox requires encryption backfill");
      const token = await open(
        job.token_cipher,
        "email:" + job.user_id + ":" + job.token_hash,
      );
      const url = new URL(
        job.kind === "verify" ? "/verify" : "/reset",
        process.env.APP_ORIGIN ?? "http://localhost:5173",
      );
      url.hash = new URLSearchParams({ token }).toString();
      await mail.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@kost.test",
        to: job.email,
        subject:
          job.kind === "verify"
            ? "Verifikasi email Kost Hospitality"
            : "Reset password Kost Hospitality",
        text: "Buka tautan berikut: " + url.href,
        messageId: "<" + job.id + "@kost.local>",
      });
      await db.query(
        "UPDATE email_outbox SET sent_at=now(),secret_token=NULL,token_cipher=NULL,attempts=attempts+1 WHERE id=$1",
        [job.id],
      );
    } catch {
      await db.query(
        "UPDATE email_outbox SET attempts=attempts+1,available_at=now()+interval '1 minute'*power(2,least(attempts,8)),failed_at=CASE WHEN attempts>=7 THEN now() END WHERE id=$1",
        [job.id],
      );
    }
    return true;
  });
}
export async function deliverInvitationOne() {
  const pending = await workerPool.query(
    "SELECT id,organization_id FROM invitation_email_outbox WHERE sent_at IS NULL AND failed_at IS NULL AND available_at<=now() ORDER BY available_at LIMIT 1",
  );
  if (!pending.rowCount) return false;
  const { id, organization_id: org } = pending.rows[0];
  return workerTransaction(org, async (db) => {
    const r = await db.query(
      "SELECT e.*,i.state,i.expires_at FROM invitation_email_outbox e JOIN invitations i ON i.organization_id=e.organization_id AND i.id=e.invitation_id WHERE e.organization_id=$1 AND e.id=$2 AND e.sent_at IS NULL AND e.failed_at IS NULL AND e.available_at<=now() FOR UPDATE OF e SKIP LOCKED",
      [org, id],
    );
    if (!r.rowCount) return false;
    const job = r.rows[0];
    if (
      job.state !== "pending" ||
      new Date(job.expires_at).getTime() <= Date.now()
    ) {
      await db.query(
        "UPDATE invitation_email_outbox SET failed_at=now(),token_cipher=NULL WHERE organization_id=$1 AND id=$2",
        [org, id],
      );
      return true;
    }
    try {
      const token = await open(
        job.token_cipher,
        "invitation:" + org + ":" + job.invitation_id,
      );
      const url = new URL(
        "/invitation",
        process.env.APP_ORIGIN ?? "http://localhost:5173",
      );
      url.search = new URLSearchParams({
        organization: org,
        id: job.invitation_id,
      }).toString();
      url.hash = new URLSearchParams({ token }).toString();
      await mail.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@kost.test",
        to: job.email,
        subject: "Undangan staf " + job.organization_name,
        text:
          "Anda diundang bergabung ke " +
          job.organization_name +
          ". Masuk atau daftar dengan email ini, lalu buka tautan berikut sebelum undangan kedaluwarsa: " +
          url.href,
        messageId: "<" + job.id + "@kost.local>",
      });
      await db.query(
        "UPDATE invitation_email_outbox SET sent_at=now(),token_cipher=NULL,attempts=attempts+1 WHERE organization_id=$1 AND id=$2",
        [org, id],
      );
    } catch {
      await db.query(
        "UPDATE invitation_email_outbox SET attempts=attempts+1,available_at=now()+interval '1 minute'*power(2,least(attempts,8)),failed_at=CASE WHEN attempts>=7 THEN now() END WHERE organization_id=$1 AND id=$2",
        [org, id],
      );
    }
    return true;
  });
}
export async function deliverOne() {
  const business = await processBookingJobs();
  const identity = await deliverIdentity();
  const invitation = await deliverInvitationOne();
  return identity || invitation || business;
}
if (process.argv[1]?.endsWith("worker.ts")) {
  let stopping = false;
  for (const s of ["SIGINT", "SIGTERM"])
    process.on(s, () => {
      stopping = true;
    });
  while (!stopping) {
    try {
      await deliverOne();
    } catch {
      console.error("Email worker unavailable; retrying.");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await workerPool.end();
  await pool.end();
}
