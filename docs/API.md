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
| POST | `/stock` | Admin | Barang masuk atau penyesuaian stok pada gudang |
| GET | `/stock/movements?product_id=&warehouse_id=` | Login | Riwayat pergerakan stok |
| POST | `/sales` | Login | Buat transaksi penjualan langsung pada gudang |
| GET | `/sales` | Login | Riwayat transaksi |
| GET | `/sales/:id` | Login | Detail invoice |
| GET | `/reports/dashboard` | Login | Ringkasan dashboard |
| GET | `/reports/sales?from=&to=` | Admin | Laporan penjualan per periode |
| GET | `/reports/sales/export?from=&to=` | Admin | Unduh laporan CSV |
| GET | `/workflows/warehouses` | Login | Daftar gudang aktif/nonaktif dan ringkasan stok |
| POST | `/workflows/warehouses` | Admin | Tambah gudang |
| GET | `/workflows/stock/levels?warehouse_id=` | Login | Saldo fisik, reservasi, dan stok tersedia per produk/gudang |
| POST | `/workflows/stock/transfers` | Admin | Transfer stok antar-gudang |
| GET/POST | `/workflows/suppliers` | Login / Admin | Daftar atau tambah supplier |
| GET/POST | `/workflows/purchase-orders` | Login | Daftar atau buat draft PO |
| GET | `/workflows/purchase-orders/:id` | Login | Detail PO dan jumlah yang sudah diterima |
| POST | `/workflows/purchase-orders/:id/submit` | Pembuat PO | Ajukan draft untuk persetujuan |
| POST | `/workflows/purchase-orders/:id/cancel` | Pembuat PO / Admin | Batalkan PO yang belum menerima barang |
| POST | `/workflows/purchase-orders/:id/review` | Admin | Setujui atau tolak PO |
| POST | `/workflows/purchase-orders/:id/receive` | Admin | Catat penerimaan barang parsial atau penuh |
| GET/POST | `/workflows/orders` | Login | Daftar pesanan atau buat pesanan dengan reservasi |
| POST | `/workflows/orders/:id/review` | Admin | Setujui atau tolak pesanan |
| POST | `/workflows/orders/:id/cancel` | Pembuat pesanan / Admin | Batalkan pesanan sebelum disetujui dan lepaskan reservasi |
| POST | `/workflows/shipments/:id/status` | Login | Perbarui status kiriman dan nomor resi |
| GET | `/workflows/shipments/:id/events` | Login | Riwayat perubahan status kiriman |
| GET | `/workflows/audit-logs` | Admin | Lihat 200 aktivitas terbaru |

## Aturan multi-gudang dan workflow

- Instalasi baru membuat gudang utama `MAIN`. Pada database lama, jalankan migrasi satu kali; seluruh saldo `products.stock` yang ada dialokasikan ke gudang tersebut.
- `warehouse_stocks.on_hand` adalah stok fisik, `reserved` adalah stok yang ditahan untuk pesanan, dan `available` dihitung sebagai `on_hand - reserved`. `products.stock` dipertahankan sebagai total agregat lintas gudang untuk fitur lama.
- Kasir tetap membuat transaksi langsung dan dapat memilih gudang. Nilai `warehouse_id` yang tidak dikirim menggunakan gudang utama.
- Purchase order dibuat sebagai draft, dikirim oleh pembuatnya untuk persetujuan Admin, lalu Admin dapat menerima barang secara bertahap. Stok baru bertambah saat penerimaan, bukan saat PO disetujui.
- Pesanan pelanggan langsung mereservasi stok tersedia. Admin menyetujui atau menolak; penolakan melepas reservasi. Pesanan yang disetujui membuat shipment dengan status `pending`.
- Perubahan shipment yang diizinkan: `pending -> shipped -> in_transit -> delivered`; `pending -> cancelled` juga diizinkan. Saat `shipped`, reservasi dilepas, stok fisik dikurangi, dan invoice penjualan dibuat. Kiriman yang sudah dikirim tidak dapat dibatalkan lewat endpoint ini.
- Perubahan stok, PO, pesanan, pengiriman, dan penjualan terkait dicatat di `audit_logs`. Status shipment juga memiliki riwayat tersendiri.

### Contoh transfer stok

```json
POST /workflows/stock/transfers
{
  "from_warehouse_id": 1,
  "to_warehouse_id": 2,
  "product_id": 4,
  "quantity": 5,
  "note": "Pemenuhan stok cabang"
}
```

### Contoh penerimaan PO

```json
POST /workflows/purchase-orders/12/receive
{
  "items": [
    { "item_id": 31, "quantity": 8 }
  ]
}
```

### Contoh pesanan pelanggan

```json
POST /workflows/orders
{
  "warehouse_id": 1,
  "items": [
    { "product_id": 4, "quantity": 2 }
  ]
}
```

```json
POST /workflows/shipments/7/status
{
  "status": "shipped",
  "tracking_number": "RESI-123",
  "note": "Diserahkan ke kurir"
}
```

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
{ "warehouse_id": 1, "items": [ { "product_id": 1, "quantity": 2 } ] }
```

Respons `201`:

```json
{ "id": 7, "invoice_number": "INV-20261013-00007", "total_amount": 7000 }
```

Total dihitung di server dari harga database, bukan dari klien. `warehouse_id` bersifat opsional; bila tidak dikirim, transaksi menggunakan gudang utama.

## Kode status

| Kode | Arti |
|---|---|
| 400 | Input tidak valid |
| 401 | Belum login atau token tidak valid |
| 403 | Role tidak punya akses |
| 404 | Data tidak ditemukan |
| 409 | Konflik: SKU ganda, stok tidak cukup, atau produk punya riwayat |