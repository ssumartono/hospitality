# Memasang konteks ke C:\KostHospitality

Paket ini berisi konteks/dokumen; bukan kode aplikasi atau installer produksi.

1. Ekstrak ZIP ke folder sementara.
2. Salin folder `project-docs` ke `C:\KostHospitality\project-docs`. Jika path tujuan sudah berisi file berbeda, bandingkan dan gabungkan; jangan timpa perubahan lokal tanpa pemeriksaan.
3. Salin `AGENTS.md` ke `C:\KostHospitality\AGENTS.md`. Jika sudah ada, gabungkan isinya.
4. Buka folder `C:\KostHospitality` sebagai workspace Codex. Kirim prompt di bawah. Codex lokal yang memiliki akses folder harus memverifikasi file sebelum mulai coding.

## Prompt awal untuk Codex lokal

```text
Kerjakan proyek KostHospitality di C:\KostHospitality. Baca AGENTS.md dan seluruh baseline project-docs/kost-v1 sesuai urutan baca. Pakai hasil diskusi yang telah dibakukan di sana sebagai acuan produk v1.0.0; jangan mengurangi scope menjadi mockup.

Periksa repository dan perubahan yang sudah ada. Verifikasi PRD, 8 dokumen pendamping, OpenAPI, 60 acceptance criteria dan 60 story tersedia. Buat project-docs/IMPLEMENTATION_STATUS.md berisi kondisi aktual, keputusan, dependency dan evidence; jangan menganggap hasil tes lama sebagai hasil lokal. Mulai implementasi foundation auth/organisasi/RBAC/database/file privat/audit sesuai backlog, lalu lanjutkan alur end to end berdasarkan dependency. Pertahankan perubahan lokal pengguna dan laporkan blocker nyata. Aplikasi belum boleh dinyatakan siap produksi sebelum release gates lulus.
```

## Verifikasi pemasangan

Pastikan `AGENTS.md` dan `project-docs/kost-v1/PRD.md` terbaca di workspace. Di bawah folder baseline juga harus ada `docs/01_SCOPE_RELEASE.md` sampai `docs/08_DEVELOPER_HANDOFF.md`, `api/openapi-v1.yaml`, dan `fixtures/BACKLOG.json`. `MANIFEST.sha256` pada baseline memeriksa dokumen baseline saja; dua file instruksi di root paket ini berada di luar manifest tersebut.

Pemasangan dan implementasi di komputer Windows belum dilakukan oleh sesi pembuat paket ini, karena drive C: tidak terhubung.
