# Kost Hospitality v1.0.0 — Development Handoff

Revisi dokumen 1.1 · 1 November 2026.

**Paket ini siap dipakai untuk memulai development v1.0.0. Aplikasi saat ini masih prototipe dan belum siap produksi.** Targetnya rilis operasional pertama dengan backend persisten, tenancy aman dan alur setup kost sampai checkout. Status test/UAT produksi tetap NOT RUN sampai dibuktikan.

Pilot: 12 kamar / 2 lantai di Palembang dekat kampus, mahasiswi/karyawati, kamar mandi dalam, listrik prabayar tiap kamar, default tanpa deposit. Lokasi/kamar dinamis; SaaS multi-owner sejak fondasi. Harga/fasilitas/rekening final diisi pemilik sebelum go-live, bukan diwarisi dari nominal mockup. Pembagian seed 6+6 kamar dan kode 101–206 adalah contoh; pemilik menyesuaikan denah dan penomoran aktual.

## Isi paket dan urutan baca

| File | Tujuan |
|---|---|
| [PRD.md](PRD.md) | PRD diperbarui, target v1.0.0 dan requirement end to end |
| [01_SCOPE_RELEASE](docs/01_SCOPE_RELEASE.md) | Batas wajib 14 modul dan fitur setelah v1.0 |
| [02_BUSINESS_RULES](docs/02_BUSINESS_RULES.md) | State/uang/availability, transaksi dan keputusan edge case |
| [03_ARCHITECTURE_DATA_SECURITY](docs/03_ARCHITECTURE_DATA_SECURITY.md) | ADR, model data, role/file/tenant, nonfungsional |
| [04_ACCEPTANCE_UAT](docs/04_ACCEPTANCE_UAT.md) | 60 acceptance criteria dan fixture terukur |
| [05_BACKLOG](docs/05_BACKLOG.md) | 60 story P0 pada 20 epic, dependency dan DoD |
| [06_RELEASE_RUNBOOK](docs/06_RELEASE_RUNBOOK.md) | G0–G8, cutover, rekonsiliasi, insiden dan restore |
| [07_MOCKUP_GAP_REGISTER](docs/07_MOCKUP_GAP_REGISTER.md) | Kesenjangan prototipe menuju server produksi |
| [08_DEVELOPER_HANDOFF](docs/08_DEVELOPER_HANDOFF.md) | Instruksi mulai implementasi dan output engineering |
| [OpenAPI](api/openapi-v1.yaml) | Baseline request/API; belum ada server produksi |
| [Pilot config](fixtures/PILOT_CONFIG.json) | Seed keputusan pilot dan field wajib sebelum publish |
| [Pilot rooms](fixtures/PILOT_ROOMS.csv) | 12 kamar inspection, 2 lantai; bukan bukti ready |
| [UAT CSV](fixtures/UAT_CASES.csv) | 60 case dengan status NOT RUN dan kolom evidence |
| [Backlog CSV](fixtures/BACKLOG.csv) / [JSON](fixtures/BACKLOG.json) | Tracker-ready, seluruh story PLANNED |
| [Migration template](fixtures/MIGRATION_TEMPLATE.csv) | Format produksi baseline, scope/cutover/opening balances |
| [Migration test example](fixtures/MIGRATION_EXAMPLE_TEST_ONLY.csv) | Data sintetis; tidak untuk seed produksi |
| [Changelog](CHANGELOG.md) | Perubahan dan status dokumen |

`reference/PRD_BASELINE_2026-10-30.md` adalah arsip baseline, bukan dokumen operasional terbaru. `reference/MOCKUP_README.md` menjelaskan simulasi pada snapshot source; batas prototipe bukan pengurangan scope produksi.

## Referensi mockup

https://kost-hospitality-modules.stono.chatgpt.site/

14 modul mockup tersedia. Snapshot code reference: `1e2c62194928684ffc2e9987674f3f098c7c9dbc`. Paket dokumen ini tidak menduplikasi repositori kode. Tim developer perlu akses source/export frontend melalui pemilik atau membangun UI berdasarkan mockup; tidak ada credential repo dalam paket.

## Status kesiapan

- Requirement/ADR/API baseline/backlog/acceptance/runbook: tersedia untuk handoff.
- Implementasi backend/database/auth/worker/file privat: belum diverifikasi/dibangun dalam tugas ini.
- 39 tes prototipe sebelumnya: referensi perilaku lokal, bukan QA produksi.
- 60 acceptance case produksi dan G1–G8: belum dijalankan/disetujui.
- Harga usaha, rekening, retensi, properti dan konfigurasi live: wajib dipenuhi pada G6.
- Payment gateway, auto-billing SaaS, WhatsApp API dan tanda tangan tersertifikasi: sesudah v1.0.

## Pemeriksaan integritas paket

Baca `VALIDATION_REPORT.md`. File `MANIFEST.sha256` dapat diverifikasi setelah ekstraksi dengan `sha256sum -c MANIFEST.sha256` pada lingkungan yang mendukungnya. Verifikasi ini hanya integritas dokumen, bukan acceptance aplikasi.
