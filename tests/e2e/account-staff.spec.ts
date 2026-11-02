import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { totp } from "../../src/server/mfa.js";
const password = "Synthetic-password-123";
async function emailLink(
  request: APIRequestContext,
  email: string,
  kind: "verify" | "invitation",
) {
  let link = "";
  await expect
    .poll(
      async () => {
        const result = await (
          await request.get("http://localhost:8025/api/v1/search", {
            params: { query: "to:" + email },
          })
        ).json();
        for (const m of result.messages ?? []) {
          const message = await (
            await request.get("http://localhost:8025/api/v1/message/" + m.ID)
          ).json();
          const candidate = (message.Text as string)
            .match(/http:\/\/localhost:4173\/[^\s]+/g)
            ?.find((s) => new URL(s).pathname === "/" + kind);
          if (candidate) {
            link = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 75000 },
    )
    .toBe(true);
  return link;
}
async function register(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Buat akun baru", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator("main > .notice")).toContainText(
    "tautan verifikasi",
  );
  await page.goto(await emailLink(request, email, "verify"));
  await page.getByRole("button", { name: "Verifikasi email saya" }).click();
  await expect(page.locator("main > .notice")).toContainText(
    "Email terverifikasi",
  );
  await login(page, email);
  await expect(
    page.getByRole("heading", { name: "Organisasi Anda", exact: true }),
  ).toBeVisible();
}
async function login(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}
const security = (page: Page) =>
  page.locator('section[aria-labelledby="account-security-title"]');
test("account MFA enrollment, recovery login and disable work through the UI", async ({
  page,
  request,
}, info) => {
  const email = "mfa-ui-" + randomUUID() + "@example.test";
  await register(page, request, email);
  const card = security(page);
  await expect(
    card.getByText("MFA belum aktif", { exact: true }),
  ).toBeVisible();
  await card.getByLabel("Password konfirmasi", { exact: true }).fill(password);
  await card.getByRole("button", { name: "Mulai aktivasi MFA" }).click();
  await expect(card.locator(".secret-value")).toBeVisible();
  const secret = (await card.locator(".secret-value").textContent())!;
  await card
    .getByLabel("Kode authenticator 6 digit")
    .fill(totp(secret).generate());
  await card.getByRole("button", { name: "Konfirmasi aktivasi MFA" }).click();
  await expect(card.locator(".recovery-codes code")).toHaveCount(10);
  const codes = await card.locator(".recovery-codes code").allTextContents();
  await card.getByRole("button", { name: "Saya sudah menyimpan kode" }).click();
  await expect(card.getByText("MFA aktif", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await login(page, email);
  await expect(
    page.getByRole("heading", { name: "Verifikasi dua langkah" }),
  ).toBeVisible();
  await page
    .getByLabel("Kode MFA atau pemulihan", { exact: true })
    .fill(codes[0]);
  await page.getByRole("button", { name: "Verifikasi dan masuk" }).click();
  await expect(card.getByText("MFA aktif", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Nonaktifkan MFA", exact: true })
    .click();
  await card.getByLabel("Password konfirmasi", { exact: true }).fill(password);
  await card
    .getByLabel("Kode MFA atau kode pemulihan (wajib)", { exact: true })
    .fill(codes[1]);
  await card
    .getByRole("button", { name: "Konfirmasi nonaktifkan MFA" })
    .click();
  await expect(
    card.getByText("MFA belum aktif", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path:
      "project-docs/evidence/account-security-" + info.project.name + ".png",
    fullPage: true,
    mask: [page.locator("input[type=password]")],
  });
});

test("Owner invites staff, changes location scope and revokes access through the UI", async ({
  page,
  browser,
  request,
}, info) => {
  const owner = "owner-ui-" + randomUUID() + "@example.test",
    staffEmail = "member-ui-" + randomUUID() + "@example.test";
  await register(page, request, owner);
  await page.getByLabel("Nama organisasi").fill("Organisasi Uji Staf");
  await page.getByLabel("Slug organisasi").fill("ui-staff-" + randomUUID());
  await page
    .getByRole("button", { name: "Buat organisasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Organisasi berhasil",
  );
  for (const name of ["Lokasi Pertama Uji Staf", "Lokasi Kedua Uji Staf"]) {
    await page.getByLabel("Nama lokasi", { exact: true }).fill(name);
    await page.getByLabel("Kota", { exact: true }).fill("Palembang");
    await page
      .getByRole("button", { name: "Tambah lokasi", exact: true })
      .click();
    await expect(page.locator("main > .notice")).toContainText(
      "Lokasi tersimpan",
    );
  }
  const region = page.locator(
    'section[aria-labelledby="staff-management-title"]',
  );
  const form = region.getByRole("form", { name: "Undang staf", exact: true });
  await expect(
    form.getByLabel("Lokasi Pertama Uji Staf", { exact: true }),
  ).toBeVisible();
  await form.getByLabel("Email staf", { exact: true }).fill(staffEmail);
  await form
    .getByRole("combobox", { name: "Peran staf", exact: true })
    .selectOption("Manager");
  await form.getByLabel("Lokasi Pertama Uji Staf", { exact: true }).check();
  await form.getByLabel("Password konfirmasi", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Kirim undangan staf" }).click();
  await expect(region.locator(".notice")).toContainText("Undangan tersimpan");
  const invitationUrl = await emailLink(request, staffEmail, "invitation");
  const org = new URL(invitationUrl).searchParams.get("organization")!;
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    baseURL: "http://localhost:4173",
  });
  const staff = await context.newPage();
  try {
    await register(staff, request, staffEmail);
    await staff.goto(invitationUrl);
    await staff.getByRole("button", { name: "Terima undangan staf" }).click();
    await expect(staff.locator("main > .notice")).toContainText(
      "Undangan diterima",
    );
    await expect(
      staff
        .locator(".grid > article")
        .getByText("Lokasi Pertama Uji Staf", { exact: true }),
    ).toBeVisible();
    await expect(
      staff
        .locator(".grid > article")
        .getByText("Lokasi Kedua Uji Staf", { exact: true }),
    ).toHaveCount(0);
    await expect(
      staff.getByRole("button", { name: "Tambah lokasi", exact: true }),
    ).toHaveCount(0);
    await expect(
      staff.getByRole("heading", {
        name: "Staf dan akses lokasi",
        exact: true,
      }),
    ).toHaveCount(0);
    await region.getByRole("button", { name: "Muat ulang staf" }).click();
    const member = region
      .locator(".staff-grid .member-list li")
      .filter({ hasText: staffEmail });
    await expect(member).toHaveCount(1);
    await member
      .getByRole("button", { name: "Ubah akses", exact: true })
      .click();
    let editor = region.getByRole("form", {
      name: "Konfirmasi perubahan akses",
    });
    await editor
      .getByRole("combobox", { name: "Peran baru", exact: true })
      .selectOption("Finance");
    await editor.getByLabel("Lokasi Kedua Uji Staf", { exact: true }).check();
    await editor
      .getByLabel("Alasan perubahan", { exact: true })
      .fill("Perubahan lokasi sintetis");
    await editor
      .getByLabel("Password konfirmasi", { exact: true })
      .fill(password);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await editor
      .getByRole("button", { name: "Simpan perubahan akses" })
      .click();
    await expect(region.locator(".notice")).toContainText(
      "Perubahan akses tersimpan",
    );
    await staff.reload();
    await expect(
      staff
        .locator(".grid > article")
        .getByText("Lokasi Kedua Uji Staf", { exact: true }),
    ).toBeVisible();
    await expect(
      staff
        .locator(".grid > article")
        .getByText("Lokasi Pertama Uji Staf", { exact: true }),
    ).toHaveCount(0);
    await member
      .getByRole("button", { name: "Cabut akses", exact: true })
      .click();
    editor = region.getByRole("form", { name: "Konfirmasi perubahan akses" });
    await editor
      .getByLabel("Alasan perubahan", { exact: true })
      .fill("Pencabutan akses sintetis");
    await editor
      .getByLabel("Password konfirmasi", { exact: true })
      .fill(password);
    await editor
      .getByRole("button", { name: "Simpan perubahan akses" })
      .click();
    await expect(region.locator(".notice")).toContainText(
      "Perubahan akses tersimpan",
    );
    expect(
      (
        await staff.request.get("/api/v1/organizations/" + org + "/properties")
      ).status(),
    ).toBe(404);
    await staff.reload();
    await expect(
      staff.getByText("Belum ada organisasi. Buat organisasi pertama Anda.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      staff
        .locator(".grid > article")
        .getByText("Lokasi Kedua Uji Staf", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path:
        "project-docs/evidence/staff-management-" + info.project.name + ".png",
      fullPage: true,
      mask: [page.locator("input[type=password]")],
    });
  } finally {
    await context.close();
  }
});
