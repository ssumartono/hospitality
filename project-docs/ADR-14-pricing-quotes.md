# ADR-14 — Kebijakan harga dan quote internal

2 November 2026. B04.1/B04.2 bertahap; baseline BR-04, AC-09/11/31/32.

Satu versi kebijakan lengkap per lokasi, immutable dan berurutan. Override kamar → tipe → base; override nol sah. effectiveAt adalah timestamp UTC, dipilih pada awal tanggal masuk di zona lokasi. Koreksi/backdate merupakan versi baru dan hanya memengaruhi quote baru; tidak menimpa snapshot. expectedVersion wajib untuk mencegah overwrite antar pengelola. Scope Owner/Manager lokasi menulis, Finance membaca; Operations tidak mengakses harga privat. Tidak memasang harga usaha atau rekening otomatis.

Quote internal dihitung server dan disimpan dengan actor, versi policy/kamar, request, hasil snapshot serta expiry teknis 15 menit. Quote bukan invoice, persetujuan pelanggan, reservasi ataupun bukti availability. Public/consent/booking masih dependency berikutnya. Snapshot booking/lease/invoice/amendment B04.3 belum diklaim selesai.

Tanggal akhir eksklusif. End kosong menghitung periode awal saja dan memberi flag initialPeriodOnly. Rent calendar actual dibagi per bulan kalender, half-up per baris dengan BigInt. Biaya monthly utuh pada setiap periode yang disentuh; once/deposit sekali. Anniversary memakai anchor tanggal masuk asli untuk setiap batas (31 Jan→28 Feb→31 Mar), bukan anchor yang terpotong. Sesuai PRD FR-03, anniversary selalu menagih satu periode penuh termasuk preview akhir parsial. Prorata actual hanya untuk calendar; aturan early checkout terpisah pada snapshot/settlement mendatang. Pilihan prorata berlaku pada rent saja. Preview maksimal 24 periode untuk membatasi resource; scheduler mendatang memakai generator periode yang sama.

Minimum booking harus tidak melebihi total awal; ini bagian total, bukan tambahan. Persentase check-in dihitung ceil total awal; required check-in setidaknya booking minimum. Deposit off harus amount0. Penalty off harus amount/cap/grace0; on memerlukan amount>0, cap>=amount. Tidak ada penagihan denda/early-exit otomatis pada fase ini. Refund/notice disnapshot tanpa mengeksekusi uang. Discounts helper tidak menghasilkan baris negatif; workflow override diskon belum di UI.

Policy scalar/fee config adalah JSON domain tervalidasi Zod strict, bukan generic resource attributes; DB menyimpan versi append-only, typed scope/effective_at/base_rent dan override rows dengan composite FK. Tenant RLS, grants INSERT/SELECT saja, audit dan idempotency dalam transaksi. Pricing tidak menciptakan penerimaan kas.
