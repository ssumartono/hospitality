# Cakupan rilis — Kost Hospitality v1.0.0

Revisi dokumen 1.1 · 1 November 2026 · Baseline untuk implementasi.

## Definisi rilis

v1.0.0 adalah rilis operasional pertama: aplikasi web responsive dengan backend, database persisten, file privat, worker, autentikasi dan otorisasi server. Sebutan MVP mengatur keluasan fitur, bukan membolehkan transaksi palsu pada produksi. Dokumen ini siap menjadi masukan development; aplikasi belum berstatus siap produksi.

Pilot: kost putri di Palembang dekat kampus; 12 kamar, 2 lantai, kamar mandi dalam dan listrik prabayar per kamar. Bangunan awal belum dinyatakan siap huni. Default deposit nonaktif. Furnitur, pendinginan, rekening, alamat, foto dan harga harus dikonfirmasi pemilik. Dua lantai dan 12 kamar adalah seed, bukan batas produk.

## Matriks 14 modul

Semua baris berstatus **wajib v1.0** dalam batas berikut. Nomor modul sama dengan mockup, tidak selalu sama dengan nomor FR pada PRD.

| Modul | Wajib berfungsi pada v1.0 | Batas yang disepakati |
|---|---|---|
| 01 Akun/onboarding | Register, verifikasi email, login/reset, organisasi, undangan, role/lokasi | Tidak memakai login demo; Owner terakhir tidak boleh terhapus |
| 02 Inventori | Multi lokasi/tipe/kamar, batch, fasilitas, kondisi, inventaris, blokir interval | Kuota configurable; kamar bertransaksi diarsip, bukan dihapus |
| 03 Tarif/kebijakan | Versi harga, override, bulanan/kalender, prorata, deposit opsional, hold, minimum dan cancel policy | IDR bilangan bulat; tarif lama tidak berubah diam-diam |
| 04 Katalog | URL organisasi/lokasi publik, foto publik terpisah, biaya, aturan, tanggal, unpublish | Bukan marketplace; akses publik hanya proyeksi yang disetujui |
| 05 Inquiry/survei | Kontak, sumber, follow-up, permintaan/jadwal/hasil, konversi ke booking | Tidak menahan kamar; spam/rate limit server wajib |
| 06 Booking | Permohonan, persetujuan atomik, hold/expiry/review window, konflik, walk-in | Alokasi database menjadi sumber kebenaran; tidak menerima booking offline |
| 07 Keuangan | Invoice immutable, transfer/cash manual, bukti privat, verifikasi, alokasi lintas invoice milik penghuni yang sama dalam organisasi, kredit, deposit, adjustment, reversal, kuitansi | Platform tidak mengirim uang bank; kuitansi hanya sesudah penerimaan terverifikasi |
| 08 Kontrak/check-in | Profil privat minimum, versi perjanjian dan penerimaan akun, inspeksi/inventaris/kunci, tanggal aktual | Bukan tanda tangan tersertifikasi; override hanya syarat finansial oleh Owner |
| 09 Operasional | Portal login penghuni, invoice/pengingat rutin, catch-up, perpanjangan, pindah terjadwal termasuk lintas lokasi organisasi sama, histori segmen dan koreksi biaya | Sewa bulanan satu kamar privat; perubahan efektif dan invoice lama tetap terlacak |
| 10 Hospitality | Tiket/foto privat, prioritas, SLA configurable, penugasan, kunjungan berizin, hasil, reopen, tugas kebersihan/inspeksi | Tidak menjanjikan layanan darurat otomatis |
| 11 Checkout | Pengajuan/approval, estimasi/final biaya, keluar fisik, settlement terpisah, ledger deposit/refund, turnover dan ready | Refund dilakukan di bank oleh pemilik; aplikasi menyimpan approval dan bukti/ref bank |
| 12 Laporan | Okupansi as-of, aging/saldo, kas, sewa ditagihkan terpisah, biaya, deposit liability, konversi, ekspor privat | Bukan buku besar akuntansi, laba rugi akrual tersertifikasi atau pajak otomatis |
| 13 SaaS | Trial, paket/kuota server, aktivasi/expiry/restricted manual, admin platform terbatas, periode ekspor | Tidak ada penagihan kartu/langganan otomatis; harga komersial dikonfigurasi |
| 14 Migrasi | Dry-run, mapping, validasi, batch idempoten, cutover, saldo piutang/kredit/deposit, rekonsiliasi dan audit | Tidak mengarang bukti pembayaran/identitas/penerimaan digital dari data lama |

## Ditunda setelah v1.0

Payment gateway, billing SaaS otomatis, WhatsApp API resmi, tanda tangan elektronik tersertifikasi, marketplace lintas organisasi, smart lock/meter otomatis, aplikasi native, sewa harian/jam/shared bed, integrasi akuntansi dan pajak otomatis. Tautan WhatsApp manual boleh tersedia tanpa status “terkirim”.

## Sumber kebenaran dan konflik

Urutan acuan: keputusan terbaru pengguna dalam percakapan → PRD revisi 1.1 dan spesifikasi normatif paket ini → OpenAPI/data dictionary → mockup sebagai referensi UX. Jika menemukan konflik dokumen, developer mencatat issue dan menghentikan command terkait sampai resolusi; tidak memilih perilaku yang melemahkan isolasi/ledger/availability. Perubahan scope tercatat pada ADR dan changelog. Mockup tidak menggantikan aturan bisnis.

## Definition of Ready untuk memulai development

Dokumen requirement, state machine, batas transaksi, API baseline, backlog/dependensi dan acceptance test tersedia dalam paket. Developer dapat memulai fondasi dan fitur tanpa menunggu harga komersial. Akses repositori, penanggung jawab tim dan secrets environment disediakan saat kickoff. Harga, refund policy, nomor rekening dan data properti dipilih melalui konfigurasi pemilik sebelum listing berstatus published, bukan hardcode engineering.
