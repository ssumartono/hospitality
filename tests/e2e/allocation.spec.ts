import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
const password = "Synthetic-password-123";
async function register(page: Page, request: APIRequestContext) {
  const email = "inventory-ui-" + randomUUID() + "@example.test";
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
  let link = "";
  await expect
    .poll(
      async () => {
        const data = await (
          await request.get("http://localhost:8025/api/v1/search", {
            params: { query: "to:" + email },
          })
        ).json();
        for (const m of data.messages ?? []) {
          const message = await (
            await request.get("http://localhost:8025/api/v1/message/" + m.ID)
          ).json();
          const found = (message.Text as string).match(
            /http:\/\/localhost:4173\/verify#[^\s]+/,
          );
          if (found) {
            link = found[0];
            return true;
          }
        }
        return false;
      },
      { timeout: 75000 },
    )
    .toBe(true);
  await page.goto(link);
  await page.getByRole("button", { name: "Verifikasi email saya" }).click();
  await expect(page.locator("main > .notice")).toContainText(
    "Email terverifikasi",
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organisasi Anda", exact: true }),
  ).toBeVisible();
}
const inventory = (page: Page) => page.locator("#inventory-section");
async function configureLocation(page: Page, code: string, floors: number) {
  const section = inventory(page);
  await expect(
    section.getByRole("heading", { name: "Profil lokasi untuk inventori" }),
  ).toBeVisible();
  const form = section.getByRole("form", { name: "Profil lokasi inventori" });
  await form.getByLabel("Kode lokasi", { exact: true }).fill(code);
  await form.getByLabel("Jumlah lantai", { exact: true }).fill(String(floors));
  await form
    .getByRole("combobox", { name: "Segmen penghuni", exact: true })
    .selectOption("Mahasiswi & karyawati");
  await form.getByRole("button", { name: "Simpan profil lokasi" }).click();
  await expect(section.locator("article > .notice")).toContainText(
    "Profil lokasi tersimpan",
  );
}
async function createType(page: Page, name: string) {
  const section = inventory(page);
  const form = section.getByRole("form", { name: "Form tipe kamar" });
  await form.getByLabel("Nama tipe kamar", { exact: true }).fill(name);
  await form.getByLabel("Kapasitas default", { exact: true }).fill("1");
  await form
    .getByRole("textbox", {
      name: "Fasilitas default (pisahkan dengan koma)",
      exact: true,
    })
    .fill("Kamar mandi dalam, Listrik prabayar per kamar");
  await form.getByRole("button", { name: "Simpan tipe kamar" }).click();
  await expect(section.locator("article > .notice")).toContainText(
    "Tipe kamar tersimpan",
  );
}
async function commitPreview(page: Page, count: number) {
  const section = inventory(page);
  await section.getByRole("button", { name: "Buat preview kamar" }).click();
  await expect(
    section.getByRole("heading", {
      name: "Preview " + count + " kamar",
      exact: true,
    }),
  ).toBeVisible();
  const save = section.getByRole("button", {
    name: "Simpan kamar dari preview",
  });
  await expect(save).toBeDisabled();
  await section
    .getByLabel("Saya sudah memeriksa kode kamar", { exact: true })
    .check();
  await section
    .getByLabel("Saya sudah memastikan lantai sesuai denah", { exact: true })
    .check();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(section.locator("article > .notice")).toContainText(
    count + " kamar tersimpan",
  );
}

test("operational block persists, overlap fails, release preserves history and inspection condition", async ({
  page,
  request,
}, info) => {
  await register(page, request);
  await page
    .getByLabel("Nama organisasi", { exact: true })
    .fill("Alokasi Sintetis");
  await page
    .getByLabel("Slug organisasi", { exact: true })
    .fill("allocation-ui-" + randomUUID());
  await page
    .getByRole("button", { name: "Buat organisasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Organisasi berhasil",
  );
  await page
    .getByLabel("Nama lokasi", { exact: true })
    .fill("Lokasi Kalender Sintetis");
  await page.getByLabel("Kota", { exact: true }).fill("Palembang");
  await page
    .getByRole("button", { name: "Tambah lokasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Lokasi tersimpan",
  );
  await configureLocation(page, "PLB-TEST", 2);
  await createType(page, "Tipe Sintetis");
  const inv = inventory(page);
  await inv.getByRole("button", { name: "Kamar", exact: true }).click();
  await inv.getByRole("button", { name: "Tambah kamar", exact: true }).click();
  const rf = inv.getByRole("form", { name: "Form kamar", exact: true });
  await rf.getByLabel("Kode kamar", { exact: true }).fill("101");
  await rf.getByLabel("Lantai kamar", { exact: true }).fill("1");
  await rf.getByRole("button", { name: "Simpan kamar", exact: true }).click();
  await expect(inv.locator(".room-card")).toHaveCount(1);
  const s = page.locator("#allocation-section");
  await s
    .getByRole("button", { name: "Muat ulang kalender", exact: true })
    .click();
  await expect(
    s.getByRole("combobox", { name: "Kamar kalender", exact: true }),
  ).toHaveValue(/.+/);
  const f = s.getByRole("form", { name: "Form blokir kamar", exact: true });
  await f
    .getByLabel("Tanggal mulai blokir", { exact: true })
    .fill("2027-01-01");
  await f
    .getByLabel("Tanggal akhir blokir (opsional)", { exact: true })
    .fill("2027-02-01");
  await f
    .getByRole("textbox", { name: "Alasan blokir", exact: true })
    .fill("Perbaikan fasilitas sintetis");
  await f
    .getByRole("button", { name: "Simpan blokir kamar", exact: true })
    .click();
  await expect(s.locator(".room-card")).toHaveCount(1);
  await expect(s.locator(".room-card")).toContainText("Blokir aktif");
  const check = s.getByRole("form", {
    name: "Periksa ketersediaan",
    exact: true,
  });
  await check
    .getByLabel("Tanggal mulai pemeriksaan", { exact: true })
    .fill("2027-01-15");
  await check
    .getByLabel("Tanggal akhir pemeriksaan (opsional)", { exact: true })
    .fill("2027-01-16");
  await check
    .getByRole("button", { name: "Periksa ketersediaan kamar", exact: true })
    .click();
  const result = s.getByLabel("Hasil ketersediaan", { exact: true });
  await expect(result).toContainText(
    "Ada alokasi atau blokir yang bertabrakan",
  );
  await expect(result).toContainText("Kamar belum siap secara fisik");
  await f
    .getByLabel("Tanggal mulai blokir", { exact: true })
    .fill("2027-01-16");
  await f
    .getByRole("textbox", { name: "Alasan blokir", exact: true })
    .fill("Konflik sintetis");
  await f
    .getByRole("button", { name: "Simpan blokir kamar", exact: true })
    .click();
  await expect(s.getByRole("alert")).toContainText("bertabrakan");
  await expect(s.locator(".room-card")).toHaveCount(1);
  await page.reload();
  await expect(s.locator(".room-card")).toHaveCount(1);
  const release = s.getByRole("form", {
    name: "Lepas blokir 2027-01-01",
    exact: true,
  });
  await release
    .getByRole("textbox", { name: "Alasan lepas blokir", exact: true })
    .fill("Pemeriksaan selesai sintetis");
  await release
    .getByRole("button", { name: "Lepas blokir", exact: true })
    .click();
  await expect(s.locator(".room-card")).toContainText("Blokir dilepas");
  await expect(s.locator(".room-card")).toContainText(
    "Pemeriksaan selesai sintetis",
  );
  await check
    .getByLabel("Tanggal mulai pemeriksaan", { exact: true })
    .fill("2027-01-15");
  await check
    .getByLabel("Tanggal akhir pemeriksaan (opsional)", { exact: true })
    .fill("2027-01-16");
  await check
    .getByRole("button", { name: "Periksa ketersediaan kamar", exact: true })
    .click();
  await expect(result).toContainText("Kamar belum siap secara fisik");
  await expect(result).not.toContainText(
    "Ada alokasi atau blokir yang bertabrakan",
  );
  await expect(inv.locator(".room-card")).toContainText("Perlu inspeksi");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await s.screenshot({
    path: "project-docs/evidence/allocation-" + info.project.name + ".png",
  });
});
