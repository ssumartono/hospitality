# Backlog implementasi — v1.0.0

60 story P0 dalam 20 epic; semuanya **PLANNED**, bukan selesai. P0 berarti wajib sebelum v1.0.0, bukan harus dikerjakan pada hari pertama. Tidak ada estimasi minggu yang mengikat tanpa tim dan kapasitas. File CSV/JSON dapat diimpor ke tracker.

## Urutan pengerjaan

1. Foundation: B01/B02, B03.1, B04, B16.1, B18.1.
2. Inventori/katalog/booking: B03 lanjutan, B05/B06/B07 dan invoice dasar B08.
3. Stay & finance: B08/B09/B10/B11/B12 dengan portal nyata.
4. Hospitality/checkout/reporting: B13/B14/B15.
5. SaaS/migration/hardening/pilot: B16 lanjutan, B17/B19/B20.

Jalankan story hanya ketika dependency selesai. Antarmuka/worker boleh dikerjakan paralel setelah kontrak data/API terkait disepakati; jangan melewati integritas transaksi untuk mempercepat demo.

## Definition of Done per story

Kode server+UI sesuai scope, migration dan permission/tenant tests, domain/integration tests yang relevan, command retry/failure tests, audit/masking, error/empty/loading/offline UX, OpenAPI sesuai implementasi, review dan evidence. Story belum DONE jika hanya mockup atau data sintetis yang bekerja. Owner/status/evidence diisi tim, tidak otomatis dari paket ini.

| ID | Deliverable | Depends on | Acceptance | Status |
|---|---|---|---|---|
| B01.1 | Model user/token dan adapter auth | — | AC-25, AC-26 | PLANNED |
| B01.2 | Session, MFA/re-auth dan revoke | B01.1 | AC-22, AC-25, AC-26 | PLANNED |
| B01.3 | Register/verify/reset/invitation email flows | B01.2 | AC-25 | PLANNED |
| B02.1 | Schema/migration tenant dan composite FK | B01.1 | AC-02, AC-28 | PLANNED |
| B02.2 | Membership, role dan location authorizer/RLS | B02.1, B01.2 | AC-02, AC-15, AC-22, AC-59 | PLANNED |
| B02.3 | Private storage/quarantine/scan/URL authorization | B02.2 | AC-02, AC-27 | PLANNED |
| B03.1 | Property/room/type/facilities schema dan CRUD | B02.2 | AC-01 | PLANNED |
| B03.2 | Generator massal, readiness, UI dan kuota hooks | B03.1, B16.1 | AC-01, AC-16 | PLANNED |
| B03.3 | Archive/blokir/occupancy conflict rules | B03.1, B07.1 | AC-10, AC-21, AC-45 | PLANNED |
| B04.1 | Policy version/effective_at dan integer money | B03.1 | AC-09, AC-11, AC-32 | PLANNED |
| B04.2 | Quote calculator + fixtures/prorata/override | B04.1 | AC-09, AC-31, AC-32 | PLANNED |
| B04.3 | Snapshot booking/lease/invoice/amendment contract | B04.2 | AC-11, AC-31 | PLANNED |
| B05.1 | Public projections/routes/media derivatives | B04.2, B02.3, B03.2 | AC-02, AC-20, AC-31 | PLANNED |
| B05.2 | Publish/unpublish server gate + UI | B05.1 | AC-20 | PLANNED |
| B05.3 | Public quote/order UX dan mobile errors | B05.2, B07.2 | AC-18, AC-31 | PLANNED |
| B06.1 | Inquiry/consent/source/rate-limit | B05.1 | AC-18, AC-28 | PLANNED |
| B06.2 | Viewing scheduling/conflicts/consent/history | B06.1 | AC-18, AC-44 | PLANNED |
| B06.3 | Idempotent inquiry-to-booking conversion | B06.2, B07.1 | AC-24 | PLANNED |
| B07.1 | Booking/allocation/presence foundations + constraints | B03.1, B02.2 | AC-03, AC-21, AC-24 | PLANNED |
| B07.2 | Accept + invoice + idempotency transaction | B07.1, B04.3, B08.1 | AC-03, AC-24, AC-29 | PLANNED |
| B07.3 | Expiry/review/cancel/payment race worker | B07.2, B08.2, B18.1 | AC-04, AC-05, AC-06, AC-30 | PLANNED |
| B08.1 | Immutable invoice/lines/adjustment/number schema | B04.3, B02.2 | AC-07, AC-11, AC-34 | PLANNED |
| B08.2 | Proof/private reference + verify/receipt/allocation | B08.1, B07.1, B02.3 | AC-05, AC-06, AC-07, AC-33 | PLANNED |
| B08.3 | Credit/multi-invoice/reversal/financial UI | B08.2 | AC-07, AC-33, AC-34, AC-38 | PLANNED |
| B09.1 | Line-level deposit ledger/opening invariants | B08.2 | AC-13, AC-35 | PLANNED |
| B09.2 | Owner approval/reservation/refund payout reference | B09.1 | AC-13, AC-35 | PLANNED |
| B09.3 | Refund correction, exception queue, reconciliation | B09.2, B08.3 | AC-13, AC-35, AC-47 | PLANNED |
| B10.1 | Lease/occupants/agreement versions/acceptance | B07.2, B02.3 | AC-36, AC-37 | PLANNED |
| B10.2 | Check-in transaction/inspection/keys/override | B10.1, B08.2 | AC-10, AC-37, AC-38, AC-58 | PLANNED |
| B10.3 | Portal identity/ownership and actual history | B10.2, B02.2 | AC-15, AC-18, AC-53 | PLANNED |
| B11.1 | Period generator + idempotent catch-up worker | B10.1, B08.1, B18.1 | AC-08, AC-09, AC-39 | PLANNED |
| B11.2 | In-app/email reminder milestones and stop conditions | B11.1, B18.2 | AC-08, AC-56 | PLANNED |
| B11.3 | Job replay/dead-letter diagnostics and billing UI | B11.2 | AC-39, AC-56 | PLANNED |
| B12.1 | Amendment approval/future pricing/conflict | B10.2, B04.3 | AC-40 | PLANNED |
| B12.2 | Scheduled target allocation incl. cross-location permission | B12.1, B07.1 | AC-12, AC-41 | PLANNED |
| B12.3 | Execute move/inspection/segments/adjustment atomic | B12.2, B08.3 | AC-12, AC-42, AC-43 | PLANNED |
| B13.1 | Ticket/private photo/state/priority + portal | B10.2, B02.3 | AC-15, AC-44 | PLANNED |
| B13.2 | Assignment/visit consent/SLA/reopen history | B13.1 | AC-44 | PLANNED |
| B13.3 | Routine/turnover inspections and ready blockers | B13.2, B14.2 | AC-45 | PLANNED |
| B14.1 | Request/approval/final estimate versioned policy | B10.2, B09.1, B12.3 | AC-14, AC-46 | PLANNED |
| B14.2 | Physical exit/presence/dirty/turnover transaction | B14.1 | AC-14, AC-45, AC-46 | PLANNED |
| B14.3 | Netting/settlement/receivable/refund final UI | B14.2, B09.3 | AC-13, AC-14, AC-47 | PLANNED |
| B15.1 | As-of occupancy/aging/cash/rent/deposit read models | B08.3, B10.2 | AC-48, AC-49 | PLANNED |
| B15.2 | Scoped private export jobs/CSV hardening | B15.1, B02.3 | AC-15, AC-49 | PLANNED |
| B15.3 | Expenses/void/reference + dashboard reconciliation | B15.1 | AC-48 | PLANNED |
| B16.1 | Plan/entitlement schema and atomic quota service | B02.2, B03.1 | AC-16, AC-50 | PLANNED |
| B16.2 | Platform admin manual activation/trial/expiry/grace | B16.1 | AC-23, AC-50 | PLANNED |
| B16.3 | Restricted obligations/export/cancellation lifecycle | B16.2, B15.2 | AC-16, AC-23, AC-50 | PLANNED |
| B17.1 | CSV mapping/staging/dry-run checksum/errors | B03.2, B10.1 | AC-51, AC-52 | PLANNED |
| B17.2 | Atomic commit/external keys/opening entries | B17.1, B09.1, B08.1 | AC-17, AC-51, AC-53 | PLANNED |
| B17.3 | Cutover/billing resume/reconciliation approval | B17.2, B11.1 | AC-17, AC-52, AC-53 | PLANNED |
| B18.1 | Transactional outbox/jobs/idempotency framework | B02.1 | AC-24, AC-28, AC-54 | PLANNED |
| B18.2 | Email adapter, in-app, retry/delivery logs | B18.1, B01.3 | AC-08, AC-56 | PLANNED |
| B18.3 | Durable audit, masking, metrics/alerts | B18.1 | AC-28, AC-54 | PLANNED |
| B19.1 | Responsive/a11y/offline/error-state completion | B05.3, B10.3 | AC-18 | PLANNED |
| B19.2 | Security + concurrent/load regression suite | B07.3, B09.3, B16.3 | AC-02, AC-03, AC-35, AC-55 | PLANNED |
| B19.3 | Infra/restore/retention/incident drill | B02.3, B18.3 | AC-19, AC-54, AC-57 | PLANNED |
| B20.1 | UAT fixtures/operator guides + cutover rehearsal | B14.3, B15.3, B17.3, B19.1 | AC-59, AC-60 | PLANNED |
| B20.2 | Resolve defects and collect gate evidence | B20.1, B19.2, B19.3 | AC-19, AC-55, AC-59, AC-60 | PLANNED |
| B20.3 | Release notes/version/tag/approval and pilot launch | B20.2 | AC-60 | PLANNED |

## Pelacakan risiko dan perubahan

Setiap PR menyebut story, BR dan AC; jelaskan migration/rollback dan dampak ke ledger/alokasi. Perubahan scope perlu ADR/keputusan Product Owner, bukan menghapus tes yang gagal. Jangan memakai PASS dari unit test prototipe sebagai evidence story produksi. Release blocker: tenant leak, double booking, uang/ledger salah, file privat bocor, rollback yang membuang transaksi atau gagal restore.
