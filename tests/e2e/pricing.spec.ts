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

test("policy setup and internal quote persist, type override and future versions do not rewrite saved snapshot", async ({
  page,
  request,
}, info) => {
  await register(page, request);
  await page
    .getByLabel("Nama organisasi", { exact: true })
    .fill("Harga Sintetis");
  await page
    .getByLabel("Slug organisasi", { exact: true })
    .fill("pricing-ui-" + randomUUID());
  await page
    .getByRole("button", { name: "Buat organisasi", exact: true })
    .click();
  await expect(page.locator("main > .notice")).toContainText(
    "Organisasi berhasil",
  );
  await page
    .getByLabel("Nama lokasi", { exact: true })
    .fill("Lokasi Harga Sintetis");
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
  const s = page.locator("#pricing-section");
  await s
    .getByRole("button", { name: "Muat ulang harga", exact: true })
    .click();
  await s
    .getByRole("button", { name: "Buat versi kebijakan", exact: true })
    .click();
  let f = s.getByRole("form", { name: "Form kebijakan harga", exact: true });
  await expect(
    f.getByLabel("Sewa dasar per bulan", { exact: true }),
  ).toHaveValue("");
  await expect(
    f.getByLabel("Aktifkan deposit", { exact: true }),
  ).not.toBeChecked();
  await f
    .getByLabel("Berlaku mulai (waktu lokasi)", { exact: true })
    .fill("2026-01-01T00:00");
  const values: any = {
    "Sewa dasar per bulan": "1500000",
    "Hari jatuh tempo": "1",
    "Terbitkan tagihan berapa hari sebelumnya": "0",
    "Minimum pembayaran booking": "500000",
    "Minimum check-in (%)": "100",
    "Batas hold (jam)": "24",
    "Tambahan review bukti (jam)": "24",
    "Notice checkout (hari)": "30",
    "Batas pembatalan sebelum masuk (hari)": "7",
    "Refund sebelum batas (%)": "100",
    "Refund sesudah batas (%)": "0",
    "Refund tidak hadir (%)": "0",
  };
  for (const [name, value] of Object.entries(values))
    await f.getByLabel(name, { exact: true }).fill(String(value));
  await f
    .getByRole("combobox", { name: "Siklus sewa", exact: true })
    .selectOption("calendar");
  await f
    .getByRole("combobox", { name: "Prorata sewa", exact: true })
    .selectOption("actual");
  await f
    .getByRole("combobox", { name: "Listrik", exact: true })
    .selectOption("prepaid_per_room");
  await f
    .getByLabel("Tarif tipe Tipe Sintetis", { exact: true })
    .fill("1800000");
  await f
    .getByRole("button", { name: "Simpan versi kebijakan", exact: true })
    .click();
  await expect(s.locator("article > .notice")).toContainText(
    "Versi kebijakan tersimpan",
  );
  const q = s.getByRole("form", { name: "Form quote internal", exact: true });
  await q
    .getByRole("combobox", { name: "Kamar quote", exact: true })
    .selectOption({ label: "101" });
  await q.getByLabel("Tanggal masuk", { exact: true }).fill("2027-01-16");
  await q
    .getByLabel("Tanggal akhir eksklusif (opsional)", { exact: true })
    .fill("2027-02-01");
  await q.getByLabel("Jumlah penghuni", { exact: true }).fill("1");
  await q
    .getByRole("button", { name: "Hitung dan simpan quote", exact: true })
    .click();
  const result = s.getByLabel("Hasil quote", { exact: true });
  await expect(result).toContainText("929.032");
  await expect(result).toContainText("dari tipe");
  const saved = await s
    .getByLabel("ID quote tersimpan", { exact: true })
    .inputValue();
  await s
    .getByRole("button", { name: "Buat versi kebijakan", exact: true })
    .click();
  f = s.getByRole("form", { name: "Form kebijakan harga", exact: true });
  await expect(
    f.getByLabel("Sewa dasar per bulan", { exact: true }),
  ).toHaveValue("1500000");
  await f
    .getByLabel("Berlaku mulai (waktu lokasi)", { exact: true })
    .fill("2027-01-16T00:00");
  await f.getByLabel("Sewa dasar per bulan", { exact: true }).fill("2000000");
  await f.getByLabel("Tarif tipe Tipe Sintetis", { exact: true }).fill("");
  await f
    .getByRole("button", { name: "Simpan versi kebijakan", exact: true })
    .click();
  await expect(s.locator("article > .notice")).toContainText(
    "Versi kebijakan tersimpan",
  );
  await expect(result.getByRole("heading")).toHaveText(
    "Quote versi kebijakan 1",
  );
  await q
    .getByRole("button", { name: "Hitung dan simpan quote", exact: true })
    .click();
  await expect(result.getByRole("heading")).toHaveText(
    "Quote versi kebijakan 2",
  );
  await expect(result).toContainText("1.032.258");
  await page.reload();
  await expect(
    s.getByRole("heading", { name: "Versi 2", exact: true }),
  ).toBeVisible();
  await s.getByLabel("ID quote tersimpan", { exact: true }).fill(saved);
  await s
    .getByRole("button", { name: "Buka snapshot quote", exact: true })
    .click();
  await expect(result.getByRole("heading")).toHaveText(
    "Quote versi kebijakan 1",
  );
  await expect(result).toContainText("929.032");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await s.screenshot({
    path: "project-docs/evidence/pricing-" + info.project.name + ".png",
  });
});
