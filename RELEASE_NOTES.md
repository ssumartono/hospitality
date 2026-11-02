# 0.6.0 development — 2 November 2026

Booking petugas end-to-end sampai invoice awal: kesiapan awal berdasarkan checklist/blocker, quote/konfirmasi petugas, kontak tenant-scoped, pending/refresh/reject/accept, invoice+alokasi+audit/outbox atomik. Nomor dan line/snapshot/bill-to invoice immutable, duplicate accept konflik tanpa invoice yatim, min0confirmed tanpa receipt. Worker expiry hold, void/release dan in-app dedupe nyata; audit worker terpisah. Migration017–022 tambahan tanpa reset.

Build/unit15/integration41/E2E14 desktop-mobile lulus. Fingerprint seluruh kolom9tabel lama MATCH. Tarif/kontak/booking sintetis hanya database test. Worker lokal direstart kode0.6.0.

Belum siap produksi: pembayaran/proof/verified ledger/receipt/deposit/credit/reversal dan perlindungan expiry vs payment belum tersedia; saldo invoice saat ini original issued total, void0, verifiedReceived0 karena payment commands belum ada. Adjustment hanya schema. Email bisnis pelanggan, portal/lease/check-in/billing sampai checkout serta60AC/G1–G8 belum selesai. Tidak deploy produksi.

---

# 0.5.0 development — 2 November 2026

Kalender kamar persisten: blokir interval, pemeriksaan ketersediaan, release beralasan dengan histori, authorization lokasi/peran, idempotency/audit dan constraint database overlap. Fondasi booking/lease/allocation/presence terpisah serta helper snapshot booking mendatang memeriksa ulang quote/room/policy. Migration015–016 tambahan tanpa reset; fingerprint9tabel operasional lama MATCH. Tidak memasang booking/presence atau harga contoh pada data pengguna.

Build/unit15/integration36/E2E12 desktop-mobile lulus; evidence di IMPLEMENTATION_STATUS.md. Dua blokir paralel dan dua SQL hold fixture tidak dapat bertabrakan. Ini belum bukti dua accept booking lengkap: accept+invoice+outbox belum tersedia.

Belum siap produksi/v1.0.0: siap-sewa/archive final, booking intake/consent/accept, invoice/payment/ledger, lease/check-in sampai checkout, billing/in-app dan seluruh release gates masih harus diselesaikan. Tidak ada deployment produksi.

---

# 0.4.0 development — 2 November 2026

Harga/kebijakan versioned dan quote internal persisten: tarif lokasi/tipe/kamar, tanggal efektif zona lokasi, biaya sekali/bulanan, deposit opsional, minimum pembayaran dan konfigurasi hold/notice/cancel/refund/denda. Kalkulator integer/half-up dan anniversary anchor, preview kalender per bulan serta snapshot lama immutable. API authorization, RLS/compositeFK, CAS, audit dan idempotency; migration013–014 tambahan tanpa reset. UI Bahasa Indonesia desktop/mobile. Tidak memasang tarif contoh pada data pengguna.

Build/unit13/integration31/E2E10 desktop-mobile lulus; evidence pada IMPLEMENTATION_STATUS.md. Data seluruh baris organisasi/properti checkpoint lama cocok; tambahan1organisasi/1lokasi sebelum migration pricing dipertahankan.

Belum siap produksi/v1.0.0: quote internal bukan reservasi, consent pelanggan, invoice, pembayaran atau checkavailability. Snapshot booking/lease/invoice B04.3, allocation/presence, publikasi, seluruh transaksi operasional sampai checkout, scanner nyata dan backuprestore/gates masih tersisa. Tidak ada deployment produksi.

---

# 0.3.0 development — 2 November 2026

Inventori persisten: profil lokasi, tipe/fasilitas versioned, kamar individual, generator pilot12/urutan/manual dengan preview dan konfirmasi, checklist fisik serta UI Bahasa Indonesia desktop/mobile. Snapshot kamar tidak berubah ketika default tipe diperbarui. Semua kamar dimulai inspection.

Entitlement/kuota atomik tenant-wide untuk kamar/lokasi/staf, expiry/restricted/downgrade guard, audit/idempotency dan migration tambahan009–012. Paket pengembangan TEST_ONLY terpisah dari konfigurasi komersial. Data organisasi/lokasi lama MATCH; tidak ada kamar pengguna ditambahkan otomatis.

Build, unit8, integration26, E2E8 lulus; audit0 kerentanan terlapor. Evidence dan batas pengujian di IMPLEMENTATION_STATUS.md. Seed CLI lokal tersedia, belum dijalankan pada data pengguna.

Belum v1.0.0/siap produksi: siap-sewa/archive/block penuh, pricing/katalog/booking/ledger, billing/in-app, hospitality/checkout, laporan, SaaS activation, backup/restore dan seluruh release gates masih tersisa. Tidak deploy produksi.

---

# 0.2.0 development — 1 November 2026

Keamanan akun dan staf: MFA TOTP opsional, recovery code sekali pakai, challenge login/anti-replay/expiry/batas percobaan, re-auth scoped per aksi/session/organisasi/target, resend verifikasi email, undangan staf 72 jam, penerimaan email terverifikasi, peran/lokasi, perubahan akses dan pencabutan dengan audit/idempotency. Owner terakhir tetap dilindungi saat konkurensi; organisasi/lokasi sebelumnya tidak direset.

Token email dan secret MFA terenkripsi AES-256-GCM. Worker memakai role database terpisah dan tidak dapat membaca password/properties. Upgrade lokal: npm run db:security-upgrade. Secret key development di .local harus dipertahankan bersama database; produksi memakai secret manager. Login tidak membedakan respons untuk akun tidak ada/password salah dan tetap menjalankan hash verification pada kedua jalur.

Build/tes dan evidence kandidat dicatat dalam IMPLEMENTATION_STATUS.md (unit 5, integration 17, E2E desktop/mobile 6). Hasil ini cakupan fondasi/keamanan/staf, bukan 60 AC penuh atau approval produksi. SMTP diterima Mailpit hanya sink lokal. Inventori/kuota/seed pilot dan seluruh alur transaksi bisnis masih tersisa. Tidak ada deploy/tag v1.0.0.

---

## Riwayat 0.1.0 (cakupan pada build saat itu)

# 0.1.0 development — 1 November 2026

Fondasi pertama: TypeScript/Fastify/PostgreSQL, React UI pola shadcn, registrasi/verifikasi email, lupa/reset password, session cookie/CSRF, organisasi dan lokasi dengan RLS, database guard Owner terakhir, audit create, worker SMTP retry, private S3/quarantine dan adapter ClamAV, kerangka idempotency transaksi, migrasi checksum versioned, Compose PostgreSQL/Mailpit/SeaweedFS dengan image digest.

Pengujian parsial: 3 unit, 7 integration dan 2 Chromium E2E (desktop/360 px) lulus. Lihat project-docs/evidence dan IMPLEMENTATION_STATUS.md. Tidak sama dengan 60 acceptance produksi. Baseline 22 file cocok manifest.

Belum rilis v1.0.0. MFA/re-auth, invitation/manajemen staf, full scope permissions, scanner clean/infected drill, inventory/kuota/seed pilot, pricing/katalog/booking/ledger, kontrak/billing/in-app, hospitality/move/checkout/refund, laporan, SaaS/migrasi bisnis, backup/restore dan hardening masih perlu implementasi/evidence. SMTP accepted hanya penerimaan sink lokal, bukan pengiriman email produksi. Outbox belum encrypted dan SMTP dapat duplikat saat crash sesudah send sebelum commit. Semua gate produksi belum disetujui.
