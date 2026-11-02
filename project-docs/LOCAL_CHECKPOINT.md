# Checkpoint lokal KostHospitality

Hasil kerja tersimpan di C:\KostHospitality.
Versi development: 0.6.0; target produk: 1.0.0.

Source frontend/API/worker, migrasi001–022, lockfile, konfigurasi contoh, panduan dan evidence tersedia di workspace. Status rinci: IMPLEMENTATION_STATUS.md. Evidence terakhir: evidence/booking-verification.json.

Validasi sesi pengembangan terakhir: build PASS, unit15, integrasi41, E2E14 desktop/mobile PASS. Tidak dijalankan ulang hanya untuk penyimpanan checkpoint ini.

Berikutnya: pembayaran manual/proof/ledger dan perlindungan expiry terhadap pembayaran, lalu kontrak/check-in dan scope lain sesuai tracker. Belum siap produksi; release gates belum lengkap.

Database lokal memakai named volume Docker persisten. Pertahankan volume dan .local/encryption.key; source workspace bukan backup database/object storage. Backup/restore drill belum selesai. Source dikelola melalui Git dengan remote tujuan https://github.com/ssumartono/hospitality (branch main). Git menyimpan source/dokumen/test, bukan database, private objects atau key lokal. Fingerprint data operasional user-data*.json tetap lokal dan di-ignore.
