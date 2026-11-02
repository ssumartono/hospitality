# Panduan fondasi development

Belum panduan operasi kost produksi. Jalankan setup README. Buka localhost:5173 → Buat akun baru → isi email dan password minimal 12 karakter. Email dikirim worker ke Mailpit localhost:8025. Buka tautan lalu konfirmasi verifikasi. Masuk, buat organisasi dengan slug unik, pilih organisasi dan tambah lokasi. Data tersimpan PostgreSQL dan tetap ada sesudah reload/logout.

Lupa password tersedia pada layar masuk. Tautan reset berlaku 15 menit dan sekali pakai; setelah reset semua sesi akun dicabut. Verifikasi email berlaku 24 jam. Tidak ada role selector demo. Organisasi aktif hanya menampilkan membership yang valid di server.

Inventori kamar tersedia mulai 0.3.0; harga/quote internal tersedia mulai0.4; publikasi dan transaksi belum tersedia. Jangan mengisi rekening/identitas asli pada build ini. Harga dan konfigurasi pilot tidak dibuat otomatis. UI staf dan undangan tersedia melalui bagian Staf dan akses lokasi. File foundation hanya Owner melalui API dan tetap quarantine sampai scanner memberi clean; bukan galeri publik.

Untuk insiden/backup dan persetujuan rilis gunakan baseline docs/06_RELEASE_RUNBOOK.md. Drill restore belum dilakukan; G5 bukan PASS. Penggunaan riil menunggu seluruh acceptance dan G1–G8.

## Keamanan dan tim (0.2.0)

Refresh aplikasi dan login kembali jika sesi sudah habis. Organisasi/lokasi tidak perlu dibuat ulang. Pada Keamanan akun, gunakan Mulai aktivasi MFA, konfirmasi password, masukkan kunci ke aplikasi authenticator dan konfirmasi 6 digit. Simpan sepuluh kode pemulihan; hanya ditampilkan sekali dan masing-masing sekali pakai. Login berikutnya meminta authenticator atau kode pemulihan. Untuk menonaktifkan, konfirmasi password dan kode MFA/pemulihan. Reset password tidak menonaktifkan MFA.

Owner dapat membuka Staf dan akses lokasi. Masukkan email tujuan, pilih peran dan lokasi (Owner berlaku semua lokasi), lalu password konfirmasi. Jika MFA aktif, gunakan kode berikutnya yang belum dipakai. Email undangan berlaku 72 jam dan dapat dilihat di Mailpit lokal. Penerima masuk/daftar dengan email yang cocok, verifikasi, buka tautan undangan dan pilih Terima undangan staf.

Ubah akses mengatur role dan lokasi dengan alasan. Cabut akses menolak request organisasi berikutnya, sementara organisasi lain milik akun tetap dapat diakses. Owner terakhir tidak bisa dicabut/didemote. Cabut undangan hanya membatalkan undangan pending; untuk undangan yang sudah diterima, cabut membership stafnya. Status Diterima server email hanya penerimaan SMTP, bukan bukti delivered ke inbox produksi.

## Inventori (0.3.0)

1. Refresh http://localhost:5173, masuk dan pilih organisasi yang sudah dibuat. Klik Inventori.
2. Pilih lokasi. Owner mengisi Profil lokasi: kode unik, jumlah lantai, segmen penghuni dan detail yang benar-benar diketahui. Jangan mengisi angka/alamat contoh sebagai data nyata.
3. Buka Tipe kamar, tambahkan kapasitas dan fasilitas aktual. Default baru tidak mengubah kamar lama.
4. Generator kamar → Pilot 12 kamar menampilkan contoh yang dapat diedit. Konfirmasikan kode/lantai bangunan, tampilkan preview, lalu centang persetujuan kode dan layout sebelum simpan. Bisa memakai urutan/manual. Mengulang seed pilot tidak menggandakan kamar.
5. Tambah kamar untuk kamar berikutnya; lokasi tambahan dibuat pada bagian lokasi lalu dilengkapi profil/tipe sendiri.
6. Isi checklist kamar setelah pemeriksaan fisik. Status tetap Perlu inspeksi sampai workflow kesiapan lengkap tersedia. Mengubah konfigurasi kamar mereset checklist saat ini dan menyimpan histori audit.

Owner/Manager berizin lokasi mengelola tipe dan kamar; Operations mengisi checklist; Finance hanya membaca inventori. Kartu kuota lokal TEST_ONLY tidak menunjukkan harga/paket produksi. Jika kuota habis, expired atau restricted, penambahan ditolak tanpa menghapus data. Hubungi pengelola deployment; Owner tidak mengubah entitlement lewat UI.

Belum tersedia: publikasi, booking, pembayaran, kontrak/check-in sampai checkout. Harga/quote internal tersedia pada0.4. Jangan memperlakukan kondisi fisik sebagai ketersediaan sewa.

## Tarif dan quote internal (0.4.0)

1. Buka Harga dan kebijakan, pilih lokasi, klik Muat ulang harga sesudah menambah tipe/kamar.
2. Buat versi kebijakan. Isi harga dasar dan semua angka kebijakan yang sudah diputuskan (nol bila benar-benar nol), pilih siklus/prorata/listrik serta waktu mulai dalam zona lokasi. Deposit/denda hanya diaktifkan bila memang disepakati. Jangan memakai nominal pengujian sebagai tarif kost.
3. Bila perlu isi override tipe/kamar. Kosong mengikuti tarif induk; nol berarti tarif gratis yang eksplisit. Biaya tambahan memiliki frekuensi sekali/bulanan serta sifat refundable. Tarif token listrik tidak ditagih otomatis.
4. Simpan versi. Perubahan berikut selalu membuat versi baru; riwayat tidak ditimpa. Anniversary menagih satu periode penuh, kalenderactual memprorata sewa saja.
5. Hitung quote internal: pilih kamar, tanggal masuk/akhir eksklusif dan jumlah penghuni. Akhir kosong hanya periode awal. Periksa rincian, total awal, minimum booking dan sisa. Minimum booking bukan tambahan total.
6. Simpan/catat ID quote untuk membuka snapshot lagi sesudah reload dengan akun yang membuat. Berlaku15menit; quote expired hanya histori. Perubahan tarif membutuhkan quote baru sebelum consent/booking mendatang.

Quote internal tidak memesan kamar, menjamin ketersediaan, menerbitkan tagihan atau mencatat penerimaan uang. Public consent/booking/ledger dan workflow transaksi masih dikembangkan. Finance dapat membaca kebijakan tetapi tidak membuat versi/quote internal; Operations tidak mengakses harga privat.

## Kalender kamar (0.5.0)

1. Refresh aplikasi, pilih organisasi, klik Kalender kamar. Pilih lokasi dan kamar. Bila kamar baru dibuat, klik Muat ulang kalender.
2. Periksa interval: tanggal mulai wajib, tanggal akhir opsional dan eksklusif. Akhir kosong berarti tanpa batas akhir. Lihat alasan belum tersedia; pemeriksaan tidak menahan kamar.
3. Owner/Manager lokasi dapat menambah blokir operasional, misalnya perbaikan yang memang dijadwalkan. Isi tanggal dan alasan aktual. Konflik alokasi/penghuni tidak bisa diabaikan; ubah rencana yang sah melalui workflow terkait.
4. Sesudah blokir tidak diperlukan, isi alasan lepas pada kartu blokir lalu Lepas blokir. Histori tetap ada; kamar tetap perlu inspeksi bila sebelumnya demikian. Ulangi pemeriksaan interval.

Finance/Operations hanya membaca kalender lokasi berizin. Kondisi fisik, interval alokasi dan keberadaan penghuni berbeda. Tanggal akhir kontrak atau blokir dilepas tidak otomatis menandai siap/kosong. Accept booking/check-in/checkout belum tersedia pada build0.5; jangan merekam presence melalui edit database sebagai pengganti workflow.

## Booking petugas sampai invoice (0.6.0)

Lengkapi checklist di Inventori, lalu buka Booking dan invoice dan muat ulang. Catat Kesiapan awal hanya setelah pemeriksaan nyata; kamar bekas penghuni wajib turnover mendatang. Hitung quote baru sesudah perubahan kondisi, baca semua biaya/aturan, kemudian Periksa quote booking. Kontak calon penghuni diisi minimum; akun calon penghuni tidak dijadikan staf.

Pilih customer baru/yang berizin, isi rencana bulan, catatan konfirmasi dan centang hanya bila konfirmasi memang ada. Ini pencatatan petugas, bukan penerimaan perjanjian oleh akun penghuni. Akhir kosong tetap ongoing meskipun rencana bulan diisi; tidak otomatis menandai kosong. Simpan menghasilkan Menunggu persetujuan tanpa menahan kamar.

Owner/Manager berizin meninjau lalu mengisi alasan Setujui booking. Jika kamar tidak siap/konflik atau quote expired/berubah, permintaan ditolak server tanpa efek parsial. Hitung quote baru di Harga dan kebijakan, jelaskan ulang dan buka Perbarui quote dan konfirmasi pada kartu pending bila diperlukan. Finance hanya membaca transaksi, Operations tidak membaca kontak/invoice.

Persetujuan menerbitkan invoice awal dan alokasi: minimum>0 Menunggu pembayaran minimum; minimum0 Booking dikonfirmasi tanpa penerimaan uang. Invoice total>0 tetap Belum dibayar atau Lewat jatuh tempo. Tidak ada tombol lunas. Worker memproses expiry hold dan notifikasi in-app; Muat ulang booking untuk status terbaru. Histori invoice void tetap disimpan. Booking confirmed0 tidak otomatis expired meski invoice belum dibayar.

Belum dapat unggah/verifikasi pembayaran, mencatat receipt/deposit/kredit, membatalkan booking accepted/refund, check-in atau settlement. Jangan mencatat uang palsu lewat perubahan database. Email bisnis pelanggan belum diaktifkan; in-app bukan bukti pengiriman email. Gunakan data uji sampai seluruh acceptance/gate diselesaikan.
