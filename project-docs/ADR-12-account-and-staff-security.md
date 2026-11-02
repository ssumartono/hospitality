# ADR-12 — Keamanan akun dan staf

1 November 2026. Status implementasi bertahap; bukan approval produksi.

B01/B02 dilanjutkan sebelum inventori. Data organisasi/lokasi pengguna dipertahankan dengan migrasi tambahan, tanpa reset database. UI baru di localhost tetap development.

## Klarifikasi kontrak sebelum command terkait

OpenAPI baseline ReauthRequest hanya password/mfaCode, sedangkan deskripsi normatif mewajibkan token scoped action. Kontrak implementasi menambah action, organizationId dan targetId. Token acak hashed berlaku 5 menit, terikat user + session + aksi + organisasi + target, sekali pakai dalam transaksi command. Ini perincian kontrak keamanan, bukan perubahan izin produk. Header X-Reauth-Token digunakan untuk enrollment/undangan/revoke; scope-change memakai field reauthToken sesuai baseline. Semua mutasi staf memakai Idempotency-Key. Re-auth diwajibkan pada seluruh perubahan akses, termasuk undangan; penambahan Owner tidak punya jalur tanpa konfirmasi ulang.

MFA menggunakan TOTP SHA1/6 digit/30 detik, window ±1, secret terenkripsi AES-256-GCM, counter anti replay, enrollment terkonfirmasi dan recovery code acak sekali pakai. Akun dengan MFA mendapat session pending setelah password; tenant API tetap ditolak sampai challenge MFA berhasil. Challenge login 5 menit/5 percobaan; enrollment 10 menit. Enrollment/disable mencabut sesi lain. Password reset tidak menonaktifkan MFA. Tidak ada bypass reset MFA oleh staf/platform.

Invitasi 72 jam dikirim ke email lokal Mailpit, token tidak dikembalikan dalam response create. Penerima harus login dengan email yang cocok dan terverifikasi. Owner mencakup semua lokasi (propertyIds kosong); role lain wajib minimal satu lokasi valid organisasi yang sama. Keanggotaan aktif tidak ditimpa dengan accept invitation; membership yang dicabut dapat diaktifkan kembali lewat undangan baru. Token kedaluwarsa/revoked/used tidak berlaku. Pencabutan membership tidak mengeluarkan akun dari organisasi lain, tetapi request tenant berikutnya ditolak.

Policy memberships lama default ALL terlalu luas untuk bootstrap membership; diubah menjadi SELECT-self dan bootstrap-Owner terbatas organisasi yang baru dibuat oleh actor, plus mutasi staf melalui fungsi database yang memeriksa Owner aktif dan organisasi di dalam transaksi. Fungsi SECURITY DEFINER memakai search_path tetap dan grant execute terbatas. Owner terakhir dilindungi pada database, termasuk konkurensi. Relasi organisasi/membership immutable.

Secret MFA dan token email memakai encryption key dari APP_ENCRYPTION_KEY di produksi. Development otomatis membuat .local/encryption.key (di-ignore; jangan hapus atau rotasi tanpa prosedur migrasi). Token plaintext lama dibackfill menjadi ciphertext sebelum constraint encrypted-only diaktifkan. Role worker terpisah, tanpa izin tabel keuangan/tenant selain antrean email dan metadata undangan yang diperlukan; handler tenant selalu membawa organisasi. SMTP tetap at-least-once, tidak menjamin delivered produksi atau dedup crash provider.

Tidak menambahkan harga, rekening, fasilitas atau data kamar pengguna. Matriks izin dan acceptance penuh tetap memerlukan evidence, bukan otomatis DONE karena layar tersedia.

Tes self-revocation menemukan hasil idempotency gagal disimpan setelah actor kehilangan membership. Migration 008 hanya mengizinkan INSERT hasil milik actor pada organisasi context yang sama; SELECT tetap membutuhkan membership aktif. Handler memeriksa izin sebelum menjalankan command/cache. Pencabutan akses dan penyimpanan hasil dapat commit atomik tanpa membuka pembacaan data setelah revoke.
