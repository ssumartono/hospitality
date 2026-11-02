# ADR-15 — Alokasi interval, presence dan snapshot booking

2 November2026. Implementasi bertahap B07.1/B03.3/B04.3.

Alokasi hold/stay/block memakai daterange [start,end), endnull=infinity, exclusion constraint GiST tenant+room. Release eksplisit, bukan predicateNOW. Presence fisik terpisah dengan unique aktif per kamar dan lease, FK ke lease; akhir kontrak/alokasi tidak mengakhiri presence. Tabel booking/lease adalah fondasi typed dengan compositeFK, tanpa command accept/check-in sebelum invoice/identitas/financial/agreements siap. Runtime hanya membaca fondasi dan menulis blokir melalui service, tidak dapat memasukkan hold/stay/presence palsu. Tes raw concurrency memakai fixture admin kost_test; belum bukti dua accept booking penuh.

API/UI blokir operasional interval tersedia Owner/Manager lokasi, audit/reason/idempotency/version, histori tidak dihapus. Block dan allocation dibuat/dilepas dalam satu transaksi; constraint trigger deferred mencegah orphan/mismatch. Semua mutasi memakai lock lokasi yang sama dengan inventori lalu roomrow, exclusion jadi pertahanan terakhir. Presence aktif menolak blokir yang menyembunyikan penghuni; baca availability tetap menolak presence meskipun alokasi berakhir. Membatalkan block tidak mengubah kondisi fisik.

Availability internal hanya inspeksi saat query: aktif/tidak arsip, ready, bebas overlap dan tidak ada presence. Memuat reason codes, tidak menjamin reservasi. Belum expose mark-ready/archive karena blocker workorder/ticket/turnover belum lengkap. Kamar inspection tetap tidak available walaupun kalender kosong.

prepareBookingPricingSnapshot service memvalidasi quote actor/expiry, room version dan policy yang berlaku pada tanggal masuk sebelum meng-copy snapshot immutable untuk command booking mendatang. Quote end untuk preview awal tidak dipakai sebagai akhir komitmen ongoing: requestedEnd dari request asli dapat null. Tidak membuat consent pelanggan palsu; helper tidak mengubah status/menyimpan transaksi sendiri. Snapshot lease/invoice/amendment diintegrasikan saat domain tersebut dibangun; B04.3 belum selesai penuh.

Tidak ada harga/booking/presence pengguna yang di-seed, tidak melepas komitmen karena deadline/date-only, tidak menambah penerimaan kas.
