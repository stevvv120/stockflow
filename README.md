# StockFlow: Inventory & Supply Chain Management

Aplikasi bisnis untuk mengelola produk, stok multi-gudang, procurement, pemenuhan pesanan, penjualan, dan laporan.

**Versi aplikasi:** 1.1.0

**Demo:** belum tersedia; aplikasi ini belum dideploy.

StockFlow saat ini ditujukan untuk **satu usaha**. Jangan gunakan satu instalasi untuk beberapa usaha yang datanya harus terpisah.

![Dashboard StockFlow](docs/screenshots/dashboard.png)
![Kasir StockFlow](docs/screenshots/kasir.png)
![Laporan StockFlow](docs/screenshots/laporan.png)

## Fitur

- **Autentikasi dan role**: login JWT, akses Admin dan Staff dipisah di backend
- **Produk dan kategori**: tambah, edit, hapus, cari, filter
- **Inventori**: barang masuk, penyesuaian stok, riwayat pergerakan stok
- **Multi-warehouse**: saldo fisik dan reservasi per gudang, transfer antar-gudang, stok tersedia, dan saran restok yang dapat ditinjau sebelum menjadi draft PO
- **Procurement**: supplier, purchase order, persetujuan Admin, dan penerimaan parsial/penuh
- **Pesanan dan pengiriman**: reservasi stok saat pesanan dibuat, persetujuan Admin, status/resi pengiriman, dan invoice saat pesanan dikirim
- **Audit log**: jejak perubahan stok, procurement, pesanan, pengiriman, dan penjualan
- **Kasir**: keranjang, total dihitung di server, invoice otomatis
- **Dashboard dan laporan**: grafik penjualan, stok menipis, produk terlaris, laba kotor, rentang laporan cepat, ekspor CSV
- **Kemudahan operasional**: navigasi responsif, pencarian dan penyortiran produk, filter transaksi dan stok, serta cetak struk penjualan

## Teknologi

React, TypeScript, Vite, Recharts, Node.js, Express, MySQL (mysql2), JWT, bcrypt, Vitest

## Keputusan teknis

- **Database transaction**: penjualan, item, pengurangan stok, dan riwayat stok disimpan dalam satu transaksi. Jika satu langkah gagal, semuanya dibatalkan.
- **Anti-oversell**: `SELECT ... FOR UPDATE` mengunci baris produk, sehingga dua kasir tidak bisa menjual stok terakhir yang sama. Ini diuji dengan tes konkurensi.
- **Harga tidak dipercaya dari klien**: total dihitung server dari harga di database.
- **Snapshot harga**: `unit_price` dan `unit_cost` disalin ke `sale_items`, jadi laporan lama tidak berubah.
- **Riwayat stok**: setiap perubahan stok punya catatan jenis, jumlah, pelaku, dan alasan.
- **Saldo gudang**: `warehouse_stocks` adalah sumber stok fisik dan reservasi per lokasi; `products.stock` tetap menjadi total agregat untuk kompatibilitas katalog/laporan lama.
- **Reservasi**: pesanan pelanggan mengunci stok tersedia tanpa mengurangi stok fisik. Penolakan atau pembatalan sebelum pengiriman melepas reservasi; pengiriman mengurangi stok dan membuat transaksi penjualan dalam satu transaksi database.
- **Penerimaan PO**: penerimaan parsial maupun penuh memperbarui saldo gudang, agregat produk, movement, dan status PO secara atomik.
- **Migrasi data**: stok lama dialokasikan ke gudang `MAIN` tanpa menghapus data pergerakan maupun penjualan.
- **Query berparameter** untuk mencegah SQL injection; password di-hash dengan bcrypt.
- **CSV aman**: sel yang diawali `=`, `+`, `-`, atau `@` dinetralkan agar tidak dieksekusi sebagai rumus Excel.

## Struktur proyek

```text
stockflow/
├── backend/    # Express API (routes, services, middleware)
├── database/   # Skema dan migrasi database
├── docs/       # ERD, dokumentasi API, dan screenshot
└── frontend/   # React + TypeScript (Vite)
```

## Instalasi (Windows PowerShell)

Prasyarat: Node.js 22+, MySQL atau MariaDB, dan Git.

Jalankan perintah berikut dari folder tempat Anda ingin menyimpan proyek:

```powershell
git clone https://github.com/stevvv120/stockflow.git
Set-Location .\stockflow

# Buat database aplikasi dari skema
Get-Content .\database\schema.sql | mysql -u root

# Siapkan backend
Set-Location .\backend
Copy-Item .\.env.example .\.env
# Edit .env: kredensial MySQL, JWT_SECRET acak minimal 32 karakter,
# dan ADMIN_PASSWORD unik minimal 10 karakter.
# Gunakan secret yang sama pada semua instance backend; perubahan secret mengharuskan login ulang.
npm install
npx tsx src/seed.ts
npm run dev
```

Jalankan frontend dari terminal PowerShell kedua. Ganti jalur contoh berikut dengan lokasi folder proyek hasil clone:

```powershell
Set-Location "C:\path\to\stockflow\frontend"
Copy-Item .\.env.example .\.env
npm install
npm run dev
```

Frontend tersedia di `http://localhost:5173` dan backend di `http://localhost:5000`.

Admin dibuat dari `ADMIN_EMAIL` dan `ADMIN_PASSWORD` di `backend/.env`. Jangan gunakan kata sandi contoh atau kredensial yang dibagikan kepada orang lain.

## Persiapan deployment

Belum ada deployment production yang disediakan. Untuk menjalankan instalasi satu usaha:

1. Siapkan MySQL/MariaDB dengan backup terjadwal dan uji proses pemulihan backup sebelum mengimpor data bisnis.
2. Backend: set `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` sebagai environment variables pada host. `JWT_SECRET` harus acak dan minimal 32 karakter; `CORS_ORIGIN` harus berisi origin frontend yang tepat (beberapa origin dipisahkan koma). Backend tidak akan mulai jika `CORS_ORIGIN` kosong.
3. Impor `database/schema.sql` hanya untuk database baru. Untuk database lama, buat dan verifikasi backup terlebih dahulu, lalu tinjau dan jalankan migrasi yang sesuai tepat satu kali. Jangan menjalankan skema dasar atau migrasi pada database berisi data tanpa memastikan target dan backup.
4. Jalankan `npm ci`, `npm run build`, lalu `npm run start` di `backend`. Endpoint `/api/health` memeriksa koneksi database.
5. Frontend: set `VITE_API_URL` ke URL HTTPS backend yang diakhiri `/api` **di environment build frontend**, bukan environment backend. Jalankan `npm ci` dan `npm run build`; sajikan folder `frontend/dist` melalui host web yang mendukung fallback SPA.
6. Buat akun admin dengan kredensial unik, masuk, periksa gudang dan stok awal, lakukan transaksi uji yang dapat dibatalkan, dan pastikan backup serta pemantauan host aktif sebelum operasional.

Jangan masukkan file `.env`, kata sandi, atau secret ke Git. Jangan gunakan database production untuk menjalankan tes.

## Pengujian dan pemeriksaan rilis

GitHub Actions menjalankan lint/build frontend serta build dan tes integrasi backend pada push ke `main` dan pull request. Tes backend menggunakan MySQL khusus (`stockflow_test`); tes akan berhenti jika `DB_NAME` bukan nama database tersebut.

Tes integrasi **menghapus data di tabel** sebelum setiap tes. Jangan arahkan konfigurasi tes ke database yang berisi data penting. Tes memakai database terpisah bernama `stockflow_test`.

Dari folder root proyek, jalankan perintah berikut di PowerShell untuk membuat database tes dan tabel-tabelnya dari skema aplikasi:

```powershell
mysql -u root -e "CREATE DATABASE IF NOT EXISTS stockflow_test;"
$schema = (Get-Content .\database\schema.sql -Raw) -replace 'USE stockflow;', 'USE stockflow_test;'
$schema | mysql -u root
```

Sesuaikan opsi `mysql` jika instalasi MySQL Anda membutuhkan username, password, atau host tertentu. Setelah itu, jalankan tes:

```powershell
Set-Location .\backend
npm test
```

Tes mencakup penjualan berhasil/gagal dan konkurensi stok terakhir, transfer antar-gudang, reservasi dan fulfillment pesanan hingga invoice, serta persetujuan dan penerimaan PO parsial.

## Dokumentasi

- [Dokumentasi API](docs/API.md)
- [ERD database](docs/ERD.md)

## Memperbarui database StockFlow yang sudah ada

Jangan jalankan skema dasar untuk menimpa database yang sudah berisi data. Buat backup database terlebih dahulu, lalu jalankan migrasi ini **satu kali** pada database StockFlow lama:

```powershell
Get-Content .\database\migrations\001_business_workflows.sql | mysql -u root stockflow
```

Sesuaikan opsi `mysql` dengan konfigurasi lokal. Migrasi membuat gudang `MAIN` dan memindahkan saldo `products.stock` saat ini ke gudang tersebut. Stok lama tidak dikosongkan atau dihapus. Untuk instalasi baru, gunakan `database\schema.sql` seperti pada petunjuk instalasi.

Pesanan pelanggan menjadi transaksi penjualan saat pengiriman ditandai **shipped**; saat itu stok fisik dikurangi. Status `in_transit` dan `delivered` melanjutkan pelacakan, sementara pembatalan hanya diperbolehkan sebelum pengiriman.
