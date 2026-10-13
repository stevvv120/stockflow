# StockFlow: Inventory & Sales Management System

Aplikasi web untuk mengelola produk, memantau stok, mencatat penjualan, dan melihat laporan bisnis.

**Demo:** isi setelah deployment.

![Dashboard StockFlow](docs/screenshots/dashboard.png)
![Kasir StockFlow](docs/screenshots/kasir.png)
![Laporan StockFlow](docs/screenshots/laporan.png)

## Fitur

- **Autentikasi dan role**: login JWT, akses Admin dan Staff dipisah di backend
- **Produk dan kategori**: tambah, edit, hapus, cari, filter
- **Inventori**: barang masuk, penyesuaian stok, riwayat pergerakan stok
- **Kasir**: keranjang, total dihitung di server, invoice otomatis
- **Dashboard dan laporan**: grafik penjualan, stok menipis, produk terlaris, laba kotor, ekspor CSV

## Teknologi

React, TypeScript, Vite, Recharts, Node.js, Express, MySQL (mysql2), JWT, bcrypt, Vitest

## Keputusan teknis

- **Database transaction**: penjualan, item, pengurangan stok, dan riwayat stok disimpan dalam satu transaksi. Jika satu langkah gagal, semuanya dibatalkan.
- **Anti-oversell**: `SELECT ... FOR UPDATE` mengunci baris produk, sehingga dua kasir tidak bisa menjual stok terakhir yang sama. Ini diuji dengan tes konkurensi.
- **Harga tidak dipercaya dari klien**: total dihitung server dari harga di database.
- **Snapshot harga**: `unit_price` dan `unit_cost` disalin ke `sale_items`, jadi laporan lama tidak berubah.
- **Riwayat stok**: setiap perubahan stok punya catatan jenis, jumlah, pelaku, dan alasan.
- **Query berparameter** untuk mencegah SQL injection; password di-hash dengan bcrypt.
- **CSV aman**: sel yang diawali `=`, `+`, `-`, atau `@` dinetralkan agar tidak dieksekusi sebagai rumus Excel.

## Struktur proyek

```text
stockflow/
├── backend/    # Express API (routes, services, middleware)
├── database/   # Skema database
├── docs/       # ERD, dokumentasi API, dan screenshot
└── frontend/   # React + TypeScript (Vite)
```

## Instalasi (Windows PowerShell)

Prasyarat: Node.js 20+, MySQL atau MariaDB, dan Git.

Jalankan perintah berikut dari folder tempat Anda ingin menyimpan proyek:

```powershell
git clone https://github.com/stevvv120/stockflow.git
Set-Location .\stockflow

# Buat database aplikasi dari skema
Get-Content .\database\schema.sql | mysql -u root

# Siapkan backend
Set-Location .\backend
Copy-Item .\.env.example .\.env
# Edit .env dan sesuaikan kredensial MySQL serta JWT_SECRET
npm install
npx tsx src/seed.ts
npm run dev
```

Jalankan frontend dari terminal PowerShell kedua. Ganti jalur contoh berikut dengan lokasi folder proyek hasil clone:

```powershell
Set-Location "C:\path\to\stockflow\frontend"
npm install
npm run dev
```

Frontend tersedia di `http://localhost:5173` dan backend di `http://localhost:5000`.

Akun contoh untuk pengembangan: `admin@stockflow.test` / `admin123` dan `staff@stockflow.test` / `staff123`.

## Pengujian backend

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

Tes mencakup penjualan berhasil, stok tidak cukup (tanpa perubahan data), input tidak valid, penggabungan item, dan dua penjualan bersamaan untuk stok terakhir.

## Dokumentasi

- [Dokumentasi API](docs/API.md)
- [ERD database](docs/ERD.md)
