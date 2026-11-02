import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
if (
  process.env.NODE_ENV === "production" ||
  !process.argv.includes("--confirm-layout")
)
  throw Error(
    "Pilot example seed is local-only and requires --confirm-layout after reviewing codes/floors.",
  );
const base = new URL(process.env.SEED_API_URL ?? "http://localhost:3001");
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw Error("Pilot example seed requires localhost API");
for (const name of [
  "SEED_OWNER_EMAIL",
  "SEED_OWNER_PASSWORD",
  "SEED_ORGANIZATION_ID",
  "SEED_PROPERTY_ID",
  "SEED_TYPE_ID",
])
  if (!process.env[name]) throw Error("Missing " + name);
const org = process.env.SEED_ORGANIZATION_ID!,
  property = process.env.SEED_PROPERTY_ID!,
  type = process.env.SEED_TYPE_ID!;
let cookie = "",
  csrf = "";
async function request(path: string, body: unknown, key?: string) {
  const r = await fetch(new URL("/api/v1" + path, base), {
    method: "POST",
    headers: {
      Origin: process.env.APP_ORIGIN ?? "http://localhost:5173",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error("API rejected seed: " + (data.error?.code ?? r.status));
  const next = r.headers.getSetCookie().find((s) => s.startsWith("session="));
  if (next) cookie = next.split(";")[0];
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
try {
  const login = await request("/auth/login", {
    email: process.env.SEED_OWNER_EMAIL,
    password: process.env.SEED_OWNER_PASSWORD,
  });
  if (login.mfaRequired) {
    if (!process.env.SEED_MFA_CODE)
      throw Error("MFA active: provide an unused SEED_MFA_CODE");
    await request("/auth/mfa/verify", {
      challengeId: login.challengeId,
      code: process.env.SEED_MFA_CODE,
    });
  }
  const override = process.env.SEED_ROOMS_FILE
    ? JSON.parse(await readFile(process.env.SEED_ROOMS_FILE, "utf8"))
    : undefined;
  const preview = await request(
    "/organizations/" + org + "/rooms/bulk-preview",
    {
      mode: "pilot",
      propertyId: property,
      typeId: type,
      ...(override ? { rooms: override } : {}),
    },
  );
  if (preview.alreadyApplied)
    console.log(
      "Pilot example already applied; no room was added or overwritten.",
    );
  else {
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          "pilot-example-v1",
          org,
          property,
          type,
          override ?? null,
        ]),
      )
      .digest("hex");
    const result = await request(
      "/organizations/" + org + "/rooms/bulk-commit",
      {
        propertyId: property,
        previewChecksum: preview.previewChecksum,
        confirmCodes: true,
        confirmLayout: true,
      },
      key,
    );
    console.log(
      "Pilot rooms created: " +
        result.created +
        "; all start inspection. No rent, payment, presence or agreement was seeded.",
    );
  }
} finally {
  if (cookie) await request("/auth/logout", {}).catch(() => {});
}
