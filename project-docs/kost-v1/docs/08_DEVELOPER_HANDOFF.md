# Handoff developer — Kost Hospitality v1.0.0

## Sasaran pekerjaan

Bangun aplikasi operasional v1.0.0 menurut PRD dan scope paket ini, memakai 14 mockup sebagai referensi UI. Jangan memperlakukan browser-local state, simulated acceptance, paid flag, harga contoh atau 39 tes prototipe sebagai backend yang selesai. Tidak ada implementasi backend, environment produksi atau tanda tangan persetujuan rilis yang dibuat dalam tugas pembaruan dokumen ini.

## Baca dan mulai

1. `README.md` → `PRD.md` → scope/rules → architecture/security → acceptance → backlog → gap register → runbook.
2. Catat ADR baseline dan dependency runtime yang dipin. Siapkan repo aplikasi, environment dev/test/staging terpisah, PostgreSQL dan private object/email test adapters. User memberi akses repo/secrets melalui kanal aman, bukan menaruh dalam dokumen/chat/log.
3. Implementasikan schema/migrations/RLS/permission dan framework transaction/idempotency/outbox sebelum mutasi uang atau booking. Public customer authorization berasal dari account yang terhubung ke booking/lease; bukan membership staf. Jangan meminta calon penghuni bergabung menjadi staf agar bisa memesan.
4. Implementasikan story menurut dependency, dengan test server dan acceptance terkait. Susun UI responsive dari komponen shadcn/ui dengan loading/error/empty/offline/retry, bukan memanggil fungsi simulasi langsung.
5. Kunci availability dan ledger di database, bukan tombol disabled. Jagalah lease/presence/room-condition/financial settlement sebagai state terpisah.
6. Isi status/evidence backlog ketika benar-benar terbukti. Bangun pilot dengan 12 kamar inspection dan tenant kedua untuk negative tests. Tidak otomatis mempublikasikan kamar bangunan baru yang belum siap.
7. Perbarui OpenAPI dan data dictionary saat implementasi berkembang; endpoint dan permission tidak boleh menyimpang dari BR tanpa ADR/keputusan Product Owner.
8. Jalankan gates G1–G8 sebelum label v1.0.0 siap pakai diberikan. Bukti konfigurasi Owner dan UAT tidak diisi dengan data dummy.

## Kontrak API baseline

`api/openapi-v1.yaml` adalah kontrak implementasi, bukan server berjalan. Memuat auth/CSRF/MFA, tenant, inventory/pricing/catalog, public customer order, bookings/payment, leases, moves, hospitality, checkout/refund, reports/export, uploads, SaaS manual, import dan jobs/audit. Schemas request dan entity inti didefinisikan; resource projection umum perlu dipertegas saat migration/schema tiap domain dikerjakan (B02/B03 dst.), sebelum frontend entity tersebut diintegrasikan. Tidak mengganti rule dengan generic JSON passthrough. List selalu paginated/scoped; tidak mengekspor seluruh data tenant di response Resource.attributes.

Error code minimum: VALIDATION_ERROR, AUTH_REQUIRED, EMAIL_NOT_VERIFIED, FORBIDDEN, NOT_FOUND, AVAILABILITY_CONFLICT, INVALID_STATE, BALANCE_CONFLICT, QUOTA_EXCEEDED, VERSION_CONFLICT, IDEMPOTENCY_MISMATCH, FILE_QUARANTINED, RATE_LIMITED. Response error mempunyai requestId dan metadata aman. Public quote/inquiry rate-limited; “public” namespace booking/status tetap membutuhkan session customer yang benar.

Command money/booking/lease memakai Idempotency-Key. Client memilih UUID/key acak unik per intent, mempertahankan key untuk retry payload sama, dan memakai key baru bila intent/payload berubah. Server menolak key reuse payload berbeda. Request property/room/customer/account IDs tetap diuji organization dan ownership; ID valid tidak memberi izin.

## Definisi konfigurasi yang belum merupakan blocker coding

`fixtures/PILOT_CONFIG.json` sengaja berisi null untuk harga, bank, fasilitas final, minimum dan policy yang belum dipilih pemilik. Developer membangun validation/setup agar listing/live operation menolak konfigurasi wajib kosong. Jangan mengganti null dengan harga/fasilitas contoh untuk meloloskan UAT. `PILOT_ROOMS.csv` menghasilkan 12 kamar inspection; itu bukan data occupancy atau bukti kamar layak huni.

Template migrasi produksi lebih lengkap dari CSV mockup: menambah external ID, cutover/billing resume, opening credit/deposit dan property scope. Wajib dry-run dan mapping; jangan mengasumsikan format 7 kolom prototipe adalah format produksi final. Contoh TEST_ONLY dilarang diimpor otomatis ke tenant produksi.

## Contoh instruksi untuk coding agent / tim

> Implementasikan Kost Hospitality v1.0.0 menurut paket dokumen ini. Mulai B01/B02 dan fondasi schema/authorization/idempotency, lalu ikuti backlog dependency. UI mengikuti mockup 14 modul dan shadcn/ui. Gunakan transaksi/constraint database untuk availability dan ledger, storage privat, worker/outbox, email adapter dan portal principal nyata. Selesaikan acceptance secara bertahap dan catat evidence. Jangan menandai fitur selesai karena data demo atau simulasi browser bekerja. Jangan mengarang rekening, harga, dokumen identitas, email terkirim, transfer bank, approval UAT atau status produksi. Jika ada konflik requirement, catat dan minta resolusi pada command terkait; keputusan rutin mengikuti ADR baseline. Produksi baru siap setelah release gates teruji dan approval rilis direkam.

## Output engineering yang harus diserahkan

Kode dan lockfile, migrations/constraints/RLS, OpenAPI aktual, test unit/integration/concurrency/E2E/security/performance, seed nonproduksi terpisah, artifact pipeline, environment/secrets inventory tanpa nilai rahasia, runbook/restore evidence, privacy/retention configuration, user guides Owner/Finance/Ops/Resident, migration reconciliation, release notes dan daftar defect. Rilis dibangun dari commit/tag yang dilacak; bukan memodifikasi data production untuk membuat demo sukses.
