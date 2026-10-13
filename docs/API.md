# Dokumentasi API

Base URL: `http://localhost:5000/api`

Semua endpoint kecuali login membutuhkan header `Authorization: Bearer <token>`.
Respons error berbentuk `{ "message": "..." }`.

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| POST | `/auth/login` | Publik | Login, mengembalikan token JWT dan data user |
| GET | `/auth/me` | Login | Data user dari token |
| GET | `/products?search=&category_id=` | Login | Daftar produk, dengan pencarian dan filter |
| POST | `/products` | Admin | Tambah produk (stok awal ikut tercatat) |
| PUT | `/products/:id` | Admin | Ubah produk (tidak mengubah stok) |
| DELETE | `/products/:id` | Admin | Hapus produk (ditolak jika sudah punya riwayat) |
| GET | `/categories` | Login | Daftar kategori |
| POST | `/categories` | Admin | Tambah kategori |
| POST | `/stock` | Admin | Barang masuk atau penyesuaian stok |
| GET | `/stock/movements?product_id=` | Login | Riwayat pergerakan stok |
| POST | `/sales` | Login | Buat transaksi penjualan |
| GET | `/sales` | Login | Riwayat transaksi |
| GET | `/sales/:id` | Login | Detail invoice |
| GET | `/reports/dashboard` | Login | Ringkasan dashboard |
| GET | `/reports/sales?from=&to=` | Admin | Laporan penjualan per periode |
| GET | `/reports/sales/export?from=&to=` | Admin | Unduh laporan CSV |

## Contoh: login

```json
POST /auth/login
{ "email": "admin@stockflow.test", "password": "admin123" }
```

Respons `200`:

```json
{ "token": "eyJ...", "user": { "id": 1, "name": "Admin", "email": "admin@stockflow.test", "role": "admin" } }
```

## Contoh: buat penjualan

```json
POST /sales
{ "items": [ { "product_id": 1, "quantity": 2 } ] }
```

Respons `201`:

```json
{ "id": 7, "invoice_number": "INV-20261013-00007", "total_amount": 7000 }
```

Total dihitung di server dari harga database, bukan dari klien.

## Kode status

| Kode | Arti |
|---|---|
| 400 | Input tidak valid |
| 401 | Belum login atau token tidak valid |
| 403 | Role tidak punya akses |
| 404 | Data tidak ditemukan |
| 409 | Konflik: SKU ganda, stok tidak cukup, atau produk punya riwayat |