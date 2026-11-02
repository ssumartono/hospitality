# PRD — Kost Hospitality v1.0.0 · Production Release

Versi aplikasi target: 1.0.0  
Revisi dokumen: 1.1 · 1 November 2026  
Status dokumen: baseline implementasi siap handoff  
Status aplikasi: prototipe; belum lulus gate produksi  
Bahasa: Indonesia  
Nama produk: Kost Hospitality (nama kerja)


> **Keputusan rilis:** v1.0.0 adalah aplikasi operasional dengan backend, database persisten, isolasi organisasi, transaksi atomik, worker dan integrasi email. Ketersediaan 14 modul mockup tidak berarti aplikasi produksi selesai. Dokumen pendamping dalam paket ini memperinci acceptance, API, backlog dan release gates. UAT produksi belum dijalankan.

## Panduan membaca dan prioritas

Baca `docs/01_SCOPE_RELEASE.md`, `docs/02_BUSINESS_RULES.md`, lalu PRD ini. Aturan pendamping memperinci atau menggantikan rincian baseline yang secara eksplisit disebut dalam changelog; konflik yang tidak eksplisit harus dicatat sebelum command terkait diimplementasikan. `docs/04_ACCEPTANCE_UAT.md` dan `fixtures/UAT_CASES.csv` menjadi acuan pembuktian rilis; semua hasil implementasi masih NOT RUN. `docs/07_MOCKUP_GAP_REGISTER.md` memisahkan reuse UI dari pekerjaan produksi.

**Pilot disepakati:** kost mahasiswi/karyawati di Palembang dekat kampus, 12 kamar pada dua lantai, kamar mandi dalam, listrik prabayar per kamar, default tanpa deposit. Kondisi awal bangunan saja; kamar mulai inspection sampai perlengkapan dan checklist selesai. Jumlah kamar/lokasi dinamis dan aplikasi multi-owner SaaS sejak fondasi. Harga/furnitur/AC/rekening tidak diasumsikan dari contoh mockup.

**Target fitur:** semua 14 modul, pada batas `docs/01_SCOPE_RELEASE.md`. Payment gateway, billing SaaS otomatis, WhatsApp API resmi dan tanda tangan tersertifikasi ditunda. Transfer, refund bank dan aktivasi SaaS dilakukan manusia dengan bukti/audit aplikasi; scheduler tagihan dan email transaksional justru wajib berjalan nyata.

## 1. Ringkasan produk

Aplikasi web responsive untuk menjalankan bisnis kost sejak pemilik membuat akun, menyiapkan lokasi dan kamar, mempublikasikan listing, menerima pemesanan, mengelola pembayaran dan penghuni, memberikan layanan selama tinggal, sampai penghuni keluar dan kamar siap disewakan kembali.

Pilot dimulai dengan satu pemilik, satu lokasi, dan 12 kamar. Angka tersebut merupakan data awal, bukan batas aplikasi. Sistem sejak awal mendukung banyak organisasi pemilik, banyak lokasi per organisasi, tipe kamar, jumlah kamar dinamis, staf, dan penghuni. Setiap organisasi memiliki data, konfigurasi, keuangan, dan pelanggan terisolasi.

Produk menggabungkan operasional kost dan hospitality: kesiapan kamar, check-in/check-out, inspeksi, kebersihan, inventaris, permintaan layanan, komunikasi, dan pengalaman penghuni. Kanal publik adalah katalog milik masing-masing organisasi; marketplace lintas pemilik ditunda.

## 2. Tujuan dan ukuran keberhasilan

### 2.1 Tujuan

- Pemilik dapat beroperasi tanpa spreadsheet terpisah untuk kamar, sewa, tagihan, deposit, dan penghuni.
- Calon penghuni dapat menemukan kamar, memahami harga total, memesan, membayar, dan melacak status.
- Pengelola dapat mengetahui kamar kosong, terpesan, dihuni, diblokir, atau menunggu pembersihan.
- Seluruh pembayaran, koreksi, dan pengembalian dana dapat ditelusuri.
- Arsitektur SaaS memungkinkan pemilik lain bergabung tanpa instalasi aplikasi terpisah.

### 2.2 KPI pilot dan target awal

Target merupakan hipotesis produk yang dievaluasi setelah 30 hari pilot.

| Indikator | Target awal | Cara ukur |
|---|---|---|
| Setup 12 kamar | ≤60 menit, di luar persiapan foto/dokumen | Waktu wizard sampai lokasi siap publish |
| Double booking terkonfirmasi | 0 | Dua alokasi aktif dengan interval bertabrakan |
| Ketepatan tagihan berkala | 100% kasus uji yang disepakati | Rekonsiliasi jadwal dan invoice |
| Pencatatan transaksi | 100% memiliki pelaku/sumber dan waktu | Audit sampling |
| Adopsi pengelola | ≥90% pembayaran dicatat ≤1 hari kerja | Selisih tanggal pembayaran dan pencatatan |
| Penyelesaian checkout | 100% punya settlement dan inspeksi | Checklist checkout |

Dashboard juga menampilkan okupansi, tunggakan, penerimaan kas, pendapatan sewa, konversi booking, dan waktu penanganan keluhan. Penerimaan kas dan pendapatan tidak diperlakukan sebagai angka yang sama.

## 3. Asumsi, keputusan awal, dan batasan

| Topik | Baseline v1 |
|---|---|
| Pasar awal | Kost Indonesia; UI Bahasa Indonesia; mata uang IDR |
| Model sewa | Bulanan, satu kamar privat per kontrak; kapasitas orang dapat diatur |
| Periode tinggal | Tanggal masuk inklusif, tanggal keluar eksklusif; tanggal keluar kosong untuk kontrak berjalan |
| Model booking | Permohonan dengan persetujuan pengelola; hold hanya setelah diterima dan ada batas pembayaran |
| Pembayaran sewa MVP | Transfer langsung ke rekening pemilik, unggah bukti, verifikasi manual |
| Otomasi pembayaran | Payment gateway fase berikut; kontrak antarmuka dan idempotensi disiapkan sejak MVP |
| Deposit | Default pilot nonaktif; bila organisasi mengaktifkan, ledger jaminan terpisah dan bukan pendapatan |
| Portal penghuni | Web responsive, tanpa aplikasi native |
| Notifikasi MVP | In-app dan email transaksional; tombol WhatsApp manual tanpa klaim sudah terkirim |
| SaaS pilot | Paket trial/manual; penagihan langganan otomatis ditunda |
| Lokasi dan kamar | Dinamis; batas paket configurable, tanpa hardcode 12 |
| Peran operator platform | Mengelola SaaS; akses data organisasi hanya melalui proses bantuan yang diaudit |

Peraturan rumah, biaya, kebijakan pembatalan, tenor minimum, jatuh tempo, grace period, dan batas kapasitas dikonfigurasi pemilik. Produk tidak menetapkan tarif atau syarat bisnis seragam untuk semua pemilik.

## 4. Pengguna dan hak akses

Tenant SaaS berarti organisasi pemilik. Orang yang tinggal di kamar disebut penghuni agar tidak rancu.

| Peran | Hak utama | Batas penting |
|---|---|---|
| Platform Admin | Akun SaaS, paket, status organisasi, kesehatan layanan | Tidak otomatis membaca identitas penghuni atau mengubah kas pemilik |
| Owner | Semua lokasi organisasi, staf, tarif, laporan, persetujuan finansial | Tidak dapat mengakses organisasi lain |
| Manager | Booking, kontrak, operasional dan tagihan pada lokasi yang ditugaskan | Pengaturan organisasi/paket dan refund besar mengikuti izin |
| Finance | Invoice, verifikasi pembayaran, rekonsiliasi, laporan | Tidak mengubah kontrak/tarif tanpa izin |
| Staff Operasional | Check-in/out, tugas kebersihan, tiket, inventaris sesuai lokasi | Data identitas dan informasi keuangan dibatasi |
| Penghuni | Kontrak, tagihan, bukti bayar, tiket dan checkout miliknya | Tidak melihat penghuni atau kamar privat pihak lain |
| Pengunjung | Listing publik, ketersediaan ringkas, permohonan booking | Tidak melihat data penghuni |

RBAC diterapkan di server pada setiap endpoint dan file. Satu akun dapat memiliki keanggotaan di beberapa organisasi; pergantian organisasi harus eksplisit. Owner dapat mengundang staf dengan cakupan lokasi dan mencabut akses. Minimal satu Owner aktif harus tersisa; transfer kepemilikan memerlukan autentikasi ulang.

## 5. Cakupan dan prioritas rilis

### 5.1 MVP operasional dan SaaS foundation — wajib

1. Registrasi, verifikasi email, login, reset password, organisasi dan undangan staf.
2. Wizard setup lokasi, tipe kamar, kamar massal, tarif, fasilitas, aturan, rekening, dan publikasi.
3. Katalog publik organisasi, detail lokasi/kamar, inquiry, jadwal survei sederhana dan booking.
4. Ketersediaan berbasis interval, persetujuan booking, hold, kedaluwarsa dan pembatalan.
5. Transfer manual, verifikasi pembayaran, invoice, kuitansi dan deposit.
6. Kontrak bulanan, check-in, tagihan berulang, perpanjangan dan pindah kamar.
7. Portal penghuni, keluhan, pemeliharaan, kebersihan dan inventaris.
8. Checkout, inspeksi, settlement, refund deposit dan pembukaan kamar kembali.
9. Dashboard, pengeluaran operasional, laporan, ekspor dan audit.
10. Isolasi organisasi, kuota paket, admin SaaS minimum, backup dan observabilitas.

### 5.2 Fase berikut

- Payment gateway sewa dengan rekening/subakun pemilik yang sesuai model provider; rekonsiliasi otomatis.
- Langganan SaaS otomatis, perubahan paket dan billing self-service.
- WhatsApp resmi, pengingat otomatis lintas kanal, custom domain.
- Meter listrik/air, pembacaan meter dan perhitungan konsumsi.
- Marketplace lintas organisasi dengan pencarian kawasan dan moderasi listing.
- Add-on laundry, parkir, makanan, layanan berbayar dan penjadwalan housekeeping berkala.
- Dokumen bertanda tangan elektronik melalui penyedia yang dipilih.
- Analitik lanjutan, integrasi akuntansi, API publik dan white label.

### 5.3 Di luar cakupan v1

Sewa harian/jam, shared-bed/dormitory, manajemen hotel penuh, smart lock, pemutusan utilitas otomatis, pengusiran otomatis, escrow dana, pinjaman, perhitungan/pelaporan pajak otomatis, akuntansi buku besar lengkap, serta aplikasi Android/iOS native.

## 6. Alur end to end

### 6.1 Pemilik mulai menggunakan aplikasi

1. Daftar → verifikasi email → buat organisasi → pilih trial/paket.
2. Buat lokasi: nama, alamat, koordinat opsional, zona waktu, kontak, jadwal layanan.
3. Buat tipe kamar dan fasilitas → generate kamar, misalnya 01–12 → edit pengecualian per kamar.
4. Tetapkan harga bulanan, deposit, biaya tambahan, tanggal jatuh tempo, aturan pembayaran dan pembatalan.
5. Tambahkan rekening, foto publik, peraturan dan template perjanjian.
6. Undang staf dan atur cakupan lokasi.
7. Preview listing → lengkapi validasi → publish.
8. Jika sudah berpenghuni, migrasikan kontrak aktif dan saldo awal sebelum membuka ketersediaan publik.

### 6.2 Calon penghuni sampai check-in

1. Buka katalog → filter lokasi, rentang harga, fasilitas dan tanggal masuk.
2. Baca rincian biaya dan kebijakan → ajukan pertanyaan/survei atau booking.
3. Verifikasi kontak/login → isi data minimum → kirim permohonan.
4. Manager menerima permohonan setelah memeriksa ketersediaan → server membuat hold atomik dengan tenggat.
5. Sistem menerbitkan invoice awal yang memisahkan sewa, deposit dan biaya lain.
6. Calon penghuni membayar → unggah bukti → Finance memverifikasi penerimaan nyata.
7. Saat pembayaran minimum dan syarat terpenuhi, booking confirmed dan alokasi kamar tetap terjamin.
8. Penghuni melengkapi identitas privat dan menerima versi perjanjian serta aturan.
9. Pada kedatangan, staf memeriksa identitas, inspeksi awal, inventaris, kunci dan checklist → aktifkan kontrak/check-in.

### 6.3 Selama tinggal

1. Scheduler menghasilkan invoice periode berikut tanpa duplikasi.
2. Penghuni menerima pengingat, membayar, dan melihat kuitansi setelah diverifikasi.
3. Penghuni membuat tiket layanan; staf menindaklanjuti sesuai prioritas.
4. Manager menangani perpanjangan, perubahan penghuni, biaya tambahan atau pindah kamar dengan persetujuan dan jejak perubahan.
5. Owner memantau okupansi, tunggakan, kas, deposit, biaya dan kondisi kamar.

### 6.4 Penghuni keluar

1. Penghuni mengajukan tanggal keluar → pengelola meninjau notice period dan menyetujui jadwal.
2. Sistem menghitung estimasi tagihan akhir sesuai kebijakan yang telah disepakati.
3. Staf memeriksa kamar, inventaris, kunci dan bukti kondisi.
4. Finance menyelesaikan tagihan, usulan potongan deposit dan saldo refund.
5. Owner/pejabat berwenang menyetujui settlement; penghuni mendapat rinciannya.
6. Keluar fisik dan penutupan finansial dicatat terpisah; tunggakan/refund belum selesai tetap dapat ditindaklanjuti.
7. Kamar masuk dirty/inspection/maintenance → tugas kebersihan/perbaikan → ready → tersedia sesuai interval.

## 7. Kebutuhan fungsional

### FR-01 — Akun, organisasi dan onboarding

- User dapat registrasi dengan email; nomor telepon menjadi kontak, bukan pengganti verifikasi email v1.
- Akun belum terverifikasi tidak dapat mempublikasikan listing atau mengundang staf.
- Organisasi memiliki nama, slug unik, penanggung jawab, kontak, paket dan status.
- Wizard menyimpan draft dan dapat dilanjutkan.
- Setup awal mendukung generate 12 kamar dengan preview kode, tipe dan harga sebelum simpan.
- Duplikasi kode kamar dalam lokasi ditolak; nama sama di lokasi berbeda diperbolehkan.
- Undangan memiliki expiry, peran, lokasi dan dapat dicabut.

### FR-02 — Lokasi, tipe kamar dan inventori

- Satu organisasi memiliki banyak lokasi; tiap lokasi punya zona waktu sendiri.
- Kamar memiliki kode, lantai, tipe, ukuran opsional, kapasitas, fasilitas, harga override, foto dan status operasional.
- Tipe kamar menyediakan default yang dapat dioverride dengan jelas.
- Perubahan default tidak menimpa kontrak aktif atau override tanpa konfirmasi.
- Kamar/lokasi berkontrak atau bertransaksi hanya dapat diarsipkan, bukan dihapus permanen.
- Pengurangan kuota paket tidak menghapus kamar/data; pembuatan baru dibatasi sampai kuota sesuai.
- Blokir kamar dapat memiliki interval dan alasan, misalnya renovasi.

### FR-03 — Tarif dan kebijakan

- Harga disimpan sebagai nilai IDR bilangan bulat; kalkulasi tanpa floating point.
- Komponen: sewa, deposit, administrasi, parkir atau biaya tetap lain; setiap komponen memiliki label dan sifat refundable.
- Pemilik memilih siklus anniversary tanggal masuk atau kalender bulanan.
- Jika anniversary jatuh pada tanggal yang tidak tersedia, gunakan hari terakhir bulan; bulan berikut kembali ke anchor awal.
- Mode prorata v1: tanpa prorata atau berdasarkan jumlah hari aktual bulan kalender. Anniversary menagih satu periode bulanan penuh.
- Prorata kalender: harga bulanan × hari terpakai / jumlah hari bulan tersebut, dibulatkan ke rupiah terdekat per baris; interval lintas bulan dihitung per bulan.
- Perpanjangan/rate baru berlaku mulai periode mendatang yang disepakati, dengan snapshot; tidak mengubah invoice terbit.
- Denda terlambat default nonaktif. Jika aktif: nominal tetap sekali per invoice setelah grace period, dengan batas maksimum dan aturan yang ditampilkan sebelum pemesanan.
- Semua perubahan kebijakan diberi effective date, versi dan pelaku.

### FR-04 — Publikasi listing

- URL organisasi dan lokasi menggunakan slug; listing draft tidak dapat diakses publik.
- Informasi publik: foto, deskripsi, alamat sesuai tingkat keterbukaan pemilik, fasilitas, aturan, harga, rincian biaya awal, tanggal tersedia dan kontak.
- Harga ditandai “mulai dari” bila tipe/kamar berbeda; tidak menyatakan kamar available hanya berdasarkan harga terendah.
- Publish wajib memiliki kontak, lokasi, minimal satu kamar aktif, harga dan kebijakan.
- Unpublish menghentikan booking baru, tanpa membatalkan booking/kontrak aktif.
- Foto identitas, perjanjian dan bukti bayar tidak pernah menjadi aset publik.
- Pencarian MVP berada dalam katalog organisasi, bukan agregator lintas pemilik.

### FR-05 — Inquiry dan survei

- Inquiry mencatat kontak, sumber, lokasi/kamar, kebutuhan tanggal dan status tindak lanjut.
- Permintaan survei memiliki pilihan jadwal, penerimaan/penjadwalan ulang dan hasil.
- Inquiry/survei tidak mengunci inventori dan dapat dikonversi menjadi booking tanpa menyalin ulang data.
- Kontak publik memiliki rate limit dan perlindungan spam.

### FR-06 — Booking dan ketersediaan

- Permohonan memuat pemesan, kamar, tanggal masuk, rencana durasi, jumlah penghuni dan snapshot harga/kebijakan.
- Jika tanggal akhir belum ditentukan, kontrak berjalan memblokir masa mendatang sampai tanggal akhir disepakati; tidak dianggap kosong pada akhir bulan tagihan.
- Permohonan pending belum menjamin kamar. Keputusan menerima harus melakukan validasi ulang dan membentuk alokasi dalam transaksi database.
- Hold default 24 jam, configurable; UI menampilkan tenggat dan zona waktu lokasi.
- Upload bukti sebelum tenggat memberi satu perpanjangan review default 24 jam. Setelah review deadline, hold dapat expired; waktu dan alasan terlihat jelas.
- Bukti ditolak sebelum tenggat mengembalikan status menunggu pembayaran; tenggat tidak otomatis terus diperpanjang.
- Pembayaran parsial tidak otomatis confirm kecuali memenuhi minimum booking yang dikonfigurasi.
- Minimum booking merupakan bagian dari tagihan awal, tidak ditagih ulang sebagai biaya tambahan.
- Expiry, pembatalan dan perpanjangan hold harus atomik terhadap proses konfirmasi pembayaran.
- Dana yang diterima setelah hold expired ditandai late payment dan membutuhkan resolusi: alokasi ulang dengan pemeriksaan ketersediaan atau refund; tidak otomatis menghidupkan booking.
- Walk-in oleh staf memakai mesin ketersediaan dan aturan yang sama.

### FR-07 — Invoice, pembayaran dan kuitansi

- Invoice terbit mempunyai nomor unik per organisasi, periode, jatuh tempo, baris biaya, total, pembayaran teralokasi dan saldo.
- Mendukung pembayaran penuh, cicilan, pembayaran beberapa invoice dan saldo kredit penghuni.
- Bukti transfer berstatus pending verification, verified atau rejected. File bukti saja tidak mengubah invoice menjadi lunas.
- Finance mencatat tanggal dana diterima, nominal, rekening tujuan dan referensi transaksi.
- Nominal yang teralokasi tidak boleh melebihi penerimaan atau saldo invoice. Kelebihan menjadi kredit atau diproses refund.
- Pembayaran terverifikasi menghasilkan kuitansi; kuitansi digital dapat dicetak dari browser.
- Pembayaran cash dapat dicatat staf berizin dan wajib memiliki nomor penerimaan serta pelaku.
- Invoice terbit tidak diedit diam-diam: koreksi melalui void bila belum dibayar atau credit/debit adjustment yang mereferensikan dokumen asli.
- Pembatalan payment melalui reversal beralasan dan berizin, tanpa menghapus histori.
- Transaksi dan alokasi menggunakan idempotency key/constraint agar retry tidak menghasilkan pembayaran atau kuitansi ganda.
- Dana sewa diterima pemilik; platform tidak menahan dana pada MVP.

### FR-08 — Kontrak dan check-in

- Kontrak mereferensikan organisasi, lokasi, kamar, penanggung jawab, daftar penghuni, tanggal, tarif, deposit, siklus tagihan dan aturan.
- Booking dan kontrak memiliki ID berbeda tetapi saling terhubung.
- Perjanjian memiliki versi dan bukti penerimaan akun beserta waktu; tidak diklaim sebagai tanda tangan elektronik tersertifikasi.
- Check-in wajib: booking confirmed atau jalur walk-in yang sah, data minimum, pembayaran minimum, kamar ready, inventaris awal dan serah terima kunci.
- Owner dapat override persyaratan pembayaran dengan alasan, izin khusus dan audit; tidak dapat override benturan kamar.
- Kapasitas kamar divalidasi; penghuni tambahan dicatat dan mengikuti biaya/kebijakan.
- Tanggal aktual check-in dibedakan dari tanggal awal kontrak dan tidak mengubah tagihan otomatis.

### FR-09 — Tagihan rutin, perpanjangan dan pindah kamar

- Invoice dibuat default H-7 jatuh tempo, configurable, oleh background job.
- Unique key kontrak + jenis tagihan + awal/akhir periode mencegah invoice ganda.
- Retry/catch-up job membuat periode terlewat sekali saja setelah gangguan.
- Pengingat default H-3, H-0 dan H+3; dihentikan ketika lunas/void dan dideduplikasi.
- Overdue dihitung atas saldo belum lunas setelah due date dalam zona waktu lokasi; grace period mengatur denda, bukan menyembunyikan tunggakan.
- Perpanjangan memeriksa konflik reservasi/blokir masa depan dan persetujuan harga baru.
- Pindah kamar membuat segmen kontrak/alokasi baru dengan tanggal efektif, inspeksi keluar/masuk dan penyesuaian biaya. Histori kamar lama tetap utuh.
- Pindah lintas lokasi hanya dalam organisasi sama pada MVP; antarorganisasi merupakan kontrak baru.

### FR-10 — Portal penghuni dan hospitality

- Penghuni melihat kontrak, aturan, tagihan, riwayat bayar, saldo deposit, pengumuman, tiket dan permohonan keluar miliknya.
- Tiket memiliki kategori, prioritas, deskripsi, foto, lokasi/kamar, penugasan, target respons dan histori.
- Status tiket: open → assigned → in_progress → resolved → closed; dapat reopened dengan alasan.
- Prioritas urgent menampilkan kontak darurat/pengelola; aplikasi tidak menjanjikan layanan darurat otomatis.
- Staf menjadwalkan kunjungan dengan persetujuan penghuni, mencatat penyelesaian dan biaya jika disetujui.
- Tugas kebersihan dan inspeksi dapat terhubung ke tiket/check-out; penyelesaian tugas tidak otomatis membuka kamar jika masih ada blocker.
- Inventaris kamar mencatat barang, jumlah, kondisi masuk/keluar dan foto.
- Pengumuman dapat ditujukan ke lokasi atau penghuni tertentu; daftar penerima dibatasi cakupan akses.

### FR-11 — Checkout dan deposit

- Permohonan keluar menyimpan tanggal diminta, tanggal disetujui, alasan opsional dan status.
- Jika tanggal berubah, availability dan tagihan dihitung ulang melalui proses persetujuan; tidak menggeser booking berikut tanpa resolusi.
- Pengelola membuat inspeksi akhir dan rincian biaya kerusakan/tunggakan dengan bukti.
- Potongan deposit memerlukan alasan, persetujuan peran berwenang dan ringkasan untuk penghuni; sengketa disimpan sebagai status dan catatan.
- Deposit diterima, dipakai dan dikembalikan melalui ledger terpisah; saldo tidak boleh negatif.
- Refund = deposit tersedia dikurangi potongan disetujui; bila biaya lebih besar, selisih menjadi piutang, bukan refund negatif.
- Refund mempunyai requested, approved, processing, paid, failed/rejected; pada MVP paid memerlukan bukti transfer dan referensi.
- Keluar fisik boleh selesai meski settlement pending; kontrak menandai physical_checkout_at dan financial_closed_at secara terpisah.
- Kamar setelah keluar berstatus dirty/inspection; ready hanya setelah checklist selesai dan tidak ada maintenance block.
- Tidak boleh menagih periode setelah akhir kontrak; invoice terbit yang melampaui akhir dikoreksi melalui adjustment sesuai kebijakan.

### FR-12 — Dashboard, biaya dan laporan

- Filter organisasi/lokasi/periode; dashboard operasional dan finansial mengikuti izin.
- Kartu utama: kamar aktif, dihuni, kosong siap, reserved, blocked, dirty, okupansi, jatuh tempo, tunggakan dan tiket terbuka.
- Okupansi hari berjalan = kamar dihuni / kamar aktif yang tidak diblokir sepanjang hari; denominator dan kamar dikecualikan ditampilkan.
- Okupansi periode = occupied room-nights / sellable room-nights; hari blokir dikeluarkan dari denominator.
- Laporan terpisah: invoice sewa, penerimaan kas, piutang aging, deposit liability, refund, pengeluaran dan arus kas sederhana.
- Pengeluaran memuat kategori, lokasi, tanggal, nominal, vendor opsional, bukti dan persetujuan configurable.
- “Pendapatan sewa” berasal dari komponen sewa untuk periode terkait, bukan seluruh transfer; laporan ini bersifat manajerial, bukan laporan akuntansi/pajak tersertifikasi.
- Ekspor CSV sesuai filter dan izin; karakter formula berbahaya disanitasi. Data identitas sensitif tidak masuk ekspor umum.

### FR-13 — SaaS dan platform administration

- Paket mendefinisikan kuota lokasi, kamar aktif dan staf, serta entitlement fitur.
- Nilai paket disimpan sebagai konfigurasi; harga komersial belum ditetapkan PRD ini.
- Langganan SaaS terpisah dari invoice sewa penghuni, termasuk nomor dokumen dan penerima dana.
- Trial berakhir → grace → restricted/read-only sesuai kebijakan; data tidak dihapus otomatis.
- Mode restricted tetap memungkinkan pemilik membaca/ekspor data dan menyelesaikan kewajiban lama seperti refund/settlement; pembuatan lokasi/kamar, publish dan booking baru dibatasi.
- Portal penghuni tetap dapat mengakses kontrak/tagihan miliknya selama akun pemilik dalam grace/restricted; sanksi keamanan dapat menerapkan aturan berbeda.
- Billing SaaS MVP diaktifkan/ditandai bayar manual oleh Platform Admin dengan audit.
- Support access memerlukan otorisasi Owner, alasan, scope, expiry dan log; tidak menggunakan akses diam-diam.
- Platform dapat menangguhkan listing karena penyalahgunaan dengan alasan dan kanal penyelesaian; transaksi lama tetap terlacak.

### FR-14 — Migrasi penghuni awal

- Wizard menerima input manual/CSV kamar, penghuni, kontrak aktif, deposit, piutang dan kredit awal.
- Preview, validasi, pemetaan kolom dan error per baris sebelum commit.
- Import diberi batch ID dan idempotency key; pengulangan batch tidak menggandakan kontrak/tagihan.
- Saldo awal diberi label opening balance beserta tanggal cutover; tidak dianggap penerimaan kas periode sekarang.
- Lokasi tidak boleh publish kamar sebelum alokasi penghuni lama diimpor atau ditandai siap secara eksplisit.
- Rollback hanya untuk batch belum memiliki transaksi lanjutan; selain itu memakai koreksi berjejak.

## 8. Model status dan aturan konsistensi

### 8.1 Pisahkan dimensi status

| Objek | Status |
|---|---|
| Listing | draft, published, unpublished, archived |
| Kondisi kamar | ready, dirty, inspection, maintenance, inactive |
| Booking | submitted, awaiting_payment, payment_review, confirmed, checked_in, cancelled, expired, no_show |
| Kontrak | draft, active, notice_given, ended, cancelled |
| Invoice | draft, issued, partially_paid, paid, void; overdue sebagai flag turunan |
| Subscription SaaS | trial, active, grace, restricted, cancelled |

Label availability kamar dihitung dari kondisi, blokir, booking dan kontrak untuk rentang yang diminta. “Dihuni”, “reserved” dan “kosong” tidak cukup direpresentasikan satu kolom manual.

### 8.2 Transisi dan otoritas

| Peristiwa | Dari → ke | Syarat utama |
|---|---|---|
| Terima booking | submitted → awaiting_payment | Cek benturan dan buat hold atomik |
| Upload bukti | awaiting_payment → payment_review | Hold masih berlaku, file valid |
| Verifikasi | payment_review → confirmed | Dana diterima, minimum terpenuhi, alokasi masih sah |
| Tolak bukti | payment_review → awaiting_payment/expired | Mengikuti tenggat yang tersisa |
| Scheduler expiry | awaiting_payment/payment_review → expired | Tenggat efektif lewat, transaksi belum terkonfirmasi |
| Kedatangan | confirmed → checked_in | Checklist, kondisi ready, kontrak aktif |
| Tidak datang | confirmed → no_show | Keputusan manual sesudah jadwal; settlement sesuai kebijakan |
| Keluar | active/notice_given → ended | Keluar fisik dicatat; finansial boleh pending |

### 8.3 Invarian sistem

1. Tidak ada dua alokasi pengunci dengan interval bertumpuk pada kamar yang sama, termasuk reservasi, kontrak dan blokir. Interval akhir eksklusif memungkinkan checkout dan check-in pada hari sama jika operasional ready.
2. Pemeriksaan benturan dilakukan di database/transaksi server, bukan hanya tampilan kalender. Semua jalur manual, API dan background job mengikuti aturan sama.
3. Perubahan finansial tidak menghapus transaksi terverifikasi; gunakan reversal/adjustment.
4. Kebijakan, tarif dan perjanjian yang diterima disnapshot; edit master tidak menulis ulang histori.
5. Semua data organisasi memiliki organization_id; relasi anak harus berada dalam organisasi yang sama.
6. Kunci idempotensi selalu mencakup organisasi dan operasi agar tidak bertabrakan lintas pemilik.
7. Tanggal bisnis memakai zona waktu lokasi; timestamp kejadian disimpan UTC.
8. Akun penghuni yang sama dapat memiliki beberapa kontrak; akses selalu ditentukan relasi kontrak, bukan kecocokan nomor telepon saja.

## 9. Aturan kalkulasi dan contoh

Contoh di bawah adalah fixture uji, bukan usulan tarif bisnis.

- Sewa Rp1.500.000/bulan, deposit Rp1.000.000, administrasi Rp100.000 → invoice awal Rp2.600.000; komponen deposit tidak masuk pendapatan sewa.
- Minimum pembayaran booking Rp500.000 → saat diverifikasi, sisa invoice awal Rp2.100.000; tidak membuat biaya booking tambahan.
- Invoice Rp1.500.000, pembayaran pertama Rp1.000.000 → saldo Rp500.000, status partially_paid. Pembayaran kedua Rp700.000 → alokasi Rp500.000, kredit Rp200.000.
- Prorata kalender tanggal 16–31 Januari, tanggal keluar 1 Februari: 16/31 × Rp1.500.000 = Rp774.194 setelah pembulatan.
- Anchor anniversary tanggal 31 Januari → periode berikut mulai 28 Februari 2027 → periode berikut mulai 31 Maret 2027.
- Deposit tersedia Rp1.000.000, tunggakan disetujui Rp200.000 dan kerusakan Rp150.000 → refund Rp650.000.
- Deposit Rp1.000.000, biaya final Rp1.200.000 → deposit terpakai Rp1.000.000 dan piutang Rp200.000.

Diskon v1 berupa nominal per baris; total tidak boleh negatif. Pajak tidak dihitung otomatis. Jika pemilik menambahkan komponen pajak/manual, label dan nominal harus eksplisit dan menjadi tanggung jawab konfigurasi bisnis pemilik.

## 10. Struktur layar dan UX responsive

### 10.1 Area publik

Beranda organisasi → daftar lokasi → detail lokasi/kamar → rincian harga → inquiry/survei → booking → instruksi pembayaran → status booking.

### 10.2 Area pengelola

- Dashboard dan pusat tugas hari ini.
- Kalender ketersediaan dan daftar kamar.
- Lokasi, tipe kamar, fasilitas, foto dan listing.
- Inquiry, survei dan booking.
- Penghuni, kontrak, check-in dan checkout.
- Invoice, pembayaran, deposit, refund, biaya dan laporan.
- Tiket, kebersihan dan inventaris.
- Pengaturan organisasi, staf, aturan, notifikasi dan langganan.

### 10.3 Portal penghuni

Beranda masa tinggal, tagihan & bayar, kontrak & aturan, layanan/keluhan, pengumuman, permohonan keluar dan profil.

### 10.4 Standar UI

- Mobile 360–767 px, tablet 768–1023 px, desktop ≥1024 px sebagai acuan layout, bukan pembatas perangkat.
- Tidak ada horizontal scroll pada halaman utama mobile; tabel besar berubah menjadi kartu/ringkasan, detail kolom tersedia melalui drill-down.
- Kalender mobile menyediakan alternatif agenda harian; tidak memaksa drag-and-drop.
- Target sentuh minimum 44×44 px, label formulir jelas, error dekat field, navigasi keyboard dan kontras memenuhi target WCAG 2.2 AA.
- Status memakai teks dan ikon selain warna. Format rupiah/tanggal konsisten.
- Aksi finansial menampilkan ringkasan nominal, penerima dan dampak sebelum submit; tombol mencegah submit ganda.
- Loading, empty, error, offline dan retry state tersedia. Offline tidak mengonfirmasi booking/pembayaran.
- Data sensitif dimasking; pemuatan foto memakai thumbnail dan lazy loading.

## 11. Model data konseptual

Semua tabel bisnis privat memuat organization_id, created_at, updated_at dan audit actor bila relevan. Objek publik disajikan melalui proyeksi terbatas.

| Entitas | Data/relasi utama |
|---|---|
| User | Identitas login global, email terverifikasi, status |
| Organization | Pemilik SaaS, slug, kontak, konfigurasi |
| Membership / LocationAccess | User, peran, organisasi, lokasi |
| Plan / Subscription | Kuota, entitlement, siklus dan status SaaS |
| Property | Lokasi, alamat, zona waktu, rekening/pengaturan |
| RoomType / Room | Kapasitas, fasilitas, tarif default/override, kondisi |
| Listing / Media | Konten publik, status, foto dan scope akses |
| RatePolicyVersion | Tarif, prorata, deposit, jatuh tempo, pembatalan |
| Inquiry / Viewing | Prospek, jadwal survei dan tindak lanjut |
| Booking | Pemesan, periode, snapshot, status dan expiry |
| RoomAllocation | Kamar, interval, jenis hold/stay/block, sumber dan status |
| Resident / IdentityDocument | Profil penghuni dan dokumen privat |
| Lease / LeaseOccupant / LeaseSegment | Kontrak, penghuni dan histori pindah kamar |
| AgreementAcceptance | Versi dokumen, penerima dan timestamp |
| Invoice / InvoiceLine | Komponen tagihan dan periode |
| Payment / PaymentAllocation | Penerimaan, bukti, verifikasi dan alokasi |
| CreditAdjustment / Refund | Koreksi, pengembalian, persetujuan |
| DepositLedger | Receipt, deduction, refund dan saldo per kontrak |
| Checkout / Inspection | Tanggal, checklist, foto, settlement |
| Inventory / InventoryCondition | Barang dan kondisi masuk/keluar |
| ServiceTicket / WorkOrder | Keluhan, penugasan, histori dan penyelesaian |
| Expense | Biaya operasional dan bukti |
| Notification / DeliveryAttempt | Pesan, penerima, deduplikasi dan hasil |
| AuditLog / OutboxEvent | Jejak aksi dan pengiriman event andal |
| ImportBatch / OpeningBalance | Migrasi awal dan saldo cutover |

Constraint minimum: slug organisasi unik; kode kamar unik per lokasi; nomor invoice unik per organisasi; satu invoice periodik per kontrak/periode/jenis; referensi idempotensi unik; relasi lintas organisasi ditolak; tidak ada overlap alokasi pengunci.

## 12. Arsitektur dan integrasi

### 12.1 Arahan implementasi

- Modular monolith sebagai baseline: frontend responsive, backend API, database relasional, private object storage, worker/scheduler dan email adapter.
- PostgreSQL direkomendasikan untuk transaksi, constraint interval dan isolasi data; pemilihan framework mengikuti kemampuan tim.
- Satu database shared schema dengan organization_id dan row-level security sebagai pertahanan tambahan; authorization aplikasi tetap wajib.
- Modul: identity/tenancy, inventory, catalog, booking, lease, billing, hospitality, reporting dan SaaS administration.
- Gunakan transaction + database locking/constraint untuk alokasi kamar dan ledger. Event setelah commit dikirim lewat transactional outbox.
- Background job bersifat at-least-once dengan handler idempotent, retry terbatas, dead-letter dan dashboard kegagalan.
- Private storage untuk dokumen, akses lewat URL sementara setelah pemeriksaan izin. Foto listing diproses menjadi varian publik terpisah.
- Tidak ada kredensial provider atau service-role database di frontend.

### 12.2 Kontrak integrasi

| Integrasi | MVP | Ketentuan |
|---|---|---|
| Email transaksional | Aktif | Log delivery, retry, template dan preference |
| WhatsApp | Tautan manual | Tidak mencatat delivered tanpa bukti provider |
| Transfer bank | Verifikasi manual | Rekening pemilik dan jejak approval |
| Payment gateway sewa | Fase berikut | Signature webhook, event ID unik, amount/currency check, rekonsiliasi |
| Billing SaaS | Manual | Terpisah dari dana sewa |
| Maps | Link/pin opsional | Tidak memblokir setup jika provider gagal |

Contoh kelompok API: /organizations, /properties, /rooms, /availability, /bookings, /leases, /invoices, /payments, /deposits, /checkouts, /tickets, /reports dan /subscriptions. Endpoint mutasi penting mendukung idempotency key; list memakai pagination, filter dan batas ukuran. OpenAPI dan daftar error merupakan deliverable engineering sebelum integrasi frontend lengkap.

## 13. Kebutuhan nonfungsional

| Area | Target/requirement |
|---|---|
| Performa | p95 baca API ≤800 ms dan mutasi biasa ≤1.500 ms pada lingkungan uji setara produksi; unggah/ekspor berat terpisah |
| UX publik | LCP target ≤2,5 detik pada profil mobile uji yang terdokumentasi |
| Kapasitas uji awal | 100 organisasi × 10 lokasi × 100 kamar; 100 sesi aktif bersamaan dengan campuran workload terdokumentasi |
| Availability | Target SLO awal 99,5% bulanan; monitoring dan definisi downtime ditetapkan sebelum pilot |
| Backup | Backup harian terenkripsi, target RPO ≤24 jam dan RTO ≤8 jam; uji restore sebelum pilot dan berkala |
| Keamanan | TLS, hash password yang kuat, rate limit, sesi aman, CSRF sesuai mekanisme auth, validasi server dan proteksi XSS/SQL injection |
| Akses istimewa | MFA wajib untuk Platform Admin dan disediakan untuk Owner/Finance; autentikasi ulang untuk perubahan rekening/Owner |
| Upload | Allowlist tipe/MIME, batas ukuran, pemindaian file dan penolakan konten berbahaya sebelum tersedia untuk unduh |
| Observabilitas | Structured log, request ID, error tracking, job lag dan alert; log tidak memuat dokumen/nomor identitas penuh |
| Konsistensi | Strong consistency untuk availability, pembayaran dan deposit; dashboard boleh eventual dengan timestamp pembaruan |
| Browser | Dua versi mayor terbaru Chrome, Edge, Firefox dan Safari saat rilis; Android dan iOS diuji |
| Ekspor | Ekspor besar menjadi job dengan akses privat dan masa unduh terbatas |

Target di atas perlu dibuktikan melalui pengujian, bukan diasumsikan dari pilihan teknologi.

## 14. Privasi, keamanan data dan tata kelola

Bagian ini menetapkan requirement produk, bukan pendapat hukum atau pernyataan kepatuhan yang sudah tersertifikasi.

- Ambil identitas minimum pada booking; dokumen lengkap hanya saat diperlukan untuk proses tinggal yang ditetapkan pemilik.
- Dasar pemrosesan, pemberitahuan privasi dan tujuan penggunaan harus ditampilkan; persetujuan pemasaran terpisah dan tidak wajib.
- Nomor identitas, rekening dan dokumen disimpan terenkripsi sesuai kebutuhan, dengan akses per peran.
- Data penghuni tidak dipakai untuk pemasaran lintas pemilik tanpa dasar dan pilihan yang sesuai.
- Pemilik dapat mengekspor data organisasinya; penghuni dapat meminta akses/koreksi data miliknya melalui alur tercatat.
- Permintaan penghapusan mempertimbangkan kontrak, sengketa dan kewajiban retensi; data dapat dianonimkan bila harus mempertahankan transaksi.
- Jadwal retensi dokumen, transaksi, audit dan backup harus ditetapkan sebelum produksi berdasarkan review bisnis dan hukum. Tidak ada retensi tanpa batas secara default.
- Pembatalan SaaS menampilkan masa ekspor dan rencana penghapusan sesuai kebijakan yang dipublikasikan; tidak menghapus seketika.
- Audit memuat actor, organisasi, objek, aksi, waktu, alasan dan perubahan relevan dengan masking; akses audit dibatasi.
- Akses bantuan lintas organisasi bersifat time-bound dan dapat dilihat Owner.
- Uji isolasi mencakup endpoint, export, file URL, pencarian, job, cache dan webhook.

## 15. Acceptance criteria utama

| ID | Skenario dan hasil yang wajib |
|---|---|
| AC-01 | Owner membuat satu lokasi dan generate 12 kamar; dapat menambah kamar ke-13 dan lokasi kedua tanpa perubahan kode |
| AC-02 | Dua organisasi menggunakan kode kamar 01; API/URL/file organisasi A tidak dapat diakses user B dengan manipulasi ID |
| AC-03 | Dua manager menerima booking kamar dan interval sama secara bersamaan; hanya satu mendapatkan hold, lainnya menerima conflict yang dapat dipahami |
| AC-04 | Hold expired membuat kamar dapat dipesan; retry expiry tidak mengubah booking yang sudah confirmed |
| AC-05 | Upload sebelum expiry mendapat review window sekali; bukti belum diverifikasi tidak menghasilkan kuitansi/lunas |
| AC-06 | Pembayaran terlambat setelah kamar teralokasi ke orang lain masuk exception queue; tidak menghasilkan double booking |
| AC-07 | Pembayaran parsial, penuh, lebih bayar dan reversal menghasilkan saldo invoice, kredit dan kas yang benar serta histori utuh |
| AC-08 | Scheduler dijalankan tiga kali untuk periode sama; hanya satu invoice rutin dibuat dan tidak ada notifikasi ganda |
| AC-09 | Kontrak tanggal 31 melewati Februari dan kembali ke anchor tanggal 31; contoh prorata bagian 9 lulus |
| AC-10 | Booking confirmed tidak bisa check-in bila kamar maintenance atau inspeksi belum lengkap; override finansial tetap tidak melewati konflik inventori |
| AC-11 | Perubahan tarif master tidak mengubah kontrak/invoice lama; tarif baru berlaku sesuai effective date |
| AC-12 | Pindah kamar memelihara histori, membebaskan kamar lama sesuai kesiapan, dan mencegah benturan kamar tujuan |
| AC-13 | Deposit, potongan dan refund contoh bagian 9 sesuai; approval dan bukti refund tersimpan |
| AC-14 | Checkout fisik selesai dengan tunggakan; kamar dapat disiapkan, piutang tetap terlihat dan tidak ada tagihan rutin setelah akhir kontrak |
| AC-15 | Penghuni hanya melihat tagihan/kontrak/tiket miliknya; staf lokasi A tidak membaca data privat lokasi B |
| AC-16 | Kuota paket tercapai menolak penambahan sesuai kebijakan, tanpa menghapus data atau memblokir settlement kewajiban lama |
| AC-17 | Import saldo awal tidak menambah kas bulan berjalan; pengulangan batch tidak menggandakan data |
| AC-18 | Pada lebar 360 px, booking, upload bukti, verifikasi, tiket dan checkout dapat diselesaikan tanpa overflow halaman |
| AC-19 | Backup dipulihkan ke lingkungan terpisah dan saldo, file privat serta relasi kontrak dapat diverifikasi |
| AC-20 | Unpublish menghentikan booking publik baru; penghuni aktif tetap dapat mengakses kontrak/tagihan |
| AC-21 | Kontrak ongoing tetap memblokir booking masa depan sampai ada akhir yang disepakati |
| AC-22 | Staff yang dicabut aksesnya ditolak pada request berikutnya, termasuk unduhan privat dan export |
| AC-23 | Subscription restricted mengizinkan baca/ekspor/refund lama, tetapi menolak publish dan booking baru sesuai entitlement |
| AC-24 | Pembayaran atau booking gagal di tengah transaksi tidak meninggalkan alokasi/ledger setengah jadi |

## 16. Strategi pengujian

- Unit/domain: overlap interval, akhir eksklusif, ongoing lease, expiry, anniversary, prorata, rounding, diskon, saldo kredit dan deposit.
- Integration: transaksi database, isolasi organisasi, izin lokasi, file privat, import, outbox, scheduler dan retry.
- Concurrency: booking vs booking, expiry vs verifikasi, pindah kamar vs booking, dua alokasi pembayaran dan refund ganda.
- E2E: onboarding → publish → booking → bayar → check-in → invoice bulan berikut → tiket → checkout → refund → ready.
- UAT pilot menggunakan 12 kamar: campuran dihuni, kosong, maintenance, booking dan penghuni lama; data simulasi diberi label dan dipisahkan dari produksi.
- Keamanan: IDOR, privilege escalation, injection, upload, session revocation, cache leakage dan export authorization.
- Operasional: restore backup, job catch-up, email gagal, upload terputus, gateway timeout untuk fase integrasi.

## 17. Tahapan implementasi dan dependensi

Tidak ada estimasi kalender mengikat sampai ukuran tim dan integrasi diputuskan.

| Tahap | Hasil | Gate selesai |
|---|---|---|
| 0 — Discovery & desain | Aturan bisnis, prototipe mobile, model data, threat model dan ADR | Keputusan blocker bagian 19 ditutup |
| 1 — Foundation | Auth, organisasi, RBAC, lokasi/kamar, kuota, private storage, audit | Isolasi organisasi dan setup 12 kamar lulus |
| 2 — Acquisition | Listing, inquiry, booking, availability, hold | Race condition dan expiry lulus |
| 3 — Stay & finance | Transfer manual, invoice, deposit, kontrak, check-in dan rutin | Rekonsiliasi dan contoh kalkulasi lulus |
| 4 — Hospitality & checkout | Portal, tiket, inventaris, checkout, refund dan ready | E2E penuh serta settlement lulus |
| 5 — Pilot & hardening | Migrasi, dashboard, ekspor, backup, monitoring, admin SaaS | G1–G8 pada runbook lulus sebelum pemakaian riil |
| 6 — Growth | Gateway, billing SaaS otomatis, WhatsApp, marketplace | Review model dana, integrasi dan acceptance khusus |

Deliverable engineering: skema/migrasi database, seed demo terpisah, kontrak API, matriks izin, test cases, runbook incident/restore, panduan setup pemilik dan panduan operasi staf.

## 18. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Double booking dari persetujuan paralel | Constraint/locking database, transaksi dan pengujian concurrency |
| Bukti transfer palsu | Verifikasi dana nyata, status pending, audit dan rekonsiliasi |
| Deposit tercampur pendapatan | Ledger terpisah dan laporan liability/refund |
| Data bocor antar pemilik | Tenant-scoped authorization, RLS, private storage dan uji negatif |
| Tarif/prorata tidak disepakati | Snapshot kebijakan, preview total, contoh perhitungan dan UAT |
| Kamar sudah ditempati sebelum migrasi | Cutover dan validasi alokasi sebelum publish |
| Penghuni terlambat keluar | Tandai konflik masa depan, tindak lanjut manual; jangan konfirmasi alokasi bertabrakan |
| Scope membesar menjadi hotel/marketplace | Rilis bulanan privat dahulu; shared bed/harian dan marketplace bertahap |
| Notifikasi gagal | Retry, dashboard undelivered dan tindakan manual |
| Ketergantungan gateway | Pembayaran manual tetap tersedia, adapter dan exception queue |
| Paket SaaS habis saat operasional berjalan | Grace/restricted menjaga akses data dan kewajiban lama |

## 19. Keputusan implementasi dan konfigurasi go-live

Keputusan produk telah dibatasi untuk pengembangan v1.0.0. Tidak menunggu penetapan harga/foto untuk membangun domain; produksi tetap memerlukan konfigurasi nyata.

| Topik | Keputusan / baseline | Pemenuhan |
|---|---|---|
| Target | v1.0.0 operasional, 14 modul sesuai scope | Semua backlog P0; bukan hanya UI |
| Pilot | Palembang, mahasiswi/karyawati, 12 kamar/2 lantai, mandi dalam, token per kamar | Seed dinamis, kondisi awal inspection |
| Deposit | Default off untuk pilot; opsional untuk pemilik lain | Ledger dan test deposit tetap wajib |
| Sewa | Bulanan privat, ongoing atau akhir tetap; akhir eksklusif | BR-02/03/04 |
| Stack | React/shadcn + TypeScript API modular monolith + PostgreSQL + private storage + worker/outbox | ADR pada dokumen 03; versi dipin saat kickoff |
| Pembayaran | Transfer/cash manual, rekening pemilik; bank tidak dikendalikan platform | Verifikasi, approval, kuitansi, reversal dan refund ledger nyata |
| Notifikasi | In-app + email transaksional; WhatsApp hanya tautan manual | Worker dan adapter produksi, bukan flag simulasi |
| SaaS | Trial/paket/kuota/aktivasi manual dengan entitlement server | Tanpa auto-charge; harga komersial configurable |
| Kontrak | Account acceptance versi; tidak mengklaim tanda tangan tersertifikasi | Dokumen dan aturan final diisi pemilik |
| Kebijakan lokasi | Harga, minimum booking/check-in, siklus, notice/cancel/refund dipilih di setup | Validasi wajib sebelum publish; angka mockup bukan keputusan bisnis |
| Go-live config | Brand, alamat/foto, rekening, domain/email/storage/region, retensi/privasi, operator dukungan | Gate G6 wajib sebelum produksi; tidak menghambat coding fondasi |
| Refund authority | Owner menyetujui default; Finance mengusulkan/mencatat setelah izin | Re-auth/izin khusus dan audit; delegasi tidak default |

Kebutuhan hukum/retensi memerlukan review kebijakan pemilik; spesifikasi ini tidak menyatakan kepatuhan hukum tersertifikasi. Status persetujuan go-live ada di dokumen 06, tidak dianggap otomatis disetujui oleh penulisan dokumen.

## 20. Definition of Done dan gate rilis v1.0.0

MVP belum dinyatakan selesai hanya karena layar, data contoh atau tombol tersedia.

- Seluruh fitur MVP berjalan dengan penyimpanan nyata dan authorization server.
- Acceptance criteria relevan lulus, termasuk concurrency dan isolasi organisasi.
- E2E lengkap berhasil pada pilot 12 kamar dan organisasi kedua untuk menguji SaaS.
- Migrasi dan saldo awal direkonsiliasi serta disetujui pemilik pilot.
- Tidak ada defect kritis/tinggi yang terbuka pada booking, pembayaran, deposit atau akses data.
- Backup/restore, monitoring, alert, retry job dan runbook diuji.
- Kebijakan harga, pembatalan, privasi, retensi dan dukungan tersedia untuk pengguna.
- Staf memahami verifikasi pembayaran, check-in, tiket, settlement dan refund.
- Aplikasi lolos pemeriksaan mobile, keyboard, error state dan jaringan terputus.
- Integrasi fase berikut diberi label belum tersedia, tanpa status pembayaran/notifikasi yang disimulasikan sebagai sukses.
- Perubahan scope, keputusan terbuka dan keterbatasan dicatat dalam release notes.

## 21. Ringkasan backlog awal

| Epic | User story utama | Prioritas |
|---|---|---|
| E01 Identity & tenancy | Sebagai Owner, saya membuat organisasi dan memberi akses staf per lokasi | P0 |
| E02 Setup kost | Saya membuat lokasi, tipe dan 12 kamar lalu menambahnya secara dinamis | P0 |
| E03 Public catalog | Calon penghuni melihat fasilitas, biaya dan ketersediaan yang jelas | P0 |
| E04 Booking engine | Pengelola menerima order tanpa benturan inventori | P0 |
| E05 Billing & payment | Finance memverifikasi dana dan melacak saldo dengan benar | P0 |
| E06 Lease & check-in | Staf menyerahkan kamar dengan kontrak dan kondisi tercatat | P0 |
| E07 Recurring operations | Tagihan rutin dan pengingat berjalan tanpa duplikasi | P0 |
| E08 Resident hospitality | Penghuni mengajukan keluhan dan staf menyelesaikannya | P0 |
| E09 Checkout & settlement | Penghuni keluar dengan tagihan, deposit dan kamar tertangani | P0 |
| E10 Reporting & migration | Owner melihat laporan yang dapat direkonsiliasi dan mengimpor kondisi awal | P0 |
| E11 SaaS administration | Operator menerapkan paket/kuota tanpa mencampur data pemilik | P0 |
| E12 Automation & distribution | Owner memakai gateway, WhatsApp dan kanal marketplace | P1/P2 |

P0 berarti wajib untuk rilis MVP end to end; pembagian sprint mengikuti dependensi tahap 17. P1/P2 adalah pengembangan setelah pilot stabil.


## 22. Deliverable dan perubahan dari baseline

- Scope 14 modul: `docs/01_SCOPE_RELEASE.md`.
- Rules/state/transaction boundary: `docs/02_BUSINESS_RULES.md`.
- ADR/data/permission/security: `docs/03_ARCHITECTURE_DATA_SECURITY.md`.
- Acceptance + fixture: `docs/04_ACCEPTANCE_UAT.md`, `fixtures/UAT_CASES.csv`.
- Backlog berdependensi: `docs/05_BACKLOG.md`, `fixtures/BACKLOG.csv`.
- Release/cutover/incident/restore: `docs/06_RELEASE_RUNBOOK.md`.
- Gap mockup: `docs/07_MOCKUP_GAP_REGISTER.md`.
- Handoff dan instruksi developer: `docs/08_DEVELOPER_HANDOFF.md`.
- Kontrak API baseline: `api/openapi-v1.yaml`; contoh seed/config: `fixtures/`.

Batas penting yang diperjelas: occupant presence terpisah dari rencana alokasi; verifikasi/refund manual tetap membutuhkan ledger atomik; transaksi opening tidak menambah kas; pindah terjadwal dan lintas lokasi organisasi sama adalah requirement produksi walau mockup terbatas; report as-of tidak dihitung dari status hari ini; kuota/role/file/jadwal harus ditegakkan server. Bukti 39 domain test prototipe tidak menggantikan acceptance produksi.
