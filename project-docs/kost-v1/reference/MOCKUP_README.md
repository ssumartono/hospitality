# Kost Hospitality — Mockup modul

Prototipe React + shadcn/ui patterns, Radix UI, Tailwind CSS dan Lucide. Akses hosting tetap privat.

## Navigasi

- `#modul-4`: Publikasi Listing.
- `#modul-5`: Inquiry & Survei.
- `#modul-6`: Booking & Ketersediaan.
- `#modul-7`: Tagihan & Pembayaran.
- `#modul-8`: Kontrak & Check-in.
- Default atau `#modul-9`: Operasional penghuni.
- `#modul-10` s.d. `#modul-14`: Layanan, checkout, laporan, SaaS dan migrasi.
- `#modul-3`: Tarif & Kebijakan.
- `#modul-2`: Lokasi & Inventori Kamar.
- `#modul-1`: Akun & Onboarding (tetap tersedia).

## Modul 02

Profil lokasi dinamis, tambah/edit/arsip lokasi, tipe dan fasilitas, daftar kartu/tabel kamar, filter dan pencarian, tambah/edit/arsip/aktifkan kamar, generator massal dengan preview serta validasi kode unik per lokasi, fasilitas override, foto lokal, checklist kesiapan dan blokir interval.

Seed: Palembang, 2 lantai, 12 kamar (6 per lantai sebagai contoh), kamar mandi dalam dan listrik prabayar. Kondisi awal semua kamar perlu inspeksi. Pendinginan/furnitur belum ditentukan. Jika ada draft onboarding lokal saat pertama dibuka, profil dan jumlah awal mengikuti draft tersebut, maksimal 200 kamar seed agar preview ringan; penambahan tetap tersedia setelah seed. Maksimal 100 kamar per batch generator, bukan batas lokasi.

## Batas prototipe

Data hanya dalam localStorage browser (`kost-inventory-v2`). Foto maksimal 1 MB, JPG/PNG/WebP, tidak diunggah ke server. Tidak ada isolasi tenant server, autentikasi operasional, kontrak, pembayaran, audit permanen atau pengecekan konflik booking nyata. Blokir memiliki validasi overlap antarsesama blokir pada kamar di mockup; mesin availability produksi masih modul berikutnya. Listing tidak dipublikasikan lewat prototipe ini.

Default fasilitas tipe memengaruhi kamar yang mengikuti tipe; override tidak ditimpa. Kapasitas dan luas kamar lama tidak ditimpa edit master. Status Siap mensyaratkan lima checklist lengkap; bukan jaminan ketersediaan booking.

## Validasi yang dilakukan

- Domain: kode duplikat, kode arsip tetap unik, kode sama di lokasi berbeda, validasi lantai dan kapasitas, gate kesiapan, batch max 100 dan preview duplikat.
- Browser: edit checklist dan status Siap, filter status, generator duplikat, kamar ke-13, arsip, pencarian, tambah lokasi 3 lantai dan empty state, navigasi Modul 01 ↔ 02.
- Responsive: halaman dan dialog pada frame lebar 360 px; tidak ada horizontal overflow halaman utama.
- Build produksi menggunakan Vite.

Jalankan `npm ci`, `npm run dev`, atau `npm run build`.

## Modul 03 — Tarif & Kebijakan

Tarif dasar per lokasi, tarif tipe, override kamar, biaya satu kali/bulanan, deposit opsional (default nonaktif), listrik prabayar/termasuk/manual, anniversary atau kalender, prorata hari aktual, jatuh tempo, denda tetap opsional, pengingat konfigurasi, minimum booking, hold/review, persentase check-in, pembatalan/no-show, minimum tinggal dan notice. Preview biaya mengikuti kamar/tanggal. Booking bagian dari tagihan dan maksimum sebesar total awal. Prorata hanya komponen sewa; biaya bulanan tambahan tidak diprorata.

Nominal awal Rp1.500.000 dan booking Rp500.000 adalah ilustrasi, belum tarif usaha yang disetujui. Data tarif memakai localStorage `kost-pricing-v3`, dipisahkan per lokasi. Draft belum menjadi versi; simpan versi membuat snapshot immutable dengan tanggal berlaku hari ini/mendatang. Versi baru harus memiliki tanggal setelah versi terakhir. Riwayat versi tidak mengganti kontrak/invoice lama. Tidak ada scheduler pemberlakuan harga, invoice nyata atau pengiriman pengingat di mockup.

Validasi Modul 03: 15 domain checks untuk harga/prorata/rounding, cap booking, anchor akhir bulan, prioritas tarif, deposit, input negatif/denda/refund dan snapshot. Browser memverifikasi prorata 16/31 = Rp774.194, simpan versi dan snapshot lama saat draft berubah. Layout mobile 360 px diperiksa tanpa overflow horizontal.

## Modul 04 — Publikasi Listing

Editor konten/slug, privasi alamat kawasan/lengkap, galeri publik (maksimal 6 JPG/PNG/WebP, 2 MB input per foto; re-encode JPEG maksimal 1400px untuk menghilangkan metadata), urutan sampul dan caption, fasilitas bersama terkonfirmasi, kontak, aturan rumah, checklist publikasi, pratinjau halaman calon penghuni dan rincian biaya. Tidak mengambil foto/dokumen privat atau nomor meter dari inventori.

Versi tarif untuk publikasi harus sudah tersimpan pada Modul 03 dan tanggal berlakunya telah tercapai. Draft tarif atau versi masa depan tidak memenuhi gate. Listing baru membutuhkan minimal satu kamar aktif, foto dengan caption, kontak dan aturan. Kamar yang belum siap tetap diberi label, tidak menjanjikan availability tanggal.

Data `kost-listing-v4` dipisahkan per lokasi. Simulasi terbit membuat snapshot konten/foto/proyeksi kamar/harga/kebijakan yang tetap walau draft diedit. Tarik listing mempertahankan snapshot dan menonaktifkan tombol minat baru. Semua status lokal; Site tetap owner-private. Kontak/inquiry/survei hanya modal pratinjau dan tidak mengirim pesan atau order. Katalog ini milik organisasi pemilik, bukan marketplace lintas pemilik.

Validasi: domain checks untuk kelengkapan, tarif berlaku, slug duplikat, snapshot immutable, privasi alamat dan proyeksi data. Browser: unggah fixture gambar nonproperti, caption, gate 8/9 lalu 9/9, simpan snapshot demo, edit judul draft tanpa mengubah judul terbit, unpublish dan disabled inquiry. Layout editor/katalog diuji pada frame 360px tanpa overflow horizontal. Fixture QA hanya di browser pengujian, tidak ada dalam seed atau bundel.

## Modul 05 — Inquiry & Survei

CRM calon penghuni per lokasi: sumber minat, preferensi kamar, segmen, tanggal masuk, anggaran, penanggung jawab, tindak lanjut, catatan, dan riwayat aktivitas. Empat data contoh berlabel dapat disembunyikan. Arsip dapat dipulihkan.

Formulir inquiry dan permintaan survei di preview listing Modul 04 masuk ke Modul 05 dengan persetujuan pengguna. Permintaan survei memerlukan konfirmasi pengelola; jadwal petugas diperiksa terhadap benturan. Perubahan jadwal, pembatalan, dan tidak hadir memerlukan alasan. Hasil survei dicatat setelah jadwal berlangsung. Penjadwalan pilot menggunakan WIB (Asia/Jakarta).

Calon penghuni berstatus siap booking dapat dibuatkan draft persiapan Modul 06 sekali saja. Draft tidak menahan kamar, membuat tagihan, atau menjadi reservasi. Draft dapat diimpor sekali dari tab Draft inquiry pada Modul 06. Data inquiry dan draft disimpan bersama dalam localStorage `kost-inquiry-v5`. Tidak ada pesan yang dikirim atau backend produksi.

Validasi: build produksi; pemeriksaan logika tanggal, benturan jadwal, transisi status, persetujuan, duplikasi pengiriman, dan idempotensi draft; pengujian browser alur listing ke inquiry, konfirmasi/reschedule survei, draft booking, serta layar 360 piksel tanpa overflow horizontal.

## Modul 06 — Booking & Ketersediaan

Mockup responsive shadcn/ui dengan daftar booking, filter, rincian biaya awal, riwayat aktivitas, dan pemeriksaan interval per kamar. Skenario contoh default memakai 12 kamar fiktif terpisah dari inventori setup. Mode Data setup saya memakai lokasi/kamar Modul 02, versi kebijakan Modul 03 yang berlaku pada tanggal masuk, serta impor idempoten draft Modul 05. Data browser disimpan pada `kost-booking-v6` dengan scope `sample` dan `setup` terpisah.

Alur: draft → pending (belum menahan kamar) → accepted/held dengan tenggat kebijakan → review bukti demo atau simulasi penerimaan terverifikasi → confirmed setelah minimum terpenuhi. Minimum nol mengonfirmasi saat diterima tanpa membuat penerimaan dana. Bukti hanya berupa referensi teks, bukan upload file; satu perpanjangan review diberikan dari tenggat hold. Penolakan bukti tidak memberi perpanjangan berulang. Pembayaran parsial mempertahankan hold sampai minimum; minimum merupakan bagian dari biaya awal.

Penerimaan memeriksa ulang kamar aktif, kesiapan fisik/checklist, kapasitas, blokir operasional, dan alokasi hold/confirmed. Interval memakai tanggal masuk inklusif dan keluar eksklusif; tanpa tanggal akhir memblokir masa depan. Pembatalan/penolakan wajib beralasan. Expiry dievaluasi saat tampilan/tindakan aktif, interval 15 detik; tanpa scheduler server. Dana demo terlambat tidak mengaktifkan booking; pembatalan berbayar dan dana terlambat ditandai perlu resolusi. Tombol percepat kedaluwarsa hanya ada pada skenario contoh.

Batas: seluruh alokasi lokal browser; tidak ada transaksi database atomik lintas perangkat, kontrak aktif produksi, notifikasi, invoice, kuitansi, transfer dana, refund, atau check-in. Pembacaan ulang localStorage sebelum mutasi mengurangi stale state tetapi bukan pengganti penguncian database. Modul 07 dan 08 kini tersedia pada pembaruan berikutnya. Produksi memerlukan mesin availability dan pembayaran server, RBAC, serta isolasi organisasi sesuai PRD.

Validasi: 28 pemeriksaan logika mencakup konflik/adjacency/open-ended, blokir/kesiapan, hold/expiry, review satu kali, pembayaran parsial dan minimum nol, referensi duplikat, pelepasan alokasi, dana terlambat, snapshot tanpa deposit dan impor idempoten. Browser: pengajuan baru, penolakan benturan, penerimaan hold, parsial lalu konfirmasi, impor inquiry dan prasyarat tarif; layout daftar/grid serta dialog pada lebar 360 piksel tanpa overflow horizontal. Build produksi lulus.

## Modul 07 — Tagihan & Pembayaran

Mockup shadcn/ui responsive: invoice awal dari snapshot booking, daftar/filter saldo dan jatuh tempo, penerimaan transfer manual/kas, review/verifikasi/penolakan, kuitansi demo dengan tampilan cetak, koreksi debit/kredit beralasan, void, reversal, kredit belum dialokasikan, serta audit. Skenario contoh dan Data setup saya tetap terpisah. Nominal rupiah bulat; minimum booking tidak ditambahkan sebagai biaya kedua; deposit ditampilkan terpisah dan token prabayar tidak ditagihkan otomatis.

Invoice awal idempoten per booking. Penerimaan Modul 06 yang sudah ada dibawa sekali sebagai histori; selisih saldo awal berlabel sumber Modul 06. Seluruh ledger dan booking berada pada satu envelope localStorage `kost-booking-v6` (`finance.sample`/`finance.setup`), sehingga pembaruan saldo/status dalam satu aksi ditulis bersama. Setelah invoice dikelola Modul 07, pencatatan dana langsung di Modul 06 diblokir dan diarahkan ke Modul 07. Pembatalan/expiry booking tetap tersedia dan tidak menghapus ledger.

Pencatatan bukti/penerimaan tidak mengurangi invoice. Transfer pada hold aktif memakai satu perpanjangan review dari kebijakan Modul 06. Verifikasi mengalokasikan maksimal dana/saldo invoice; sisanya menjadi kredit. Minimum terpenuhi mengonfirmasi booking setelah pemeriksaan ulang availability. Booking tutup/expired hanya menerima verifikasi sebagai kredit dengan alokasi nol; tidak diaktifkan ulang. Nomor kuitansi dibuat hanya setelah verifikasi; reversal mempertahankan dokumen dan mengembalikan saldo serta mengevaluasi kembali minimum booking. Void hanya pada invoice tanpa dana teralokasi dan tanpa review pending. Koreksi mempertahankan baris sumber dan tidak boleh menghasilkan total negatif, di bawah minimum booking atau dana teralokasi.

Batas mockup: bukti berupa referensi teks, tidak menyimpan file sensitif. Tidak ada transfer/rekening terhubung, email/WhatsApp, kuitansi resmi/faktur pajak, refund, alokasi ulang kamar, penagihan berkala atau scheduler produksi. Alokasi kredit terbatas pada invoice awal booking yang sama; alokasi lintas invoice/kontrak dan penagihan rutin menunggu implementasi berikutnya. Audit ditampilkan untuk seluruh lokasi pada mode terpilih. RBAC server dan isolasi organisasi produksi belum diimplementasikan. Satu write browser bukan transaksi database lintas pengguna/perangkat.

Validasi: `node --test tests/finance-model.test.js` (12 tes domain) meliputi snapshot, impor/idempotensi, saldo pending vs verified, parsial, kelebihan bayar/kredit, konflik, expiry, late payment, reversal, void, adjustment, alokasi dan input invalid. Browser: catat pending → verifikasi parsial → kelebihan bayar → kuitansi → reversal; saldo dan status booking ikut berubah. Layout kartu invoice dan dialog diperiksa pada lebar 360 piksel tanpa luapan horizontal. Build produksi lulus. Dialog cetak disediakan, tanpa pengiriman atau pencetakan fisik otomatis.

## Modul 08 — Kontrak & Check-in

Mockup responsive shadcn/ui untuk draft kontrak dari booking terkonfirmasi, data penanggung jawab/penghuni dan kontak darurat opsional, snapshot periode/tarif/deposit/kebijakan, aturan hunian, penerbitan versi perjanjian, penerimaan akun penghuni demo, revisi beralasan dan penerimaan ulang. Versi dokumen terdahulu tetap utuh; dokumen dapat dipratinjau dan dicetak sebagai demo. Tidak menyimpan NIK atau file identitas. Skenario contoh terpisah dari Data setup saya; tombol Coba alur siap check-in secara eksplisit membuat booking lunas fiktif dan invoice/penerimaan demo sekali saja.

Alur: draft → issued → accepted → active. Checklist kedatangan mencakup tanggal aktual, petugas, referensi verifikasi identitas demo, inspeksi kamar, jumlah/kondisi inventaris, kesepakatan inventaris, serta jumlah/referensi dan serah terima kunci. Barang Rusak wajib diselesaikan; kondisi Catatan wajib memiliki catatan. Tanggal aktual dibedakan dari awal kontrak dan tidak mengubah invoice otomatis.

Aktivasi memeriksa ulang booking, lokasi/kamar aktif, kapasitas, versi penerimaan, kesiapan fisik/checklist Modul 02, blokir/alokasi, kontrak aktif lain, invoice awal aktif dan penerimaan teralokasi Modul 07 sesuai minimum check-in snapshot. Minimum pembayaran dapat dikecualikan oleh Owner demo dengan alasan; pengecualian tidak dapat melewati benturan, dokumen, tanggal, atau kondisi fisik. Kontrak dan booking ditulis bersama dalam envelope localStorage `kost-booking-v6`, pada `contracts.sample`/`contracts.setup`.

Setelah check-in, pembatalan dari booking diblokir. Reversal dana tidak mengeluarkan penghuni atau melepas alokasi; kekurangan pembayaran ditandai untuk tindak lanjut keuangan. Booking yang sudah check-in memblokir masa depan sampai alur checkout diimplementasikan/diselesaikan, termasuk bila tanggal kontrak rencana sudah lewat. Kamar setup dengan penghuni aktif tidak dapat diarsipkan dari Modul 02. Snapshot serah terima tetap tersimpan; kontrak aktif tidak diedit di modul ini.

Batas: semua penerimaan perjanjian, identitas, pembayaran, dan check-in adalah simulasi browser. Tidak ada login penghuni nyata, RBAC server, tanda tangan tersertifikasi, kontrak hukum siap pakai, file identitas, foto inspeksi, pesan, smart lock, atau scheduler. Penagihan berkala, perubahan kontrak aktif, operasional penghuni, dan checkout menyusul modul berikut. Pilot mengikuti tanggal WIB; kebutuhan lintas zona waktu/server dan transaksi lintas perangkat masih perlu implementasi produksi.

Validasi: `node --test tests/*.test.js` lulus 25 tes (13 kontrak/check-in + 12 regresi keuangan), termasuk idempotensi, versi/revisi, kapasitas, inventaris rusak, batas tanggal, pembayaran/override, konflik, dan perlindungan alokasi setelah reversal. Browser: skenario lunas → terbitkan v1 → penerimaan demo → aktivasi prematur diblokir → isi/simpan checklist → penghuni aktif dan ringkasan serah terima. Layout halaman dan dialog diperiksa pada lebar 360 piksel tanpa overflow horizontal. Build produksi lulus; dialog cetak disediakan tanpa pencetakan fisik otomatis.

## Modul 09–14 — Semua 14 mockup tersedia

Pembaruan melengkapi enam modul lanjutan, dengan satu navigasi dan ruang simulasi terpisah dari Data setup saya. Data lama tetap dipertahankan pada envelope `kost-booking-v6`; penambahan berada pada `ops`, `roomStates`, dan `saas`. Skenario lengkap hanya dimuat saat tombol dipilih dan tidak diduplikasi.

- **09 Operasional penghuni:** daftar penghuni aktif, simulasi terbit invoice rutin H-leadDays, anniversary dengan anchor awal dan kalender/prorata sesuai snapshot; biaya bulanan tanpa deposit/biaya sekali; idempotensi kontrak/periode; perpanjangan bertarif mendatang dengan persetujuan demo; pindah kamar hari ini dalam lokasi sama dan tarif tetap; riwayat segmen; portal penghuni demo, tiket dan pengumuman lokasi.
- **10 Layanan & kebersihan:** tiket open → assigned → in_progress → resolved → closed, reopen beralasan, petugas, jadwal/persetujuan kunjungan dan hasil kerja; tugas rutin/turnover, checklist kebersihan, inspeksi dan perbaikan. Turnover tidak dapat membuka kamar bila masih ada penghuni atau tiket aktif.
- **11 Checkout & settlement:** permohonan, persetujuan tanggal/pengecualian notice period, inspeksi akhir, pengembalian kunci, biaya akhir disepakati, keluar fisik terpisah dari saldo; alokasi dilepas tetapi kamar dirty; tugas turnover dibuat. Tagihan akhir terhubung Modul 07. Refund hanya pencatatan demo; kredit yang direfund tidak dapat dialokasikan lagi. Settlement hanya ditutup setelah saldo tagihan dan refund nol. Saldo sewa tidak dihitung ulang otomatis; koreksi invoice melalui Modul 07.
- **12 Dashboard & laporan:** okupansi dan konversi booking snapshot, saldo/overdue saat ini, kas verified, refund, pengeluaran dan sewa ditagihkan dalam periode, komposisi arus kas, pencatatan/void biaya beralasan serta ekspor CSV. Kas dapat mencakup kredit/deposit dan tidak disamakan dengan pendapatan akrual. Filter tanggal bukan rekonstruksi historis okupansi.
- **13 Langganan SaaS:** paket Trial/Basic/Pro dengan harga ilustrasi, penggunaan kamar/lokasi lintas lokasi, preview pilihan paket, penolakan downgrade di bawah penggunaan, riwayat/status expired/aktivasi ulang. Tidak ada penagihan, akses berbayar atau penegakan kuota server nyata.
- **14 Migrasi data awal:** template CSV, baca file lokal/paste, parser quoted CSV, pratinjau per baris, validasi tanggal/nominal/kamar/duplikasi/alokasi, batch maksimum 200 baris, konfirmasi pemilik, impor semua-atau-tidak-sama-sekali dan fingerprint anti-duplikasi. Penghuni existing diberi penanda migrasi; saldo awal menjadi invoice piutang, tanpa menciptakan penerimaan kas. Riwayat eksternal bukan bukti identitas, penerimaan kontrak digital, atau inspeksi check-in. Periode sebelum migrasi tidak ditagih ulang; saldo deposit lama belum diimpor pada mockup pilot tanpa deposit.

Integrasi kesiapan kamar: overlay `roomStates` dipakai modul booking, kontrak dan inventori agar kamar dirty tidak langsung dijual ulang. Kamar siap kembali setelah turnover selesai; blokir lain dan alokasi tetap diperiksa. Pindah terjadwal/lintas lokasi dan prorata pindah, perhitungan otomatis sewa akhir/refund kebijakan, pembatalan refund, file foto, scheduler, pesan resmi, RBAC, isolasi tenant server dan payment gateway belum diimplementasikan. Seluruh tampilan adalah prototipe browser lokal, bukan SaaS operasional produksi.

Validasi akhir: `node --test tests/*.test.js` lulus **39 tes** (25 regresi modul sebelumnya + 14 tes operasional/billing/tiket/checkout/refund/laporan/paket/CSV). Browser: portal → tiket → penugasan; request → approve notice exception → keluar fisik → settlement; pengeluaran dan paket Pro; CSV valid → impor → batch tersimpan; tagihan rutin → Modul 07 dengan retry menghasilkan 0 invoice ganda. Keenam halaman diperiksa pada lebar 360 piksel tanpa overflow horizontal. Build produksi lulus.
