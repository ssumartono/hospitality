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

test("inventory profile, pilot 12→13, default snapshots, checklist and second location persist", async ({
  page,
  request,
}, info) => {
  await register(page, request);
  await page
    .getByLabel("Nama organisasi", { exact: true })
    .fill("Organisasi Inventori Sintetis");
  await page
    .getByLabel("Slug organisasi", { exact: true })
    .fill("inventory-ui-" + randomUUID());
  await page
    .getByRole("button", { name: "Buat organisasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Organisasi berhasil",
  );
  await page
    .getByLabel("Nama lokasi", { exact: true })
    .fill("Lokasi Pilot Sintetis");
  await page.getByLabel("Kota", { exact: true }).fill("Palembang");
  await page
    .getByRole("button", { name: "Tambah lokasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Lokasi tersimpan",
  );
  await configureLocation(page, "PLB-TEST", 2);
  await createType(page, "Tipe Sintetis");
  const section = inventory(page);
  await section
    .getByRole("button", { name: "Generator kamar", exact: true })
    .click();
  await expect(
    section.getByRole("textbox", {
      name: "Kode,lantai contoh pilot (dapat disesuaikan)",
      exact: true,
    }),
  ).toBeVisible();
  await commitPreview(page, 12);
  await expect(section.locator(".room-card")).toHaveCount(12);
  await section
    .getByRole("button", { name: "Tambah kamar", exact: true })
    .click();
  let form = section.getByRole("form", { name: "Form kamar", exact: true });
  await form.getByLabel("Kode kamar", { exact: true }).fill("207");
  await form.getByLabel("Lantai kamar", { exact: true }).fill("2");
  await form.getByRole("button", { name: "Simpan kamar", exact: true }).click();
  await expect(section.locator(".room-card")).toHaveCount(13);
  await page.reload();
  await expect(section.locator(".room-card")).toHaveCount(13);
  await section
    .getByRole("button", { name: "Tipe kamar", exact: true })
    .click();
  await section.getByRole("button", { name: "Ubah tipe", exact: true }).click();
  form = section.getByRole("form", { name: "Form tipe kamar" });
  await form.getByLabel("Kapasitas default", { exact: true }).fill("2");
  await form
    .getByRole("textbox", {
      name: "Fasilitas default (pisahkan dengan koma)",
      exact: true,
    })
    .fill("Fasilitas uji sintetis");
  await form.getByRole("button", { name: "Simpan tipe kamar" }).click();
  await expect(section.locator("article > .notice")).toContainText(
    "Tipe kamar tersimpan",
  );
  await section.getByRole("button", { name: "Kamar", exact: true }).click();
  const room = section
    .locator(".room-card")
    .filter({
      has: page.getByRole("heading", { name: "Kamar 101", exact: true }),
    });
  await expect(room).toContainText("1 orang");
  await room
    .getByRole("button", { name: "Isi checklist", exact: true })
    .click();
  form = section.getByRole("form", { name: "Checklist kamar", exact: true });
  for (const checkbox of await form.getByRole("checkbox").all())
    await checkbox.check();
  await form.getByRole("button", { name: "Simpan checklist" }).click();
  await expect(room).toContainText("Checklist lengkap");
  await expect(room).toContainText("Perlu inspeksi");
  await room.getByRole("button", { name: "Ubah kamar", exact: true }).click();
  form = section.getByRole("form", { name: "Form kamar", exact: true });
  await form
    .getByLabel("Terapkan default terbaru tipe ke kamar ini", { exact: true })
    .check();
  await form
    .getByLabel("Alasan ubah kamar", { exact: true })
    .fill("Pembaruan default sintetis");
  await form.getByRole("button", { name: "Simpan kamar", exact: true }).click();
  await expect(room).toContainText("2 orang");
  await expect(room).toContainText("Checklist belum lengkap");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await section.screenshot({
    path: "project-docs/evidence/inventory-" + info.project.name + ".png",
  });
  await section
    .getByRole("button", { name: "Generator kamar", exact: true })
    .click();
  await section
    .getByRole("button", { name: "Buat preview kamar", exact: true })
    .click();
  await expect(section.locator("article > .notice")).toContainText(
    "Contoh pilot sudah pernah diterapkan",
  );
  await page
    .getByLabel("Nama lokasi", { exact: true })
    .fill("Lokasi Kedua Inventori");
  await page.getByLabel("Kota", { exact: true }).fill("Palembang");
  await page
    .getByRole("button", { name: "Tambah lokasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Lokasi tersimpan",
  );
  await section
    .getByRole("combobox", { name: "Lokasi inventori", exact: true })
    .selectOption({ label: "Lokasi Kedua Inventori" });
  await configureLocation(page, "PLB-SECOND", 1);
  await createType(page, "Tipe Kedua Sintetis");
  await section
    .getByRole("button", { name: "Generator kamar", exact: true })
    .click();
  const gen = section.getByRole("form", {
    name: "Generator kamar",
    exact: true,
  });
  await gen
    .getByRole("combobox", { name: "Mode generator", exact: true })
    .selectOption("sequence");
  await gen.getByLabel("Awalan kode", { exact: true }).fill("B");
  await gen.getByLabel("Jumlah kamar", { exact: true }).fill("2");
  await gen.getByLabel("Jumlah digit nomor", { exact: true }).fill("2");
  await commitPreview(page, 2);
  await expect(section.locator(".room-card")).toHaveCount(2);
  await section
    .getByRole("combobox", { name: "Lokasi inventori", exact: true })
    .selectOption({ label: "Lokasi Pilot Sintetis" });
  await expect(section.locator(".room-card")).toHaveCount(13);
});
