# ADR-11 — Fondasi aplikasi development

1 November 2026. Status: diterapkan sebagian; G1 belum lulus.

Workspace awal hanya dokumen. Node 24.13.0, TypeScript exact lockfile, Fastify 5, pg, React 19 dan Vite menjadi fondasi. Database PostgreSQL 17 melalui Compose lokal; role migrasi kost terpisah dari kost_app NOSUPERUSER/NOBYPASSRLS. RLS FORCE pada tabel tenant, scope transaksi melalui set_config lokal transaksi, foreign key komposit pada akses lokasi. Versi npm exact di package.json dan package-lock.json. Image PostgreSQL/Mailpit/SeaweedFS lokal telah dipin digest dari image terpasang; compatibility staging/production belum diuji.

Argon2id memory 64 MiB/time 3/parallelism 1; session acak 256 bit hanya hash disimpan, cookie HttpOnly/SameSite Strict, Secure di produksi, idle 30 menit/absolute 12 jam. Origin allowlist semua mutasi dan CSRF terikat sesi untuk endpoint authenticated. Email token hash single-use 24 jam. Token mentah sementara berada di outbox untuk adapter email, dihapus setelah SMTP sukses; enkripsi outbox dan role worker terpisah wajib sebelum G1/G5.

SMTP outbox memakai lock SKIP LOCKED dan retry bounded/dead-letter. SMTP bersifat at-least-once; crash setelah SMTP menerima sebelum commit dapat menduplikasi email. Message-ID stabil membantu pelacakan, bukan jaminan provider dedup. Belum memenuhi acceptance dedup notifikasi bisnis yang memerlukan unique milestone keys. Mailpit hanya evidence SMTP lokal, bukan email delivered produksi.

UI memakai React, pola shadcn Button dengan Radix Slot dan class-variance-authority, Bahasa Indonesia, session nyata, tanpa localStorage. Source mockup tidak ada. Akses URL lewat alat web gagal sebelumnya. UI baru sebatas fondasi; tes Chromium desktop 1280/mobile360 lulus dan screenshot diperiksa.

Endpoint implemented terdaftar di api/foundation.openapi.json. Belum mengklaim seluruh baseline API 98 operation sudah ada. Endpoint verify-email dan organisasi/lokasi nested selaras pola baseline; kontrak proyeksi fondasi ditulis terpisah untuk tidak mengklaim semua endpoint baseline sudah tersedia.

Belum ada MFA/re-auth, invitation, last-owner commands UI/API, full RBAC mutation, kuota, ledger, billing, migrasi bisnis, laporan atau checkout. Private storage/quarantine dan ClamAV adapter tersedia tetapi clean/infected scan nyata belum dibuktikan. Database guard Owner terakhir diuji dua koneksi paralel. Jangan expose aplikasi ke produksi. Seluruh 60 story tetap tercatat, belum ada DONE; AC penuh NOT RUN sampai evidence seluruh syarat tersedia.

Private storage lokal memakai SeaweedFS 4.51 S3-compatible dengan credentials config eksplisit (tanpa anonymous identity), setelah image MinIO resmi tidak dapat diunduh. Adapter tetap S3 vendor-neutral. Sumber konfigurasi: https://github.com/seaweedfs/seaweedfs/wiki/S3-Configuration dan release https://github.com/seaweedfs/seaweedfs/releases/tag/4.51. ClamAV optional profile scan; kegagalan scanner tidak mengubah quarantine menjadi clean. Dokumen foundation hanya Owner-only; ownership proof/identity/resident per domain belum diintegrasikan.

## Pembaruan 0.2.0

Keterangan belum ada MFA/undangan/worker terpisah di atas adalah riwayat build awal. Implementasi terbaru mengikuti ADR-12: MFA dan staf API/UI tersedia, token outbox encrypted-only, role worker terpisah. Batas produksi lain tetap mengikuti tracker dan gate, bukan otomatis selesai.
