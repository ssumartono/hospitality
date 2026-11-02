# Acceptance criteria dan UAT — v1.0.0

Semua skenario berikut **NOT RUN pada aplikasi produksi**. “39 tes lulus” hanya evidence prototipe yang dicatat pada gap register. Test case ini harus diotomasi atau dieksekusi pada staging dengan backend/database/worker, bukan menekan tombol demo.

## Data fixture (sintetis, bukan tarif usaha)

| Fixture | Input dan expected |
|---|---|
| F01 Pilot tanpa deposit | Rent 1.500.000; deposit 0; admin 0; minimum booking 500.000; minimum check-in 100%; awal 1.500.000 dan sisa setelah minimum 1.000.000 |
| F02 Organisasi deposit opsional | Rent 1.500.000 + deposit 1.000.000 + admin 100.000 = 2.600.000; pembayaran booking 500.000 meninggalkan 2.100.000 |
| F03 Parsial/lebih | Invoice 1.500.000; verified 1.000.000 → saldo 500.000; verified 700.000 → allocate 500.000 + kredit 200.000 |
| F04 Prorata | 16–31 Jan 2027, akhir eksklusif 1 Feb: 16/31 × 1.500.000 = 774.194 |
| F05 Anniversary | 31 Jan 2027 → 28 Feb 2027 → 31 Mar 2027; leap year diuji terpisah |
| F06 Deposit/refund | Saldo deposit 1.000.000; potongan approved 200.000 + damage 150.000 → refund 650.000; bukan pendapatan ganda |
| F07 Kekurangan deposit | Deposit 1.000.000, approved charge 1.200.000 → deposit terpakai 1.000.000 dan piutang 200.000 |
| F08 Zona | UTC 1 Nov 2026 16:30 = WIB 23:30 tanggal 1 dan WITA 00:30 tanggal 2; overdue/reminder ikut lokasi |
| F09 Cutover | Lease start 1 Okt 2026, billing_resume 1 Nov 2026; opening receivable 250.000, credit 200.000, deposit 0; cash opening 0; tidak menagih ulang Oktober |
| F10 Pindah calendar actual | Rate lama 1.500.000, baru 1.800.000; pindah 16 Jan 2027. Lama 15/31=725.806; baru 16/31=929.032; invoice lama 1.500.000 diberi credit 774.194 dan debit 929.032, net +154.838 |

Tambahkan tenant A/B, Owner/Manager/Finance/Ops/resident dan lokasi Jakarta/Palembang serta Bali sebagai fixture otorisasi/zona. Semua nomor kontak adalah dummy; email pengujian ke sink. Clock harus injectable agar tes deadline dan akhir bulan deterministik.

## Matriks wajib

| ID | Modul | Skenario / tindakan | Hasil wajib | Jenis / epic |
|---|---|---|---|---|
| AC-01 | 02 · BR-02 | Generate 12 kamar, tambahkan kamar 13 dan lokasi kedua | Semua tersimpan dan dapat dimuat ulang; tanpa perubahan kode | E2E · B03 |
| AC-02 | 01 · BR-01 | User tenant B menebak ID room/invoice/file tenant A | 404/deny tanpa metadata; scoped query, cache dan file tidak bocor | Security · B02 |
| AC-03 | 06 · BR-03A | Dua accept bersamaan pada kamar dan interval sama | Satu allocation aktif dan satu sukses; lainnya 409; tidak ada invoice yatim | Concurrency · B07 |
| AC-04 | 06 · BR-03B | Expiry retry bersamaan dengan payment confirmation | Confirmed tidak expired; invariant final satu state valid | Concurrency · B07 |
| AC-05 | 07 · BR-03B | Upload sebelum deadline lalu upload/reject ulang | Review bertambah sekali; pending proof tidak menghasilkan receipt/lunas | Integration · B08 |
| AC-06 | 07 · BR-03B | Dana terlambat setelah kamar diberikan orang lain | Exception/kredit; tidak merebut alokasi atau membuat booking confirmed kedua | Concurrency · B08 |
| AC-07 | 07 · BR-05 | Bayar parsial/penuh/lebih/reversal memakai F03 | Saldo 500.000 lalu 0 dan kredit 200.000; reversal mempertahankan histori | Domain+Integration · B08 |
| AC-08 | 09 · BR-08 | Worker dijalankan tiga kali dan outbox retry | Satu invoice per periode; satu reminder milestone/channel/recipient | Integration · B11 |
| AC-09 | 03 · BR-04 | Anchor dan prorata memakai F04/F05 | 16/31 rent=774.194; anchor 31 kembali setelah Februari | Domain · B04 |
| AC-10 | 08 · BR-07 | Check-in maintenance/incomplete checklist dengan payment override | Ditolak; hanya kekurangan pembayaran boleh di-override Owner beralasan | E2E · B10 |
| AC-11 | 03 · BR-04 | Edit policy master sesudah invoice/kontrak terbit | Snapshot lama identik; rate efektif mendatang dipakai transaksi baru | Integration · B04 |
| AC-12 | 09 · BR-09 | Pindah terjadwal bersamaan dengan booking target | Satu alokasi target; histori segmen utuh; kamar lama dirty | Concurrency · B12 |
| AC-13 | 11 · BR-06 | Deposit F06/F07, approve potongan/refund | Refund 650.000 atau piutang 200.000; approval/bukti dan ledger rekonsiliasi | Domain+Integration · B09 |
| AC-14 | 11 · BR-11 | Keluar fisik dengan tunggakan | Presence keluar; dirty/turnover terbentuk; piutang tetap; future billing berhenti | E2E · B14 |
| AC-15 | 09 · BR-01 | Penghuni/staf akses objek orang/lokasi lain | Deny seluruh read/write/download/export yang tidak diizinkan | Security · B02 |
| AC-16 | 13 · BR-13 | Kuota tercapai lalu create/bulk/import paralel | Tidak melebihi kuota; existing data dan kewajiban lama tetap utuh | Concurrency · B16 |
| AC-17 | 14 · BR-14 | Import F09 diulang dengan key/checksum sama | Satu batch; opening receivable/credit/deposit benar; kas hari ini tidak bertambah | Integration · B17 |
| AC-18 | 01–14 · BR-01 | E2E di lebar 360 px, upload/error/focus keyboard | Tidak overflow halaman; kontrol penting dapat dipakai; aksesibilitas target teruji | UI/E2E · B19 |
| AC-19 | Lintas · BR-01 | Restore DB + file manifest ke environment terpisah | Relasi, balances dan akses privat cocok; RPO≤24j/RTO≤8j dibuktikan | Ops · B19 |
| AC-20 | 04 · BR-02 | Unpublish saat penghuni aktif masih tinggal | Booking publik baru ditolak; portal/kontrak/tagihan lama tetap tersedia | E2E · B05 |
| AC-21 | 06 · BR-03C | Booking masa depan terhadap ongoing tanpa approved end | Ditolak overlap infinity; billing end tidak dianggap vacancy | Integration · B07 |
| AC-22 | 01 · BR-01 | Cabut membership saat session/export aktif | Request berikut ditolak; tidak mint file URL baru; URL lama expire sesuai TTL | Security · B02 |
| AC-23 | 13 · BR-13 | Subscription restricted menjalankan perintah baru/lama | Publish/new booking ditolak; export/pelunasan/refund/checkout lama diizinkan | Integration · B16 |
| AC-24 | 06–07 · BR-03A | Fault injection setelah allocation/ledger insert sebelum commit | Rollback utuh; tidak ada partial allocation/receipt/outbox sukses | Integration · B07 |
| AC-25 | 01 · BR-01 | Email belum terverifikasi dan token reset/verify dipakai ulang | Publish/invite deny; token expiry dan single-use; reset tidak login user lain | Security · B01 |
| AC-26 | 01 · BR-01 | Hapus Owner terakhir, ubah rekening tanpa re-auth/MFA policy | Ditolak; Owner terakhir tetap; actor/reason keamanan tercatat | Security · B01 |
| AC-27 | 07/10 · BR-01 | Upload executable/disguised MIME/oversize dan scan gagal | Quarantine/deny; tidak dapat download/public; hanya metadata aman pada log | Security · B02 |
| AC-28 | Lintas · BR-01 | Worker/import/export/cache membawa tenant context salah | Cross-tenant command gagal; tidak ada email/data tenant lain | Security · B18 |
| AC-29 | 06 · BR-04 | Minimum booking nol | Accept menghasilkan allocation dan invoice sekali; confirmed tanpa payment palsu | Integration · B07 |
| AC-30 | 06 · BR-03B | Submit proof tepat deadline dan cancel vs verify | Server clock menentukan; hasil serialize; receipt/credit tidak ganda | Concurrency · B07 |
| AC-31 | 04 · BR-04 | Quote future entry berubah policy sebelum consent ulang | Harga/detail baru ditampilkan; snapshot accepted lama tetap utuh | E2E · B05 |
| AC-32 | 03 · BR-04 | Calendar lintas bulan + monthly fee + once/deposit | Rent per bulan dibulatkan per baris; fee bulanan tidak diprorata; deposit sekali | Domain · B04 |
| AC-33 | 07 · BR-05 | Satu penerimaan dialokasikan ke 2 invoice dan 2 Finance paralel | Total allocation ≤receipt dan saldo; satu reference tidak dicatat dua kali | Concurrency · B08 |
| AC-34 | 07 · BR-05 | Void invoice paid/pending proof, adjust lalu reverse | Void tidak sah ditolak; correction/reference utuh; tidak hard-delete transaksi | Integration · B08 |
| AC-35 | 11 · BR-06 | Dua refund approve/pay bersamaan atas saldo sama | Reserved+paid tidak melebihi refundable; idempotent payout reference | Concurrency · B09 |
| AC-36 | 08 · BR-07 | Revisi agreement sesudah versi diterima | Versi lama tersimpan; acceptance lama tidak memenuhi check-in versi baru | Integration · B10 |
| AC-37 | 08 · BR-07 | Check-in retry, future actual date, capacity over, presence lain | Satu lease/presence; invalid date/capacity/occupancy ditolak | Concurrency · B10 |
| AC-38 | 07–08 · BR-05 | Reverse pembayaran setelah check-in | Presence/alokasi tidak dilepas; finance exception/piutang tampil; tidak auto-evict | Integration · B08 |
| AC-39 | 09 · BR-08 | Worker tertinggal 3 periode dan restart | Catch-up invoice tepat sekali; reminders lama sesuai policy tanpa spam ganda | Ops+Integration · B11 |
| AC-40 | 09 · BR-09 | Perpanjang bertabrakan blokir/booking dan rate baru | Konflik ditolak; amendment disetujui saja; invoice lama immutable | Integration · B12 |
| AC-41 | 09 · BR-09 | Pindah lintas lokasi sama org, tanpa akses target/ke org lain | Hanya user berizin kedua lokasi yang dapat execute; antar org ditolak | Security · B12 |
| AC-42 | 09 · BR-09 | Execute move sebelum ready atau gagal di tengah transaksi | Presence tetap source; reserve target valid; tidak ada half-move | Concurrency · B12 |
| AC-43 | 09 · BR-09 | Adjustment pindah kalender F10 | Kredit 774.194 + debit 929.032; net +154.838 tanpa edit invoice lama | Domain+Integration · B12 |
| AC-44 | 10 · BR-10 | Resolve tanpa hasil, reopen tanpa reason, visit tanpa consent | Semua transisi tidak sah ditolak; histori event lengkap | Integration · B13 |
| AC-45 | 10 · BR-10 | Selesaikan turnover saat ada blocking ticket/presence | Tidak ready; setelah blocker selesai dan inspection lulus baru ready | Integration · B13 |
| AC-46 | 11 · BR-11 | Approve tanggal keluar pendek notice, ubah tanggal, actual exit berbeda | Alasan/approval wajib; estimasi versi baru; billing/allocation diperiksa ulang | Integration · B14 |
| AC-47 | 11 · BR-11 | Close financial settlement saat outstanding/refund nonnol | Tidak berstatus settled; physical_out boleh tetap; saldo terlihat untuk follow-up | Integration · B14 |
| AC-48 | 12 · BR-12 | Bandingkan cash, billed rent, deposit, expense, refund F01/F06 | Masing-masing terpisah; filter/as-of valid dan total cocok ledger | Integration · B15 |
| AC-49 | 12 · BR-12 | Historical occupancy sesudah move/checkout, CSV formula injection | Hitung segmen/presence tanggal as-of; export private dan formula dinetralkan | Security+Integration · B15 |
| AC-50 | 13 · BR-13 | Downgrade saat usage melebihi target | Ditolak/dijadwalkan tanpa hapus room/history; status akhir audit jelas | Integration · B16 |
| AC-51 | 14 · BR-14 | CSV quoted name, duplicate room, invalid dates, overlap/quota | Per-row errors; tidak ada sebagian record live jika satu baris invalid | Integration · B17 |
| AC-52 | 14 · BR-14 | Ubah file/mapping/cutover sesudah approval dry-run | Checksum mismatch menolak commit; approval baru diperlukan | Integration · B17 |
| AC-53 | 14 · BR-14 | Migrasi occupancy dengan inventory inspection dan dokumen tidak ada | Import warning ditandai; blok booking baru; tidak membuat acceptance/receipt palsu | Integration · B17 |
| AC-54 | Lintas · BR-01 | Inspect structured logs, audit, monitoring export | Tidak ada password/token/NIK/file body; actor/tenant/correlation tetap ada | Security · B18 |
| AC-55 | Lintas · BR-01 | API load baseline dan publik mobile | p95 read≤800ms/write≤1500ms; LCP≤2,5s pada profil terdokumentasi | Performance · B19 |
| AC-56 | 09 · BR-08 | Email gagal/retry dan invoice paid sebelum reminder berikut | Status failed/pending benar; retry-safe; reminder lunas berhenti | Integration · B18 |
| AC-57 | Lintas · BR-01 | Retensi policy kosong, legal hold aktif, purge job | Go-live gate menolak kosong; hold mempertahankan data; purge audited sesuai policy | Security+Ops · B19 |
| AC-58 | 06/08 · BR-03C | Overstay menghadapi confirmed booking kedatangan berikut | Check-in baru diblokir presence; exception untuk Owner; tidak auto-evict | E2E · B10 |
| AC-59 | 01–14 · BR-01 | E2E tenant kedua dengan kamar bernama sama | Seluruh alur independen; data/uang/file/kuota tidak tercampur | E2E · B20 |
| AC-60 | 01–14 · BR-01 | UAT pilot dengan data dikonfigurasi dan nonproduksi terpisah | Owner/staf menyetujui hasil, cutover reconcile, seluruh G1–G8 dengan evidence | UAT · B20 |

## Prosedur dan bukti

Untuk setiap case: catat build/commit, environment, role/tenant, input, langkah, expected/actual, hasil PASS/FAIL/BLOCKED dan evidence aman (test report, request ID, DB invariant query atau screenshot tanpa identitas/bank sensitif). Semua kasus concurrency memakai setidaknya dua koneksi/transaksi terpisah dan fault injection; urutan klik satu browser tidak cukup.

UAT utama: Owner setup 12 kamar → lengkapi kesiapan/policy → publish → calon penghuni submit → accept/hold → proof/verify → perjanjian/check-in → worker invoice berikut → service ticket → perpanjang/pindah → checkout/refund/settlement → turnover ready. Ulangi jalur tanpa deposit pada pilot dan jalur deposit aktif pada tenant B. Jalankan kasus gagal/offline/retry, bukan hanya happy path. Tidak menyimpan password asli atau dokumen sensitif di evidence.

Kriteria selesai: semua AC wajib lulus pada build kandidat, defect critical/high nol pada tenant/availability/ledger/restore, rekonsiliasi cutover cocok dan release gates disetujui. Tidak mengubah status CSV menjadi PASS tanpa bukti. Form sign-off ada di runbook.
