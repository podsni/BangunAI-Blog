# Changelog

Catatan perubahan penting pada BangunAI Blog. Tanggal menggunakan format `YYYY-MM-DD`.

## 2026-11-02

### Tampilan dan navigasi

- Memperbarui beranda dengan tata letak editorial: hero taman digital, sorotan tulisan terbaru, arsip ringkas, catatan Daily, dan koleksi "Sedang dibaca".
- Menyelaraskan navbar, kartu tulisan, footer, dan pemilih tema dengan gaya visual baru, tampilan responsif, serta mode terang dan gelap.

### Berbagi dan pratinjau tautan

- Memperbarui panel berbagi dengan WhatsApp, X, menu berbagi perangkat, salin tautan bersih, dan caption untuk Instagram/TikTok.
- Menambahkan kartu Story PNG vertikal 1080 × 1920 (9:16) yang dapat dibagikan melalui perangkat atau diunduh sebagai fallback.
- Menambahkan judul, deskripsi, URL kanonis, metadata Open Graph, Twitter Card, dan waktu publikasi yang mengikuti halaman/konten aktif.
- Menghasilkan halaman HTML dengan metadata pratinjau untuk artikel, writing, bacaan, dan Daily saat `postbuild`, sehingga crawler sosial tidak bergantung pada JavaScript di browser.
- Menghasilkan `sitemap.xml` dan menambahkan referensinya pada `robots.txt`.

### Konfigurasi Cloudflare Pages

- Menambahkan konfigurasi Pages pada `wrangler.toml` dengan direktori hasil build `dist`.
- Menambahkan fallback SPA melalui `public/_redirects` agar rute aplikasi dapat dibuka langsung.

### Referensi commit

- `7227178` — meningkatkan berbagi sosial dan pratinjau tautan.
- `3cbafbd` — memperbarui beranda editorial.
- `c3dfdfe` — menambahkan konfigurasi Cloudflare Pages.
- `9143167` — menambahkan fallback SPA Cloudflare Pages.
