# Gap mockup → aplikasi v1.0.0

Referensi UI: https://kost-hospitality-modules.stono.chatgpt.site/
Snapshot source reference: commit `1e2c62194928684ffc2e9987674f3f098c7c9dbc`.

14 modul tersedia sebagai prototipe React/shadcn/ui. Source dan README prototipe adalah bukti perilaku demo, bukan implementasi produksi. Pemeriksaan sebelumnya: 39 domain test prototipe dan browser/mobile; tidak membuktikan transaksi database, isolasi tenant, secure file, integrasi provider atau backup. Tidak ada hasil QA produksi dalam paket ini.

| Modul | Yang dapat dipakai dari mockup | Gap wajib ditutup v1.0 | Backlog |
|---|---|---|---|
| 01 | Wizard/field/urutan UX | Auth nyata, email token, session, membership, RBAC/MFA | B01, B02 |
| 02 | Layout room, generator, readiness | Persistensi server, kuota atomik, archive/blocks terhubung occupancy | B03 |
| 03 | Preview/calculation fixtures | Decimal-free money server, policy effective_at, version/snapshot tests | B04 |
| 04 | Editor/katalog responsive | Public slug/routes server, media variants, private/public boundary, unpublish real | B05 |
| 05 | CRM/survey forms | Contact protection, schedule conflict server, consent/rate limit, conversion command | B06 |
| 06 | State/hold UX | DB overlap constraint, locking/idempotency, server expiry/race, real exception queue | B07 |
| 07 | Invoice/payment/receipt UI | Object proofs, verification bank reference, ledger line allocations/multi-invoice, deposit/refund/reversal transaction | B08, B09 |
| 08 | Agreement/checklist UI | Identity/profile private, account acceptance, real room presence, upload/inspection snapshots | B10 |
| 09 | Manual recurring simulation, same-location move, portal selector | Worker/catch-up/reminders, login portal scoped, scheduled/cross-location move, adjustment cost | B11, B12 |
| 10 | Ticket states and cleaning checklist | File private, role/assignment, visits/consent, SLA and blocking work orders | B13 |
| 11 | Physical vs finance split, dirty/turnover | Full final estimation/prorata/cancel rules, deposit ledger/netting/refund approval/reference, payout correction | B14 |
| 12 | Current snapshot and simple cash bars | Server as-of reports/historical occupancy, aging/deposit liability, authorization exports/jobs | B15 |
| 13 | Illustrative plan/limit selection | Server entitlements at write/bulk/import, manual platform administration, expiry/restricted/export lifecycle | B16 |
| 14 | CSV dry-run/validation/idempotency ideas | Full opening receivable+credit+deposit, staging rows/checksum/cutover, actual reconciliation, file-private import | B17 |
| Lintas modul | Bahasa/palette/komponen | Error/loading/offline/keyboard/contrast, field masking, durable audit/outbox, monitoring/restore/UAT | B18, B19, B20 |

## Aturan reuse source

- Reuse komponen presentasi dan fixture berlabel, bukan localStorage sebagai database produksi.
- Semua mutasi uang, availability, role/tenant dan status dinilai ulang server. Jangan hanya memindahkan state object JSON prototipe ke satu kolom database.
- Selector “Skenario contoh/Data setup saya” dan “Portal demo” tidak tampil sebagai pemisah keamanan produksi. Demo memakai environment/tenant data sintetis terpisah; portal nyata memakai principal sendiri.
- Jangan menyalin nomor telepon 000..., harga contoh, identity reference demo, acceptedAt palsu atau paid flag menjadi data produksi.
- Status sukses hanya setelah commit server; delivered hanya dari provider/in-app persistence yang benar. Worker berjalan tanpa tab browser terbuka.
- Label harga paket mockup belum merupakan harga komersial. BMC lama tidak diubah karena tidak ada keputusan model pendapatan baru dalam tugas ini.
- Keterbatasan mockup yang didokumentasikan bukan alasan untuk meniadakan fitur yang wajib di scope v1.0.
