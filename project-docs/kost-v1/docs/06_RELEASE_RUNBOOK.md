# Release gates dan runbook — v1.0.0

Status dokumen: spesifikasi tersedia. Status aplikasi: prototipe; produksi **BELUM DISETUJUI**. Semua gate implementasi di bawah berstatus NOT RUN sampai ada evidence. Tidak ada tanda tangan UAT atau hasil keamanan yang direkayasa dari mockup.

## Release gates

| Gate | Penanggung jawab | Evidence kelulusan | Status saat paket dibuat |
|---|---|---|---|
| G0 Dokumen handoff | Product Owner + Tech Lead | Scope, BR, backlog, API baseline, UAT, gap register, konfigurasi pilot | Paket tersedia; konfirmasi kickoff belum direkam |
| G1 Foundation/tenant | Backend + QA/security | Migration/RLS; negative tests dua organisasi dan seluruh role/lokasi/file/export | NOT RUN |
| G2 Availability | Backend + QA | Concurrency booking/expiry/payment/move; constraint membuktikan satu pemenang | NOT RUN |
| G3 Ledger/billing | Finance domain + QA | Semua fixture monetary, opening balance, deposit/refund; retry jobs; rekonsiliasi | NOT RUN |
| G4 E2E/UX | Frontend + QA + operator pilot | Setup → order → check-in → billing → layanan → checkout → turnover; mobile/keyboard | NOT RUN |
| G5 Ops/security | Tech Lead + operator infra | Restore DB/files, monitoring, alerts, incident drill, performance/security reports | NOT RUN |
| G6 Bisnis/config | Owner pilot | Tarif/rekening/aturan/refund/notice/retensi/privacy/support, properti siap, domain/email provider | BELUM DIKONFIGURASI |
| G7 UAT/cutover | Owner + staf + QA | Seluruh AC kritis lulus, saldo cutover disetujui, onboarding staf dan rollback plan | NOT RUN |
| G8 Release approval | Product Owner + Tech Lead | Evidence G1–G7, commit/tag/artifact/deploy ID, release notes, no critical/high defect | NOT APPROVED |

Tidak ada rilis v1.0.0 hanya karena ada 14 layar atau 39 unit test prototipe. Defect kritis: data bocor antar tenant, double booking, ledger salah/hilang, pembayaran ganda, gagal restore, atau penghapusan data tanpa kontrol. Seluruh critical/high pada area tersebut wajib nol. Defect lain harus punya keputusan risiko, pemilik dan target perbaikan; jangan menyembunyikan dengan label “MVP”.

## Konfigurasi produksi yang wajib diisi

Nama pemilik/organisasi dan brand final, alamat/area publik, kontak bantuan, fasilitas aktual dan readiness 12 kamar, tarif per tipe/override, rekening yang diverifikasi, siklus tagihan, minimum booking/check-in, notice/cancel/no-show/refund, deposit off untuk pilot, zona Asia/Jakarta, perjanjian dan aturan, privacy/retention, email domain/provider, hosting/storage/backup region, admin dan operator on-call. Nilai contoh tidak otomatis diaktifkan. Tidak ada permintaan persetujuan terpisah di paket ini; operator mengisi melalui setup dan menyimpan bukti pada G6.

## Cutover pilot

1. Freeze perubahan konfigurasi dan ekspor kondisi awal dari pemilik. Catat waktu cutover per zona lokasi.
2. Backup sumber; buat batch dry-run dengan checksum. Verifikasi 12 kamar dan bila ada existing resident: lease, occupancy, receivable/credit/deposit. Bangunan kosong memakai saldo nol yang dinyatakan pemilik, bukan data penghuni dummy.
3. Import atomik, rekonsiliasi count dan total; Owner menandatangani lembar rekonsiliasi. Jangan terbitkan invoice historis sebelum billing_resume_at.
4. Uji permission Owner/Manager/Finance/Ops/penghuni serta tenant kedua; publik hanya proyeksi listing.
5. Uji satu booking dan pembayaran terkontrol dengan catatan transaksi yang benar; hapus hanya fixture nonproduksi sebelum live, bukan menghapus penerimaan nyata.
6. Jalankan catch-up worker; cek job/outbox/dead-letter; aktifkan reminder dan email melalui konfigurasi produksi.
7. Publish listing sesudah readiness dan G6 lulus; monitor konflik, dana, email dan task queue. Catat go-live approval dan commit.

## Rekonsiliasi harian

Finance mencocokkan mutasi rekening/kas dengan payment verified dan reference; tinjau pending/rejected/late payment, kredit, deposit, refund reserved/paid, invoice aging dan reversal. Operator cek occupancy vs kondisi fisik, kedatangan/overstay, checkout pending financial dan dirty/maintenance. Tidak ada perbedaan yang dihapus diam-diam; buat exception dengan actor/reason.

## Insiden

| Insiden | Tindakan awal | Pemulihan dan evidence |
|---|---|---|
| Dugaan bocor tenant/file | Suspend endpoint/grant terdampak, revoke session/URL, preserve audit | Telusuri scope, perbaiki policy, uji negatif, review komunikasi sesuai prosedur organisasi |
| Dugaan double booking | Hentikan acceptance kamar/lokasi terdampak; jangan cancel salah satu tanpa review | Snapshot alokasi/presence, resolve bersama Owner, perbaiki constraint dan tes race |
| Saldo/payment salah | Tahan verification/refund command terdampak | Rekonsiliasi sumber bank, koreksi/reversal audited, replay aman; jangan edit DB tanpa runbook |
| Worker tertinggal | Cek queue lag/dead-letter dan dependency | Replay job idempoten; hitung invoice/notifikasi sebelum/sesudah; tidak menjalankan raw insert |
| Email provider gagal | Tampilkan pending/failed; retry bounded | Replay outbox; status tidak delivered tanpa evidence provider; manual follow-up tercatat |
| Upload berbahaya/scan gagal | Tetap quarantine, jangan tampilkan URL publik | Scan ulang/deny; log metadata aman dan cleanup orphan |
| Overstay | Blokir check-in baru pada kamar; hubungi pengelola | Resolusi tanggal/reservasi oleh Owner; tidak ada pengusiran otomatis |

## Backup/restore drill

Restore backup DB dan object manifest di environment terpisah. Uji login scoped, jumlah tenant/room/lease, FK, allocation constraint, invoice/payment/deposit balances dan file access. Jangan mengirim ulang email nyata dari environment restore. Rekam backup ID, waktu data terakhir, mulai/selesai restore, RPO/RTO terukur dan hasil rekonsiliasi. Target: RPO ≤24 jam, RTO ≤8 jam. Ulangi drill sebelum rilis dan sekurangnya per kuartal atau setelah perubahan storage/migration besar.

## Deployment dan rollback

Artefak terikat commit/tag, migration set dan checksum. Backup sebelum migration, gunakan backward-compatible expand/contract; smoke test dan health check sebelum traffic. Jika schema belum menerima transaksi baru, rollback aplikasi dan migration yang teruji. Jika sudah menerima transaksi, jangan restore snapshot lama yang menghapus pembayaran/check-in; freeze writes, deploy fix-forward atau rekonsiliasi event dengan prosedur insiden. Approval rollback mencatat owner teknis, dampak dan evidence. Tag v1.0.0 hanya sesudah G8; sebelum itu gunakan build development/staging, bukan klaim siap produksi.

## Checklist persetujuan rilis (diisi saat pengujian nyata)

- Commit/tag/artifact/deployment: BELUM ADA.
- Hasil AC/UAT dan defect report: BELUM ADA.
- Bukti tenant isolation/concurrency/restore/performance/security: BELUM ADA.
- Rekonsiliasi cutover dan konfigurasi bisnis: BELUM ADA.
- Product Owner / Tech Lead / Finance / Ops pilot approval: BELUM DIBERIKAN.
