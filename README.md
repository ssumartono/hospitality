# Kost Hospitality — development 0.6.0

Target produk v1.0.0. Implementasi saat ini fondasi, inventori, harga, blokir dan booking petugas sampai invoice awal; belum aplikasi end to end atau siap produksi. Baseline: project-docs/kost-v1. Checkpoint: project-docs/IMPLEMENTATION_STATUS.md.

## Windows local setup

Prasyarat Node 24 dan Docker Desktop Linux Engine aktif. PowerShell di C:\KostHospitality:

~~~powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres mailpit
npm run db:security-upgrade
npm run db:development-plan
npm run dev:api
~~~

Terminal kedua: npm run worker. Terminal ketiga: npm run dev. Buka http://localhost:5173 (gunakan localhost, sesuai APP_ORIGIN). Mailpit di http://localhost:8025. Daftar akun, buka email sink dan verifikasi, login, buat organisasi lalu lokasi. Tidak ada akun/password demo yang disisipkan ke produksi. Database memakai named volume persisten. docker compose stop menghentikan layanan tanpa menghapus volume. Jangan gunakan down -v untuk database berisi data yang perlu dipertahankan.

Environment default hanya lokal. .env.example memisahkan DATABASE_URL role aplikasi dan MIGRATION_DATABASE_URL role migrasi. Jangan menggunakan role superuser untuk API. Layanan belum disiapkan untuk hosting publik; pengaturan produksi, secret manager, TLS, MFA, scan/storage dan seluruh gate masih wajib.

## Pemeriksaan

~~~powershell
npm run db:migrate
npm run typecheck
npm test
npm run test:integration
npm run build
~~~

Tes integrasi membuat database kost_test terpisah pada PostgreSQL localhost dan menerapkan migrasi. Data sintetis example.test persisten hanya pada database test; runner menolak NODE_ENV=production dan host database nonlokal. Mailpit tetap sink lokal bersama. Tidak mengubah status AC produksi. Migrasi checksum dan advisory lock mencegah edit migration lama/parallel runner. Semua perubahan skema setelah applied harus migration baru.

## Cakupan tersedia

Registrasi/verifikasi/resend email, lupa/reset password, login/logout/session, MFA/recovery/re-auth, organisasi/lokasi, undangan/staf/peran/cakupan lokasi/pencabutan, audit, RLS tenant, private S3/quarantine, idempotency, SMTP outbox terenkripsi. UI terhubung API/database. Semua modul lain mengikuti dependency tracker; tidak ada booking/payment palsu atau harga ilustrasi produksi.

## Operasi dan batas

Worker SMTP mengirim nyata ke Mailpit lokal, status sent hanya berarti SMTP menerima. Belum ada scheduler tagihan/in-app bisnis. Private object storage S3/quarantine dan adapter ClamAV tersedia; scanner clean/infected belum diuji. Seed pilot lokal tersedia setelah profil dan tipe dikonfigurasi; lihat bagian inventori. Jangan menjalankan fixture TEST_ONLY sebagai data produksi.

Runbook baseline: project-docs/kost-v1/docs/06_RELEASE_RUNBOOK.md. Backup/restore drill belum dilakukan; G5 tetap NOT RUN. Bukti 60 acceptance dan G1–G8 belum lengkap; tidak ada approval deploy/release.

## Storage dan browser tests

Jalankan docker compose up -d object-storage lalu npm run storage:init. Bucket privat S3 lokal berada di localhost:9000. Default credentials dalam infra/s3.local.json hanya development. Upload foundation Owner-only melalui POST /api/v1/organizations/:org/files multipart field file. File selalu quarantined. Download ditolak sampai ClamAV memberi hasil clean. Mulai scanner opsional dengan docker compose --profile scan up -d clamd; image scanner belum dipin digest/diuji dan signature database harus siap. Tidak ada scanner palsu. Alur upload UI belum tersedia.

Browser test: npx playwright install chromium kemudian npm run test:e2e. Runner membuat kost_e2e terpisah, memakai API port 3002 dan Vite port 4173, mengirim email hanya ke Mailpit. Tes fondasi desktop/360 px bukan acceptance E2E seluruh bisnis. Screenshot sintetis tersimpan di project-docs/evidence.

## Upgrade dan keamanan akun/staf (0.2.0)

Jalankan npm run db:security-upgrade sebelum restart API/worker dari versi awal. Command menerapkan migration tambahan, mengenkripsi token lama tanpa mencetaknya, memvalidasi constraint encrypted-only dan role runtime. Tidak reset organisasi/lokasi. WORKER_DATABASE_URL menggunakan role kost_worker, bukan kredensial migrasi.

Development otomatis membuat key acak di .local/encryption.key (di-ignore Git). Jangan menghapus folder .local ketika named volume PostgreSQL masih dipakai; ciphertext MFA/email memerlukan key yang sama. Simpan key terpisah dan terlindungi bersama prosedur backup. Produksi harus mengisi APP_ENCRYPTION_KEY (base64 dari 32 byte random) melalui secret manager; auto-key development tidak dipakai di NODE_ENV=production. Restore/rotation key belum menjadi drill release yang lulus.

Pada halaman aplikasi: Keamanan akun untuk MFA, lalu Staf dan akses lokasi (Owner) untuk mengundang/mengubah/mencabut. Password konfirmasi wajib untuk perubahan akses; bila MFA aktif gunakan kode baru atau kode pemulihan yang belum dipakai. Undangan 72h dikirim ke Mailpit lokal; penerima harus daftar/login dan memverifikasi email yang cocok. Owner baru memerlukan undangan Owner dari Owner aktif, tidak ada selector role demo.

Build, unit 8, integration 26 dan E2E 8 lulus pada checkpoint 0.3.0; bukan 60 acceptance produksi. Alur transaksi dan release gates masih mengikuti tracker.

## Inventori dan kuota (0.3.0)

Sesudah upgrade jalankan npm run db:development-plan untuk memasang paket TEST_ONLY lokal dan entitlement organisasi yang belum ada. Paket 100 kamar/10 lokasi/100 staf adalah fixture teknis, tanpa harga komersial dan ditolak di produksi. Owner tidak dapat menaikkan kuota sendiri. Organisasi lama tetap dipertahankan.

Buka Inventori → pilih lokasi → Profil lokasi → isi kode/lantai/segmen aktual → Tipe kamar → buat tipe/fasilitas aktual → Generator kamar. Pilih pilot 12, periksa/edit kode dan lantai, lihat preview, centang dua konfirmasi lalu simpan. Atau tambah kamar individual/urutan/manual. Kamar ke-13 dan lokasi kedua tidak memerlukan perubahan kode. Semua kamar mulai Perlu inspeksi; checklist lengkap belum menjadikan kamar siap disewakan. Booking/harga belum tersedia.

Seed CLI opsional memakai API yang sama: isi SEED_OWNER_EMAIL/PASSWORD dan SEED_ORGANIZATION_ID/SEED_PROPERTY_ID/SEED_TYPE_ID pada environment lokal (lihat nama tepat .env.example), lalu npm run db:seed-pilot -- --confirm-layout. Jika MFA aktif isi konfigurasi MFA yang disediakan script. SEED_ROOMS_FILE opsional memuat 12 baris layout yang dikonfirmasi. Tidak ada password default, dan script tidak dijalankan otomatis. API contract: api/inventory.openapi.json; keputusan: project-docs/ADR-13-inventory-and-entitlements.md.

## Harga dan kebijakan (0.4.0)

Jalankan npm run db:migrate (atau db:security-upgrade untuk seluruh upgrade keamanan), lalu refresh aplikasi. Klik Harga dan kebijakan → pilih lokasi → Muat ulang harga bila baru menambahkan kamar → Buat versi kebijakan. Semua nominal/syarat harus diisi dari keputusan pemilik; nol harus dimasukkan eksplisit bila memang nol. Waktu berlaku mengikuti zona lokasi yang ditampilkan. Deposit/denda nonaktif tidak membuat tagihan tersembunyi.

Tarif override kamar mengalahkan tipe lalu lokasi; kosong mewarisi, nol override gratis. Simpan membuat versi baru, bukan menimpa versi lama. Kalender actual memakai hari aktual bulan; anniversary selalu periode penuh dan kembali ke anchor asli setelah Februari. Fee bulanan tidak diprorata, fee sekali dan deposit sekali.

Hitung quote internal memilih kebijakan pada tanggal masuk. Akhir eksklusif; kosong hanya periode awal; maksimum24periode. Salin ID quote untuk Buka snapshot quote sesudah reload (actor yang membuat saja). Snapshot tidak berubah ketika tarif diperbarui. Expiry15menit tidak menghapus histori. Quote belum menjadi booking/invoice, belum memeriksa availability atau menerima consent pelanggan. Kontrak API: api/pricing.openapi.json; generator kontrak npx tsx scripts/pricing-contract.ts.

Build kandidat0.4: unit13/integration31; browser/evidence final pada IMPLEMENTATION_STATUS.md. Tes SMTP menunggu hingga75detik agar mencakup retry pertama1menit; suite90detik. Ini bukan hasil latency/SLO produksi. Tidak ada harga/rekening operasional yang di-seed.

## Kalender kamar dan blokir (0.5.0)

Upgrade: npm run db:migrate kemudian refresh localhost:5173. Klik Kalender kamar, pilih lokasi/kamar dan Muat ulang kalender sesudah menambah kamar. Owner/Manager lokasi dapat menambah blokir tanggal/alasan dan melepas dengan alasan; Finance/Operations hanya membaca kalender lokasi berizin. Akhir eksklusif, kosong berarti tanpa batas akhir. Blokir yang bertabrakan dengan alokasi atau presence aktif ditolak409 tanpa override. Histori tetap ada sesudah release dan kondisi kamar tidak berubah.

Periksa interval menampilkan alasan belum tersedia. Kamar inspection tetap tidak available meskipun tidak ada blokir; hasil bukan reservasi. Mark-ready/archive, accept booking, invoice dan check-in belum tersedia. Booking/presence foundation tidak diberi runtime write; tidak ada data transaksi contoh dipasang pada database pengguna.

Kontrak api/allocation.openapi.json; ADR-15; domain15/integration36 dan hasil browser final di IMPLEMENTATION_STATUS.md. Pemeriksaan data penuh9tabel lama: npx tsx scripts/checkpoint-data.ts before allocation lalu after allocation (jangan overwrite file before untuk menutupi perubahan). Skrip hanya database development lokal kost dan menyimpan count/hash, bukan data pribadi.

## Booking petugas dan invoice awal (0.6.0)

Upgrade npm run db:security-upgrade, restart API/worker dan refresh aplikasi. Worker sekarang memproses expiry hold serta notifikasi in-app selain SMTP identity/staf. Tidak ada secret/env tambahan. Jalankan npm run worker pada terminal khusus; gunakan satu versi worker saat upgrade.

1. Lengkapi checklist kamar di Inventori.
2. Booking dan invoice → Muat ulang booking → Kesiapan awal kamar, pilih kamar dan isi alasan aktual. Hanya inspection awal tanpa histori occupancy/lease dan penghalang yang sah; bukan pengganti turnover.
3. Harga dan kebijakan → hitung quote BARU sesudah readiness (versi kamar berubah). Quote terbaru otomatis mengisi ID di Booking dan invoice.
4. Periksa quote booking, baca biaya/kebijakan, masukkan kontak minimum atau pilih customer yang berizin, rencana bulan dan konfirmasi yang benar-benar dicatat petugas. Simpan permohonan masih pending, tidak menahan kamar.
5. Isi alasan lalu Setujui booking. Konflik/expired/harga berubah ditolak tanpa invoice yatim. Jika perlu hitung quote baru dan Perbarui quote dan konfirmasi pada pending; tidak mengganti terms diam-diam.
6. Invoice awal muncul; tetap belum dibayar bila total>0. Minimum booking0 mengonfirmasi tanpa receipt; minimum>0 menjadi held. Worker melepaskan hold expired dan void invoice secara atomik. Muat ulang booking untuk melihat in-app.

Belum ada proof/payment verification/receipt/deposit ledger/credit/reversal, cancel accepted/refund, check-in atau email bisnis pelanggan. Jangan mengubah DB/paid flag untuk menggantikan verifikasi. Invoice tidak dapat diedit; adjustment baru fondasi schema tanpa command. DueAt awal held mengikuti deadline, confirmed0 mengikuti tanggal masuk; routine billing belum tersedia. Keterbatasan read model wajib dituntaskan sebelum payment/adjustment dibuka.

Build/unit15/integration41/E2E14 lulus pada data sintetis; bukan60 acceptance penuh atau approval produksi. Kontrak api/booking.openapi.json; ADR-16; evidence/checkpoint IMPLEMENTATION_STATUS.md.
