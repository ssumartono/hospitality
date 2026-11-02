# KostHospitality — instruksi proyek

Target workspace pengguna: `C:\KostHospitality`. Target aplikasi: Kost Hospitality v1.0.0, rilis operasional pertama. Dokumen baseline revisi 1.1, 1 November 2026, ada di `project-docs/kost-v1/`.

## Wajib sebelum implementasi

Baca `project-docs/kost-v1/README.md`, `docs/01_SCOPE_RELEASE.md`, `docs/02_BUSINESS_RULES.md`, `PRD.md`, `docs/03_ARCHITECTURE_DATA_SECURITY.md`, dan `docs/08_DEVELOPER_HANDOFF.md`. Path docs pada kalimat ini relatif terhadap `project-docs/kost-v1/`. Gunakan acceptance, backlog, OpenAPI dan runbook pada folder yang sama. Ikuti aturan prioritas dalam PRD; catat konflik yang belum dijelaskan sebelum mengimplementasikan command terkait. Arsip dalam `reference/` bukan baseline terbaru.

## Keputusan yang harus dipertahankan

- Pilot: Palembang dekat kampus, mahasiswi/karyawati, 12 kamar pada 2 lantai, kamar mandi dalam, listrik prabayar per kamar. Angka 12 hanya seed; lokasi dan kamar dinamis.
- SaaS multi-owner: isolasi organisasi, izin server per peran dan lokasi, file privat dan audit sejak fondasi.
- Default pilot tanpa deposit. Deposit opsional bagi organisasi lain tetap membutuhkan ledger, approval dan refund yang benar.
- End to end: setup, publikasi, inquiry/survei, booking, pembayaran, kontrak/check-in, tagihan rutin, layanan penghuni, pindah/perpanjangan, checkout/settlement, turnover dan laporan.
- UI responsive Bahasa Indonesia memakai React, TypeScript, shadcn/ui. Baseline backend Fastify modular monolith, PostgreSQL, private object storage, worker/outbox. Pin versi aktual saat kickoff.
- Pembayaran sewa transfer/cash diverifikasi manusia; refund bank dan aktivasi SaaS manual dengan audit. In-app, email transaksional dan scheduler tagihan wajib nyata.
- Payment gateway, SaaS auto-charge, WhatsApp API resmi dan tanda tangan tersertifikasi ditunda sesuai scope.
- Harga, alamat detail, rekening, furnitur, AC dan kebijakan bisnis yang belum disepakati tidak boleh dikarang dari contoh mockup. Field wajib divalidasi sebelum publish/go-live. Seed lantai/kode kamar hanya contoh yang harus dikonfirmasi.

## Cara bekerja

1. Periksa repository, instruksi yang sudah ada, kode dan status git. Pertahankan perubahan pengguna. Jangan mengganti atau menghapus source hanya untuk menyamakan template.
2. Buat tracker implementasi berdasarkan `fixtures/BACKLOG.json` dan dependency; mulai foundation lalu alur vertikal end to end. Semua 60 story wajib v1.0 sesuai batas scope, bukan tuntutan diselesaikan sekaligus tanpa dependency.
3. Perjelas proyeksi response API, migrasi database dan keputusan teknis saat modul terkait diimplementasikan; kontrak baseline bukan server yang sudah jadi.
4. Gunakan mockup https://kost-hospitality-modules.stono.chatgpt.site/ sebagai acuan UI. Paket ini tidak berisi source frontend. Jangan menganggap localStorage, demo role selector, flag pembayaran atau notifikasi sebagai implementasi produksi.
5. Tegakkan transaksi atomik, concurrency, idempotency, snapshot kebijakan, pemisahan presence/alokasi, ledger, saldo awal dan report as-of sesuai business rules.
6. Uji dan simpan evidence per acceptance. Jangan menandai PLANNED/NOT RUN menjadi lulus tanpa bukti. 39 tes prototipe bukan acceptance produksi.
7. Catat progres dan keputusan di `project-docs/IMPLEMENTATION_STATUS.md` serta ADR baru tanpa mengubah keputusan produk diam-diam. Laporkan blocker konkret dan lanjutkan pekerjaan independen yang aman.
8. Jangan commit secret atau data pribadi asli. Pisahkan fixture sintetis dari produksi. Jalankan pemeriksaan yang sesuai perubahan.
9. Status aplikasi awal belum terverifikasi, bukan production ready. Klaim siap operasional hanya setelah acceptance dan G1–G8 runbook memiliki bukti dan persetujuan nyata. Jangan deploy produksi atau mengirim pesan eksternal hanya karena instruksi baseline ini.

Jika `AGENTS.md` telah ada, gabungkan instruksi ini tanpa menghapus instruksi atau pekerjaan pengguna. Perselisihan instruksi harus dicatat, bukan diabaikan.
