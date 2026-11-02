import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("owner registers, verifies email through SMTP, creates organization and location", async ({
  page,
  request,
}, testInfo) => {
  const email = "e2e-" + randomUUID() + "@example.test",
    password = "Synthetic-password-123";
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
  let messageId = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://localhost:8025/api/v1/search",
          { params: { query: "to:" + email } },
        );
        const data = await response.json();
        messageId = data.messages?.[0]?.ID ?? "";
        return messageId;
      },
      { timeout: 75000 },
    )
    .not.toBe("");
  const message = await (
    await request.get("http://localhost:8025/api/v1/message/" + messageId)
  ).json();
  const link = (message.Text as string).match(
    /http:\/\/localhost:4173\/verify#[^\s]+/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page.getByRole("button", { name: "Verifikasi email saya" }).click();
  await expect(page.locator("main > .notice")).toContainText(
    "Email terverifikasi",
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organisasi Anda" }),
  ).toBeVisible();
  await page.getByLabel("Nama organisasi").fill("Kost Sintetis");
  await page.getByLabel("Slug organisasi").fill("e2e-" + randomUUID());
  await page
    .getByRole("button", { name: "Buat organisasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Organisasi berhasil",
  );
  await page.getByLabel("Nama lokasi").fill("Lokasi Sintetis Palembang");
  await page.getByLabel("Kota", { exact: true }).fill("Palembang");
  await page.getByRole("button", { name: "Tambah lokasi" }).click();
  await expect(page.locator("main > .notice")).toContainText(
    "Lokasi tersimpan",
  );
  await page.reload();
  await expect(
    page
      .locator(".grid > article")
      .getByText("Lokasi Sintetis Palembang", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "project-docs/evidence/ui-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible();
});
