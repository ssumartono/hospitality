export type Api = (
  path: string,
  method?: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<any>;
export type Property = {
  id: string;
  name: string;
  city: string;
  timezone: string;
};
export const errorText: Record<string, string> = {
  ROOM_NOT_READY:
    "Kamar belum memenuhi kesiapan: periksa checklist, penghuni, blokir saat ini dan pekerjaan penghalang.",
  BALANCE_CONFLICT:
    "Rincian invoice dan total tidak cocok. Muat ulang dan coba lagi.",
  AVAILABILITY_CONFLICT:
    "Interval bertabrakan dengan alokasi yang sudah aktif. Periksa tanggal lain.",
  ACTIVE_PRESENCE:
    "Penghuni masih tercatat berada di kamar. Selesaikan proses keluar fisik yang sah sebelum memblokir.",
  QUOTE_EXPIRED:
    "Quote sudah kedaluwarsa. Buat quote baru sebelum melanjutkan.",
  QUOTE_CHANGED:
    "Konfigurasi kamar atau kebijakan harga berubah. Periksa quote baru dan lakukan persetujuan ulang.",
  POLICY_NOT_CONFIGURED:
    "Belum ada kebijakan yang berlaku pada tanggal masuk tersebut.",
  QUOTE_RANGE_TOO_LONG:
    "Quote dibatasi 24 periode. Pilih interval lebih pendek.",
  BOOKING_MINIMUM_EXCEEDS_INITIAL:
    "Minimum booking melebihi total periode awal. Periksa tarif, prorata dan kebijakan minimum.",
  CAPACITY_EXCEEDED: "Jumlah penghuni melebihi kapasitas kamar.",
  USAGE_EXCEEDS_PLAN:
    "Kuota baru berada di bawah pemakaian saat ini; turunkan pemakaian atau jadwalkan perubahan paket.",
  QUOTA_EXCEEDED:
    "Kuota paket tercapai. Hubungi Owner/pengelola paket sebelum menambah data.",
  SUBSCRIPTION_RESTRICTED:
    "Paket membatasi penambahan baru. Data dan kewajiban lama tetap tersedia.",
  ENTITLEMENT_NOT_CONFIGURED: "Paket belum dikonfigurasi untuk penambahan ini.",
  PROPERTY_CONFIGURATION_REQUIRED:
    "Lengkapi kode lokasi, jumlah lantai dan segmen penghuni terlebih dahulu.",
  FLOOR_IN_USE:
    "Jumlah lantai tidak dapat dikurangi karena masih ada kamar pada lantai tersebut.",
  DUPLICATE_ROOM_CODE:
    "Kode kamar sudah ada atau berulang dalam preview. Periksa daftar kode.",
  PREVIEW_INVALID:
    "Preview tidak berlaku untuk akun/lokasi ini. Buat preview baru.",
  PREVIEW_EXPIRED:
    "Preview sudah kedaluwarsa. Buat preview baru sebelum menyimpan.",
  PREVIEW_ALREADY_COMMITTED:
    "Preview ini sudah disimpan. Muat ulang daftar kamar.",
  PILOT_ALREADY_APPLIED: "Contoh pilot sudah pernah dibuat pada lokasi ini.",
  READINESS_WORKFLOW_REQUIRED:
    "Kesiapan final memerlukan proses inspeksi, alokasi dan blocker yang belum tersedia pada tahap ini.",
  MFA_REQUIRED: "Masukkan kode MFA untuk melanjutkan.",
  INVALID_MFA_CODE:
    "Kode MFA tidak berlaku, sudah dipakai, atau tantangan kedaluwarsa. Coba kode baru.",
  REAUTH_REQUIRED:
    "Konfirmasi ulang diperlukan. Masukkan kembali password dan kode MFA bila aktif.",
  EMAIL_NOT_VERIFIED:
    "Verifikasi email Anda sebelum mengundang staf atau mengaktifkan MFA.",
  LAST_OWNER_REQUIRED:
    "Organisasi harus tetap memiliki sedikitnya satu Owner aktif.",
  ALREADY_MEMBER: "Akun ini sudah menjadi staf aktif pada organisasi ini.",
  INVALID_INVITATION:
    "Undangan sudah dipakai, dicabut, kedaluwarsa, atau tidak berlaku.",
  INVALID_STATE: "Status sudah berubah. Muat ulang daftar dan coba lagi.",
  IDEMPOTENCY_MISMATCH:
    "Isian berubah dari percobaan sebelumnya. Kirim sebagai tindakan baru.",
  MFA_ALREADY_ENABLED: "MFA sudah aktif pada akun ini.",
};
