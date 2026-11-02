# Status implementasi Kost Hospitality

Checkpoint 2 November 2026. Target v1.0.0; build development 0.6.0. Belum siap produksi.

## Kondisi awal

Hanya paket dokumen; belum ada Git/source aplikasi. Seluruh dokumen wajib tersedia. Node 24.13.0 dan npm 11.19.1 tersedia. Docker Engine 29.2.1 aktif setelah diperiksa ulang. Tidak ada container awal. Source mockup tidak tersedia; akses URL lewat alat web gagal pada sesi sebelumnya. Tidak mengubah baseline.

## Rencana

B01/B02 dan B18.1 → B03.1/B04/B16.1 → katalog/booking/invoice → finance/stay → hospitality/checkout/reporting → migrasi/hardening/UAT. Ikuti dependency per story. Harga/rekening/kebijakan produksi tetap kosong.

## Tracker

| Story | Deliverable | Dependency | AC | Status | Kode/evidence |
|---|---|---|---|---|---|
| B01.1 | Model user/token dan adapter auth | — | AC-25, AC-26 | IN_PROGRESS | src/server/security.ts, crypto.ts; migration 001/004/005; Argon2id, AEAD, TOTP/RFC, last-owner tests; review final tetap terbuka |
| B01.2 | Session, MFA/re-auth dan revoke | B01.1 | AC-22, AC-25, AC-26 | IN_PROGRESS | access.ts, account-security.ts, mfa.ts; session pending MFA, recovery, re-auth scoped/expiry/revoke; API dan UI diuji |
| B01.3 | Register/verify/reset/invitation email flows | B01.2 | AC-25 | IN_PROGRESS | register/verify/reset/resend + undangan 72h, encrypted queue dan Mailpit; lifecycle/expiry/revoke serta UI diuji |
| B02.1 | Schema/migration tenant dan composite FK | B01.1 | AC-02, AC-28 | IN_PROGRESS | db/migrations/001–008; checksum runner; role kost_app/kost_worker non-superuser; composite FK dan RLS; schema domain berikutnya belum ada |
| B02.2 | Membership, role dan location authorizer/RLS | B02.1, B01.2 | AC-02, AC-15, AC-22, AC-59 | IN_PROGRESS | access.ts, staff.ts; Owner/Manager/Finance/Operations dan lokasi; invite/accept/scope/revoke API+UI, negative matrix domain tersedia; exports/finance belum ada |
| B02.3 | Private storage/quarantine/scan/URL authorization | B02.2 | AC-02, AC-27 | IN_PROGRESS | src/server/storage.ts + file API; real S3/quarantine denial; clean/infected scanner drill belum dijalankan |
| B03.1 | Property/room/type/facilities schema dan CRUD | B02.2 | AC-01 | IN_PROGRESS | inventory.ts/service/schema; migrations 009–012; profil, tipe versioned, kamar snapshot, checklist dan UI; readiness/archive mengikuti dependency |
| B03.2 | Generator massal, readiness, UI dan kuota hooks | B03.1, B16.1 | AC-01, AC-16 | IN_PROGRESS | Preview/checksum/konfirmasi/commit atomik, pilot 12 idempoten, manual/sequence, UI; readiness penuh menunggu allocation/presence |
| B03.3 | Archive/blokir/occupancy conflict rules | B03.1, B07.1 | AC-10, AC-21, AC-45 | IN_PROGRESS | initial-ready SQL/API + BookingWorkspace; checklist nyata, block hari ini/workorder/histori occupancy guards; archive/turnover penuh belum ada |
| B04.1 | Policy version/effective_at dan integer money | B03.1 | AC-09, AC-11, AC-32 | IN_PROGRESS | pricing-schema.ts/pricing.ts; migrations013–014; versi append-only, effective_at, override composite FK; UI/API dan CAS/role tests; integrasi invoice/lease belum ada |
| B04.2 | Quote calculator + fixtures/prorata/override | B04.1 | AC-09, AC-31, AC-32 | IN_PROGRESS | pricing-domain.ts, pricing.ts, PricingWorkspace.tsx; F01/F02/F04/F05/F10 fragments/AC32, internal quote snapshot; public quote/consent belum ada |
| B04.3 | Snapshot booking/lease/invoice/amendment contract | B04.2 | AC-11, AC-31 | IN_PROGRESS | booking-snapshot.ts + invoices.pricing_snapshot/bill_to; snapshot booking/invoice immutable dan refresh consent pending; lease/amendment belum terintegrasi |
| B05.1 | Public projections/routes/media derivatives | B04.2, B02.3, B03.2 | AC-02, AC-20, AC-31 | PLANNED | — |
| B05.2 | Publish/unpublish server gate + UI | B05.1 | AC-20 | PLANNED | — |
| B05.3 | Public quote/order UX dan mobile errors | B05.2, B07.2 | AC-18, AC-31 | PLANNED | — |
| B06.1 | Inquiry/consent/source/rate-limit | B05.1 | AC-18, AC-28 | PLANNED | — |
| B06.2 | Viewing scheduling/conflicts/consent/history | B06.1 | AC-18, AC-44 | PLANNED | — |
| B06.3 | Idempotent inquiry-to-booking conversion | B06.2, B07.1 | AC-24 | PLANNED | — |
| B07.1 | Booking/allocation/presence foundations + constraints | B03.1, B02.2 | AC-03, AC-21, AC-24 | IN_PROGRESS | booking.ts/schema, customers/customer_locations/consent, intake pending tanpa hold; runtime scoped, ongoing terpisah preview; public intake/customer portal belum ada |
| B07.2 | Accept + invoice + idempotency transaction | B07.1, B04.3, B08.1 | AC-03, AC-24, AC-29 | IN_PROGRESS | accept atomik entitlement/room/booking + invoice/lines/number + hold/stay + audit/outbox; actual parallel accepts satu sukses/satu409 tanpa invoice yatim; evidence booking-integration.txt |
| B07.3 | Expiry/review/cancel/payment race worker | B07.2, B08.2, B18.1 | AC-04, AC-05, AC-06, AC-30 | IN_PROGRESS | booking-jobs.ts/worker.ts, fungsi expiry satu transaksi held→expired/release/void/audit; confirmed0 aman; proof/review/cancel-after-accept/payment race masih belum ada |
| B08.1 | Immutable invoice/lines/adjustment/number schema | B04.3, B02.2 | AC-07, AC-11, AC-34 | IN_PROGRESS | invoices/lines/counters/bill_to/snapshot immutable, total deferred constraint dan overdue; adjustment schema foundation tanpa command/financial ledger; initial invoice API/UI |
| B08.2 | Proof/private reference + verify/receipt/allocation | B08.1, B07.1, B02.3 | AC-05, AC-06, AC-07, AC-33 | PLANNED | — |
| B08.3 | Credit/multi-invoice/reversal/financial UI | B08.2 | AC-07, AC-33, AC-34, AC-38 | PLANNED | — |
| B09.1 | Line-level deposit ledger/opening invariants | B08.2 | AC-13, AC-35 | PLANNED | — |
| B09.2 | Owner approval/reservation/refund payout reference | B09.1 | AC-13, AC-35 | PLANNED | — |
| B09.3 | Refund correction, exception queue, reconciliation | B09.2, B08.3 | AC-13, AC-35, AC-47 | PLANNED | — |
| B10.1 | Lease/occupants/agreement versions/acceptance | B07.2, B02.3 | AC-36, AC-37 | PLANNED | — |
| B10.2 | Check-in transaction/inspection/keys/override | B10.1, B08.2 | AC-10, AC-37, AC-38, AC-58 | PLANNED | — |
| B10.3 | Portal identity/ownership and actual history | B10.2, B02.2 | AC-15, AC-18, AC-53 | PLANNED | — |
| B11.1 | Period generator + idempotent catch-up worker | B10.1, B08.1, B18.1 | AC-08, AC-09, AC-39 | PLANNED | — |
| B11.2 | In-app/email reminder milestones and stop conditions | B11.1, B18.2 | AC-08, AC-56 | PLANNED | — |
| B11.3 | Job replay/dead-letter diagnostics and billing UI | B11.2 | AC-39, AC-56 | PLANNED | — |
| B12.1 | Amendment approval/future pricing/conflict | B10.2, B04.3 | AC-40 | PLANNED | — |
| B12.2 | Scheduled target allocation incl. cross-location permission | B12.1, B07.1 | AC-12, AC-41 | PLANNED | — |
| B12.3 | Execute move/inspection/segments/adjustment atomic | B12.2, B08.3 | AC-12, AC-42, AC-43 | PLANNED | — |
| B13.1 | Ticket/private photo/state/priority + portal | B10.2, B02.3 | AC-15, AC-44 | PLANNED | — |
| B13.2 | Assignment/visit consent/SLA/reopen history | B13.1 | AC-44 | PLANNED | — |
| B13.3 | Routine/turnover inspections and ready blockers | B13.2, B14.2 | AC-45 | PLANNED | — |
| B14.1 | Request/approval/final estimate versioned policy | B10.2, B09.1, B12.3 | AC-14, AC-46 | PLANNED | — |
| B14.2 | Physical exit/presence/dirty/turnover transaction | B14.1 | AC-14, AC-45, AC-46 | PLANNED | — |
| B14.3 | Netting/settlement/receivable/refund final UI | B14.2, B09.3 | AC-13, AC-14, AC-47 | PLANNED | — |
| B15.1 | As-of occupancy/aging/cash/rent/deposit read models | B08.3, B10.2 | AC-48, AC-49 | PLANNED | — |
| B15.2 | Scoped private export jobs/CSV hardening | B15.1, B02.3 | AC-15, AC-49 | PLANNED | — |
| B15.3 | Expenses/void/reference + dashboard reconciliation | B15.1 | AC-48 | PLANNED | — |
| B16.1 | Plan/entitlement schema and atomic quota service | B02.2, B03.1 | AC-16, AC-50 | IN_PROGRESS | DB entitlement lock/triggers, quota rooms/properties/staff, expiry/restricted/downgrade; local TEST_ONLY plan; activation komersial belum ada |
| B16.2 | Platform admin manual activation/trial/expiry/grace | B16.1 | AC-23, AC-50 | PLANNED | — |
| B16.3 | Restricted obligations/export/cancellation lifecycle | B16.2, B15.2 | AC-16, AC-23, AC-50 | PLANNED | — |
| B17.1 | CSV mapping/staging/dry-run checksum/errors | B03.2, B10.1 | AC-51, AC-52 | PLANNED | — |
| B17.2 | Atomic commit/external keys/opening entries | B17.1, B09.1, B08.1 | AC-17, AC-51, AC-53 | PLANNED | — |
| B17.3 | Cutover/billing resume/reconciliation approval | B17.2, B11.1 | AC-17, AC-52, AC-53 | PLANNED | — |
| B18.1 | Transactional outbox/jobs/idempotency framework | B02.1 | AC-24, AC-28, AC-54 | IN_PROGRESS | idempotency.ts + business booking outbox accepted/expired transactional; expiry per tx; generic jobs/dead-letter framework belum lengkap |
| B18.2 | Email adapter, in-app, retry/delivery logs | B18.1, B01.3 | AC-08, AC-56 | IN_PROGRESS | identity/invitation SMTP Mailpit + worker role; booking in-app event+recipient dedupe nyata; email bisnis pelanggan dan billing reminders belum tersedia |
| B18.3 | Durable audit, masking, metrics/alerts | B18.1 | AC-28, AC-54 | IN_PROGRESS | audit actor user/worker terpisah (migration021), command booking/ready/expiry reason/source; metrics/alerts/retensi belum lengkap |
| B19.1 | Responsive/a11y/offline/error-state completion | B05.3, B10.3 | AC-18 | IN_PROGRESS | React UI fondasi/MFA/staf; 6 E2E Chromium desktop/360px; belum seluruh 14 modul |
| B19.2 | Security + concurrent/load regression suite | B07.3, B09.3, B16.3 | AC-02, AC-03, AC-35, AC-55 | PLANNED | — |
| B19.3 | Infra/restore/retention/incident drill | B02.3, B18.3 | AC-19, AC-54, AC-57 | PLANNED | — |
| B20.1 | UAT fixtures/operator guides + cutover rehearsal | B14.3, B15.3, B17.3, B19.1 | AC-59, AC-60 | PLANNED | — |
| B20.2 | Resolve defects and collect gate evidence | B20.1, B19.2, B19.3 | AC-19, AC-55, AC-59, AC-60 | PLANNED | — |
| B20.3 | Release notes/version/tag/approval and pilot launch | B20.2 | AC-60 | PLANNED | — |

## Evidence dan gate

AC-01–AC-60 NOT RUN. G1–G8 belum lulus. Hasil parsial fondasi akan dicatat terpisah; tidak mengubah hasil UAT baseline.

## Checkpoint aktual fondasi

Docker PostgreSQL/Mailpit/SeaweedFS aktif, database development kost persisten. Tes dipisahkan ke kost_test dan kost_e2e; bucket test kost-test-private. Tidak ada Git, commit/tag/release. Dependency npm exact dan lockfile tersedia; image tiga layanan aktif dipin digest. ClamAV profile opsional belum dijalankan/dipin digest.

- npm run db:migrate: 4 migrasi diterapkan pada development, pengulangan aman/checksum tetap; juga diterapkan test/E2E.
- npm run build: PASS TypeScript + Vite.
- npm test: PASS 3 tes primitive keamanan dan validasi upload.
- npm run test:integration: PASS 7 tes database/API/SMTP/S3; termasuk tenant denial, CSRF, token sekali pakai, reset/revoke, dua koneksi idempotency/rollback dan perlindungan last-owner paralel. Evidence: evidence/foundation-integration.txt.
- npm run test:e2e: PASS 2 project Chromium desktop 1280 dan mobile 360; akun → email SMTP → verify → login → organisasi → lokasi → reload → logout. Evidence: evidence/ui-desktop.png dan evidence/ui-mobile.png. Bukan checkout E2E.
- MANIFEST: 22 file baseline cocok hash; 60 story/20 epic tersedia. evidence/baseline-integrity.json.

Tes menemukan dan memperbaiki bug subquery RLS organisasi (migration 002); tes concurrency sempat menunggu karena verifikasi memakai pool yang semua koneksinya ditahan, telah dikoreksi di test. E2E awal belum berjalan karena Chromium masih diunduh, kemudian dua project lulus. Inspeksi visual menemukan sisa CSS import; telah diperbaiki dan screenshot final diperbarui. Tidak ada hasil gagal yang diubah menjadi PASS tanpa rerun.

## Rencana checkpoint awal (riwayat; gunakan checkpoint 0.2.0 di bawah)

1. Selesaikan B01/B02: MFA/re-auth, invitation/staf/scope/revocation API dan UI, email verification gate publish/invite, full role/location denial matrix dan proteksi Owner. Last-owner database guard sudah ada, belum command mutasi staf.
2. Enkripsi token outbox sementara, pisahkan role worker/identity, perketat privileges, SMTP adapter produksi, generic jobs/outbox, cleanup orphan object dan scanner clean/infected nyata. Outbox SMTP at-least-once, crash sesudah SMTP accepted sebelum DB commit dapat duplikasi; belum memenuhi dedup event bisnis.
3. Lengkapi kontrak OpenAPI per domain sebelum UI, pagination UI load-more, audit auth/retensi/metrics.
4. Baru selesaikan B03 kamar/tipe/kuota dan seed pilot idempoten 12 inspection tanpa harga/rekening buatan, lalu pricing/katalog/booking sesuai dependency baseline. Seed kamar belum tersedia, jangan menyebut pilot selesai.
5. Semua ledger, kontrak/billing/in-app, hospitality/move/checkout/refund, laporan, SaaS/migrasi, backup/restore dan G1–G8 masih harus dikerjakan. Seluruh AC penuh tetap NOT RUN; tidak ada story DONE atau approval produksi.

## Blocker/keterbatasan nyata

Docker sudah bukan blocker. Mockup source tidak ada dan URL gagal via alat web sebelumnya; UI mengikuti dokumen dan pola shadcn. Image MinIO tidak tersedia, emulator lokal diganti SeaweedFS dengan ADR-11 dan tes authenticated/anonymous. Scanner optional belum dijalankan: file tidak dapat diunduh selama quarantine. Provider produksi, harga/rekening/retensi dan kesiapan bangunan belum dikonfigurasi; tidak menghalangi coding fondasi tetapi menghalangi go-live.

## Checkpoint 0.2.0 — keamanan akun dan staf

Data organisasi/lokasi pengguna tetap dipertahankan. scripts/data-fingerprint.ts merekam count/hash sebelum dan sesudah migrasi, hasil MATCH tanpa mencetak nama/email/data pengguna. API development kembali berjalan pada 3001, frontend 5173, worker memakai role khusus; konfirmasi status port/health akhir dicatat terpisah.

Fitur baru: MFA TOTP opsional dan recovery code sekali pakai, login challenge yang membatasi akses sebelum faktor kedua, re-auth 5 menit/satu aksi/session/org/target, resend verification, undangan email 72 jam, penerimaan akun terverifikasi/email cocok, perubahan peran/lokasi, pencabutan invitation/membership dan guard Owner terakhir. Semua mutasi staf memakai idempotency key dan audit. Histori undangan accepted tetap accepted setelah membership dicabut; presence/alokasi/keuangan belum diimplementasikan.

Migration 005–008 bersifat tambahan. Token email plaintext lama dibackfill dan constraint encrypted-only divalidasi dengan npm run db:security-upgrade. Encryption key development di .local/encryption.key, tidak boleh dihapus ketika DB masih dipakai. Produksi mewajibkan APP_ENCRYPTION_KEY dari secret manager. SMTP/invitation metadata diproses role kost_worker tanpa izin password atau properties; queue tenant handler memakai organisasi.

Evidence kandidat 0.2.0:

- Build TypeScript + Vite: PASS.
- Unit: 5/5 PASS (Argon2id, token, MIME/size, AES-GCM/AAD/tamper, RFC6238).
- Integration: 17/17 PASS di kost_test, termasuk role/lokasi/file denial pasca-revoke, expiry/token/session binding, MFA/recovery/attempt cap, immutable last Owner concurrency dan retry acceptance. evidence/account-staff-integration.txt.
- Browser: 6/6 PASS Chromium desktop 1280x900/mobile360x800, meliputi fondasi, MFA enable/recovery login/disable, invite/accept/scope/revoke. evidence/account-staff-e2e.txt; account-security-*.png dan staff-management-*.png. Screenshot diperiksa; field password dimask, seluruh data sintetis.
- E2E harness memakai limit fixture lebih tinggi agar delapan pendaftaran tidak menghabiskan limit nyata; override ditolak di luar NODE_ENV=test, API normal tetap 5 registrasi/menit dan diuji 429. Ini bukan evidence capacity/load.
- Validasi no-plaintext dan role app/worker terbatas: PASS lokal. DB restore, ClamAV clean/infected nyata, seluruh 60 AC dan G1–G8 belum lulus/dijalankan penuh. Test private clean file memakai fixture admin hanya di kost_test; bukan bukti antivirus.

Perbaikan dari tes: retry accept awal belum memakai cache; self-revocation gagal menyimpan hasil setelah hilang membership, diperbaiki migration 008 (INSERT hasil actor sendiri; SELECT tetap scoped membership aktif). E2E awal memakai selector label select yang terlalu ketat dan berpindah URL sebelum login penerima selesai; selector berbasis role dan penantian login diperbaiki, lalu suite penuh lulus. Tidak mengubah hasil gagal menjadi PASS tanpa rerun.

### Langkah lanjut dari checkpoint ini

1. Review penutupan B01/B02 sesuai cakupan story dan acceptance terkait; full G1 masih butuh audit permission seluruh domain, scan nyata, retensi dan hardening. Tidak ada story otomatis DONE atau AC produksi diubah.
2. Implementasi B03.1 tipe/kamar/fasilitas, B16.1 entitlement/kuota atomik, kemudian B03.2 generator/preview/seed 12 inspection yang aman dan dapat diulang. Lengkapi profil lokasi draft (kode/lantai/segment dan kesiapan) tanpa mengarang detail lokasi pengguna.
3. Lanjut pricing/policy snapshot, katalog dan booking/invoice menurut dependency. Generic jobs/outbox, in-app, scan cleanup, quota, ledger, kontrak/billing, hospitality/move/checkout, laporan, SaaS, migrasi bisnis dan backup/restore masih tersisa.
4. Kelola key rotation/backup dan delivery diagnostics/retensi; SMTP tetap at-least-once dan crash send-before-commit dapat duplikat. Role worker saat ini dipisah, role identity server/grants lebih sempit masih perlu review. Tidak ada email/provider produksi atau deployment.

Pemeriksaan penutup kandidat 0.2.0: build PASS, unit 5 PASS, integration 17 PASS, E2E 6 PASS (32,8 detik), npm audit 0 kerentanan terlapor, baseline manifest 22/22 cocok. Checksum organisasi/properti setelah seluruh migrasi MATCH. Health lewat frontend localhost:5173 mengembalikan build 0.2.0 dan productionReady=false. Tidak ada reset data atau deploy produksi.

## Checkpoint 0.3.0 — inventori dan entitlement (2 November 2026)

Migration tambahan 009–012 sudah diterapkan tanpa reset. Count/hash kolom identitas organisasi/properti sebelum dan sesudah MATCH (evidence/user-data-*-inventory.json). Workspace masih tanpa .git; tidak ada commit atau perubahan baseline. ADR-13 mencatat keputusan property-scoped room types, snapshot immutable, preview 15 menit, kondisi inspection dan entitlement development. API domain: api/inventory.openapi.json.

Tersedia: profil lokasi (kode/lantai/segment, detail aktual opsional), tipe/fasilitas versioned, kamar individual, generator urutan/manual/pilot 12 dengan preview dan dua konfirmasi, optimistic version, idempotency, audit, checklist fisik append-only, daftar/search/pagination dan UI desktop/mobile 360. Perubahan default tipe tidak mengubah kamar lama; penerapan eksplisit mereset checklist. Checklist lengkap tetap inspection; tidak ada klaim kamar siap atau vacancy sebelum constraint alokasi/presence dan blocker lengkap. Archive/ready/block command belum dibuka.

Kuota tenant-wide memakai entitlement row lock dan database triggers untuk kamar/lokasi/staf, termasuk restore; kode kamar arsip tetap dicadangkan. Downgrade di bawah usage ditolak tanpa menghapus data. Restricted/expired menolak akuisisi baru tetapi read/checklist tetap tersedia. Paket local-development-v1 TEST_ONLY (100 kamar/10 lokasi/100 staf aktif termasuk Owner, tanpa harga) dipasang eksplisit dengan db:development-plan; tiga organisasi development lama diberi entitlement yang belum ada. Tidak menaikkan entitlement lama saat rerun dan ditolak pada runtime produksi. Ini bukan paket/aktivasi SaaS komersial.

Seed pilot runnable: npm run db:seed-pilot -- --confirm-layout, hanya lokal dengan konfigurasi kredensial/ID milik pengguna dan profil/tipe yang sudah ada; layout dapat diganti SEED_ROOMS_FILE. API seed source pilot-example-v1 diuji idempoten. CLI hanya typechecked, tidak dijalankan pada data pengguna dan tidak otomatis menambah kamar. Harga/rekening/alamat/furnitur/AC tidak dibuat dari contoh.

Evidence kandidat 0.3.0:

- Build TypeScript/Vite PASS; unit 8/8 PASS.
- Integrasi 26/26 PASS: evidence/inventory-integration.txt. Termasuk kamar 12→13/lokasi kedua, isolasi tenant/lokasi/peran, quota concurrent kamar/lokasi/staf, bulk atomic rollback, stale preview/version, snapshot immutable, retry, expiry/restricted, production-context rejection dan downgrade/restore guards. Tes memakai kost_test sintetis.
- Browser 8/8 PASS (48,8 detik), Chromium desktop1280/mobile360: evidence/inventory-e2e.txt. Fondasi/MFA/staf tetap lulus; profil→tipe→preview12→13→reload→checklist→lokasi kedua teruji. inventory-desktop.png/mobile.png; tampilan mobile diperiksa. Ini belum E2E setup sampai checkout.
- npm audit: 0 kerentanan terlapor. Health localhost:5173/api/v1/health: build0.3.0, productionReady=false. PostgreSQL/Mailpit healthy, S3 lokal berjalan.

Tes menemukan fixture Owner perlu konteks entitlement dan cast UUID; diperbaiki. Selector E2E lokasi dipersempit ke kartu staf dan textarea memakai role textbox; rerun suite penuh lulus. Output PowerShell evidence dikonversi UTF-8 setelah selesai. Tidak ada acceptance penuh/story DONE atau G1–G8 yang diubah menjadi PASS.

### Berikutnya

1. B04 pricing/policy versi/effective_at, integer money, quote fixtures dan snapshot kontrak sebelum katalog/booking; konfigurasi bisnis kosong tetap menunggu pemilik.
2. B07.1 allocation/presence/constraints sebelum siap-sewa/archive/blokir B03.3; B13.3/turnover dependency tetap terbuka.
3. Lanjut ledger/invoice/manual verification, lease/check-in, billing scheduler/in-app, hospitality/move/checkout/refund, laporan, migration opening balance dan SaaS admin sesuai backlog. Generic jobs dan dedup event bisnis belum lengkap; SMTP masih at-least-once.
4. Scanner nyata/cleanup, hardening, backup/restore drill dan seluruh 60 acceptance serta release gates belum selesai. Tidak deploy produksi.

## Checkpoint 0.4.0 — harga/kebijakan dan quote internal (2 November 2026)

Tersedia B04.1/B04.2 secara bertahap: kebijakan lengkap per lokasi dengan versi immutable/effective timestamp, override kamar→tipe→lokasi (nol sah), fee once/monthly/refundable, deposit opsional, minimum booking/check-in, hold/review, notice/cancel/refund dan konfigurasi denda. Tidak ada harga/kebijakan usaha di-seed pada organisasi pengguna. Owner/Manager lokasi menulis; Finance membaca; Operations tidak dapat membaca harga privat. SQL role worker tidak diberi akses baru.

Migration013–014 diterapkan tanpa reset: policy/override/quote tenant-scoped, composite FK, RLS, monotonic version guard, grants append-only, larangan menambahkan override ke versi yang sudah committed. Command policy/quote memakai transaksi audit+idempotency. CAS dua pengelola: satu sukses, satu409; retry payload sama tidak membuat versi/quote/audit kedua. ADR-14 dan api/pricing.openapi.json (request/response schema serta invariants) mendokumentasikan keputusan.

Perhitungan memakai BigInt untuk rasio/pembulatan half-up; tidak ada floating point untuk nominal. Kalender actual dipisah per bulan dengan hari aktual; fee bulanan utuh, sekali/deposit sekali. Anniversary sesuai PRD FR-03 selalu satu periode penuh, anchor asli kembali31 setelah Februari/leap year. Policy dipilih pada midnight tanggal masuk zona lokasi. End eksklusif, end kosong hanya periode awal, preview maksimum24periode. Minimum booking bagian total awal, bukan tambahan/penerimaan; minimum melebihi total awal ditolak.

Quote INTERNAL tersimpan dengan policy/kamar version, snapshot konfigurasi/rincian/total, actor dan expiry teknis15menit. Snapshot lama dapat dibuka actor sesudah reload/perubahan tarif; hanya histori saat expired. Belum public quote/consent, tidak reservasi/checkavailability, tidak membuat invoice/payment. B04.3 snapshot booking/lease/invoice/amendment belum diimplementasikan. Due/penalty/refund disimpan untuk workflow mendatang, belum mengeksekusi penagihan/settlement.

Data preservation: fingerprint keseluruhan lama tidak cocok karena ada tambahan1organisasi+1lokasi sejak checkpoint0.3. Tidak menimpa evidence lama atau mengklaim MATCH keseluruhan. scripts/pricing-checkpoint.ts memverifikasi subset seluruh baris lama berdasarkan cutoff evidence0.3: hash/count kolom identitas (id/nama/slug/city/timezone/created_at, sesuai tabel) MATCH; ini bukan fingerprint seluruh field profil/kamar. Kini4organisasi/5properti; tambahan terakhir00:56/00:57UTC mendahului migration013 pada01:29UTC. Evidence user-data-pricing-checkpoint.json hanya count/hash/waktu, tanpa nama/email. Tidak ada fingerprint tepat sebelum migration013; batas bukti dicatat eksplisit.

Validasi kandidat: build PASS, unit13 PASS dan integration31 PASS pada kost_test. Tambahan5 integration membuktikan effective date/zona/override0, CAS/idempotency, snapshot lama, invalid/cross-tenant/cross-property rollback, role/lokasi/actor-onlyquote, capacity/range/minimum, expiry serta immutable grants/append guard. Domain fixture nominal sintetis hanya di tests. F10 hanya perhitungan pecahan sewa, bukan workflow pindah/ledger. AC-09/32 memiliki evidence domain; AC-11 invoice/lease dan AC-31 public consent masih NOT RUN penuh. Tidak ada story DONE/approval gate.

Browser targeted2 lulus18,1detik; suite final10/10 PASS (1,0menit) sesudah penyesuaian batas tunggu SMTP, lihat evidence/pricing-e2e.txt. Screenshot pricing desktop/mobile diperiksa, test overflow360 lulus. Regresi pertama9/10: email fixture gagal1kali lalu retry nyata setelah1menit berhasil(attempts2,sent_at ada,failed_at null); batas poll15detik lebih pendek dari backoff. Poll email fixture disesuaikan75detik dan suite90detik tanpa mengubah assertion/delivery produksi. Test juga menemukan JSX navigasi perlu fragment dan selector select/tab fixture perlu role/navigasi yang benar; diperbaiki lalu diuji ulang.

### Lanjutan dari checkpoint0.4

1. B07.1 allocation/presence/exclusion constraints dan state/lock sebelum B03.3 readiness/archive/block final; tetap tidak menandai kamarready dari checklist saja.
2. B04.3 kontrak snapshot untuk booking/lease/invoice/amendment, B08.1 invoice immutable, lalu accept booking atomikB07.2 sesuai dependency; public projection/publish/consent menyusul media scan dan kesiapan.
3. Remainder v1 tetap mengikuti60row tracker: manual payment/ledger/deposit/refund, lease/check-in, scheduler billing/in-app, inquiry/hospitality/move/checkout/turnover/reports, SaaSadmin/import/opening dan backuprestore. G1–G8 belum lengkap.
4. Batas aktual: belum minimum tenancy/house rules listing lengkap, diskon override UI, early-exit settlement, quota admin komersial, scan nyata/retensi/cleanup/performance/browsermatrix. SMTP at-least-once masih dapat duplikat pada crash send-before-commit; belum menutup dedup event bisnisB18. Tidak deploy produksi.

Pemeriksaan penutup0.4: build PASS; unit13/13, integration31/31, browser10/10 PASS; npm audit0 kerentanan terlapor; manifest22/22 cocok. Health localhost:5173/api/v1/health build0.4.0, productionReady=false; Docker Postgres/Mailpit healthy, S3 lokal berjalan. Data lama pada kolom fingerprint identitas MATCH dan tambahan sebelum migration tetap ada. Evidence ringkas: evidence/pricing-verification.json. Tidak ada reset, perubahan baseline atau deploy produksi.

## Pekerjaan aktif setelah0.4 — alokasi/presence

B07.1→B03.3 blokir/availability dan B04.3 snapshot guard sedang dikerjakan menurut ADR-15. Acceptance penuh pending. Evidence domain sebelum migrasi direkam dengan scripts/checkpoint-data.ts; tidak reset data.

## Checkpoint 0.5.0 — fondasi alokasi/presence dan blokir

Migration015–016 tambahan diterapkan; tidak reset/seed data pengguna. ADR-15 mencatat fondasi B07.1, irisan B03.3 dan helper B04.3. Database memiliki bookings/leases typed (belum runtime write/API transaksi), alokasi hold/stay/block dengan GiST exclusion tenant+room+[start,end), endnull=infinity; presence terpisah unique aktif/kamar dan lease. FK lease pada presence/alokasi scoped organisasi dan room memiliki FK sendiri, agar pindah lintas lokasi kelak tetap dapat memakai lease yang sama; lease booking awal tetap scoped ke kamar asal. Tidak mengasumsikan deadline/akhir rencana mengakhiri presence.

API/UI Kalender kamar tersedia: Owner/Manager lokasi membuat blokir dan melepas dengan alasan/version/idempotency/audit; Finance/Operations membaca sesuai lokasi. Histori tidak dihapus, kondisi kamar tidak berubah, presence aktif menolak blokir baru. Alokasi dan blokir harus commit/release bersama melalui deferred constraint. Runtime tidak mendapat izin insert hold/stay/presence atau booking/lease palsu. Lock lokasi→room konsisten inventori, constraint overlap pertahanan terakhir. API23P01 menjadi409AVAILABILITY_CONFLICT. Source parent invalid/composite tenant FK ditolak. Kontrak request/response: api/allocation.openapi.json (generator scripts/allocation-contract.ts).

Availability read-only memeriksa kondisi ready, overlap dan presence independen; reason tanpa identitas penghuni. Hasil hanya pemeriksaan saat checkedAt, bukan reservasi. Mark-ready/archive/check-in tetap belum dibuka: blocker workorder/ticket/turnover belum lengkap. Tidak membuat tombol ready palsu agar test melewati constraint.

prepareBookingPricingSnapshot dipanggil dalam transaksi command booking mendatang: actor quote dan lokasi, expiryclock DB, room version dan versi policy efektif dicek ulang di bawah lock lokasi→pricing→room. RequestedEnd berasal dari request asli(null untuk ongoing), bukan end preview periode awal. Snapshot/rincian awal di-copy sehingga tidak mengubah quote. Helper tidak membuat consent, booking, invoice, hold atau penerimaan dana; B04.3 belum lulus AC11/31 penuh.

Evidence data: scripts/checkpoint-data.ts before/after allocation MATCH untuk seluruh kolom9tabel operasional lama (organizations/properties/rooms/types/type versions/policy versions/override tipe/override kamar/quotes). Hanya count/hash disimpan di evidence/user-data-allocation-before.json dan after.json, tanpa data pribadi. Tabel baru tidak berisi booking/presence pengguna buatan. Tidak menimpa fingerprint fase sebelumnya.

Unit15 PASS; integration36 PASS di kost_test (tambahan5). Membuktikan dua request blokir paralel satu201/satu409 tanpa parent/audit yatim, retry exact result, release audit/histori dan kondisi inspection tetap; dua koneksi SQL independent pada hold/infinity exclusion satu commit/satu23P01 dengan booking fixture rollback; presence tetap menghalangi setelah planned end dan allocation released, unique aktif dan cross-tenant FK; role/location denial termasuk lokasi kedua dalam tenant sama; guard snapshot stale policy/room, expiry, deep-copy dan requestedEnd. Fixtures hold/lease/presence diinsert admin hanya pada kost_test dan berlabel TEST_ONLY, bukan evidence dua accept booking end-to-end yang belum ada.

Browser targeted2/2 PASS desktop1280/mobile360 (23,2detik): setupkamar→block→queryconflict→overlap409→reload→release→querykamar masihinspection. Screenshot allocation-desktop/mobile diperiksa. Regresi full suite12/12 PASS (1,3menit), integration akhir36/36 PASS termasuk tambahan denial lokasi kedua dan stale room-version terpisah; jangan menandai AC03/21/24 penuh PASS hanya karena constraint/helper lulus. Semua60story tetap IN_PROGRESS/PLANNED, G1–G8 belum selesai.

Perbaikan dari tes: trigger polymorphic memakai CASE yang mengakses field NEW.block_id pada record room_blocks; dua command mendapat500. Diperbaiki dengan IF branch melalui migration016 (migration015 yang sudah applied tidak diedit), kemudian suite36 lulus. Tidak mengganti hasil gagal menjadi PASS tanpa rerun.

### Pekerjaan berikutnya dari0.5

1. Booking intake/identity/request dan validasi snapshot consent sesungguhnya; B08.1 immutable invoice/lines/number/adjustment primitives, lalu B07.2 accept atomik allocation+invoice+audit/outbox/idempotency. Konfigurasi kebijakan tetap diisi pemilik.
2. Generic transactional outbox/jobs B18 dan booking expiry/review workerB07.3, manual payment verification/receipt/ledger; tanpa fakepaid.
3. Public listing/media scan/publish/inquiry, lease/agreements/check-in, scheduler/in-app, hospitality/move/physical checkout vs financial settlement/turnover, reports/SaaS/migration/restore sesuai dependency60story. Readiness dan archive final menunggu blocker lengkap.
4. Backup/restore drill, scan clean/infected nyata, retention/hardening/load/browsermatrix dan seluruh acceptance/release gates masih tersisa. Workspace belum Git repo; tidak ada tag/release produksi.

Pemeriksaan penutup0.5: build PASS, unit15/15, integration36/36, E2E12/12 PASS desktop1280/mobile360; npm audit0 kerentanan terlapor; manifest22/22 cocok. Fingerprint seluruh kolom9tabel lama before/after MATCH. Docker PostgreSQL/Mailpit healthy dan S3 berjalan; health localhost:5173/api/v1/health build0.5.0 productionReady=false. Evidence ringkas evidence/allocation-verification.json. Tidak ada reset, deploy, story DONE atau approval release gates.

## Pekerjaan aktif sesudah0.5

ADR-16: booking petugas/pending→accept+invoice+allocation, kesiapan awal terjaga dan expiry/outbox in-app. Evidence pending, tidak ada AC/gate baru ditandai PASS. Fingerprint before booking diambil sebelum migrasi.

## Checkpoint 0.6.0 — booking petugas sampai invoice awal

Migration017–022 tambahan diterapkan tanpa reset; data lama9tabel operasional before/after booking MATCH. ADR-16 mencatat keputusan; api/booking.openapi.json berisi request/response typed dan proyeksi aktual. Source tetap workspace tanpa Git repo; tidak ada tag/release produksi. Paket/lockfile development0.6.0, dependency tidak berubah.

Alur tersedia: checklist Inventori→Kesiapan awal kamar→quote→permohonan kontak baru/customer tenant-scoped→konfirmasi petugas→pending→refresh quote/konfirmasi bila berubah→accept atomik→invoice/hold atau confirmed0→notifikasi in-app. Pending dapat ditolak dengan alasan tanpa invoice/alokasi. Customer tidak dijadikan staf. Consent disimpan append-only jenis staff_recorded; bukan penerimaan akun/perjanjian penghuni. Quote, requestedEnd ongoing, versi kamar/policy dan customer scope divalidasi; waktu bisnis date-only SQL::text (bukan toISOString tanggal lokal).

Kesiapan awal hanya inspection dengan checklist recorded lengkap, akun terverifikasi dan Owner/Manager lokasi, tidak ada presence/lease history, open blocking workorder atau block mencakup tanggal lokal saat ini. Workorder schema foundation belum command layanan. Future block/reservation tetap dicek saat accept, tidak berarti physical ready=available. Kamar bekas occupancy tetap harus melalui turnover mendatang. Kondisi tidak diubah otomatis oleh pembayaran/deadline.

Accept mengunci entitlement→location→pricing→room→booking; checks stale version/policy/expiry/capacity/ready/checklist/presence dan exclusion. Dalam satu commit invoice+immutable lines+nomor organisasi+snapshot/bill_to, bookingstate, alokasi, audit/outbox/idempotency. DB deferred checks mewajibkan total invoice cocok, accepted booking memiliki issued invoice/snapshot sama dan alokasi dengan interval/kind sesuai state; held harus memiliki deadline. Invoice counter rollback bila transaksi gagal. Minimum booking0 menjadi confirmed tanpa receipt; jika total>0 invoice tetap unpaid/overdue. Minimum>0 held dengan deadline server. Initial dueAt held=hold deadline; confirmed0=tanggal masuk lokal. Routine dueDay/billing belum ada.

Worker proses expiry held aktual via fungsi terbatas role kost_worker, release allocation dan void invoice atomik; confirmed0 tidak diekspirasikan. Worker audit actor_kind=worker, tidak mengatasnamakan user. Business outbox menjadi notifikasi in-app scoped Owner/Manager/Finance berizin dengan unique event+recipient. Worker lokal lama di-restart memakai kode baru; layanan tetap terpisah dari API. SMTP identity/invitation tetap sink lokal dan at-least-once; email bisnis pelanggan belum dikirim/diaktifkan. Tidak mengklaim provider produksi.

Batas finansial aktual0.6: payment/proof/verified allocations/credit/deposit ledger belum tersedia; verifiedReceived=0 karena tidak ada command penerimaan. Balance/current read model adalah total invoice issued (void0), bukan bukti penerimaan bank; paid hanya bila total0, tanpa receipt. Adjustment baru schema dan tanpa write command/grant. Sebelum modul pembayaran/adjustment diaktifkan wajib mengganti read model dengan ledger/alokasi, memperluas void/expiry guards untuk proof/payment dan menguji races. Tidak ada tombol lunas/flag bayar manual atau auto-deposit-received. Pembatalan sesudah accepted/refund/check-in belum tersedia.

Evidence kandidat:

- Build TS/Vite PASS; unit15/15 PASS (domain/security lama tetap lulus).
- Integration41/41 PASS kost_test, evidence/booking-integration.txt. Tambahan5 membuktikan dua actual APIaccept pada kamar sama satu200/satu409, satu allocation/invoice/outbox tanpa yatim dan retry identik; harga master tidak mengubah invoice/snapshot, line append/UPDATE ditolak; min0confirmed+invoiceunpaid tanpa penerimaan, overdue derived; worker expiry/retry/dedupe dan role no customer-read; initial checklist/currentblock/workorder/pastoccupancy guards, accept mengecek checklist ulang; stale/expired quote wajib refresh+consent event baru, Manager lain berizin bisa accept; customer/booking/invoice tenant-role boundaries, failed intake rollback. Ini evidence AC03 otomatis lokal, belum approval staging/UAT atau semua release gate. AC11 invoice terbukti, lease/amendment masih NOT RUN. AC04/05/06 payment/proof races masih NOT RUN.
- E2E14/14 PASS (1,8menit) Chromium desktop1280/mobile360, evidence/booking-e2e.txt. Onboarding, MFA/staf, inventory13/lokasi kedua, harga dan blokir tetap lulus; tambahan2 alur checklist→ready→harga→quote autofill→kontak/konfirmasi→pending→accept→invoice belum dibayar→in-app→reload. booking-desktop/mobile.png diperiksa dan overflow360 diuji. Belum check-in/checkout E2E.
- Domain data preservation: evidence/user-data-booking-before.json dan after.json MATCH seluruh kolom9tabel lama; hanya hash/count. Health localhost:5173/api/v1/health build0.6.0 productionReady=false. Tidak memasang fixture harga/kontak/booking pengguna. Semua test memakai kost_test/kost_e2e dan kontak sintetis.

Perbaikan dari tes: expiry awal gagal karena actor_id audit wajib user; migration021 menambah actor_kind worker + constraint actorNULL khususworker (RLS app tetap actor sendiri). Assertion browser angka rupiah sempat tidak memperhitungkan NBSP locale dan diperbaiki tanpa mengubah nilai; suite lengkap13/14 sempat gagal karena polling email foundation masih default5detik, diselaraskan75detik dengan retry worker. Test pool worker ditutup di after agar cleanup terjadi meskipun test gagal. Seluruh suite diulang dan lulus.

### Langkah lanjut dari0.6

1. B08.2: rekening tujuan konfigurasi pemilik, private proof clean/authorized, dana claimed≠verified, manual bank/cash verification, receipt/reference uniqueness, allocations per line, credit dan recon; ubah read model invoice dan expiry guard sebelum enable. Scan nyata masih harus tersedia untuk bukti.
2. B07.3 review window once/expiry vs verification, cancel-after-accept dan late funds exception; B08.3 adjustments/reversal/credit UI + immutable references. B09 deposit liability/reservation/refund approval/payout.
3. Resident/account portal, agreement version/acceptance, lease/check-in safeguards; billing scheduler/catch-up/in-app/email reminders; inquiry/public listing/publish/media; move/hospitality/checkout fisik vs settlement/turnover; reports/SaaS/migration/opening/backuprestore sesuai60story.
4. General jobs/retry/dead-letter/metrics, security/retention/file scanning/load/browsermatrix, G1–G8 dan60AC tetap belum selesai. Tidak menandai story DONE atau siap produksi.

Pemeriksaan penutup0.6: build PASS, unit15/15, integration41/41, E2E14/14 PASS desktop1280/mobile360; npm audit0 kerentanan terlapor; baseline22/22 cocok. Fingerprint seluruh kolom9tabel operasional lama MATCH. Docker PostgreSQL/Mailpit healthy, S3 lokal berjalan; API/frontend/worker aktif, health build0.6.0 productionReady=false. Evidence booking-verification.json dan screenshot sintetis diperiksa. Tidak ada reset, deployment produksi atau approval gate/story DONE.

## Salinan source GitHub

Atas instruksi pengguna, source development0.6.0 disiapkan pada branch main dengan remote https://github.com/ssumartono/hospitality. Pemeriksaan awal: workspace belum Git, remote tidak memiliki refs. Git author memakai konfigurasi pengguna yang sudah tersedia. Source, migrasi, lockfile, baseline, dokumen dan evidence sintetis disertakan; .env, .local/key, node_modules, dist, backup, test-results, private objects/database dan fingerprint operasional user-data*.json tidak disertakan. Git bukan backup DB/object/key dan bukan deployment atau persetujuan produksi. Hasil push diverifikasi terhadap remote HEAD pada pelaksanaan salinan.
