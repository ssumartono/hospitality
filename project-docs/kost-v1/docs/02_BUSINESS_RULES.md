# Aturan bisnis dan transaksi — v1.0.0

Semua tanggal bisnis memakai zona waktu lokasi. Event disimpan UTC dan ditampilkan dengan zona lokasi; date-only tidak digeser oleh zona browser. Interval [masuk, keluar), akhir kosong berarti infinity. Nilai uang IDR integer, tanpa floating point. Rule ID adalah acuan acceptance/backlog.

## BR-01 — organisasi dan otorisasi

Organisasi adalah tenant SaaS; penghuni adalah orang. Context organisasi berasal dari session/membership server, tidak dari organization_id dalam body. Setiap command, query, job, file, cache dan ekspor memverifikasi organisasi dan cakupan lokasi. ID organisasi lain menghasilkan 404 tanpa metadata privat. Endpoint admin platform tidak memberi akses otomatis ke kas/identitas tenant. Akun penghuni tidak memiliki selector untuk melihat data orang lain.

## BR-02 — kondisi fisik berbeda dari alokasi

Room.condition = inspection/ready/dirty/maintenance/inactive; allocation = hold/stay/block dengan interval dan status active/released. “Ready” tidak berarti available bila ada alokasi bertabrakan. Acceptance booking mensyaratkan kamar aktif, ready dan interval bebas. Permohonan pending/inquiry tidak memblokir. Kamar arsip mempertahankan kode unik/histori. Arsip yang menyembunyikan occupancy/komitmen aktif ditolak sampai kewajiban dipindahkan/diselesaikan.

## BR-03 — state booking

| State | Command berikut yang sah | Efek alokasi |
|---|---|---|
| draft | submit, cancel | Tidak ada |
| pending | accept, reject, cancel | Accept membuat hold atomik |
| held | submit-proof, verify-payment, cancel, expire | Tetap mengunci selama deadline |
| review | verify/reject-proof, cancel, expire | Satu review window saja |
| confirmed | prepare-lease, check-in, cancel-before-checkin | Stay/reservation aktif |
| expired/rejected/cancelled | resolve-credit/refund atau permohonan baru | Alokasi lama released; tidak dihidupkan otomatis |
| checked_in | proses kontrak/checkout, bukan cancel-booking | Tetap mengunci kamar |
| checked_out | pelunasan/refund/settlement | Alokasi fisik released; kondisi dirty |

Booking confirmed dan kontrak checked_in dapat dimodelkan sebagai dua entity state terpisah; invariant di atas tetap berlaku. Owner tidak dapat mengabaikan konflik kamar.

### BR-03A — command accept yang atomik

Dalam satu transaksi: validasi membership/entitlement → kunci row room dan booking → baca ulang status/kebijakan snapshot → cek ready/kapasitas/interval → buat allocation active → deadline berdasarkan server clock → terbitkan invoice awal persis sekali → update status → audit + outbox → commit. Constraint overlap adalah pertahanan terakhir. Dua persetujuan paralel: satu sukses, satu 409 AVAILABILITY_CONFLICT. Rollback menghapus seluruh efek command gagal. Idempotency key sama dan payload sama mengembalikan hasil sama; payload berbeda menghasilkan 409 IDEMPOTENCY_MISMATCH.

### BR-03B — tenggat dan balapan worker

Default hold 24 jam dan review tambahan 24 jam, configurable 1–168 jam. Deadline review = deadline hold + reviewHours, diberikan sekali saat bukti pertama berhasil diterima sebelum deadline. Membuka form tidak dihitung upload. Bukti ditolak tidak menambah deadline. Pada now >= deadline hold sudah tidak sah. Expiry dan verifikasi mengunci booking/alokasi yang sama; sesudah commit confirmed worker tidak boleh mengekspirasikan. Bukti diterima tepat pada deadline dianggap terlambat. Penerimaan terlambat menjadi exception/kredit, tidak mengaktifkan booking atau merebut kamar.

### BR-03C — tanggal keluar dan overstay

Kontrak ongoing mengunci infinity. Check-in dengan akhir rencana tetap tidak boleh dianggap membuat kamar kosong otomatis. Baseline konservatif: occupancy aktif mengunci sampai tanggal keluar disetujui pengelola; approval checkout boleh membatasi akhir alokasi rencana dalam transaksi setelah cek konflik. Presence/occupancy aktual punya constraint satu kontrak aktif per kamar, terpisah dari reservasi masa depan. Tanggal kontrak rencana atau deadline invoice tidak mengakhiri presence. Overstay memblokir check-in berikutnya dan memicu exception bagi pengelola; jangan mengeluarkan penghuni atau memindahkan booking otomatis. Perubahan tanggal yang bertabrakan wajib resolusi manusia, bukan override constraint.

## BR-04 — harga dan biaya

RatePolicyVersion memuat effective_at, version, actor; UI boleh menerima tanggal dan zona lokasi lalu mengonversi ke timestamp. Resolusi tarif: override kamar → tipe → lokasi. Quote publik memilih versi yang berlaku pada tanggal masuk, menampilkan masa berlaku quote dan semua komponen. Quote belum diterima dapat kedaluwarsa; perubahan harga memerlukan persetujuan ulang, tidak tersembunyi. Booking diterima menyimpan snapshot tetap. Kontrak, amendment dan invoice mereferensikan versi masing-masing.

Default pilot: deposit off; listrik token per kamar dibayar langsung oleh penghuni dan tidak masuk invoice listrik otomatis. Sewa, admin/parkir, minimum booking, minimum check-in, notice dan refund adalah konfigurasi pemilik. Nominal Rp1.500.000/Rp500.000 pada mockup adalah fixture, bukan keputusan usaha. Minimum booking adalah bagian total awal; nol diperbolehkan dan accept dapat langsung confirmed tanpa penerimaan palsu.

Anniversary memakai anchor hari awal (31 Jan → 28 Feb 2027 → 31 Mar). Calendar prorata hanya komponen sewa: rate × hari terpakai / hari aktual bulan; pembulatan half-up per baris rupiah. Biaya tambahan bulanan tidak diprorata pada baseline. Akhir sewa dini mengikuti mode prorata/no-prorata yang disepakati pada snapshot; tidak otomatis memberi diskon di luar kebijakan. Denda default off; jika on: sekali/invoice setelah grace, cap berlaku; overdue tidak disembunyikan oleh grace. Diskon nominal per baris tidak boleh membuat nilai negatif.

## BR-05 — ledger invoice, penerimaan, kredit

Invoice = issued/void; derived payment status unpaid/partial/paid/overdue. Saldo = total baris + debit − credit adjustment − payment allocation valid. Baris terbit immutable; koreksi melalui dokumen penyesuaian beralasan. Void hanya bila belum ada penerimaan teralokasi atau review pending; invoice void tidak dibuat ulang diam-diam.

PaymentProof = quarantined/pending/accepted/rejected; file bukan uang. Payment = pending/verified/rejected/reversed. Finance mencatat tanggal dana benar-benar diterima, amount, account tujuan, bank reference, actor; cocokkan dengan mutasi rekening di luar aplikasi. Verifikasi atomik menciptakan penerimaan/receipt, alokasi, kredit, booking effect, audit/outbox. Cash juga membutuhkan izin dan nomor penerimaan; tidak melewati verifikasi server. Satu transaksi bank tidak boleh didaftarkan ulang; unique organization + rekening + normalized reference, dengan alur koreksi/retry beralasan.

Allocation boleh ke beberapa invoice milik resident/customer yang sama dalam organisasi; bukan lintas organisasi. Kunci payment dan invoice dalam urutan ID konsisten. Jumlah alokasi ≤ dana verified belum terpakai dan ≤ saldo setiap invoice. Kelebihan menjadi kredit; transfer ke penghuni lain bukan fitur v1.0. Refund kredit mengurangi saldo tersedia dan tidak mengurangi pembayaran invoice yang tidak direversal. Pembayaran invoice periode kedua tidak menggantikan minimum awal check-in.

Reversal mempertahankan receipt/status batal dan audit; tidak mengirim refund bank. Bila belum check-in dan minimum booking jadi tidak terpenuhi: kembali held jika deadline masih sah, selain itu expired dan allocation released. Bila sudah check-in: occupancy tetap, catat piutang/finance exception, jangan mengeluarkan penghuni. Dana sudah direfund tidak boleh direversal tanpa koreksi refund berizin yang ditelusuri.

## BR-06 — deposit dan refund

Deposit opsional tetap tersedia bagi pemilik lain; pilot default nol. DepositLedger append-only: receive, deduct-approved, refund-approved/paid, reversal. Saldo jaminan bukan pendapatan atau kredit bebas pakai. Deposit tersedia berasal dari baris/alokasi deposit yang benar-benar verified, bukan anggapan invoice seluruhnya lunas. Prioritas alokasi per baris harus eksplisit pada payment allocation; jangan menggunakan “sewa dibayar dulu” secara implisit.

Usulan potongan memuat alasan, referensi invoice/kerusakan, nominal dan bukti; Owner menyetujui seluruh refund/potongan secara default. Hindari pengurangan deposit dan penambahan tagihan yang menagih kerusakan sama dua kali. Settlement menampilkan gross charge, pembayaran, penggunaan deposit/kredit dan net payable/refundable. Netting hanya melalui alokasi yang disetujui, bukan perubahan saldo tersembunyi.

Refund = proposed → approved → paid/rejected/cancelled; paid hanya sesudah transfer bank dilakukan pemilik dan reference/bukti tercatat. Kunci saldo saat approval/payout agar refund ganda gagal. Jumlah paid+reserved tidak melebihi kredit/deposit refundable. Harga pembatalan/no-show mengikuti snapshot dan rincian per komponen. Perselisihan tidak otomatis diputuskan aplikasi. Koreksi paid refund harus melalui reversal beralasan Owner; kas/refundable saldo dan audit ikut diperbarui secara atomik.

## BR-07 — kontrak dan check-in

Draft → issued(version) → accepted(version/account/timestamp) → active. Revisi sebelum check-in menyimpan versi lama dan membatalkan penerimaan versi terakhir. Teks perjanjian final disiapkan pemilik; aplikasi tidak mengklaim tanda tangan tersertifikasi. Identitas dikumpulkan minimum; referensi pemeriksaan dapat cukup bila dokumen tidak diwajibkan kebijakan. File identitas privat, bukan syarat unggah universal.

Check-in atomik: booking confirmed, room/location aktif, tidak ada presence lain, capacity valid, minimum awal verified, versi aturan/perjanjian diterima akun benar, readiness+inspection, inventory condition, key handover, tanggal aktual valid dan petugas. Actual date tidak mengubah lease start atau invoice. Owner berizin dapat mengecualikan minimum pembayaran dengan alasan dan audit; tidak dapat mengecualikan identitas minimum, readiness atau konflik. Tidak boleh merekam check-in mendatang sebagai actual. Retry tidak membuat lease/presence ganda.

## BR-08 — billing dan pengingat

Job harian mengikuti zona lokasi, catch-up sesudah downtime. Key unik lease + charge_kind + start + end; invoice dan event notif outbox dibuat dalam transaksi. Default H-7, reminders H-3/H0/H+3; masing-masing reminder unik invoice + milestone + channel + recipient. Retry/provider delivery terpisah. Lunas/void menonaktifkan pengingat berikut; job gagal masuk antrean dead-letter dan bisa diputar ulang aman.

Snapshot rate per segmen/amendment efektif; tidak menyentuh invoice terbit. Ongoing terus ditagih sampai akhir disetujui. Tagihan setelah actual end tidak dibuat; invoice yang terlanjur terbit dikoreksi eksplisit. Untuk migrasi, billing_resume_at cutover mencegah menagih histori yang sudah diselesaikan di sistem lama. Notifikasi in-app dan email benar-benar dikirim melalui adapter produksi; tidak boleh mensimulasikan delivered.

## BR-09 — perpanjangan dan pindah

Perpanjangan memerlukan persetujuan penghuni, tarif/akhir baru, actor, reason dan validasi alokasi/blokir masa depan. Pindah dapat dijadwalkan dalam organisasi sama, termasuk lintas lokasi berizin. Tahap request → approved/reserved → executed/cancelled. Reserve target atomik; pada execute cek ulang ready/presence, inspeksi keluar/masuk, inventaris dan kunci; segmen lama berakhir eksklusif dan segmen baru dimulai pada effective date. Kamar lama dirty, bukan ready otomatis. Perubahan tarif menggunakan snapshot segmen tujuan; invoice terbit tidak ditimpa. Adjustment prorata hari aktual pada masing-masing segmen jika mode actual, atau tanpa prorata sesuai kontrak; larang tagihan ganda untuk hari/komponen sama. Jika scheduler execute gagal, jangan memindahkan occupancy secara parsial.

## BR-10 — layanan dan turnover

Ticket open → assigned → in_progress → resolved → closed; reopen beralasan. Resolved butuh hasil/bukti, petugas dan waktu. Kunjungan kamar membutuhkan persetujuan penghuni. Foto privat terhubung ticket, bukan galeri publik. Urgent menampilkan kontak pengelola dan eskalasi, tidak mengirim layanan darurat otomatis. SLA adalah konfigurasi target, bukan janji provider eksternal.

Turnover selesai baru mengubah kondisi menjadi ready bila kebersihan/inspeksi/perbaikan lengkap, tidak ada penghuni/presence, blokir operasional atau work order penghalang. Tiket administratif nonblocking tidak harus mengunci kamar; blocking ditetapkan pengelola dan diaudit. Mengubah kondisi kamar tidak melepaskan allocation. Jadwal cleaning rutin tidak otomatis membuat kamar lain available.

## BR-11 — checkout dan settlement

Checkout requested → approved → physical_out → financial_settled; status finansial boleh masih pending sesudah keluar. Notice dari snapshot; pengecualian Owner beralasan. Estimasi akhir memisahkan sewa/prorata sesuai policy, outstanding, approved damage/add-on, deposit, kredit dan refund. Perubahan tanggal menghasilkan estimasi versi baru. Final approval tidak mengarang transaksi bank.

Keluar fisik merekam actual date, kondisi/inventaris/foto, kunci atau kehilangan beralasan, petugas; presence dihentikan, allocation actual dilepas, kondisi dirty dan turnover dibuat atomik. Piutang/refund tetap dapat diproses tanpa menghidupkan occupancy. Settlement final hanya jika invoice final terbit/reconciled dan payable/refundable bersih nol atau menjadi piutang/utang yang secara eksplisit dibawa untuk tindak lanjut dengan approval Owner; status “selesai tanpa saldo” tidak boleh dipakai bila masih ada saldo. Baseline UI final menahan financial_settled sampai seluruh saldo nol; dukungan carry-forward administratif tidak wajib untuk pilot.

## BR-12 — reporting

Kas = verified cash receipts − paid refunds/reversals yang relevan; sewa ditagihkan berasal dari baris rent, bukan seluruh invoice; deposit liability terpisah. Penerimaan kas periode, tagihan periode, pengeluaran, saldo as-of dan okupansi as-of punya filter/timestamp jelas. Ekspor memakai izin dan scope yang sama, anti spreadsheet-formula injection. Historical occupancy dihitung dari segment/presence, bukan jumlah record active hari ini.

## BR-13 — SaaS

Trial/active/grace/restricted/cancelled. Kuota kamar/lokasi nonarsip dicek atomik pada create/bulk/import/restore; limit bukan hardcode 12. Downgrade di bawah usage ditolak atau dijadwalkan sampai usage sesuai, tanpa menghapus data. Restricted menolak acquisition baru/publish/add-room tetapi membolehkan data lama, ekspor, tagihan kewajiban lama, check-in komitmen sah, layanan, pelunasan/refund dan checkout. Billing SaaS dipisahkan dari kas pemilik. Plan/price/duration manual configurable; angka paket mockup bukan harga rilis.

## BR-14 — migrasi

Dry-run → validated → approved → committed/rejected. Validate tenant/property/room/reference, tanggal, kapasitas dan overlap, money dan currency. Preview mencakup row errors/warnings dan checksum; approval mengikat input+mapping+cutover yang sama. Batch tunggal atomik untuk pilot, batas default 200 baris configurable; file besar diproses job/staging tanpa partial live commit. Retry checksum/external keys sama tidak duplikatif.

Piutang, kredit dan deposit awal menggunakan ledger opening, bukan cash receipt bulan berjalan. Riwayat pembayaran/dokumen hanya direferensikan bila benar-benar tersedia; tidak membuat receipt atau acceptance palsu. Cutover per kontrak jelas, historical billing sebelum cutover tidak dibuat. Existing resident boleh dimigrasikan meskipun status awal inventory inspection, tetapi diberi warning verifikasi, presence aktif dan booking publik tidak boleh masuk kamar itu. Rekonsiliasi jumlah kamar/penghuni/kontrak/piutang/kredit/deposit disetujui Owner sebelum publish. Bukan rollback penghapusan sesudah transaksi baru; koreksi melalui alur audited.
